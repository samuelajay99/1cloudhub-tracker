'use client';

// Board's Kanban view — 4 status columns, native HTML5 drag-and-drop.
// Ported from renderBoard()'s kanbanCardHtml() plus the dragstart/dragend/
// dragover/dragleave/drop wiring right below it. Kanban is unavailable
// while Trash is showing — BoardTab forces List in that case (matching
// vanilla's `useKanban = (boardViewMode === 'kanban') && !showTrash`), so
// this component never needs a trash/flat mode of its own.
import { useRef, useState } from 'react';
import type { Task, TaskStatus } from '../types';
import { PRIORITY_COLOR, STATUSES, isOverdue, relativeDueLabel, todayStr } from '../shared/taskDisplay';
import { celebrate } from '../shared/celebrate';

function KanbanCard({
  task,
  overdue,
  onClick,
  onToggleDone,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  overdue: boolean;
  onClick: () => void;
  onToggleDone: (done: boolean) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const pc = (task.priority && PRIORITY_COLOR[task.priority]) || 'var(--gray-500)';
  const done = task.status === 'Done';

  // Same celebrate-on-check behavior as TaskRow — vanilla's global
  // `.row-check` change listener applies to every checkbox with that class,
  // Kanban's included, not just List's.
  function handleCheckChange(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    if (checked && checkboxRef.current) {
      const r = checkboxRef.current.getBoundingClientRect();
      celebrate(r.left + 8, r.top + 8);
    }
    onToggleDone(checked);
  }

  return (
    <div
      className={'ch-kanban-card' + (done ? ' done-card' : '')}
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <div className="ch-kanban-card-top">
        <input
          ref={checkboxRef}
          type="checkbox"
          className="ch-task-row-check"
          checked={done}
          onClick={(e) => e.stopPropagation()}
          onChange={handleCheckChange}
        />
        <span className="ch-task-row-priority" style={{ background: pc }} />
        <span className={'ch-kanban-card-item' + (done ? ' done' : '')}>{task.item}</span>
        {overdue ? <span className="ch-badge danger">OVERDUE</span> : null}
      </div>
      {task.parent ? <div className="ch-kanban-card-parent">&#8627; sub-task of: {task.parent}</div> : null}
      <div className="ch-kanban-card-meta">
        {task.type ? <span className="ch-kanban-card-tag">{task.type}</span> : null}
        {task.related ? <span className="ch-kanban-card-tag">{task.related}</span> : null}
        <span>{relativeDueLabel(task.due, task.status)}</span>
      </div>
      {task.sourceNoteTitle ? (
        <div className="ch-kanban-card-source">from note: {task.sourceNoteTitle}</div>
      ) : task.manual ? (
        <div className="ch-kanban-card-source">Added manually</div>
      ) : null}
    </div>
  );
}

export default function KanbanBoard({
  tasks,
  onRowClick,
  onToggleDone,
  onDrop,
}: {
  tasks: Task[];
  onRowClick: (taskId: string) => void;
  onToggleDone: (taskId: string, done: boolean) => void;
  onDrop: (taskId: string, newStatus: TaskStatus, clientX: number, clientY: number) => void;
}) {
  const today = todayStr();
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  // Fallback for browsers/situations where dataTransfer.getData comes back
  // empty on drop (some browsers restrict reads during dragover but this is
  // a defensive belt-and-braces, not something vanilla needed to worry
  // about since it ran in a single controlled Electron/Chromium build).
  const draggingIdRef = useRef<string | null>(null);

  function handleDragStart(e: React.DragEvent, id: string) {
    draggingIdRef.current = id;
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    draggingIdRef.current = null;
  }

  return (
    <div className="ch-kanban-board">
      {STATUSES.map((status) => {
        const items = tasks.filter((t) => (t.status || 'Open') === status);
        return (
          <div
            key={status}
            className={'ch-kanban-column' + (dragOverStatus === status ? ' drag-over' : '')}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverStatus(status);
            }}
            onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverStatus(null);
              const id = e.dataTransfer.getData('text/plain') || draggingIdRef.current;
              if (!id) return;
              onDrop(id, status, e.clientX, e.clientY);
            }}
          >
            <div className="ch-kanban-column-header">
              {status} <span className="ch-kanban-count">{items.length}</span>
            </div>
            {items.length ? (
              items.map((t) => (
                <KanbanCard
                  key={t.id}
                  task={t}
                  overdue={isOverdue(t, today)}
                  onClick={() => onRowClick(t.id)}
                  onToggleDone={(done) => onToggleDone(t.id, done)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))
            ) : (
              <div className="ch-kanban-empty">Drop tasks here</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
