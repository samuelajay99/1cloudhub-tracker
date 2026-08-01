'use client';

// Board's List view — grouped-by-source-note list with collapsible groups,
// or (in Trash) a flat list with no grouping. Ported from renderBoard()'s
// `if (!displayTasks.length) ... else if (showTrash) { flat } else { group
// by source note ... }` branch. `trash` doubles as both "skip grouping" and
// "hide the row checkbox" — exactly like vanilla's single `showTrash` flag
// drives both.
import { useMemo } from 'react';
import type { Task } from '../types';
import TaskRow from './TaskRow';
import { isOverdue, todayStr } from '../shared/taskDisplay';

interface Group {
  id: string;
  title: string;
  tasks: Task[];
  overdueCount: number;
  openCount: number;
}

export default function TaskListView({
  tasks,
  trash,
  expandedGroups,
  onToggleGroup,
  onRowClick,
  onToggleDone,
}: {
  tasks: Task[];
  trash: boolean;
  expandedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
  onRowClick: (taskId: string) => void;
  onToggleDone: (taskId: string, done: boolean) => void;
}) {
  const today = todayStr();

  // Group by source note (or "Added manually" for quick-add tasks) —
  // ported verbatim from renderBoard()'s groups Map + groupList.sort().
  const groups = useMemo<Group[]>(() => {
    if (trash) return [];
    const map = new Map<string, Group>();
    tasks.forEach((t) => {
      const gid = t.sourceNoteId || 'manual';
      const gtitle = t.sourceNoteId ? t.sourceNoteTitle || 'Untitled note' : 'Added manually on Board';
      let g = map.get(gid);
      if (!g) {
        g = { id: gid, title: gtitle, tasks: [], overdueCount: 0, openCount: 0 };
        map.set(gid, g);
      }
      g.tasks.push(t);
    });
    const list = Array.from(map.values());
    list.forEach((g) => {
      g.overdueCount = g.tasks.filter((t) => isOverdue(t, today)).length;
      g.openCount = g.tasks.filter((t) => t.status !== 'Done').length;
    });
    list.sort((a, b) => {
      if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
      if (a.openCount !== b.openCount) return b.openCount - a.openCount;
      return a.title.localeCompare(b.title);
    });
    return list;
  }, [tasks, trash, today]);

  if (!tasks.length) {
    return <div className="ch-task-list-empty">{trash ? 'Trash is empty' : 'No tasks match this view'}</div>;
  }

  if (trash) {
    return (
      <div className="ch-task-list">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            overdue={isOverdue(t, today)}
            showCheckbox={false}
            onClick={() => onRowClick(t.id)}
            onToggleDone={(done) => onToggleDone(t.id, done)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="ch-task-list">
      {groups.map((g) => {
        const expanded = expandedGroups.has(g.id);
        return (
          <div className="ch-task-group" key={g.id}>
            <button
              type="button"
              className={'ch-task-group-header' + (expanded ? ' expanded' : '')}
              onClick={() => onToggleGroup(g.id)}
            >
              <span className="ch-task-group-chevron">&#9656;</span>
              <span className="ch-task-group-title">{g.title}</span>
              {g.overdueCount > 0 ? (
                <span className="ch-task-group-count has-overdue">{g.overdueCount} overdue</span>
              ) : (
                <span className="ch-task-group-count">{g.tasks.length}</span>
              )}
            </button>
            {expanded ? (
              <div className="ch-task-group-rows">
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    overdue={isOverdue(t, today)}
                    showCheckbox={true}
                    onClick={() => onRowClick(t.id)}
                    onToggleDone={(done) => onToggleDone(t.id, done)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
