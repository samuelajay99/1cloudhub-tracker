'use client';

// Notes list sidebar — ported from app/index.html's renderSidebar(): notes
// sorted by updatedAt descending, each item showing title + a plain-text
// snippet of the rich body (first 60 chars) + a last-updated date.
import { Plus } from 'lucide-react';
import type { Note } from '../types';
import { htmlToPlainText } from '../utils';

export default function NoteSidebar({
  notes,
  selectedNoteId,
  onSelect,
  onCreate,
}: {
  notes: Note[];
  selectedNoteId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const sorted = notes.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  return (
    <div className="ch-notes-sidebar">
      <div className="ch-notes-sidebar-head">
        <span className="ch-notes-sidebar-title">Notes</span>
        <button type="button" className="ch-btn ch-btn-primary ch-notes-new-btn" onClick={onCreate}>
          <Plus size={15} strokeWidth={2.25} />
          New note
        </button>
      </div>
      <div className="ch-notes-list">
        {sorted.length === 0 ? (
          <div className="ch-notes-empty">No notes yet</div>
        ) : (
          sorted.map((n) => (
            <button
              type="button"
              key={n.id}
              className={'ch-note-item' + (n.id === selectedNoteId ? ' selected' : '')}
              onClick={() => onSelect(n.id)}
            >
              <div className="ch-note-item-title">{n.title || 'Untitled'}</div>
              <div className="ch-note-item-snippet">{htmlToPlainText(n.body || '').slice(0, 60) || 'No content yet'}</div>
              <div className="ch-note-item-meta">{n.updatedAt ? new Date(n.updatedAt).toLocaleDateString() : ''}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
