'use client';

// Email tab root — Step 1 "Add context" (context/instructions/tone chips/
// Generate Email/New Email) and Step 2 "Review & send" (subject/body/
// revision/copy buttons). Ported from app/index.html's `#emailView` markup
// (~lines 717-757) and the generateEmailBtn/newEmailBtn/applyRevisionBtn/
// copyEmailBtn/copyBodyBtn click handlers plus loadEmailWorkspace()/
// persistEmailWorkspace() (~lines 1190-1346).
//
// Composition (matches NotesTab/BoardTab): takes `data: UseCompassData` as
// its only prop rather than calling useCompassData() itself, so Email
// shares the exact same hook instance — and therefore the exact same
// `email` object reference and in-flight debounced save — as whatever else
// is mounted in Compass (see app/compass/page.tsx).
import { useEffect, useRef, useState } from 'react';
import type { UseCompassData } from '../useCompassData';
import type { EmailWorkspace } from '../types';
import { callClaude, emailGeneratePrompt, emailRevisePrompt, parseEmailJson } from '../prompts';
import ToneChips from './ToneChips';

export default function EmailTab({ data }: { data: UseCompassData }) {
  const { email, updateEmail } = data;

  // `emailRevisionInput` in vanilla is never part of the persisted
  // workspace object (persistEmailWorkspace()'s field list is only
  // context/instructions/subject/body) — it lives as local component state
  // here for the same reason.
  const [revisionInput, setRevisionInput] = useState('');
  const [status, setStatus] = useState('');
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [subjectCopied, setSubjectCopied] = useState(false);
  const [bodyCopied, setBodyCopied] = useState(false);

  const contextRef = useRef<HTMLTextAreaElement>(null);
  const subjectCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (subjectCopyTimer.current) clearTimeout(subjectCopyTimer.current);
      if (bodyCopyTimer.current) clearTimeout(bodyCopyTimer.current);
    };
  }, []);

  // ---------- field edits ----------
  // Every context/instructions/subject/body field below calls
  // `updateEmail(patch)` directly on each keystroke, with NO extra
  // component-level debounce layered on top — unlike NoteEditor's title/
  // transcript inputs, which deliberately DO add their own ~800ms debounce
  // on top of updateNote()'s internal one (see NoteEditor.tsx's comment on
  // `scheduleFieldSave`). That extra layer exists there because `notes` is
  // an array with a second, expensive consumer (NoteSidebar's list): every
  // updateNote() call replaces the whole notes array, so collapsing rapid
  // keystrokes into one call avoids re-rendering that list on every
  // keystroke. `email` is a single object with exactly one consumer (this
  // component) — there is no sibling list to spare from re-rendering, so
  // the only genuinely expensive step is the network write, and
  // updateEmail() already debounces that internally via
  // `EMAIL_DEBOUNCE_MS` (600ms, see useCompassData.ts's scheduleEmailSave).
  // This also reproduces vanilla's actual shape more directly than adding a
  // second timer would: vanilla's <textarea>/<input> elements are
  // themselves the synchronous, free, per-keystroke source of truth (the
  // DOM just updates), and only persistEmailWorkspace()'s cloud push is
  // debounced (500ms) — calling updateEmail() per keystroke gives the same
  // "instant local state, debounced network write" behavior in React
  // without a redundant local buffer.
  function handleFieldChange(patch: Partial<EmailWorkspace>) {
    updateEmail(patch);
  }

  // ---------- Generate Email ----------
  // Ported from generateEmailBtn's click handler. Note the `|| ''` fallback
  // on both fields (vs. Apply Change's `|| currentSubject/currentBody`
  // below) — a Generate response with a missing field blanks that field
  // rather than leaving whatever was there before, matching vanilla exactly.
  async function handleGenerate() {
    const context = email.context.trim();
    const instructions = email.instructions.trim();
    if (!context && !instructions) {
      setStatus('Add some context or instructions first.');
      return;
    }
    setGenerating(true);
    setStatus('Drafting your email…');
    try {
      const raw = await callClaude(emailGeneratePrompt(email.context, email.instructions));
      const parsed = parseEmailJson(raw);
      updateEmail({ subject: parsed.subject || '', body: parsed.body || '' });
      setStatus('Draft ready — edit directly, or ask for a change below.');
    } catch {
      // Vanilla doesn't distinguish ClaudeCallError codes here (unlike
      // Extract Tasks' NOT_SIGNED_IN special-case) — match that simpler
      // behavior, one status message for any failure.
      setStatus('Could not generate the email — check your connection and try again.');
    }
    setGenerating(false);
  }

  // ---------- New Email ----------
  // Ported from newEmailBtn's click handler. Clearing `instructions` here
  // also clears every tone chip's active state for free, since ToneChips
  // derives "active" from `instructions` rather than tracking it
  // separately — vanilla has to explicitly
  // `querySelectorAll('.tone-chip.active').forEach(c => c.classList.remove('active'))`
  // to get the same effect.
  function handleNewEmail() {
    updateEmail({ context: '', instructions: '', subject: '', body: '' });
    setRevisionInput('');
    setStatus('');
    contextRef.current?.focus();
  }

  // ---------- Apply Change ----------
  // Ported from applyRevisionBtn's click handler. Note the `|| currentX`
  // fallback (vs. Generate's `|| ''` above) — a missing field in the
  // response keeps the existing subject/body instead of blanking it,
  // matching vanilla exactly.
  async function handleApplyRevision() {
    const revision = revisionInput.trim();
    if (!revision) return;
    if (!email.body.trim()) {
      setStatus('Generate a draft first, then ask for changes.');
      return;
    }
    setApplying(true);
    setStatus('Applying your change…');
    try {
      const raw = await callClaude(emailRevisePrompt(email.subject, email.body, revision));
      const parsed = parseEmailJson(raw);
      updateEmail({ subject: parsed.subject || email.subject, body: parsed.body || email.body });
      setRevisionInput('');
      setStatus('Updated — ask for another change anytime.');
    } catch {
      setStatus('Could not apply that change — check your connection and try again.');
    }
    setApplying(false);
  }

  // ---------- Copy buttons ----------
  // Ported from flashCopied(): flashes the button's OWN text to
  // "Copied ✓" for 1.5s then reverts, as local per-button state — not the
  // app-wide Toast (see BoardTab.tsx's Undo toast), since vanilla's
  // flashCopied() is a self-contained per-button effect rather than a
  // dismissable notification.
  async function handleCopySubjectAndBody() {
    const text = 'Subject: ' + email.subject + '\n\n' + email.body;
    try {
      await navigator.clipboard.writeText(text);
      setSubjectCopied(true);
      if (subjectCopyTimer.current) clearTimeout(subjectCopyTimer.current);
      subjectCopyTimer.current = setTimeout(() => setSubjectCopied(false), 1500);
    } catch {
      // Matches vanilla's empty catch — clipboard failures are silent.
    }
  }

  async function handleCopyBody() {
    try {
      await navigator.clipboard.writeText(email.body);
      setBodyCopied(true);
      if (bodyCopyTimer.current) clearTimeout(bodyCopyTimer.current);
      bodyCopyTimer.current = setTimeout(() => setBodyCopied(false), 1500);
    } catch {
      // Matches vanilla's empty catch.
    }
  }

  // Matches NotesTab/BoardTab's own `if (data.loading)` guard — avoids a
  // flash of the empty-workspace form (all fields default to '' before the
  // real Supabase row loads, see useCompassData.ts's EMPTY_EMAIL) before
  // the actual saved context/instructions/subject/body arrive.
  if (data.loading) {
    return <div className="ch-notes-loading">Loading email workspace…</div>;
  }

  return (
    <div className="ch-email-layout">
      <div className="ch-email-column ch-email-inputs">
        <div className="ch-email-step">
          <span className="ch-email-step-num">1</span>Add context
        </div>
        <label className="ch-label" style={{ marginTop: 0 }}>
          Unstructured content / context
        </label>
        <textarea
          ref={contextRef}
          className="ch-field ch-email-textarea"
          placeholder="Drop in raw notes, bullet points, a meeting recap, anything relevant..."
          value={email.context}
          onChange={(e) => handleFieldChange({ context: e.target.value })}
        />
        <label className="ch-label">How should this email read?</label>
        <ToneChips instructions={email.instructions} onChange={(next) => handleFieldChange({ instructions: next })} />
        <textarea
          className="ch-field ch-email-textarea short"
          placeholder="e.g. Formal email to a client explaining the delay, apologetic tone, keep it under 150 words, sign off as Ajay"
          value={email.instructions}
          onChange={(e) => handleFieldChange({ instructions: e.target.value })}
        />
        <div className="ch-email-actions-row">
          <button
            type="button"
            className={'ch-btn ch-btn-primary' + (generating ? ' is-loading' : '')}
            disabled={generating}
            onClick={handleGenerate}
          >
            Generate Email
          </button>
          <button
            type="button"
            className="ch-btn ch-btn-secondary"
            title="Clear this workspace and start over"
            onClick={handleNewEmail}
          >
            New Email
          </button>
        </div>
        <span className="ch-status-line">{status}</span>
      </div>

      <div className="ch-email-column ch-email-output">
        <div className="ch-email-step">
          <span className="ch-email-step-num">2</span>Review &amp; send
        </div>
        <label className="ch-label" style={{ marginTop: 0 }}>
          Subject
        </label>
        <input
          type="text"
          className="ch-field"
          placeholder="Subject line appears here"
          value={email.subject}
          onChange={(e) => handleFieldChange({ subject: e.target.value })}
        />
        <label className="ch-label">Body (editable)</label>
        <textarea
          className="ch-field ch-email-textarea tall"
          placeholder="Generated email appears here — feel free to edit it directly."
          value={email.body}
          onChange={(e) => handleFieldChange({ body: e.target.value })}
        />
        <div className="ch-email-revision-row">
          <input
            type="text"
            className="ch-field"
            placeholder="Ask for a change, e.g. 'make it shorter and more formal'"
            value={revisionInput}
            onChange={(e) => setRevisionInput(e.target.value)}
          />
          <button
            type="button"
            className={'ch-btn ch-btn-secondary' + (applying ? ' is-loading' : '')}
            disabled={applying}
            onClick={handleApplyRevision}
          >
            Apply Change
          </button>
        </div>
        <div className="ch-email-copy-row">
          <button type="button" className="ch-btn ch-btn-secondary" onClick={handleCopySubjectAndBody}>
            {subjectCopied ? 'Copied ✓' : 'Copy Subject + Body'}
          </button>
          <button type="button" className="ch-btn ch-btn-secondary" onClick={handleCopyBody}>
            {bodyCopied ? 'Copied ✓' : 'Copy Body Only'}
          </button>
        </div>
      </div>
    </div>
  );
}
