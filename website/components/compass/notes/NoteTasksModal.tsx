'use client';

// "Tasks extracted from this note" pull-out panel — ported from
// app/index.html's renderNoteTasksPane()/openNoteTasksModal()/
// wireNoteTaskRowListeners(). PRIORITY_COLOR/statusClass/relativeDueLabel
// used to be small ported display helpers kept local to this component;
// now that the Board tab needs equivalents too, they've been hoisted into
// shared/taskDisplay.ts (see that file's header comment) and this component
// imports from there instead.
import Modal from '../shared/Modal';
import type { Task } from '../types';
import { PRIORITY_COLOR, relativeDueLabel, statusClass, todayStr } from '../shared/taskDisplay';

export default function NoteTasksModal({
  open,
  onClose,
  tasks,
  onToggleDone,
}: {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  onToggleDone: (taskId: string, done: boolean) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Tasks from this note">
      {tasks.length === 0 ? (
        <div className="ch-notes-modal-empty">No tasks extracted yet.</div>
      ) : (
        <div className="ch-note-task-list">
          {tasks.map((t) => {
            const pc = (t.priority && PRIORITY_COLOR[t.priority]) || '#999';
            const done = t.status === 'Done';
            const overdue = !!(t.due && t.due < todayStr() && t.status !== 'Done');
            return (
              <label className="ch-note-task-row" key={t.id}>
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => onToggleDone(t.id, e.target.checked)}
                />
                <span className="ch-note-task-priority" style={{ background: pc }} />
                <span className={'ch-note-task-item' + (done ? ' done' : '')}>{t.item}</span>
                <span className={'ch-note-task-due' + (overdue ? ' overdue' : '')}>{relativeDueLabel(t.due, t.status)}</span>
                <span className={'ch-badge ' + statusClass(t.status || 'Open')}>{t.status || 'Open'}</span>
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
