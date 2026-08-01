'use client';

// Meeting-minutes pull-out panel — ported from app/index.html's
// renderMinutesPane()/openMinutesModal()/generateMinutesForCurrentNote().
import Modal from '../shared/Modal';
import type { Note } from '../types';

export default function MeetingMinutesModal({
  open,
  onClose,
  note,
  generating,
  onGenerate,
}: {
  open: boolean;
  onClose: () => void;
  note: Note | null;
  generating: boolean;
  onGenerate: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Meeting Minutes">
      {!note ? null : !note.minutes ? (
        <div>
          <div className="ch-notes-modal-empty">
            Not generated yet — uses your note text, plus the transcript if one is attached. Runs only when you ask.
          </div>
          <button type="button" className="ch-btn ch-btn-secondary" style={{ marginTop: 'var(--space-3)' }} onClick={onGenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate Minutes'}
          </button>
        </div>
      ) : (
        <div>
          <div className="ch-minutes-pane">{note.minutes}</div>
          <div className="ch-minutes-meta">
            Generated {note.minutesGeneratedAt ? new Date(note.minutesGeneratedAt).toLocaleString() : ''} · from{' '}
            {note.minutesSource === 'transcript' ? 'note + transcript' : 'note only'}
          </div>
          <button type="button" className="ch-btn ch-btn-secondary" style={{ marginTop: 'var(--space-3)' }} onClick={onGenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Regenerate Minutes'}
          </button>
        </div>
      )}
    </Modal>
  );
}
