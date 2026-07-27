-- Beacon: live polling/quiz events.
-- Run via `supabase db push` (or paste into the SQL editor in the Supabase dashboard).

-- ── app_access ───────────────────────────────────────────────────────────
-- Generic per-app approval gate, on top of the platform-wide
-- profiles.status gate. An approved Orbit account is not automatically
-- allowed to host Beacon events — the platform admin decides that
-- separately, per app_id. Only 'beacon' is used today; future marketplace
-- apps can reuse this same table rather than inventing their own.
create table public.app_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_id text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  unique (user_id, app_id)
);

alter table public.app_access enable row level security;

-- A user can see their own request(s).
create policy "app_access: read own" on public.app_access
  for select using (auth.uid() = user_id);

-- Admins can see every request (needed for the admin approval page).
create policy "app_access: admins read all" on public.app_access
  for select using (public.is_admin());

-- Self-service "request access" — always lands as pending; a user can't
-- insert their own row as already-approved.
create policy "app_access: request own" on public.app_access
  for insert with check (auth.uid() = user_id and status = 'pending');

-- Only admins can approve/reject.
create policy "app_access: admins update all" on public.app_access
  for update using (public.is_admin());

create function public.has_app_access(check_app_id text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.app_access
    where user_id = auth.uid() and app_id = check_app_id and status = 'approved'
  );
$$;

-- ── beacon_events ────────────────────────────────────────────────────────
create table public.beacon_events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  type text not null check (type in ('poll', 'quiz')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'live', 'closed', 'archived')),
  join_code text unique,
  current_question_index int,
  leaderboard_visible boolean not null default false,
  leaderboard_scope text check (leaderboard_scope in ('top5', 'top10', 'full')),
  raffle_enabled boolean not null default false,
  raffle_winner_count int,
  raffle_eligibility text check (raffle_eligibility in ('all', 'completed', 'min_score')),
  raffle_min_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  live_started_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz
);

alter table public.beacon_events enable row level security;

create policy "beacon_events: host full access" on public.beacon_events
  for all using (auth.uid() = host_id and public.is_approved() and public.has_app_access('beacon'))
  with check (auth.uid() = host_id and public.is_approved() and public.has_app_access('beacon'));

-- ── beacon_questions ─────────────────────────────────────────────────────
create table public.beacon_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.beacon_events (id) on delete cascade,
  order_index int not null,
  title text not null,
  options jsonb not null,              -- [{id:"opt_1", label:"..."}, ...]
  correct_option_id text,              -- null for polls
  points int not null default 0,
  explanation text,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, order_index)
);

create index beacon_questions_event_id_idx on public.beacon_questions (event_id);

alter table public.beacon_questions enable row level security;

create policy "beacon_questions: host full access via event" on public.beacon_questions
  for all using (
    exists (select 1 from public.beacon_events e where e.id = beacon_questions.event_id and e.host_id = auth.uid())
  )
  with check (
    exists (select 1 from public.beacon_events e where e.id = beacon_questions.event_id and e.host_id = auth.uid())
  );

-- ── beacon_participants ──────────────────────────────────────────────────
-- No Supabase Auth session for participants — this row's own id doubles as
-- the participant's opaque session token, handed back by beacon-join and
-- stored in their browser. All writes to this table happen through the
-- beacon-join/beacon-submit Edge Functions via the service-role key, which
-- bypasses RLS entirely — no insert/update policy exists here on purpose.
create table public.beacon_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.beacon_events (id) on delete cascade,
  name text not null,
  email text not null,
  score int not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

create index beacon_participants_event_id_idx on public.beacon_participants (event_id);

alter table public.beacon_participants enable row level security;

create policy "beacon_participants: host read via event" on public.beacon_participants
  for select using (
    exists (select 1 from public.beacon_events e where e.id = beacon_participants.event_id and e.host_id = auth.uid())
  );

-- ── beacon_responses ─────────────────────────────────────────────────────
-- unique(question_id, participant_id) is the actual source of truth for
-- duplicate-submission prevention (enforced by beacon-submit's
-- insert-then-handle-23505 pattern), not just a nice-to-have.
create table public.beacon_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.beacon_events (id) on delete cascade,
  question_id uuid not null references public.beacon_questions (id) on delete cascade,
  participant_id uuid not null references public.beacon_participants (id) on delete cascade,
  option_id text not null,
  is_correct boolean,
  points_awarded int not null default 0,
  response_time_ms int,
  created_at timestamptz not null default now(),
  unique (question_id, participant_id)
);

create index beacon_responses_event_id_idx on public.beacon_responses (event_id);
create index beacon_responses_question_id_idx on public.beacon_responses (question_id);

alter table public.beacon_responses enable row level security;

create policy "beacon_responses: host read via event" on public.beacon_responses
  for select using (
    exists (select 1 from public.beacon_events e where e.id = beacon_responses.event_id and e.host_id = auth.uid())
  );

-- ── beacon_raffle_winners ────────────────────────────────────────────────
create table public.beacon_raffle_winners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.beacon_events (id) on delete cascade,
  participant_id uuid not null references public.beacon_participants (id) on delete cascade,
  drawn_at timestamptz not null default now(),
  unique (event_id, participant_id)
);

create index beacon_raffle_winners_event_id_idx on public.beacon_raffle_winners (event_id);

alter table public.beacon_raffle_winners enable row level security;

create policy "beacon_raffle_winners: host full access via event" on public.beacon_raffle_winners
  for all using (
    exists (select 1 from public.beacon_events e where e.id = beacon_raffle_winners.event_id and e.host_id = auth.uid())
  )
  with check (
    exists (select 1 from public.beacon_events e where e.id = beacon_raffle_winners.event_id and e.host_id = auth.uid())
  );

-- ── scoring helper ───────────────────────────────────────────────────────
-- Atomic increment for beacon-submit, so a participant's score can never be
-- double-counted via a read-modify-write race. Only ever called by the
-- service-role client from beacon-submit (never exposed to anon/host RLS).
create function public.increment_beacon_score(p_participant_id uuid, p_delta int)
returns void
language sql
as $$
  update public.beacon_participants set score = score + p_delta where id = p_participant_id;
$$;
