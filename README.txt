1CloudHub Notes & Tracker — build instructions
================================================

This sandbox couldn't download the Electron runtime itself (its network
access is restricted to a small allowlist that doesn't include GitHub's
release CDN), so the final .app has to be built on your own Mac, where
there's no such restriction. It's two commands.

Requirements: Node.js installed (download from https://nodejs.org if you
don't have it — the LTS version is fine).

Steps:
1. Unzip this folder anywhere on your Mac.
2. Open Terminal, cd into the unzipped folder.
3. Run:  npm install
4. Run:  npm run package-mac
5. Your app will appear in the "dist" folder as
   "1CloudHub Tracker-darwin-universal/1CloudHub Tracker.app"
   Drag it into Applications like any other app.

First launch: since this app isn't signed/notarized by Apple, macOS
Gatekeeper will block it the first time. Right-click the app -> Open ->
Open, instead of double-clicking. You only need to do this once.

Using the app:
- Click the gear icon (top right) and paste in your Anthropic API key
  the first time you open it. It's stored only on your Mac.
- Notes tab: write freely, click "Extract Tasks" to have Claude pull
  structured tasks out of a note.
- Board tab: kanban view with stats, priority breakdown, and one-click
  status updates.
- All your notes and tasks are stored locally in the app (nothing is
  sent anywhere except the note text, to Anthropic, when you click
  Extract Tasks).
