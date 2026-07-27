-- Beacon: persist "which closing-ceremony view was shown" so the
-- leaderboard/podium reveal survives a page reload or a presenter tab
-- opened after the fact — not just a live broadcast that only reaches
-- whichever tabs happened to already be subscribed at that exact moment.
-- Raffle winners already persist in beacon_raffle_winners, so no new
-- column is needed for that one.
alter table public.beacon_events
  add column leaderboard_shown_at timestamptz,
  add column podium_shown_at timestamptz;
