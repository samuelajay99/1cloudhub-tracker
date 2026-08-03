-- Automatic scheduling for horizon-harvest (was manual-only — see that
-- function's own header comment: "Until horizon-scheduler + pg_cron land
-- in Phase 2, invoke manually"). This migration IS that Phase 2: a
-- pg_cron job inside Postgres itself calls the deployed Edge Function on a
-- schedule, so horizon_stories stays fresh without anyone needing to run
-- the curl command from horizon-harvest's header by hand.
--
-- The service-role key horizon-harvest needs to authenticate the call is
-- deliberately NOT in this file — this repo is public (see README.md), so
-- committing a real secret here would leak it. Instead the key lives in
-- Supabase Vault, seeded ONCE via a separate command run directly in the
-- SQL editor (never committed, never shared in chat):
--
--   select vault.create_secret(
--     'paste-your-real-service-role-key-here',
--     'horizon_service_role_key',
--     'Used by pg_cron to call horizon-harvest on a schedule'
--   );
--
-- Run that first, THEN run this migration — the cron job below looks the
-- key up from Vault by name at call time, so this file only ever contains
-- a reference to it, never the value itself.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Every 6 hours (00:00 / 06:00 / 12:00 / 18:00 UTC) — 4x/day, per BRD
-- HZ-HV-01. Harvest is timezone-agnostic (it just needs to keep
-- horizon_stories populated within the 36h candidate window
-- horizon-brief reads from — see RANKING_CONFIG.candidateWindowHours in
-- _shared/horizon.ts), so this doesn't need to align with any particular
-- user's morning the way brief generation itself does.
select cron.schedule(
  'horizon-harvest-4x-daily',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://wzkxivwyorzygjnhuyye.supabase.co/functions/v1/horizon-harvest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'horizon_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
