# Supabase backend

Auth, database, and the `claude-proxy` Edge Function (the only place the real
Anthropic API key lives) for 1CloudHub Tracker. One Supabase project backs
both the Electron app (`../app/`) and the website (`../website/`).

## One-time setup

1. **Create the project**: [supabase.com](https://supabase.com) → New Project
   (free tier is plenty for a small user base). Note the project URL and
   the `anon` / `service_role` keys from Settings → API.
2. **Run the schema**: Settings → SQL Editor → paste the contents of
   `migrations/0001_init.sql` → Run. (Or, with the Supabase CLI installed
   and linked: `supabase db push`.)
3. **Create the storage bucket**: Storage → New bucket → name it `releases`
   → make it **public** (so the website's download links work without
   auth). This is where CI uploads built installers.
4. **Deploy the Edge Function**:
   ```
   supabase functions deploy claude-proxy
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```
   (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically
   by the Edge Function runtime — don't set those yourself.)
5. **Wire the URL/anon key into both clients**:
   - `app/index.html` — `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants near
     the top of the `<script type="module">` block.
   - `website/.env.local` (copy from `website/.env.local.example`) and the
     same two values as Vercel project env vars.
6. **Make yourself admin**: sign up once through the app or website, then
   in Supabase's Table Editor → `profiles`, find your row and set
   `is_admin = true` and `status = 'approved'`. Every signup after that
   goes through the in-app/on-site admin approval page instead.
7. **GitHub Actions secrets** (repo → Settings → Secrets and variables →
   Actions): add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — used by
   `.github/workflows/build-app.yml` to upload built installers to the
   `releases` bucket. The service role key bypasses Row Level Security, so
   treat it like a password — GitHub secrets, never committed.

## Why this shape

- **Row Level Security is the real access control**, not the app code —
  every table's policy checks `auth.uid()` and, for notes/tasks/email,
  `is_approved()`. Even a bug in the client can't leak another user's data.
- **The Edge Function is the trust boundary for the Anthropic key.** It
  re-verifies the caller's session and approval status itself (using the
  service role key) rather than trusting the client — see
  `functions/claude-proxy/index.ts`.
- See the repo root `README.md` for how this fits together with the app and
  website.
