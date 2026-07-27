-- Beacon: per-question timers + speed-based scoring.

-- Optional per-question countdown, in seconds. Null = no timer (question
-- stays open until the host advances manually, today's original behavior).
alter table public.beacon_questions
  add column time_limit_seconds int;

-- Server-authoritative "when did this question open" timestamp, set by the
-- host's goLive()/nextQuestion() actions at the same time
-- current_question_index changes. beacon-submit computes elapsed time from
-- this rather than trusting a client-reported duration, so a participant
-- can't just claim they answered instantly to win the speed bonus.
alter table public.beacon_events
  add column current_question_started_at timestamptz;
