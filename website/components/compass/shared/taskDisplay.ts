// Small display-only helpers shared between the Board tab and Notes'
// NoteTasksModal pull-out panel — ported from app/index.html's
// PRIORITY_COLOR/STATUSES/todayStr()/statusClass()/relativeDueLabel().
// NoteTasksModal.tsx originally kept ad hoc local copies of these (see its
// own header comment: "Board tab, built in a later phase, will need
// equivalents — worth hoisting into a shared module at that point rather
// than duplicating ad hoc"). This module is that hoist — NoteTasksModal.tsx
// now imports from here too instead of keeping its own copies.
import type { Task, TaskStatus } from '../types';

export const STATUSES: TaskStatus[] = ['Open', 'In Progress', 'Waiting on Others', 'Done'];

// Vanilla's own palette (PRIORITY_COLOR = { High: '#F07814', Medium:
// '#1899C2', Low: '#8ED4EE' }) is deliberately NOT reused verbatim — per the
// Board build plan, the website re-skins everything onto the 1CloudHub
// design-system tokens instead (see globals.css). Three tokens of
// descending visual weight: red (urgent/High) > the design system's own
// "point accent" orange (a fitting middling-urgency signal for Medium) >
// a pale desaturated blue (calm/Low).
export const PRIORITY_COLOR: Record<string, string> = {
  High: 'var(--red-500)',
  Medium: 'var(--orange-500)',
  Low: 'var(--blue-200)',
};

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// CSS class suffix for a status badge — port of vanilla's statusClass(), but
// `.ch-status-*` per the website's naming convention (see the
// `.ch-badge.ch-status-*` rules already added to globals.css for Notes'
// NoteTasksModal, which this Board tab reuses unchanged).
export function statusClass(s: string): string {
  return 'ch-status-' + s.replace(/ /g, '-');
}

export function relativeDueLabel(due: string | null, status: string | null): string {
  if (!due) return '—';
  const d = new Date(due + 'T00:00:00');
  const now = new Date(todayStr() + 'T00:00:00');
  const diffDays = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (status === 'Done') return due;
  if (diffDays < 0) return `Overdue ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays <= 6) return `Due in ${diffDays}d`;
  return due;
}

// Port of renderBoard()'s per-task `t._overdue = !!(t.due && t.due < today
// && t.status !== 'Done')` — computed on demand here instead of stashed as
// a mutated property on the task object.
export function isOverdue(task: Pick<Task, 'due' | 'status'>, today: string): boolean {
  return !!(task.due && task.due < today && task.status !== 'Done');
}
