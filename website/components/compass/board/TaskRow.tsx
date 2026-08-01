'use client';

// Shared row renderer for Board's List view (both the grouped-by-note view
// and the flat Trash view) — ported from app/index.html's taskRowHtml()
// inside renderBoard(). Not reused by KanbanBoard.tsx (vanilla's
// kanbanCardHtml() is a materially different card layout — parent/source
// lines, drag handles, no group context) nor by NoteTasksModal.tsx (a
// narrower pull-out list with an always-visible checkbox and no
// type/person columns) — see BoardTab.tsx's header comment / the phase
// report for why those weren't unified into this component too.
import { useRef } from 'react';
import type { Task } from '../types';
import { PRIORITY_COLOR, relativeDueLabel, statusClass } from '../shared/taskDisplay';
import { celebrate } from '../shared/celebrate';

export default function TaskRow({
  task,
  overdue,
  showCheckbox,
  onClick,
  onToggleDone,
}: {
  task: Task;
  overdue: boolean;
  showCheckbox: boolean;
  onClick: () => void;
  onToggleDone: (done: boolean) => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const pc = (task.priority && PRIORITY_COLOR[task.priority]) || 'var(--gray-500)';
  const done = task.status === 'Done';

  // Matches vanilla's global capturing `change` listener on `.row-check`
  // (`if (el.checked) celebrate(r.left + 8, r.top + 8)`) — bursts confetti
  // from the checkbox's own position whenever it transitions to checked,
  // independent of the status-update side effect below.
  function handleCheckChange(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    if (checked && checkboxRef.current) {
      const r = checkboxRef.current.getBoundingClientRect();
      celebrate(r.left + 8, r.top + 8);
    }
    onToggleDone(checked);
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className={'ch-task-row' + (done ? ' done-row' : '')} onClick={onClick}>
      {showCheckbox ? (
        <input
          ref={checkboxRef}
          type="checkbox"
          className="ch-task-row-check"
          checked={done}
          onClick={(e) => e.stopPropagation()}
          onChange={handleCheckChange}
        />
      ) : null}
      <span className="ch-task-row-priority" style={{ background: pc }} />
      <span className={'ch-task-row-item' + (done ? ' done' : '')}>{task.item}</span>
      {task.type ? <span className="ch-task-row-tag">{task.type}</span> : null}
      <span className="ch-task-row-person">{task.related || ''}</span>
      <span className={'ch-task-row-due' + (overdue ? ' overdue' : '')}>{relativeDueLabel(task.due, task.status)}</span>
      <span className={'ch-badge ' + statusClass(task.status || 'Open')}>{task.status || 'Open'}</span>
    </div>
  );
}
