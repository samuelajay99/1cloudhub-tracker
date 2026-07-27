-- Horizon: personalised daily intelligence brief. Third app on Orbit.
-- See Horizon_BRD.md / Horizon_Product_Plan.md for full rationale.
--
-- Access model: platform-wide is_approved() (0001_init.sql) plus the
-- generic per-app has_app_access('horizon') gate (0004_beacon.sql) — no
-- new access-control mechanism, reuse both exactly as Beacon does.

-- ── per-user configuration ──────────────────────────────────────────────
create table public.horizon_profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  role_title        text,
  industry          text,
  seniority         text check (seniority in ('ic', 'lead', 'head', 'cxo')),
  company           text,
  country           text,
  city              text,
  timezone          text not null default 'Asia/Kolkata',
  delivery_time     time not null default '07:00',
  lenses            jsonb not null default '{"global":true,"national":true,"local":true,"your_world":true,"your_craft":true}'::jsonb,
  goals             text[] not null default '{}',
  brief_length      text not null default 'standard' check (brief_length in ('short', 'standard', 'long')),
  weekend_mode      text not null default 'lighter' check (weekend_mode in ('off', 'lighter', 'same')),
  email_delivery    boolean not null default false,
  paused_until      date,
  onboarding_step   int not null default 0,
  onboarding_done   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── interest graph ───────────────────────────────────────────────────────
create table public.horizon_interests (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  kind               text not null check (kind in ('topic', 'entity', 'skill', 'region', 'source', 'format')),
  label              text not null,
  weight             numeric(4, 3) not null default 0.5 check (weight >= -1 and weight <= 1),
  provenance         text not null default 'onboarding' check (provenance in ('onboarding', 'explicit', 'inferred', 'manual')),
  muted_until        timestamptz,
  last_reinforced_at timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (user_id, kind, label)
);
create index horizon_interests_user_kind_idx on public.horizon_interests (user_id, kind);

-- ── curated source registry (shared) ────────────────────────────────────
create table public.horizon_sources (
  domain        text primary key,
  name          text,
  tier          int not null default 3 check (tier between 1 and 4),
  is_primary    boolean not null default false,
  is_blocked    boolean not null default false,
  note          text,
  created_at    timestamptz not null default now()
);

-- ── shared story pool (not per-user — this is the whole point, see BRD §6.1) ──
create table public.horizon_story_clusters (
  id                uuid primary key default gen_random_uuid(),
  canonical_title   text not null,
  canonical_summary text,
  event_date        date,
  story_count       int not null default 1,
  velocity          numeric,
  created_at        timestamptz not null default now()
);

create table public.horizon_stories (
  id                uuid primary key default gen_random_uuid(),
  cluster_id        uuid references public.horizon_story_clusters (id) on delete set null,
  url               text not null,
  url_hash          text not null unique,
  title             text not null,
  publisher         text,
  domain            text references public.horizon_sources (domain),
  published_at      timestamptz,
  summary           text not null,
  topics            text[] not null default '{}',
  entities          text[] not null default '{}',
  region            text,
  lens_hint         text,
  credibility_tier  int default 3,
  is_primary_source boolean default false,
  read_minutes      int,
  contested         boolean default false,
  alt_view_url      text,
  first_seen_at     timestamptz not null default now()
);
create index horizon_stories_first_seen_idx on public.horizon_stories (first_seen_at desc);
create index horizon_stories_topics_idx on public.horizon_stories using gin (topics);
create index horizon_stories_entities_idx on public.horizon_stories using gin (entities);

-- ── briefs ───────────────────────────────────────────────────────────────
create table public.horizon_briefs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  brief_date      date not null,
  status          text not null default 'queued' check (status in ('queued', 'generating', 'ready', 'failed')),
  sixty_second    text,
  item_count      int not null default 0,
  is_quiet_day    boolean not null default false,
  model           text,
  input_tokens    int,
  output_tokens   int,
  error           text,
  attempts        int not null default 0,
  queued_at       timestamptz not null default now(),
  generated_at    timestamptz,
  unique (user_id, brief_date)
);
create index horizon_briefs_user_date_idx on public.horizon_briefs (user_id, brief_date desc);

create table public.horizon_brief_items (
  id              uuid primary key default gen_random_uuid(),
  brief_id        uuid not null references public.horizon_briefs (id) on delete cascade,
  story_id        uuid not null references public.horizon_stories (id) on delete cascade,
  section         text not null check (section in ('must_know', 'worth_knowing', 'radar', 'deep_dive', 'wildcard', 'water_cooler')),
  rank            int not null,
  lens            text not null check (lens in ('global', 'national', 'local', 'your_world', 'your_craft')),
  why_it_matters  text not null,
  score           numeric,
  is_exploration  boolean not null default false,
  is_read         boolean not null default false,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (brief_id, story_id)
);
create index horizon_brief_items_brief_idx on public.horizon_brief_items (brief_id, section, rank);

-- ── signals ──────────────────────────────────────────────────────────────
create table public.horizon_feedback (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  brief_item_id  uuid references public.horizon_brief_items (id) on delete set null,
  story_id       uuid references public.horizon_stories (id) on delete set null,
  signal         text not null check (signal in ('up', 'down', 'save', 'share', 'open', 'dwell', 'skip', 'read', 'mute_topic', 'mute_source', 'add_to_compass', 'report')),
  reason         text,
  value          numeric,
  created_at     timestamptz not null default now()
);
create index horizon_feedback_user_idx on public.horizon_feedback (user_id, created_at desc);

create table public.horizon_saved (
  user_id     uuid not null references auth.users (id) on delete cascade,
  story_id    uuid not null references public.horizon_stories (id) on delete cascade,
  note        text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (user_id, story_id)
);

create table public.horizon_calibrations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  week_start    date not null,
  candidates    uuid[] not null,
  best_item_id  uuid,
  worst_item_id uuid,
  answered_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ── account watch ────────────────────────────────────────────────────────
-- Commercially sensitive — see the confidentiality note above the RLS
-- section below before touching this table's policies.
create table public.horizon_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  owner_scope   text not null default 'user' check (owner_scope in ('user', 'org')), -- 'org' reserved for Phase 4, not implemented
  name          text not null,
  aliases       text[] not null default '{}',
  domain        text,
  watch_type    text not null check (watch_type in ('client', 'prospect', 'competitor', 'partner')),
  is_priority   boolean not null default false,
  is_paused     boolean not null default false,
  is_archived   boolean not null default false,
  owner_note    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, name)
);
create index horizon_accounts_active_idx on public.horizon_accounts (user_id) where not is_archived;

create table public.horizon_account_matches (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.horizon_accounts (id) on delete cascade,
  story_id        uuid not null references public.horizon_stories (id) on delete cascade,
  confidence      numeric(3, 2) not null check (confidence between 0 and 1),
  matched_alias   text,
  matched_on      text check (matched_on in ('entity', 'title', 'summary', 'domain')),
  trigger_type    text not null default 'other' check (trigger_type in ('leadership_change', 'funding', 'm_and_a', 'earnings', 'layoffs_restructuring', 'expansion_new_market', 'regulatory_action', 'breach_or_outage', 'major_partnership', 'product_launch', 'hiring_surge', 'tender_rfp', 'other')),
  suggested_angle text,
  is_dismissed    boolean not null default false,
  surfaced_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (account_id, story_id)
);
create index horizon_account_matches_account_idx on public.horizon_account_matches (account_id, created_at desc);

-- ── ops ──────────────────────────────────────────────────────────────────
create table public.horizon_harvest_runs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  beat_count      int,
  stories_found   int,
  stories_new     int,
  input_tokens    int,
  output_tokens   int,
  error           text
);

create table public.horizon_deliveries (
  id          uuid primary key default gen_random_uuid(),
  brief_id    uuid not null references public.horizon_briefs (id) on delete cascade,
  channel     text not null check (channel in ('in_app', 'email')),
  sent_at     timestamptz,
  opened_at   timestamptz,
  error       text
);

-- ── ownership helpers (security definer — see 0001_init.sql/0003 for why) ──
-- horizon_brief_items and horizon_deliveries don't carry user_id directly;
-- ownership resolves through horizon_briefs.user_id. A plain sub-query in a
-- policy defined on the same table it queries recurses (42P17) — routing
-- through horizon_briefs from a different table's policy doesn't hit that
-- specific recursion, but this is still routed through a security definer
-- helper for consistency with the rest of the codebase and so RLS on
-- horizon_briefs itself can never accidentally interfere with the check.
create function public.owns_horizon_brief(check_brief_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.horizon_briefs
    where id = check_brief_id and user_id = auth.uid()
  );
$$;

create function public.owns_horizon_account(check_account_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.horizon_accounts
    where id = check_account_id and user_id = auth.uid()
  );
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Directly-owned tables: own rows only, gated by has_app_access('horizon').
alter table public.horizon_profiles enable row level security;
alter table public.horizon_interests enable row level security;
alter table public.horizon_briefs enable row level security;
alter table public.horizon_feedback enable row level security;
alter table public.horizon_saved enable row level security;
alter table public.horizon_calibrations enable row level security;
alter table public.horizon_accounts enable row level security;

create policy "horizon_profiles: own row" on public.horizon_profiles
  for all using (user_id = auth.uid() and public.has_app_access('horizon'))
  with check (user_id = auth.uid() and public.has_app_access('horizon'));

create policy "horizon_interests: own rows" on public.horizon_interests
  for all using (user_id = auth.uid() and public.has_app_access('horizon'))
  with check (user_id = auth.uid() and public.has_app_access('horizon'));

create policy "horizon_briefs: own rows" on public.horizon_briefs
  for all using (user_id = auth.uid() and public.has_app_access('horizon'))
  with check (user_id = auth.uid() and public.has_app_access('horizon'));

create policy "horizon_feedback: own rows" on public.horizon_feedback
  for all using (user_id = auth.uid() and public.has_app_access('horizon'))
  with check (user_id = auth.uid() and public.has_app_access('horizon'));

create policy "horizon_saved: own rows" on public.horizon_saved
  for all using (user_id = auth.uid() and public.has_app_access('horizon'))
  with check (user_id = auth.uid() and public.has_app_access('horizon'));

create policy "horizon_calibrations: own rows" on public.horizon_calibrations
  for all using (user_id = auth.uid() and public.has_app_access('horizon'))
  with check (user_id = auth.uid() and public.has_app_access('horizon'));

-- Commercially sensitive (BRD HZ-AW-08): strictly per-user, no admin
-- exception, ever. Do not add a broader read policy to this table.
create policy "horizon_accounts: own rows" on public.horizon_accounts
  for all using (user_id = auth.uid() and public.has_app_access('horizon'))
  with check (user_id = auth.uid() and public.has_app_access('horizon'));

-- Tables owned indirectly through horizon_briefs / horizon_accounts.
alter table public.horizon_brief_items enable row level security;
alter table public.horizon_deliveries enable row level security;
alter table public.horizon_account_matches enable row level security;

create policy "horizon_brief_items: via owning brief" on public.horizon_brief_items
  for select using (public.owns_horizon_brief(brief_id));
create policy "horizon_brief_items: mark read" on public.horizon_brief_items
  for update using (public.owns_horizon_brief(brief_id))
  with check (public.owns_horizon_brief(brief_id));

create policy "horizon_deliveries: via owning brief" on public.horizon_deliveries
  for select using (public.owns_horizon_brief(brief_id));

create policy "horizon_account_matches: via owning account" on public.horizon_account_matches
  for select using (public.owns_horizon_account(account_id));
create policy "horizon_account_matches: dismiss" on public.horizon_account_matches
  for update using (public.owns_horizon_account(account_id))
  with check (public.owns_horizon_account(account_id));

-- Shared read-only pool: any approved Horizon user may read; only the
-- service role (which bypasses RLS entirely) may write. No insert/update/
-- delete policy exists for these on purpose.
alter table public.horizon_sources enable row level security;
alter table public.horizon_story_clusters enable row level security;
alter table public.horizon_stories enable row level security;

create policy "horizon_sources: readable to horizon users" on public.horizon_sources
  for select using (public.has_app_access('horizon'));
create policy "horizon_story_clusters: readable to horizon users" on public.horizon_story_clusters
  for select using (public.has_app_access('horizon'));
create policy "horizon_stories: readable to horizon users" on public.horizon_stories
  for select using (public.has_app_access('horizon'));

-- Admin-only ops visibility. Service role writes (no write policy needed).
alter table public.horizon_harvest_runs enable row level security;
create policy "horizon_harvest_runs: admin read" on public.horizon_harvest_runs
  for select using (public.is_admin());

-- ── seed: curated source registry ───────────────────────────────────────
-- Tier 1 = official/primary (company blogs, regulators, wire services) —
-- prefer these over aggregator rewrites per BRD HZ-HV-08. Tier 4 = general
-- reputable but not primary. is_primary drives that preference at
-- selection time; tier alone drives credibility scoring (§5).
insert into public.horizon_sources (domain, name, tier, is_primary, note) values
  -- official vendor / platform blogs
  ('aws.amazon.com', 'AWS Blog', 1, true, 'Cloud vendor primary source'),
  ('azure.microsoft.com', 'Azure Blog', 1, true, 'Cloud vendor primary source'),
  ('cloud.google.com', 'Google Cloud Blog', 1, true, 'Cloud vendor primary source'),
  ('anthropic.com', 'Anthropic', 1, true, 'AI vendor primary source'),
  ('openai.com', 'OpenAI', 1, true, 'AI vendor primary source'),
  ('github.blog', 'GitHub Blog', 1, true, 'Dev platform primary source'),
  ('kubernetes.io', 'Kubernetes Blog', 1, true, 'Project primary source'),
  ('hashicorp.com', 'HashiCorp Blog', 1, true, 'Vendor primary source'),
  ('databricks.com', 'Databricks Blog', 2, true, 'Vendor primary source'),
  ('salesforce.com', 'Salesforce News', 2, true, 'Vendor primary source'),
  ('sap.com', 'SAP News', 2, true, 'Vendor primary source'),
  -- regulators / official bodies
  ('sec.gov', 'U.S. SEC', 1, true, 'Regulator primary source'),
  ('rbi.org.in', 'Reserve Bank of India', 1, true, 'Regulator primary source'),
  ('sebi.gov.in', 'SEBI', 1, true, 'Regulator primary source'),
  ('meity.gov.in', 'MeitY', 1, true, 'Government primary source'),
  ('pib.gov.in', 'Press Information Bureau (India)', 1, true, 'Government primary source'),
  -- wire services
  ('reuters.com', 'Reuters', 1, true, 'Wire service'),
  ('apnews.com', 'AP News', 1, true, 'Wire service'),
  ('pti.in', 'Press Trust of India', 1, true, 'Wire service'),
  -- global tech/business press
  ('techcrunch.com', 'TechCrunch', 2, false, null),
  ('theverge.com', 'The Verge', 2, false, null),
  ('arstechnica.com', 'Ars Technica', 2, false, null),
  ('wired.com', 'Wired', 2, false, null),
  ('bloomberg.com', 'Bloomberg', 1, false, 'Tier-1 business press'),
  ('ft.com', 'Financial Times', 1, false, 'Tier-1 business press'),
  ('economist.com', 'The Economist', 1, false, 'Tier-1 business press'),
  ('wsj.com', 'Wall Street Journal', 1, false, 'Tier-1 business press'),
  ('hbr.org', 'Harvard Business Review', 2, false, 'Analysis, not breaking news'),
  ('forbes.com', 'Forbes', 3, false, 'Mixed contributor quality'),
  ('businessinsider.com', 'Business Insider', 3, false, null),
  ('fortune.com', 'Fortune', 2, false, null),
  ('zdnet.com', 'ZDNET', 3, false, null),
  ('venturebeat.com', 'VentureBeat', 3, false, null),
  ('siliconangle.com', 'SiliconANGLE', 3, false, null),
  ('theregister.com', 'The Register', 2, false, 'Strong enterprise/infra coverage'),
  -- dev / cloud / security specific
  ('infoq.com', 'InfoQ', 2, false, null),
  ('thenewstack.io', 'The New Stack', 2, false, null),
  ('devops.com', 'DevOps.com', 3, false, null),
  ('csoonline.com', 'CSO Online', 2, false, null),
  ('krebsonsecurity.com', 'Krebs on Security', 1, false, 'High-trust independent security research'),
  ('bleepingcomputer.com', 'BleepingComputer', 2, false, null),
  ('darkreading.com', 'Dark Reading', 2, false, null),
  ('thehackernews.com', 'The Hacker News', 2, false, null),
  -- analyst / research
  ('gartner.com', 'Gartner', 2, true, 'Analyst primary research'),
  ('forrester.com', 'Forrester', 2, true, 'Analyst primary research'),
  ('mckinsey.com', 'McKinsey & Company', 2, true, 'Analyst primary research'),
  ('idc.com', 'IDC', 2, true, 'Analyst primary research'),
  -- startups / funding
  ('techinasia.com', 'Tech in Asia', 2, false, null),
  ('news.crunchbase.com', 'Crunchbase News', 2, false, null),
  ('inc42.com', 'Inc42', 2, false, 'India startup coverage'),
  ('entrackr.com', 'Entrackr', 2, false, 'India startup coverage'),
  ('theken.com', 'The Ken', 1, false, 'High-trust India business journalism, subscription'),
  ('yourstory.com', 'YourStory', 3, false, 'India startup coverage'),
  -- Indian business/general press
  ('economictimes.indiatimes.com', 'The Economic Times', 2, false, null),
  ('livemint.com', 'Mint', 2, false, null),
  ('business-standard.com', 'Business Standard', 2, false, null),
  ('thehindubusinessline.com', 'The Hindu Business Line', 2, false, null),
  ('moneycontrol.com', 'Moneycontrol', 3, false, null),
  ('thehindu.com', 'The Hindu', 2, false, null),
  ('indianexpress.com', 'The Indian Express', 3, false, null),
  ('hindustantimes.com', 'Hindustan Times', 3, false, null),
  -- global general press
  ('bbc.com', 'BBC', 1, false, 'Tier-1 general press'),
  ('nytimes.com', 'The New York Times', 1, false, 'Tier-1 general press'),
  ('theguardian.com', 'The Guardian', 2, false, null)
on conflict (domain) do nothing;
