'use client';

// Note editor pane — title input, the persistent Quill body editor,
// collapsible transcript, and the Extract Tasks / Tasks-from-this-note /
// Meeting Minutes / Delete Note action row. Ported from app/index.html's
// renderEditor()/saveCurrentNote()/extractFromCurrentNote()/
// generateMinutesForCurrentNote()/deleteCurrentNote().
//
// IMPORTANT: this component renders <QuillEditor> UNCONDITIONALLY (never
// `{note && <QuillEditor/>}`) even when `note` is null, per the "construct
// once, for the whole lifetime of the Notes tab" constraint documented in
// QuillEditor.tsx. When nothing is selected, the surrounding chrome is
// hidden/disabled instead.
import { useEffect, useRef, useState } from 'react';
import type { UseCompassData, NewTaskInput } from '../useCompassData';
import type { Note } from '../types';
import { sanitizeNoteHtml, htmlToPlainText, simpleHash } from '../utils';
import { callClaude, ClaudeCallError, extractionPrompt, minutesPrompt, parseTaskJson } from '../prompts';
import QuillEditor, { QuillEditorHandle } from './QuillEditor';
import TranscriptSection from './TranscriptSection';
import NoteTasksModal from './NoteTasksModal';
import MeetingMinutesModal from './MeetingMinutesModal';

export default function NoteEditor({
  note,
  data,
  onDeleted,
}: {
  note: Note | null;
  data: UseCompassData;
  onDeleted: () => void;
}) {
  const [localTitle, setLocalTitle] = useState(note?.title ?? '');
  const [localTranscript, setLocalTranscript] = useState(note?.transcript ?? '');
  const [localIncludeTranscript, setLocalIncludeTranscript] = useState(note?.includeTranscriptInExtract ?? false);
  const [transcriptOpen, setTranscriptOpen] = useState(!!(note?.transcript && note.transcript.trim()));
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [minutesModalOpen, setMinutesModalOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState('');
  const [minutesGenerating, setMinutesGenerating] = useState(false);

  const quillEditorRef = useRef<QuillEditorHandle>(null);
  const editingNoteIdRef = useRef<string | null>(null);
  const pendingPatchRef = useRef<Partial<Note>>({});
  const fieldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- title / transcript / checkbox debounced-save plumbing ----------
  // Quill owns its own body-save debounce internally (see QuillEditor); this
  // mirrors the same ~800ms-after-typing-stops pattern for the title input
  // and transcript textarea, which vanilla drives off one shared `saveTimer`
  // inside renderEditor()'s triggerAutosave(). A single pending-patch ref
  // (rather than one timer per field) keeps it simple: any field change
  // merges into the same pending patch and resets one 800ms timer.
  function flushFields(id: string | null) {
    if (fieldTimerRef.current) {
      clearTimeout(fieldTimerRef.current);
      fieldTimerRef.current = null;
    }
    const patch = pendingPatchRef.current;
    if (id && Object.keys(patch).length) {
      data.updateNote(id, patch);
    }
    pendingPatchRef.current = {};
  }

  function scheduleFieldSave(patch: Partial<Note>) {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    if (fieldTimerRef.current) clearTimeout(fieldTimerRef.current);
    const id = note?.id ?? null;
    fieldTimerRef.current = setTimeout(() => flushFields(id), 800);
  }

  // Reset local editable state + flush any pending save from the note being
  // navigated away from, whenever the selected note actually changes. This
  // is the title/transcript equivalent of QuillEditor's own
  // quillEditingNoteId guard — and, like that guard, is a deliberate
  // improvement over vanilla (which can lose a fast-abandoned note's last
  // <800ms of title/transcript edits — see QuillEditor.tsx's header comment
  // for the full reasoning, which applies identically here).
  useEffect(() => {
    const prevId = editingNoteIdRef.current;
    if (prevId && prevId !== (note?.id ?? null)) {
      flushFields(prevId);
    }
    editingNoteIdRef.current = note?.id ?? null;
    setLocalTitle(note?.title ?? '');
    setLocalTranscript(note?.transcript ?? '');
    setLocalIncludeTranscript(note?.includeTranscriptInExtract ?? false);
    setTranscriptOpen(!!(note?.transcript && note.transcript.trim()));
    setTasksModalOpen(false);
    setMinutesModalOpen(false);
    setExtractStatus('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // Flush on unmount too — defensive; see QuillEditor.tsx's own comment on
  // why vanilla never needs this (it never unmounts).
  useEffect(() => {
    return () => flushFields(editingNoteIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTitleChange(v: string) {
    setLocalTitle(v);
    scheduleFieldSave({ title: v });
  }

  function handleTranscriptChange(v: string) {
    setLocalTranscript(v);
    scheduleFieldSave({ transcript: v });
  }

  function handleTranscriptAttached(merged: string) {
    setLocalTranscript(merged);
    pendingPatchRef.current = { ...pendingPatchRef.current, transcript: merged };
    flushFields(note?.id ?? null); // immediate — matches vanilla's saveCurrentNote(false) right after attach
  }

  function handleIncludeChange(checked: boolean) {
    setLocalIncludeTranscript(checked);
    pendingPatchRef.current = { ...pendingPatchRef.current, includeTranscriptInExtract: checked };
    flushFields(note?.id ?? null); // immediate — matches vanilla's includeTranscriptCheck 'change' listener
  }

  function handleQuillChange(noteId: string, html: string) {
    data.updateNote(noteId, { body: sanitizeNoteHtml(html) });
  }

  const noteTasks = note ? data.tasks.filter((t) => t.sourceNoteId === note.id && !t.deleted) : [];

  // ---------- Extract Tasks ----------
  // Ported from extractFromCurrentNote(). Notably: on ANY failure —
  // network error, NOT_APPROVED, or the model returning non-JSON — vanilla
  // does not create a fallback/raw task and does not update
  // lastExtractedHash (so the user can just retry). That "no fallback"
  // behavior is deliberate here too, unlike quickAddTask() (a different,
  // Board-tab-only function) which DOES fall back to a raw manual task —
  // the two are not the same code path in vanilla.
  async function handleExtractTasks() {
    if (!note) return;
    flushFields(note.id);
    quillEditorRef.current?.flush();
    const rawHtml = quillEditorRef.current?.getHtml() ?? note.body;
    const cleanBody = sanitizeNoteHtml(rawHtml);
    const plainBody = htmlToPlainText(cleanBody);
    if (!plainBody.trim()) {
      setExtractStatus('Nothing to extract yet — write something first.');
      return;
    }

    const useTranscript = !!(localIncludeTranscript && localTranscript && localTranscript.trim());
    // Hashes the sanitized body HTML — only needs to detect *any* change,
    // not semantic equivalence, matching vanilla's simpleHash(note.body + ...).
    const hashInput = cleanBody + (useTranscript ? '|' + localTranscript : '');
    const bodyHash = simpleHash(hashInput);
    if (note.lastExtractedHash != null && String(note.lastExtractedHash) === String(bodyHash)) {
      setExtractStatus('No changes since last extract.');
      return;
    }

    setExtracting(true);
    setExtractStatus(useTranscript ? 'Reading note + transcript and pulling out tasks…' : 'Reading note and pulling out tasks…');
    try {
      const raw = await callClaude(extractionPrompt(localTitle, plainBody, useTranscript ? localTranscript : null));
      const parsed: NewTaskInput[] = parseTaskJson(raw, plainBody);
      const created = data.replaceTasksForNote(note.id, parsed);
      data.updateNote(note.id, { lastExtractedHash: String(bodyHash), body: cleanBody });
      setExtractStatus(`Extracted ${created.length} task(s).`);
      setTasksModalOpen(true);
    } catch (e) {
      setExtractStatus(
        e instanceof ClaudeCallError && e.code === 'NOT_SIGNED_IN'
          ? 'You need to be signed in to extract tasks.'
          : 'Could not auto-parse this note — check your connection, or add the task manually on the Board.'
      );
    }
    setExtracting(false);
  }

  // ---------- Meeting Minutes ----------
  // Ported from generateMinutesForCurrentNote(). Note the transcript is
  // used whenever one is present — this does NOT check
  // includeTranscriptInExtract (that flag only gates Extract Tasks).
  async function handleGenerateMinutes() {
    if (!note) return;
    flushFields(note.id);
    quillEditorRef.current?.flush();
    const rawHtml = quillEditorRef.current?.getHtml() ?? note.body;
    const cleanBody = sanitizeNoteHtml(rawHtml);
    const plainBody = htmlToPlainText(cleanBody);
    const hasBody = !!plainBody.trim();
    const hasTx = !!(localTranscript && localTranscript.trim());
    if (!hasBody && !hasTx) return;

    setMinutesGenerating(true);
    try {
      const text = await callClaude(minutesPrompt(localTitle, plainBody, hasTx ? localTranscript : null));
      data.updateNote(note.id, {
        body: cleanBody,
        minutes: text.trim(),
        minutesGeneratedAt: new Date().toISOString(),
        minutesSource: hasTx ? 'transcript' : 'note',
      });
    } catch {
      data.updateNote(note.id, {
        body: cleanBody,
        minutes: 'Could not generate minutes — check your connection and try again.',
      });
    }
    setMinutesGenerating(false);
  }

  function handleDelete() {
    if (!note) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this note? Its extracted tasks will be removed too.')) return;
    data.deleteNote(note.id);
    onDeleted();
  }

  return (
    <div className="ch-note-editor">
      {/*
        This wrapper div is ALWAYS rendered (only its children swap between
        the banner and the title+meta-row) — deliberately, to work around a
        DOM-ordering quirk in QuillEditor's persistent-instance design: Quill
        inserts its toolbar into the live DOM itself (outside React's
        tracking), positioned as the sibling immediately before the
        ch-quill-host div, the very first time QuillEditor mounts (which, per
        its own "construct once" contract, is once for the whole Notes tab
        lifetime — see QuillEditor.tsx). That first mount happens while no
        note is selected yet (banner state). If this header were a bare
        conditional (banner <-> fragment of two new nodes) instead of one
        stable wrapper, React would need to insert the newly-mounted title
        input/meta-row as new top-level siblings anchored against the next
        REACT-managed node it knows about (ch-quill-host) — landing them
        AFTER Quill's already-injected, React-invisible toolbar node instead
        of before it. The toolbar would then render above the title
        permanently for the rest of the session. Keeping one persistent
        wrapper element here means its position relative to the toolbar is
        fixed once at mount and never needs to be renegotiated — only its
        contents change.
      */}
      <div className="ch-note-header">
        {note ? (
          <div className="ch-note-header-row">
            <input
              className="ch-note-title-input"
              value={localTitle}
              placeholder="Note title..."
              onChange={(e) => handleTitleChange(e.target.value)}
            />
            <span className="ch-note-meta-inline">
              Updated {note.updatedAt ? new Date(note.updatedAt).toLocaleString() : 'just now'}
            </span>
          </div>
        ) : (
          <div className="ch-note-editor-empty-banner">Select a note or create one to get started.</div>
        )}
      </div>

      <QuillEditor ref={quillEditorRef} noteId={note?.id ?? null} initialHtml={note?.body ?? ''} onChange={handleQuillChange} />

      <TranscriptSection
        key={note?.id ?? 'none'}
        transcript={localTranscript}
        includeTranscriptInExtract={localIncludeTranscript}
        open={transcriptOpen}
        onOpen={() => setTranscriptOpen(true)}
        onHide={() => {
          flushFields(note?.id ?? null);
          setTranscriptOpen(false);
        }}
        onTranscriptChange={handleTranscriptChange}
        onTranscriptAttached={handleTranscriptAttached}
        onIncludeChange={handleIncludeChange}
        disabled={!note}
      />

      {note ? (
        <div className="ch-note-editor-actions">
          <div className="ch-note-editor-actions-left">
            <button type="button" className="ch-btn ch-btn-primary" onClick={handleExtractTasks} disabled={extracting}>
              {extracting ? 'Extracting…' : 'Extract Tasks'}
            </button>
            <button type="button" className="ch-btn ch-btn-secondary" onClick={() => setTasksModalOpen(true)}>
              Tasks from this note{noteTasks.length ? ` (${noteTasks.length})` : ''}
            </button>
            <button type="button" className="ch-btn ch-btn-secondary" onClick={() => setMinutesModalOpen(true)}>
              Meeting Minutes
            </button>
            <button type="button" className="ch-btn ch-btn-danger" onClick={handleDelete}>
              Delete Note
            </button>
          </div>
          <span className="ch-status-line">{extractStatus}</span>
        </div>
      ) : null}

      <NoteTasksModal
        open={tasksModalOpen}
        onClose={() => setTasksModalOpen(false)}
        tasks={noteTasks}
        onToggleDone={(id, done) => data.updateTask(id, { status: done ? 'Done' : 'Open' })}
      />
      <MeetingMinutesModal
        open={minutesModalOpen}
        onClose={() => setMinutesModalOpen(false)}
        note={note}
        generating={minutesGenerating}
        onGenerate={handleGenerateMinutes}
      />
    </div>
  );
}
