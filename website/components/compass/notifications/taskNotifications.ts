// Pure logic for "which tasks deserve the user's attention right now" —
// deliberately has zero opinion about how that gets shown (bell icon,
// badge, a mascot waving, whatever). See useTaskNotifications.ts for the
// stateful hook that wraps this, and CompassHome.tsx (later) for wherever
// it actually gets rendered.
import type { Task, TaskNotificationBucket } from '../types';
import { isOverdue, todayStr } from '../shared/taskDisplay';

// A task is notification-worthy in exactly two situations, in ascending
// order of urgency. Anything else (no due date, due later, already Done,
// already in Trash) is null — not worth interrupting the user for.
export function getTaskNotificationBucket(task: Task, today: string): TaskNotificationBucket | null {
  if (task.deleted || task.status === 'Done') return null;
  if (isOverdue(task, today)) return 'overdue';
  if (task.due === today) return 'due_today';
  return null;
}

// A task is an ACTIVE notification if it currently has a bucket AND that
// bucket differs from whatever the user last dismissed it from. This is
// the piece that makes dismissal smart rather than permanent: dismissing a
// "due today" notice suppresses it for the rest of today, but if the task
// is still open tomorrow it becomes 'overdue' — a genuinely worse state —
// which no longer matches the dismissed bucket, so it re-surfaces. A task
// that's been overdue for a week and was dismissed once stays suppressed
// (its bucket never changes), which is deliberate: re-nagging daily about
// the same unchanged overdue task is exactly the kind of thing that trains
// people to ignore notifications altogether. If that turns out to be too
// quiet in practice, the fix is re-dismissing after N days, not here.
export function isTaskNotificationActive(task: Task, today: string): boolean {
  const bucket = getTaskNotificationBucket(task, today);
  if (!bucket) return false;
  return task.notifiedDismissedBucket !== bucket;
}

// Sort order for however a notification list ends up being displayed:
// overdue before due-today, then earliest due date first within each.
export function compareTaskNotifications(a: Task, b: Task, today: string): number {
  const bucketRank = (t: Task) => (getTaskNotificationBucket(t, today) === 'overdue' ? 0 : 1);
  const r = bucketRank(a) - bucketRank(b);
  if (r !== 0) return r;
  return (a.due || '9999').localeCompare(b.due || '9999');
}

export { todayStr };
