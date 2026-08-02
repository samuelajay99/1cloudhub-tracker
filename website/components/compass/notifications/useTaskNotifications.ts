'use client';

// Stateful wrapper around taskNotifications.ts's pure bucket logic — the
// thing an eventual delivery UI (bell icon, badge, pet mascot, whatever)
// actually imports. Reuses useCompassData's existing tasks array and
// updateTask (same debounced-upsert path everything else on Board uses) —
// no separate fetch, no polling, no realtime subscription needed, since
// "which tasks are due" is already fully derivable from data already in
// memory.
import { useEffect, useMemo, useState } from 'react';
import type { UseCompassData } from '../useCompassData';
import type { Task } from '../types';
import { compareTaskNotifications, getTaskNotificationBucket, isTaskNotificationActive, todayStr } from './taskNotifications';

// How often to re-check "what day is it" while a tab stays open. This is
// the one bit of real time-based logic here: everything else recomputes
// automatically whenever `data.tasks` changes, but a task quietly flipping
// from "due today" to "overdue" at midnight needs something to notice even
// if nothing else changes and the tab is never reloaded. Five minutes is
// frequent enough that the flip is never off by more than that, and cheap
// enough (a plain string comparison over an already-in-memory array) not
// to matter for a background interval.
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface UseTaskNotifications {
  /** Tasks currently deserving attention, overdue first then soonest due. */
  active: Task[];
  count: number;
  /** Suppresses this task's CURRENT bucket — re-surfaces automatically if it gets worse (due-today -> overdue). See taskNotifications.ts. */
  dismiss: (taskId: string) => void;
  dismissAll: () => void;
}

export function useTaskNotifications(data: UseCompassData): UseTaskNotifications {
  const [today, setToday] = useState(todayStr);

  useEffect(() => {
    const tick = () => setToday((prev) => {
      const next = todayStr();
      return next === prev ? prev : next;
    });
    const interval = setInterval(tick, RECHECK_INTERVAL_MS);
    // Also re-check whenever the tab regains focus/visibility — catches the
    // common case of a laptop closed overnight and reopened the next
    // morning, where the interval above simply wasn't running to fire.
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, []);

  const active = useMemo(() => {
    return data.tasks
      .filter((t) => isTaskNotificationActive(t, today))
      .sort((a, b) => compareTaskNotifications(a, b, today));
  }, [data.tasks, today]);

  function dismiss(taskId: string) {
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const bucket = getTaskNotificationBucket(task, today);
    if (!bucket) return;
    data.updateTask(taskId, { notifiedDismissedBucket: bucket, notifiedDismissedAt: new Date().toISOString() });
  }

  function dismissAll() {
    active.forEach((t) => dismiss(t.id));
  }

  return { active, count: active.length, dismiss, dismissAll };
}
