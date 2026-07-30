-- Beacon: capture which company a participant is joining from, alongside
-- their name/email, so hosts can export it after the event. Optional (not
-- every event cares who's from where), so no default/not-null constraint.
alter table public.beacon_participants
  add column company text;
