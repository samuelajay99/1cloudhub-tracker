'use client';

// Compass's data layer. Unlike the vanilla Electron app (localStorage as the
// synchronous source of truth, Supabase as a best-effort background mirror —
// see app/CLAUDE.md), this hook treats Supabase as the SOLE source of truth:
// load once on mount into React state, then every mutation does an
// optimistic in-memory update plus a debounced upsert (or, for note
// deletion, an immediate real delete — see deleteNote below) back to
// Supabase. There is no merge-on-pull logic to port.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { EmailWorkspace, Note, Task } from './types';
import { cleanTaskField } from './prompts';
import { migrateNoteBodyToHtml, sanitizeNoteText } from './utils';

const NOTES_DEBOUNCE_MS = 700;
const TASKS_DEBOUNCE_MS = 700;
const EMAIL_DEBOUNCE_MS = 600;

const EMPTY_EMAIL: EmailWorkspace = { context: '', instructions: '', subject: '', body: '' };

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- Row <-> object mapping ----------
// Mirrors noteToRow/rowToNote and taskToRow/rowToTask from app/index.html,
// against the exact columns in supabase/migrations/0001_init.sql.

interface NoteRow {
  id: string;
  user_id: string;
  title: string | null;
  body: string | null;
  transcript: string | null;
  include_transcript_in_extract: boolean | null;
  minutes: string | null;
  minutes_generated_at: string | null;
  minutes_source: string | null;
  last_extracted_hash: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  user_id: string;
  item: string | null;
  parent: string | null;
  type: string | null;
  related: string | null;
  priority: string | null;
  status: string | null;
  due: string | null;
  notes: string | null;
  source_note_id: string | null;
  source_note_title: string | null;
  manual: boolean | null;
  deleted: boolean | null;
  created_at: string;
}

interface EmailRow {
  user_id: string;
  data: EmailWorkspace;
  updated_at: string;
}

function noteToRow(n: Note, userId: string): NoteRow {
  return {
    id: n.id,
    user_id: userId,
    title: n.title || null,
    body: n.body || null,
    transcript: n.transcript || null,
    include_transcript_in_extract: !!n.includeTranscriptInExtract,
    minutes: n.minutes || null,
    minutes_generated_at: n.minutesGeneratedAt || null,
    minutes_source: n.minutesSource || null,
    last_extracted_hash: n.lastExtractedHash != null ? String(n.lastExtractedHash) : null,
    created_at: n.createdAt || new Date().toISOString(),
    updated_at: n.updatedAt || new Date().toISOString(),
  };
}

function rowToNote(r: NoteRow): Note {
  return {
    id: r.id,
    title: r.title || '',
    body: r.body || '',
    transcript: r.transcript || '',
    includeTranscriptInExtract: !!r.include_transcript_in_extract,
    minutes: r.minutes,
    minutesGeneratedAt: r.minutes_generated_at,
    minutesSource: (r.minutes_source as Note['minutesSource']) || null,
    lastExtractedHash: r.last_extracted_hash,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function taskToRow(t: Task, userId: string): TaskRow {
  return {
    id: t.id,
    user_id: userId,
    item: t.item || null,
    parent: t.parent || null,
    type: t.type || null,
    related: t.related || null,
    priority: t.priority || null,
    status: t.status || null,
    due: t.due || null,
    notes: t.notes || null,
    source_note_id: t.sourceNoteId || null,
    source_note_title: t.sourceNoteTitle || null,
    manual: !!t.manual,
    deleted: !!t.deleted,
    created_at: t.createdAt || new Date().toISOString(),
  };
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    item: r.item || '',
    parent: r.parent,
    type: (r.type as Task['type']) || null,
    related: r.related,
    priority: (r.priority as Task['priority']) || null,
    status: (r.status as Task['status']) || null,
    due: r.due,
    notes: r.notes,
    sourceNoteId: r.source_note_id,
    sourceNoteTitle: r.source_note_title,
    manual: !!r.manual,
    deleted: !!r.deleted,
    createdAt: r.created_at,
  };
}

// ---------- One-time legacy-markup heal ----------
// Equivalent to migrateLegacyMarkup() in app/index.html, but run once over
// freshly-loaded Supabase rows (right after load) instead of once per
// sign-in. Mutates the arrays in place and reports whether anything changed
// so the caller can push the healed rows back.
const MARKUP_RE = /<br\s*\/?>|<\/?(p|div)[^>]*>|&nbsp;|<[^>]+>/i;

function healLegacyMarkup(notes: Note[], tasks: Task[]): { notesChanged: boolean; tasksChanged: boolean } {
  let notesChanged = false;
  notes.forEach((n) => {
    (['title', 'transcript', 'minutes'] as const).forEach((k) => {
      const v = n[k];
      if (v && MARKUP_RE.test(String(v))) {
        const c = sanitizeNoteText(String(v));
        if (c !== v) {
          (n as unknown as Record<string, unknown>)[k] = c;
          notesChanged = true;
        }
      }
    });
    // Body has its own idempotent plain-text -> paragraph-HTML migration
    // (skips notes that are already the new rich-HTML format).
    if (migrateNoteBodyToHtml(n)) notesChanged = true;
  });

  let tasksChanged = false;
  tasks.forEach((t) => {
    (['item', 'notes', 'parent', 'sourceNoteTitle', 'related'] as const).forEach((k) => {
      const v = t[k];
      if (v && MARKUP_RE.test(String(v))) {
        const c = cleanTaskField(v);
        if (c !== v) {
          (t as unknown as Record<string, unknown>)[k] = c;
          tasksChanged = true;
        }
      }
    });
  });

  return { notesChanged, tasksChanged };
}

export type NewTaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'item'>> & { item: string };

export interface UseCompassData {
  loading: boolean;
  notes: Note[];
  tasks: Task[];
  email: EmailWorkspace;
  createNote: () => Note;
  updateNote: (id: string, patch: Partial<Omit<Note, 'id'>>) => void;
  deleteNote: (id: string) => Promise<void>;
  createTask: (input: NewTaskInput) => Task;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id'>>) => void;
  deleteTask: (id: string) => void; // soft delete (Trash) — sets deleted: true
  restoreTask: (id: string) => void; // undo — sets deleted: false
  // Hard-replaces the non-Done, non-deleted tasks previously extracted from
  // `noteId` with `newTasks` — see the implementation comment above for the
  // exact stale-task condition ported from vanilla's extractFromCurrentNote().
  // Returns the newly-created Task objects (with real ids) for immediate use
  // (e.g. NoteTasksModal).
  replaceTasksForNote: (noteId: string, newTasks: NewTaskInput[]) => Task[];
  updateEmail: (patch: Partial<EmailWorkspace>) => void;
  reload: () => Promise<void>;
}

export function useCompassData(userId: string): UseCompassData {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [email, setEmail] = useState<EmailWorkspace>(EMPTY_EMAIL);

  // Refs mirror the latest state synchronously (set inside the same
  // setState updater that computes the new array) so the debounced flush
  // functions below never read a stale closure.
  const notesRef = useRef<Note[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const emailRef = useRef<EmailWorkspace>(EMPTY_EMAIL);

  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tasksTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks whether a debounced write is currently queued (not yet fired) for
  // each kind, so the beforeunload guard only warns about genuinely
  // unflushed changes.
  const pendingRef = useRef({ notes: false, tasks: false, email: false });

  const flushNotes = useCallback(async () => {
    pendingRef.current.notes = false;
    const arr = notesRef.current;
    if (!arr.length || !userId) return;
    try {
      await supabase.from('notes').upsert(arr.map((n) => noteToRow(n, userId)));
    } catch (e) {
      console.error('compass: notes save failed', e);
    }
  }, [userId]);

  const flushTasks = useCallback(async () => {
    pendingRef.current.tasks = false;
    const arr = tasksRef.current;
    if (!arr.length || !userId) return;
    try {
      await supabase.from('tasks').upsert(arr.map((t) => taskToRow(t, userId)));
    } catch (e) {
      console.error('compass: tasks save failed', e);
    }
  }, [userId]);

  const flushEmail = useCallback(async () => {
    pendingRef.current.email = false;
    if (!userId) return;
    try {
      await supabase
        .from('email_workspace')
        .upsert({ user_id: userId, data: emailRef.current, updated_at: new Date().toISOString() });
    } catch (e) {
      console.error('compass: email save failed', e);
    }
  }, [userId]);

  const scheduleNotesSave = useCallback(() => {
    pendingRef.current.notes = true;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(flushNotes, NOTES_DEBOUNCE_MS);
  }, [flushNotes]);

  const scheduleTasksSave = useCallback(() => {
    pendingRef.current.tasks = true;
    if (tasksTimer.current) clearTimeout(tasksTimer.current);
    tasksTimer.current = setTimeout(flushTasks, TASKS_DEBOUNCE_MS);
  }, [flushTasks]);

  const scheduleEmailSave = useCallback(() => {
    pendingRef.current.email = true;
    if (emailTimer.current) clearTimeout(emailTimer.current);
    emailTimer.current = setTimeout(flushEmail, EMAIL_DEBOUNCE_MS);
  }, [flushEmail]);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [notesRes, tasksRes, emailRes] = await Promise.all([
      supabase.from('notes').select('*').eq('user_id', userId),
      supabase.from('tasks').select('*').eq('user_id', userId),
      supabase.from('email_workspace').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    const loadedNotes = ((notesRes.data as NoteRow[] | null) || []).map(rowToNote);
    const loadedTasks = ((tasksRes.data as TaskRow[] | null) || []).map(rowToTask);
    const loadedEmail = ((emailRes.data as EmailRow | null)?.data as EmailWorkspace) || EMPTY_EMAIL;

    // One-time heal pass over freshly-loaded rows — equivalent to vanilla's
    // migrateLegacyMarkup(), which used to run once per sign-in.
    const { notesChanged, tasksChanged } = healLegacyMarkup(loadedNotes, loadedTasks);

    notesRef.current = loadedNotes;
    tasksRef.current = loadedTasks;
    emailRef.current = loadedEmail;
    setNotes(loadedNotes);
    setTasks(loadedTasks);
    setEmail(loadedEmail);
    setLoading(false);

    // Push healed rows back immediately so the fix persists (matches
    // vanilla, where migrateLegacyMarkup's saveNotesArr/saveTasks calls
    // schedule a cloud push of the healed data).
    if (notesChanged) {
      supabase.from('notes').upsert(loadedNotes.map((n) => noteToRow(n, userId))).then(({ error }) => {
        if (error) console.error('compass: legacy-markup note heal push failed', error);
      });
    }
    if (tasksChanged) {
      supabase.from('tasks').upsert(loadedTasks.map((t) => taskToRow(t, userId))).then(({ error }) => {
        if (error) console.error('compass: legacy-markup task heal push failed', error);
      });
    }
  }, [userId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // beforeunload guard: warn if a debounced save is still queued.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (pendingRef.current.notes || pendingRef.current.tasks || pendingRef.current.email) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ---------- Notes ----------
  const createNote = useCallback((): Note => {
    const now = new Date().toISOString();
    const note: Note = {
      id: uid(),
      title: 'New note',
      body: '',
      transcript: '',
      includeTranscriptInExtract: false,
      minutes: null,
      minutesGeneratedAt: null,
      minutesSource: null,
      lastExtractedHash: null,
      createdAt: now,
      updatedAt: now,
    };
    setNotes((prev) => {
      const next = [...prev, note];
      notesRef.current = next;
      return next;
    });
    scheduleNotesSave();
    return note;
  }, [scheduleNotesSave]);

  const updateNote = useCallback(
    (id: string, patch: Partial<Omit<Note, 'id'>>) => {
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n));
        notesRef.current = next;
        return next;
      });
      scheduleNotesSave();
    },
    [scheduleNotesSave]
  );

  // Real delete — matches vanilla's deleteCurrentNote(), which hard-removes
  // the note AND hard-removes (not soft-deletes) every task sourced from it,
  // then persists. Unlike vanilla — which only ever upserts the *remaining*
  // rows and never issues a real Supabase DELETE, so a deleted note's cloud
  // row is orphaned and can resurrect on a future pull — this issues real
  // DELETEs immediately so state and Supabase never diverge (this app has
  // no localStorage cache to paper over that gap; see the architecture note
  // in the parent plan: "Supabase is the sole source of truth").
  const deleteNote = useCallback(
    async (id: string) => {
      let cascadeIds: string[] = [];
      setNotes((prev) => {
        const next = prev.filter((n) => n.id !== id);
        notesRef.current = next;
        return next;
      });
      setTasks((prev) => {
        cascadeIds = prev.filter((t) => t.sourceNoteId === id).map((t) => t.id);
        const next = prev.filter((t) => t.sourceNoteId !== id);
        tasksRef.current = next;
        return next;
      });
      try {
        await supabase.from('notes').delete().eq('id', id).eq('user_id', userId);
        if (cascadeIds.length) {
          await supabase.from('tasks').delete().in('id', cascadeIds).eq('user_id', userId);
        }
      } catch (e) {
        console.error('compass: delete note failed', e);
      }
    },
    [userId]
  );

  // ---------- Tasks ----------
  const createTask = useCallback(
    (input: NewTaskInput): Task => {
      const task: Task = {
        id: uid(),
        item: input.item,
        parent: input.parent ?? null,
        type: input.type ?? 'Task',
        related: input.related ?? null,
        priority: input.priority ?? 'Medium',
        status: input.status ?? 'Open',
        due: input.due ?? null,
        notes: input.notes ?? null,
        sourceNoteId: input.sourceNoteId ?? null,
        sourceNoteTitle: input.sourceNoteTitle ?? null,
        manual: input.manual ?? false,
        deleted: input.deleted ?? false,
        createdAt: new Date().toISOString(),
      };
      setTasks((prev) => {
        const next = [...prev, task];
        tasksRef.current = next;
        return next;
      });
      scheduleTasksSave();
      return task;
    },
    [scheduleTasksSave]
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Omit<Task, 'id'>>) => {
      setTasks((prev) => {
        const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
        tasksRef.current = next;
        return next;
      });
      scheduleTasksSave();
    },
    [scheduleTasksSave]
  );

  const deleteTask = useCallback(
    (id: string) => {
      setTasks((prev) => {
        const next = prev.map((t) => (t.id === id ? { ...t, deleted: true } : t));
        tasksRef.current = next;
        return next;
      });
      scheduleTasksSave();
    },
    [scheduleTasksSave]
  );

  const restoreTask = useCallback(
    (id: string) => {
      setTasks((prev) => {
        const next = prev.map((t) => (t.id === id ? { ...t, deleted: false } : t));
        tasksRef.current = next;
        return next;
      });
      scheduleTasksSave();
    },
    [scheduleTasksSave]
  );

  // Bulk-replace the tasks previously extracted from one note — used by
  // Extract Tasks. Mirrors extractFromCurrentNote() in app/index.html
  // exactly: `kept = tasks.filter(t => !(t.sourceNoteId === note.id &&
  // t.status !== 'Done' && !t.deleted))`, i.e. hard-remove every
  // non-Done, non-deleted task sourced from this note (Done tasks and
  // already-trashed tasks survive re-extraction untouched), then push in
  // the freshly-extracted tasks. Unlike deleteTask()'s soft-delete (Trash/
  // Undo), this is a real removal — vanilla never soft-deletes stale
  // extracted tasks, it just drops them, and there's no cloud DELETE in
  // vanilla to mirror either (it only upserts survivors and leaves the
  // stale rows orphaned in local storage's shadow — see deleteNote's own
  // comment on why this hook issues real Supabase DELETEs instead, since
  // there's no localStorage cache here to paper over the gap).
  const replaceTasksForNote = useCallback(
    (noteId: string, newTasks: NewTaskInput[]): Task[] => {
      const note = notesRef.current.find((n) => n.id === noteId);
      const sourceNoteTitle = note?.title || 'Untitled';
      const now = new Date().toISOString();
      const created: Task[] = newTasks.map((input) => ({
        id: uid(),
        item: input.item,
        parent: input.parent ?? null,
        type: input.type ?? 'Task',
        related: input.related ?? null,
        priority: input.priority ?? 'Medium',
        status: input.status ?? 'Open',
        due: input.due ?? null,
        notes: input.notes ?? null,
        sourceNoteId: noteId,
        sourceNoteTitle,
        manual: false,
        deleted: false,
        createdAt: now,
      }));

      let removedIds: string[] = [];
      setTasks((prev) => {
        removedIds = prev
          .filter((t) => t.sourceNoteId === noteId && t.status !== 'Done' && !t.deleted)
          .map((t) => t.id);
        const kept = prev.filter((t) => !removedIds.includes(t.id));
        const next = [...kept, ...created];
        tasksRef.current = next;
        return next;
      });

      // Real delete for the stale rows (bypasses the soft-delete/Trash
      // path entirely), then a normal upsert for the newly-created rows —
      // scheduleTasksSave() debounces an upsert of the *whole* current
      // array, which would re-insert a stale row if the delete lost a
      // race, so the delete is issued immediately and awaited-in-place
      // (fire-and-forget from the caller's perspective, but ordered
      // before the debounced upsert can fire).
      if (removedIds.length && userId) {
        supabase
          .from('tasks')
          .delete()
          .in('id', removedIds)
          .eq('user_id', userId)
          .then(({ error }) => {
            if (error) console.error('compass: replaceTasksForNote delete failed', error);
          });
      }
      scheduleTasksSave();
      return created;
    },
    [userId, scheduleTasksSave]
  );

  // ---------- Email ----------
  const updateEmail = useCallback(
    (patch: Partial<EmailWorkspace>) => {
      setEmail((prev) => {
        const next = { ...prev, ...patch };
        emailRef.current = next;
        return next;
      });
      scheduleEmailSave();
    },
    [scheduleEmailSave]
  );

  return {
    loading,
    notes,
    tasks,
    email,
    createNote,
    updateNote,
    deleteNote,
    createTask,
    updateTask,
    deleteTask,
    restoreTask,
    replaceTasksForNote,
    updateEmail,
    reload: load,
  };
}
