# Supabase backend

Auth, database, and the `claude-proxy` Edge Function (the only place the real
Anthropic API key lives) for Orbit / Compass. One Supabase project backs
both the Electron app (`../app/`) and the website (`../website/`).

## One-time setup

1. **Create the project**: [supabase.com](https://supabase.com) → New Project
   (free tier is plenty for a small user base). Note the project URL and
   the `anon` / `service_role` keys from Settings → API.
2. **Run the schema**: Settings → SQL Editor → paste the contents of every
   file in `migrations/`, in order (`0001_init.sql`, `0002_storage_bucket.sql`,
   `0003_fix_admin_policy_recursion.sql`) → Run each. (Or, with the Supabase
   CLI installed and linked: `supabase db push`.) Note: `0002` creates a
   `releases` storage bucket that an earlier iteration of this project used
   for hosting installers — that's since been replaced by GitHub Releases
   (Supabase Storage's 50MB free-tier file limit rejected the 100-300MB
   installers). The bucket is harmless to leave in place; nothing reads from
   it anymore.
3. **Turn off email confirmation** (recommended for a small invite-only
   group): Authentication → Sign In / Up → Email → toggle "Confirm email"
   off. Otherwise new signups need to click a confirmation link before they
   can sign in, on top of your admin approval.
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
   Actions): `.github/workflows/build-app.yml` no longer needs Supabase
   credentials — it attaches installers straight to a GitHub Release using
   the automatically-provided `GITHUB_TOKEN`. `SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY` may still be set as leftover secrets from an
   earlier iteration; harmless, safe to remove if you want to tidy up. If
   you do keep the service role key anywhere, treat it like a password — it
   bypasses Row Level Security.

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
