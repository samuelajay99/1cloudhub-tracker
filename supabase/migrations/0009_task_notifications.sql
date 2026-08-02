-- In-app task notifications: foundation only (no delivery UI, no channel
-- integrations — see website/components/compass/notifications/). Tracks
-- which "notification-worthy state" a task was last dismissed in, so the
-- eventual UI (bell icon, badge, or whatever the pet mascot becomes) can
-- compute "what needs the user's attention right now" without re-surfacing
-- something they already acknowledged, while still re-surfacing it if the
-- task's situation genuinely got worse (e.g. drifted from due-today to
-- overdue after the user dismissed the due-today notice).
--
-- notified_dismissed_bucket stores which bucket ('due_today' | 'overdue')
-- was last dismissed; the app compares this against the task's CURRENT
-- computed bucket (see taskNotifications.ts) rather than trusting this
-- column alone, so no server-side logic is needed here — it's just storage.
alter table public.tasks
  add column notified_dismissed_bucket text,
  add column notified_dismissed_at timestamptz;
