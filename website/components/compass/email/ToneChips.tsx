'use client';

// Tone-preset chip row for the Email tab's Step 1. Ported from
// app/index.html's `#toneChips` markup (5 `.tone-chip` buttons with
// `data-tone` attributes, ~lines 723-729) and its click handler
// (~lines 1216-1229).
import { useMemo } from 'react';

// Exact canned strings ported verbatim from vanilla's `data-tone` attribute
// values — these are inserted directly into `instructions` as literal
// lines, so they must not be reworded.
const TONE_PRESETS: { label: string; tone: string }[] = [
  { label: 'Formal', tone: 'Keep the tone formal and professional.' },
  { label: 'Friendly', tone: 'Keep the tone warm and friendly.' },
  { label: 'Apologetic', tone: 'Apologetic tone — acknowledge the issue clearly.' },
  { label: 'Urgent', tone: 'Convey urgency — this needs prompt attention.' },
  { label: 'Brief', tone: 'Keep it brief — under 100 words.' },
];

export default function ToneChips({
  instructions,
  onChange,
}: {
  instructions: string;
  onChange: (nextInstructions: string) => void;
}) {
  // Active state is DERIVED from `instructions` on every render, never
  // stored as its own state — ported from loadEmailWorkspace()'s
  // `instructionLines.includes(chip.dataset.tone)` (note: no
  // `.filter(Boolean)` here, matching vanilla's load-time check exactly).
  // Vanilla gets away with a separate `.active` DOM class only because its
  // click handler is the sole place that ever mutates `instructions`
  // programmatically alongside toggling that class, keeping them in sync by
  // construction; but the moment `instructions` changes some other way
  // (typed directly into the textarea, cleared by New Email, loaded fresh
  // from Supabase) a stored-active-flag would need a second reconciliation
  // pass to catch up — deriving it fresh here makes that whole class of bug
  // impossible.
  const activeTones = useMemo(() => {
    const lines = (instructions || '').split('\n');
    return new Set(TONE_PRESETS.filter((p) => lines.includes(p.tone)).map((p) => p.tone));
  }, [instructions]);

  // Ported from the #toneChips click handler: toggling a chip pushes/splices
  // its canned string as a whole line into `instructions`, operating on the
  // non-blank lines only (matches vanilla's `.split('\n').filter(Boolean)`
  // before the push/splice — this is intentionally NOT the same split used
  // for `activeTones` above; that asymmetry exists in vanilla too).
  function handleToggle(tone: string) {
    const lines = (instructions || '').split('\n').filter(Boolean);
    const idx = lines.indexOf(tone);
    if (idx >= 0) {
      lines.splice(idx, 1);
    } else {
      lines.push(tone);
    }
    onChange(lines.join('\n'));
  }

  return (
    <div className="ch-chip-group ch-tone-chips">
      {TONE_PRESETS.map((p) => (
        <button
          type="button"
          key={p.tone}
          className={'ch-chip' + (activeTones.has(p.tone) ? ' selected' : '')}
          onClick={() => handleToggle(p.tone)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
