# Orbit (by 1CloudHub)

A marketplace of AI-powered apps for everyday life. First app: **Compass**
(formerly "1CloudHub Tracker") — invite-only notes, AI task extraction,
kanban board, and email drafting for a manager's daily workflow. Originally
a local-only Claude Cowork build; now three pieces working together:

```
app/          Electron desktop app (Mac + Windows) — Compass, what people actually use
website/      Next.js site — the Orbit marketplace: landing page + inline auth + app grid
supabase/     Auth, database, and the Edge Function holding the Anthropic key
.github/      CI that builds installers and cuts a GitHub Release on every version tag
```

## How it fits together

```
Electron app (Mac/Windows)          Website (Next.js on Vercel)
        |                                   |
        |--- login/signup ----------->  Supabase Auth
        |--- notes/tasks sync -------->  Supabase Postgres (Row Level Security:
        |                                  each user only ever sees their own rows)
        |--- AI requests ------------>  Supabase Edge Function ("claude-proxy")
                                              |
                                        holds ANTHROPIC_API_KEY as a secret,
                                        calls api.anthropic.com, returns result
```

Nobody but the Edge Function ever sees the Anthropic key — everyone uses the
one shared key, billed to the account that owns the Supabase project. Access
is invite-only: anyone can sign up, but the app is unusable until an admin
approves the account (`profiles.status = 'approved'`), enforced by Row Level
Security, not just app-side checks.

**Website routing**: `/` is the single entry point — hero + inline sign-in/
request-access when signed out, a "waiting for approval" message when
pending, and the app marketplace grid (currently just Compass) when
approved. `/login`, `/pending`, `/dashboard` are thin redirects to `/` kept
for old links/bookmarks. `/admin` is the standalone approve/reject page for
accounts with `is_admin = true`. Feedback throughout (signup sent, sign-in
errors, admin approve/reject) goes through a shared toast component
(`website/components/Toast.tsx` + `useToast.ts`) rather than silent state
changes.

## Setup (do this once)

1. **Supabase** — follow `supabase/README.md` start to finish first;
   everything else depends on it.
2. **App** — `app/CLAUDE.md` has dev/build instructions. Fill in
   `SUPABASE_URL`/`SUPABASE_ANON_KEY` in `app/index.html` before running.
3. **Website** — `cd website && npm install`, copy
   `.env.local.example` to `.env.local` and fill in the same two Supabase
   values, then `npm run dev`. Deploy: connect the repo to
   [Vercel](https://vercel.com) (root directory `website/`), add the same
   two env vars as Vercel project settings, deploy on the free `*.vercel.app`
   subdomain — it auto-redeploys on every push to `main`.
4. **CI / releases** — add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as
   GitHub Actions secrets (repo Settings → Secrets and variables → Actions;
   the Supabase ones aren't actually used by the release workflow anymore
   but are still there from an earlier iteration — see note below). Push a
   tag like `v1.0.2` to trigger `.github/workflows/build-app.yml`, which
   builds unsigned Mac (arm64 + x64) and Windows installers and attaches
   them to a **GitHub Release** (the repo is public specifically so these
   are downloadable without a GitHub account). The website always links to
   `.../releases/latest/download/<filename>`, which GitHub resolves to
   whatever the newest release's matching asset is — no website change
   needed when cutting a new version.

## Current known limitations (deliberate, for v1)

- **Unsigned installers**: Mac needs right-click → Open once (Gatekeeper) —
  in practice this can present as "is damaged and can't be opened," fixed
  with `xattr -cr "/Applications/Compass.app"` in Terminal — Windows needs
  "More info → Run anyway" (SmartScreen). Real code signing needs a paid
  Apple Developer account (~$99/yr) and a Windows signing cert
  (~$100-400/yr) — worth it once there's real demand, skipped for now.
- **Repo is public**: switched from private after Supabase Storage's 50MB
  file-size limit rejected the installers (100-300MB) and GitHub Releases
  became the distribution mechanism instead. No secrets were ever committed,
  so nothing sensitive is exposed by this — see git history around
  "Switch installer distribution from Supabase Storage to GitHub Releases."
- **Sync, not real-time collaboration**: each account's notes/tasks sync to
  Supabase in the background and merge on sign-in; two devices signed into
  the same account editing simultaneously isn't a target use case yet (see
  `app/CLAUDE.md`'s "Auth + cloud sync" section for the exact merge rules).
- **Admin approval is manual**: no email notifications when someone
  requests access — check the website's `/admin` page periodically.
- **One app in the marketplace so far**: the website's app grid is built to
  add more cards, but only Compass exists today. The "More apps — Coming
  soon" card is a placeholder, not a real roadmap commitment.

## Where things live

- Full architecture rationale and phase-by-phase build notes:
  `~/.claude/plans/crispy-hugging-meadow.md` (the plan this was originally
  built from — predates the Orbit/Compass rebrand and GitHub Releases
  switch, both landed afterward).
- App-specific implementation details, "don't regress these" bugs, and the
  cloud-sync design: `app/CLAUDE.md`.
- Database schema and RLS policies: `supabase/migrations/`.
