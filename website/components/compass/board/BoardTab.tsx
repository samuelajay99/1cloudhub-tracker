'use client';

// Board tab root — owns every piece of filter/view state, composes
// StatsRow/QuickAddBar/FilterBar/TaskListView/KanbanBoard/TaskDetailModal.
// Ported from app/index.html's module-level Board state (PRIORITY_COLOR/
// STATUSES/showTrash/personFilterVal/searchVal/priorityFilterVal/
// dueFilterVal/boardViewMode/statusFilterVal/expandedGroups) plus
// quickAddTask()/renderBoard()/openDetailModal() and its Save/Remove
// handlers.
//
// Composition choice (matches NotesTab.tsx): BoardTab takes the return
// value of useCompassData(userId) as a prop (`data`) rather than calling
// the hook itself, so Board sees the exact same in-memory tasks/notes as
// Notes — e.g. a task Notes just extracted shows up here without a second
// Supabase round trip or the two tabs' state diverging.
//
// Toast: unlike NotesTab (which has no toast needs yet), Board's soft-
// delete Undo flow needs one. There is no app-wide toast host threaded down
// from app/compass/page.tsx yet (that's CompassHome, task #108) — so this
// component owns its own useToast()/<Toast> for now, same as any other
// early-adopter page on the site (see app/page.tsx, /admin, etc., which
// each own their own toast instance too). CompassHome can later replace
// this with a shared one if/when Notes or Email also need toasts.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { UseCompassData } from '../useCompassData';
import type { Task, TaskPriority, TaskStatus } from '../types';
import { sanitizeNoteText } from '../utils';
import { callClaude, extractionPrompt, parseTaskJson } from '../prompts';
import { celebrate } from '../shared/celebrate';
import { isOverdue, todayStr } from '../shared/taskDisplay';
import { useToast } from '../../useToast';
import Toast from '../../Toast';
import StatsRow from './StatsRow';
import QuickAddBar, { PriorityOverride } from './QuickAddBar';
import FilterBar from './FilterBar';
import TaskListView from './TaskListView';
import KanbanBoard from './KanbanBoard';
import TaskDetailModal from './TaskDetailModal';

const BOARD_VIEW_MODE_KEY = 'ch_board_view_mode';
const EXPANDED_GROUPS_KEY = 'ch_expanded_groups';
const STATUS_ORDER: Record<string, number> = { Open: 0, 'In Progress': 1, 'Waiting on Others': 2, Done: 3 };

// Imperative handle so a later phase (CompassHome, task #108 — global ⌘K/
// ⌘F shortcuts) can focus these inputs without BoardTab needing to build
// its own document-level keydown listener itself. Mirrors QuillEditor's own
// forwardRef + useImperativeHandle pattern (see QuillEditor.tsx).
export interface BoardTabHandle {
  focusQuickAdd: () => void;
  focusSearch: () => void;
}

function sortDisplayTasks(list: Task[], today: string): Task[] {
  // Ported verbatim from renderBoard()'s displayTasks.sort(): overdue-first,
  // then STATUSES index order, then due date ascending ('9999' fallback for
  // null so undated tasks sort last).
  return list.slice().sort((a, b) => {
    const aOver = isOverdue(a, today);
    const bOver = isOverdue(b, today);
    if (aOver !== bOver) return aOver ? -1 : 1;
    const so = (STATUS_ORDER[a.status || 'Open'] ?? 0) - (STATUS_ORDER[b.status || 'Open'] ?? 0);
    if (so !== 0) return so;
    return (a.due || '9999').localeCompare(b.due || '9999');
  });
}

const BoardTab = forwardRef<BoardTabHandle, { data: UseCompassData }>(function BoardTab({ data }, ref) {
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast, showToast } = useToast();

  useImperativeHandle(
    ref,
    () => ({
      focusQuickAdd: () => quickAddInputRef.current?.focus(),
      focusSearch: () => searchInputRef.current?.focus(),
    }),
    []
  );

  // ---------- Filter / view state ----------
  const [searchVal, setSearchVal] = useState('');
  const [personFilterVal, setPersonFilterVal] = useState('');
  const [statusFilterVal, setStatusFilterVal] = useState<TaskStatus | ''>('');
  const [priorityFilterVal, setPriorityFilterVal] = useState<TaskPriority | ''>('');
  const [dueFilterVal, setDueFilterVal] = useState<'' | 'overdue' | 'today'>('');
  const [showTrash, setShowTrash] = useState(false);

  // boardViewMode/expandedGroups are pure UI preferences (not app data), so
  // — per the architecture decision that Supabase is the sole source of
  // truth for DATA — they keep vanilla's localStorage persistence exactly.
  // Guarded against SSR: BoardTab only ever mounts client-side in practice
  // (behind CompassGate's client-only 'ready' transition), but the guard
  // costs nothing and avoids a hard crash if that ever changes.
  const [boardViewMode, setBoardViewMode] = useState<'list' | 'kanban'>(() => {
    if (typeof window === 'undefined') return 'list';
    return (localStorage.getItem(BOARD_VIEW_MODE_KEY) as 'list' | 'kanban') || 'list';
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(EXPANDED_GROUPS_KEY) || '[]'));
    } catch {
      return new Set();
    }
  });

  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  // ---------- Quick add ----------
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddPriority, setQuickAddPriority] = useState<PriorityOverride>('auto');
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState('');
  const quickAddStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (quickAddStatusTimerRef.current) clearTimeout(quickAddStatusTimerRef.current);
    };
  }, []);

  // Ported from quickAddTask(). Notably different from Notes' Extract Tasks
  // (NoteEditor.tsx's handleExtractTasks): on ANY failure — network error,
  // NOT_APPROVED, or the model returning non-JSON (parseTaskJson throwing)
  // — this falls back to creating exactly ONE raw task from the typed text,
  // rather than leaving the user with nothing. That fallback is deliberate
  // and Quick-Add-specific; Extract Tasks intentionally has no such
  // fallback (see NoteEditor.tsx's own comment on this exact asymmetry).
  async function handleQuickAddSubmit() {
    const text = (sanitizeNoteText(quickAddText) || '').trim();
    if (!text) return;
    const forcedPriority: TaskPriority | null = quickAddPriority !== 'auto' ? quickAddPriority : null;

    setQuickAddBusy(true);
    setQuickAddStatus('Turning that into task(s)…');
    try {
      const raw = await callClaude(extractionPrompt('Quick add', text));
      const parsed = parseTaskJson(raw, text);
      parsed.forEach((p) => {
        data.createTask({
          ...p,
          priority: forcedPriority || p.priority,
          sourceNoteId: null,
          sourceNoteTitle: null,
          manual: true,
        });
      });
      setQuickAddText('');
      setQuickAddStatus(`Added ${parsed.length} task(s).`);
    } catch {
      data.createTask({
        item: text.slice(0, 100),
        type: 'Task',
        priority: forcedPriority || 'Medium',
        status: 'Open',
        sourceNoteId: null,
        sourceNoteTitle: null,
        manual: true,
      });
      setQuickAddText('');
      setQuickAddStatus('Could not auto-parse — added as-is instead.');
    }
    setQuickAddBusy(false);
    if (quickAddStatusTimerRef.current) clearTimeout(quickAddStatusTimerRef.current);
    quickAddStatusTimerRef.current = setTimeout(() => setQuickAddStatus(''), 4000);
  }

  // ---------- Derived data ----------
  const today = todayStr();
  const activeTasks = useMemo(() => data.tasks.filter((t) => !t.deleted), [data.tasks]);
  const trashTasks = useMemo(() => data.tasks.filter((t) => t.deleted), [data.tasks]);

  // Stats are always computed over active (non-deleted) tasks, regardless
  // of the current filters/trash view — matches vanilla's activeTasks.
  const stats = useMemo(() => {
    const total = activeTasks.length;
    const doneCount = activeTasks.filter((t) => t.status === 'Done').length;
    const openCount = total - doneCount;
    const pct = total ? Math.round((doneCount / total) * 100) : 0;
    const overdueCount = activeTasks.filter((t) => isOverdue(t, today)).length;
    return { total, open: openCount, done: doneCount, overdue: overdueCount, pct };
  }, [activeTasks, today]);

  // Person filter options — distinct `related` values from active tasks,
  // alphabetized. Matches vanilla (computed from activeTasks, not
  // displayTasks).
  const people = useMemo(
    () => Array.from(new Set(activeTasks.map((t) => t.related).filter((r): r is string => !!r))).sort(),
    [activeTasks]
  );

  const displayTasks = useMemo(() => {
    let list = showTrash ? trashTasks : activeTasks;
    if (personFilterVal) list = list.filter((t) => t.related === personFilterVal);
    if (statusFilterVal) list = list.filter((t) => t.status === statusFilterVal);
    if (priorityFilterVal) list = list.filter((t) => t.priority === priorityFilterVal);
    if (dueFilterVal === 'overdue') list = list.filter((t) => isOverdue(t, today));
    if (dueFilterVal === 'today') list = list.filter((t) => t.due === today && t.status !== 'Done');
    if (searchVal.trim()) {
      const q = searchVal.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.item || '').toLowerCase().includes(q) ||
          (t.related || '').toLowerCase().includes(q) ||
          (t.notes || '').toLowerCase().includes(q) ||
          (t.sourceNoteTitle || '').toLowerCase().includes(q)
      );
    }
    return sortDisplayTasks(list, today);
  }, [showTrash, trashTasks, activeTasks, personFilterVal, statusFilterVal, priorityFilterVal, dueFilterVal, searchVal, today]);

  const detailTask = detailTaskId ? data.tasks.find((t) => t.id === detailTaskId) ?? null : null;

  // ---------- Handlers ----------
  function handleToggleDone(id: string, done: boolean) {
    data.updateTask(id, { status: done ? 'Done' : 'Open' });
  }

  function handleToggleGroup(gid: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      if (typeof window !== 'undefined') localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }

  function handleSetViewMode(mode: 'list' | 'kanban') {
    setBoardViewMode(mode);
    if (typeof window !== 'undefined') localStorage.setItem(BOARD_VIEW_MODE_KEY, mode);
  }

  // Ported from the kanban column's `drop` listener: only updates (and only
  // celebrates) when the drop actually changes the task's status.
  function handleKanbanDrop(taskId: string, newStatus: TaskStatus, clientX: number, clientY: number) {
    const t = data.tasks.find((x) => x.id === taskId);
    if (t && t.status !== newStatus) {
      data.updateTask(taskId, { status: newStatus });
      if (newStatus === 'Done') celebrate(clientX, clientY);
    }
  }

  function handleSaveDetail(id: string, patch: Partial<Omit<Task, 'id'>>) {
    data.updateTask(id, patch);
    setDetailTaskId(null);
  }

  // Ported from detailDeleteBtn's non-trashed branch: soft-deletes and
  // shows an Undo toast that restores the same task.
  function handleRemoveDetail(id: string) {
    data.deleteTask(id);
    showToast('Task removed.', 'info', 6000, { label: 'Undo', onClick: () => data.restoreTask(id) });
    setDetailTaskId(null);
  }

  // Ported from detailDeleteBtn's already-trashed branch: no toast — this
  // IS the explicit un-delete action, not something to itself offer an
  // undo for.
  function handleRestoreDetail(id: string) {
    data.restoreTask(id);
    setDetailTaskId(null);
  }

  if (data.loading) {
    return <div className="ch-notes-loading">Loading board…</div>;
  }

  const useKanban = boardViewMode === 'kanban' && !showTrash;

  return (
    <div className="ch-board">
      <StatsRow total={stats.total} open={stats.open} done={stats.done} overdue={stats.overdue} pct={stats.pct} />

      <QuickAddBar
        ref={quickAddInputRef}
        value={quickAddText}
        onValueChange={setQuickAddText}
        priority={quickAddPriority}
        onPriorityChange={setQuickAddPriority}
        busy={quickAddBusy}
        status={quickAddStatus}
        onSubmit={handleQuickAddSubmit}
      />

      <FilterBar
        ref={searchInputRef}
        searchVal={searchVal}
        onSearchChange={setSearchVal}
        people={people}
        personFilterVal={personFilterVal}
        onPersonChange={setPersonFilterVal}
        statusFilterVal={statusFilterVal}
        onStatusChange={setStatusFilterVal}
        priorityFilterVal={priorityFilterVal}
        onPriorityChange={setPriorityFilterVal}
        dueFilterVal={dueFilterVal}
        onToggleOverdue={() => setDueFilterVal((v) => (v === 'overdue' ? '' : 'overdue'))}
        onToggleToday={() => setDueFilterVal((v) => (v === 'today' ? '' : 'today'))}
        showTrash={showTrash}
        trashCount={trashTasks.length}
        onToggleTrash={() => setShowTrash((v) => !v)}
        boardViewMode={boardViewMode}
        onSetViewMode={handleSetViewMode}
      />

      {useKanban ? (
        <KanbanBoard
          tasks={displayTasks}
          onRowClick={setDetailTaskId}
          onToggleDone={handleToggleDone}
          onDrop={handleKanbanDrop}
        />
      ) : (
        <TaskListView
          tasks={displayTasks}
          trash={showTrash}
          expandedGroups={expandedGroups}
          onToggleGroup={handleToggleGroup}
          onRowClick={setDetailTaskId}
          onToggleDone={handleToggleDone}
        />
      )}

      <TaskDetailModal
        open={detailTaskId != null}
        task={detailTask}
        onClose={() => setDetailTaskId(null)}
        onSave={handleSaveDetail}
        onRemove={handleRemoveDetail}
        onRestore={handleRestoreDetail}
      />

      <Toast toast={toast} />
    </div>
  );
});

export default BoardTab;
