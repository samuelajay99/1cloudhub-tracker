'use client';

// Board's quick-add row — ported from app/index.html's `.quick-add` HTML
// block plus quickAddTask()'s Enter-to-submit keydown listener (the
// extraction/fallback logic itself lives in BoardTab.tsx; this component is
// pure presentation).
import { forwardRef } from 'react';
import type { TaskPriority } from '../types';

export type PriorityOverride = 'auto' | TaskPriority;

const QuickAddBar = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onValueChange: (v: string) => void;
    priority: PriorityOverride;
    onPriorityChange: (p: PriorityOverride) => void;
    busy: boolean;
    status: string;
    onSubmit: () => void;
  }
>(function QuickAddBar({ value, onValueChange, priority, onPriorityChange, busy, status, onSubmit }, ref) {
  return (
    <div className="ch-quick-add-wrap">
      <div className="ch-quick-add">
        <input
          ref={ref}
          type="text"
          className="ch-field ch-quick-add-input"
          value={value}
          placeholder="Type a task in plain English, e.g. 'Call Meera about the invoice by Friday' — press Enter"
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
          disabled={busy}
        />
        <select
          className="ch-field ch-quick-add-priority"
          title="Priority"
          value={priority}
          onChange={(e) => onPriorityChange(e.target.value as PriorityOverride)}
          disabled={busy}
        >
          <option value="auto">Auto priority</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <button type="button" className="ch-btn ch-btn-primary" onClick={onSubmit} disabled={busy}>
          {busy ? 'Adding…' : 'Add Task'}
        </button>
      </div>
      <span className="ch-status-line">{status}</span>
    </div>
  );
});

export default QuickAddBar;
