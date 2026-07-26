# Compass (Electron app)

A macOS/Windows desktop app (Electron) for a manager's daily workflow: freeform notes, AI-powered task extraction, a task board (list + kanban), meeting-minutes generation, and an email-drafting assistant. Originally built in Claude Cowork as a local-only, bring-your-own-API-key app called "1CloudHub Tracker"; now **Compass**, one app in the **Orbit** marketplace (`../website/`), invite-only and cloud-synced via Supabase (`../supabase/`). See the repo root `README.md` for the full architecture.

**Renamed from "Tracker" to "Compass"**: this only changed what's user-visible (window title, topbar branding, `productName` in `package.json`, the installer's display name). `package.json`'s `"name": "1cloudhub-tracker"` is deliberately unchanged — see the renaming hazard below. Compass has its own logo mark (inline SVG, violet→coral pastel gradient, `--compass-violet`/`--compass-coral`/`--grad-compass` in `:root`) used only for branding — the interior UI intentionally keeps its original cyan/orange 1CloudHub-derived palette rather than a full re-theme.

## Architecture (deliberately simple — keep it that way unless asked)

- **Single-page, single-file app**: ALL HTML, CSS, and JS live in `index.html` (~1900 lines). No framework, no bundler. The main script is `<script type="module">` so it can `import` the Supabase JS client straight from a CDN (`esm.sh`) — same "no build step" philosophy as before, just one more CDN import alongside JSZip and Google Fonts.
- `main.js` — minimal Electron main process (one BrowserWindow, loads index.html).
- `assets/logo.png` — 1CloudHub logo (also embedded as base64 inside index.html for the topbar).
- **Renaming hazard**: the `name` in `package.json` / app name determines Electron's userData path. Renaming the app orphans all user data. This was preserved as `1cloudhub-tracker` through the cloud-sync migration for exactly this reason.

## Auth + cloud sync (added on top of the original local-only design)

- **Config**: `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants near the top of the `<script type="module">` block. Fill these in from your Supabase project (Settings → API) before shipping — see `../supabase/README.md`.
- **Auth gate**: `#authGate` (login/signup/pending/rejected screens) sits over `#appShell` (the entire original app UI, `display:none` until approved). Routing logic lives in `routeSession()` / `enterApp()` near the bottom of the script, driven by `supabase.auth.onAuthStateChange`.
- **Local-first sync, not a full async rewrite**: `loadNotes()`, `saveNotesArr()`, `loadTasks()`, `saveTasks()`, `loadEmailData()`, `saveEmailData()` kept their original synchronous signatures (localStorage stays the fast source of truth read by every render function). What changed: every `save*` now also calls `scheduleCloudPush()`, a debounced background upsert to Supabase. On sign-in, `pullFromCloud()` merges the user's cloud rows into the local cache (notes: last-write-wins by `updatedAt`; tasks/email: local wins on conflict, cloud only fills in what's missing locally — see `pullFromCloud()` for the full reasoning). This was a deliberate choice to avoid rewriting ~25 call sites to async/await.
- **AI calls**: `callClaude()` now POSTs `{ prompt }` to the `claude-proxy` Supabase Edge Function (`../supabase/functions/claude-proxy/`) with the user's session access token, instead of calling `api.anthropic.com` directly with a locally-stored key. The real Anthropic key lives only in that Edge Function's secrets — never in this app. A 403 from the proxy (approval revoked) drops the user back to the auth gate via `refreshGateForCurrentSession()`.
- The old gear-icon "paste your API key" flow is gone. The gear icon now shows account email + sync status + sign out (`#settingsModal`).

## Critical lessons already learned (do NOT regress these)

1. **Never use `innerText` to escape HTML.** Chromium's `innerText` setter converts `\n` into `<br>` elements — this bug injected literal `<br>` into users' notes for days. `escapeHtml()` is now pure string replacement. Keep it that way.
2. **Sanitization pipeline**: `sanitizeNoteText()` strips `<br>`/`<p>`/`<div>`/`&nbsp;`/any tags → newlines. It runs: on paste, on input (only when markup detected — cursor safety), in `saveCurrentNote`, on task extraction (`cleanTaskField`), and as a one-time `migrateLegacyMarkup()` heal that now runs once per sign-in (after `pullFromCloud()`, so newly-pulled data gets healed too) rather than once at page load. If you add any new text-entry surface, wire it into this pipeline.
3. **Beware template-literal regex escaping** when generating JS from Python patches (this project was originally built by patching; in Claude Code, edit directly).
4. `renderEditor`/`renderBoard` fully rebuild innerHTML and re-attach listeners. Any new interactive element inside them must have its listeners attached after each render.
5. **`type="module"` means no implicit globals.** Functions defined in the main script are not on `window`. There are no inline `onclick=""` attributes anywhere in `index.html` — keep it that way (everything is `addEventListener`), or a module conversion like this one would break.

## Build & run

- Dev: `npm install` then `npx electron .` (fill in `SUPABASE_URL`/`SUPABASE_ANON_KEY` first, or auth will fail against the placeholder project).
- Package for distribution: `npm run build-mac` / `npm run build-win` (via `electron-builder`, configured in `package.json`). Produces unsigned installers in `dist/` — Mac needs Gatekeeper bypass (right-click → Open), Windows shows SmartScreen (More info → Run anyway). Signing was deliberately deferred (see repo root `README.md`) — revisit if/when there's demand to justify the ~$100-500/yr cost.
- Normal end users should not run these commands at all — they download a pre-built installer from the website (`../website/`), produced by `.github/workflows/build-app.yml` on every version tag.

## Testing

`/tmp`-based jsdom integration tests were used in Cowork (not checked in). Pattern worth recreating in `test/`:
- Load real `index.html` in jsdom with `runScripts: 'dangerously'`, a localStorage mock, and a **Chromium-innerText shim** (newlines→`<br>`) — jsdom's innerText differs from Chromium's, which previously masked the escapeHtml bug.
- Seed dirty data (`<br>` in notes/tasks), assert: stores healed at startup, textarea clean on open AND after repeated re-renders, live-clean on paste, board rows clean.
- Always `node --check` the extracted inline script after edits (it's an ES module now — extract with `awk` between the `<script type="module">` and `</script>` markers, save as `.mjs`, then `node --check`).

## Feature map (all in index.html)

- **Notes tab**: sidebar list + editor; autosave (800ms debounce); Extract Tasks button (skips if content hash unchanged); collapsible transcript section (attach .docx via JSZip CDN + DOMParser, or .txt, or paste); Meeting Minutes pane (generates from note alone, or note+transcript when attached; only on click).
- **Board tab**: stats cards; natural-language quick-add (with priority override select); search / person / status / priority filters; Overdue & Today chips; List view (grouped by source note, collapsible, expanded state persisted) and Kanban view (drag-and-drop between status columns); soft-delete with Trash + undo toast; task detail modal (full edit).
- **Email tab**: numbered 2-step layout (Add context / Review & send); tone preset chips (Formal/Friendly/Apologetic/Urgent/Brief — click toggles a canned line in/out of the instructions textarea, state restored on reload by checking which preset strings are present in saved `instructions`); context + instructions → generate subject/body; iterative "Apply Change" revisions; "New Email" clears the workspace; separate "Copy Subject + Body" / "Copy Body Only" with inline button-text confirmation (`flashCopied()`); generate/revise buttons show a spinner via `.is-loading` (`setBtnLoading()`) instead of just disabling; autosaved workspace.
- **Global**: ⌘K quick-add, ⌘F search, ⌘N new note, Esc closes modals; confetti burst on task completion.
- **Theme**: tokens in `:root` derived from the actual logo palette — cyan `#1899C2`/`#4FC3F0`, orange `#F07814`, green `#6FB43C`, charcoal `#333B49`. Poppins + Space Grotesk (Google Fonts CDN); JSZip and `@supabase/supabase-js` also CDN (`esm.sh`) — the only network deps besides the `claude-proxy` Edge Function.

## Likely next-level roadmap

Code signing/notarization (Mac + Windows) once there's real demand, auto-update via `electron-builder`'s updater, a real-time sync layer (Supabase Realtime) instead of pull-on-sign-in if multi-device use gets heavy, richer sub-task hierarchy, per-person views for team follow-ups.
