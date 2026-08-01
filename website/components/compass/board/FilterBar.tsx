'use client';

// Board's filter/search/view-switch row — ported from the `.controls-row`
// block in app/index.html plus the small filter-state module vars
// (personFilterVal/searchVal/priorityFilterVal/dueFilterVal/statusFilterVal/
// boardViewMode/showTrash). Pure presentation; BoardTab.tsx owns all the
// state and filtering logic.
import { forwardRef } from 'react';
import type { TaskPriority, TaskStatus } from '../types';

const FilterBar = forwardRef<
  HTMLInputElement,
  {
    searchVal: string;
    onSearchChange: (v: string) => void;
    people: string[];
    personFilterVal: string;
    onPersonChange: (v: string) => void;
    statusFilterVal: TaskStatus | '';
    onStatusChange: (v: TaskStatus | '') => void;
    priorityFilterVal: TaskPriority | '';
    onPriorityChange: (v: TaskPriority | '') => void;
    dueFilterVal: '' | 'overdue' | 'today';
    onToggleOverdue: () => void;
    onToggleToday: () => void;
    showTrash: boolean;
    trashCount: number;
    onToggleTrash: () => void;
    boardViewMode: 'list' | 'kanban';
    onSetViewMode: (mode: 'list' | 'kanban') => void;
  }
>(function FilterBar(
  {
    searchVal,
    onSearchChange,
    people,
    personFilterVal,
    onPersonChange,
    statusFilterVal,
    onStatusChange,
    priorityFilterVal,
    onPriorityChange,
    dueFilterVal,
    onToggleOverdue,
    onToggleToday,
    showTrash,
    trashCount,
    onToggleTrash,
    boardViewMode,
    onSetViewMode,
  },
  ref
) {
  return (
    <div className="ch-board-controls-row">
      <input
        ref={ref}
        type="text"
        className="ch-field ch-board-search"
        placeholder="Search tasks..."
        value={searchVal}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        className="ch-field ch-board-select"
        value={personFilterVal}
        onChange={(e) => onPersonChange(e.target.value)}
      >
        <option value="">All people</option>
        {people.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select
        className="ch-field ch-board-select"
        value={statusFilterVal}
        onChange={(e) => onStatusChange(e.target.value as TaskStatus | '')}
      >
        <option value="">All statuses</option>
        <option value="Open">Open</option>
        <option value="In Progress">In Progress</option>
        <option value="Waiting on Others">Waiting on Others</option>
        <option value="Done">Done</option>
      </select>
      <select
        className="ch-field ch-board-select"
        value={priorityFilterVal}
        onChange={(e) => onPriorityChange(e.target.value as TaskPriority | '')}
      >
        <option value="">All priorities</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
      <button
        type="button"
        className={'ch-chip' + (dueFilterVal === 'overdue' ? ' selected' : '')}
        onClick={onToggleOverdue}
      >
        Overdue
      </button>
      <button type="button" className={'ch-chip' + (dueFilterVal === 'today' ? ' selected' : '')} onClick={onToggleToday}>
        Today
      </button>
      <div className="ch-board-view-toggle">
        <button
          type="button"
          className={'ch-board-view-btn' + (boardViewMode === 'list' || showTrash ? ' active' : '')}
          onClick={() => onSetViewMode('list')}
        >
          List
        </button>
        <button
          type="button"
          className={'ch-board-view-btn' + (boardViewMode === 'kanban' && !showTrash ? ' active' : '')}
          onClick={() => onSetViewMode('kanban')}
          disabled={showTrash}
        >
          Kanban
        </button>
      </div>
      <button
        type="button"
        className={'ch-btn ch-btn-secondary ch-board-trash-btn' + (showTrash ? ' active' : '')}
        onClick={onToggleTrash}
      >
        Trash ({trashCount})
      </button>
    </div>
  );
});

export default FilterBar;
