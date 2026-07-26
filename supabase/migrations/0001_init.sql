-- 1CloudHub Tracker: initial schema
-- Run via `supabase db push` (or paste into the SQL editor in the Supabase dashboard).

-- ── profiles ─────────────────────────────────────────────────────────────
-- One row per auth.users row. Holds the invite/approval gate and admin flag.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can see and update their own profile (but not status/is_admin — see below).
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

-- Admins can see every profile (needed for the approval page).
create policy "profiles: admins read all" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Only admins can change status/is_admin on someone else's row.
create policy "profiles: admins update all" on public.profiles
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- New signups land here automatically, status defaults to 'pending'.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── helper: is the current user approved? ──────────────────────────────────
create function public.is_approved()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'approved'
  );
$$;

-- ── notes ────────────────────────────────────────────────────────────────
-- Mirrors the shape of the ch_notes_v2 localStorage array in app/index.html.
create table public.notes (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  body text,
  transcript text,
  include_transcript_in_extract boolean default false,
  minutes text,
  minutes_generated_at timestamptz,
  minutes_source text,
  last_extracted_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.notes enable row level security;

create policy "notes: owner full access" on public.notes
  for all using (auth.uid() = user_id and public.is_approved())
  with check (auth.uid() = user_id and public.is_approved());

-- ── tasks ────────────────────────────────────────────────────────────────
-- Mirrors the shape of the ch_tasks_v1 localStorage array in app/index.html.
create table public.tasks (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  item text,
  parent text,
  type text,
  related text,
  priority text,
  status text,
  due text,
  notes text,
  source_note_id text,
  source_note_title text,
  manual boolean default false,
  deleted boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.tasks enable row level security;

create policy "tasks: owner full access" on public.tasks
  for all using (auth.uid() = user_id and public.is_approved())
  with check (auth.uid() = user_id and public.is_approved());

-- ── email_workspace ──────────────────────────────────────────────────────
-- One row per user, mirrors ch_email_workspace.
create table public.email_workspace (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.email_workspace enable row level security;

create policy "email_workspace: owner full access" on public.email_workspace
  for all using (auth.uid() = user_id and public.is_approved())
  with check (auth.uid() = user_id and public.is_approved());
