# 1CloudHub Notes & Tracker

A macOS/Windows desktop app (Electron) for a manager's daily workflow: freeform notes, AI-powered task extraction, a task board (list + kanban), meeting-minutes generation, and an email-drafting assistant. Built iteratively in Claude Cowork; now maintained in Claude Code.

## Architecture (deliberately simple — keep it that way unless asked)

- **Single-page, single-file app**: ALL HTML, CSS, and JS live in `index.html` (~1500 lines). No framework, no bundler, no build step for the UI.
- `main.js` — minimal Electron main process (one BrowserWindow, loads index.html).
- `assets/logo.png` — 1CloudHub logo (also embedded as base64 inside index.html for the topbar).
- **Persistence**: browser `localStorage` only. No backend, no files. Keys:
  - `ch_notes_v2` — array of notes `{id, title, body, transcript, includeTranscriptInExtract, minutes, minutesGeneratedAt, minutesSource, lastExtractedHash, _transcriptOpen, createdAt, updatedAt}`
  - `ch_tasks_v1` — array of tasks `{id, item, parent, type, related, priority, status, due, notes, sourceNoteId, sourceNoteTitle, manual, deleted, createdAt}`
  - `ch_api_key` — user's Anthropic API key (entered via gear icon)
  - `ch_email_workspace`, `ch_board_view_mode`, `ch_expanded_groups`
- **AI calls**: direct `fetch` to `https://api.anthropic.com/v1/messages` (model `claude-haiku-4-5-20251001`) with the user's own key and the `anthropic-dangerous-direct-browser-access` header. See `callClaude()`. Prompts ask for strict JSON; responses parsed with a `[...]`/`{...}` regex match then `JSON.parse`.
- **Renaming hazard**: the `name` in `package.json` / app name determines Electron's userData path. Renaming the app orphans all user data.

## Critical lessons already learned (do NOT regress these)

1. **Never use `innerText` to escape HTML.** Chromium's `innerText` setter converts `\n` into `<br>` elements — this bug injected literal `<br>` into users' notes for days. `escapeHtml()` is now pure string replacement. Keep it that way.
2. **Sanitization pipeline**: `sanitizeNoteText()` strips `<br>`/`<p>`/`<div>`/`&nbsp;`/any tags → newlines. It runs: on paste, on input (only when markup detected — cursor safety), in `saveCurrentNote`, on task extraction (`cleanTaskField`), and as a one-time `migrateLegacyMarkup()` at startup that heals both stores. If you add any new text-entry surface, wire it into this pipeline.
3. **Beware template-literal regex escaping** when generating JS from Python patches (this project was built by patching; in Claude Code, edit directly).
4. `renderEditor`/`renderBoard` fully rebuild innerHTML and re-attach listeners. Any new interactive element inside them must have its listeners attached after each render.

## Build & run

- Dev: `npm install` then `npx electron .` (electron is a devDependency; postinstall script may be blocked by allow-scripts config — packaging still works).
- macOS package: `npx electron-packager . "1CloudHub Tracker" --platform=darwin --arch=arm64 --out=dist --overwrite`
- Windows package: `npx electron-packager . "1CloudHub Tracker" --platform=win32 --arch=x64 --out=dist --overwrite`
- Universal mac build needs Xcode CLT (`lipo`); arm64-only avoids that.
- Apps are unsigned: macOS needs Gatekeeper bypass (Open Anyway / `xattr -cr`), Windows shows SmartScreen (More info → Run anyway).

## Testing

`/tmp`-based jsdom integration tests were used in Cowork (not checked in). Pattern worth recreating in `test/`:
- Load real `index.html` in jsdom with `runScripts: 'dangerously'`, a localStorage mock, and a **Chromium-innerText shim** (newlines→`<br>`) — jsdom's innerText differs from Chromium's, which previously masked the escapeHtml bug.
- Seed dirty data (`<br>` in notes/tasks), assert: stores healed at startup, textarea clean on open AND after repeated re-renders, live-clean on paste, board rows clean.
- Always `node --check` the extracted inline script after edits.

## Feature map (all in index.html)

- **Notes tab**: sidebar list + editor; autosave (800ms debounce); Extract Tasks button (skips if content hash unchanged); collapsible transcript section (attach .docx via JSZip CDN + DOMParser, or .txt, or paste); Meeting Minutes pane (generates from note alone, or note+transcript when attached; only on click).
- **Board tab**: stats cards; natural-language quick-add (with priority override select); search / person / status / priority filters; Overdue & Today chips; List view (grouped by source note, collapsible, expanded state persisted) and Kanban view (drag-and-drop between status columns); soft-delete with Trash + undo toast; task detail modal (full edit).
- **Email tab**: context + instructions → generate subject/body; iterative "Apply Change" revisions; copy to clipboard; autosaved workspace.
- **Global**: ⌘K quick-add, ⌘F search, ⌘N new note, Esc closes modals; confetti burst on task completion.
- **Theme**: tokens in `:root` derived from the actual logo palette — cyan `#1899C2`/`#4FC3F0`, orange `#F07814`, green `#6FB43C`, charcoal `#333B49`. Poppins + Space Grotesk (Google Fonts CDN; JSZip also CDN — the only two network deps besides the Anthropic API).

## Likely next-level roadmap (user's stated direction)

Ideas discussed or implied: proper icon + code signing/notarization, auto-update, moving storage from localStorage to files/SQLite (export/backup), cross-device sync, streaming AI responses, richer sub-task hierarchy, per-person views for team follow-ups.
