Compass (part of Orbit by 1CloudHub)
======================================

Getting the app
----------------
Don't build this yourself — sign in (or request access) at the Orbit
website, then download Compass from your app grid there. You'll get in
once an admin approves your account.

First launch
------------
This app isn't signed/notarized (Mac) or code-signed (Windows) yet, so:
  Mac:     if you see "Compass is damaged and can't be opened," that's just
           macOS being strict about unsigned downloads, not a real problem —
           open Terminal and run:
               xattr -cr "/Applications/Compass.app"
           then open it normally. You only need to do this once.
  Windows: click "More info" -> "Run anyway" on the SmartScreen warning.

Using the app
--------------
- Sign in (or request access, if this is your first time) on launch.
- Notes tab: write freely, click "Extract Tasks" to have Claude pull
  structured tasks out of a note.
- Board tab: kanban view with stats, priority breakdown, and one-click
  status updates.
- Email tab: pick a tone (Formal/Friendly/Apologetic/Urgent/Brief), add
  context, generate a draft, and iterate with "Apply Change" until it's
  ready — then copy the subject+body or just the body.
- Your notes and tasks sync to your account, so they follow you to any
  Mac/Windows machine you sign in on. AI features run through the shared
  1CloudHub server — you never need to provide your own API key.

Building from source (developers)
-----------------------------------
See CLAUDE.md in this folder.
