'use client';

// Notes list sidebar — ported from app/index.html's renderSidebar(): notes
// sorted by updatedAt descending, each item showing title + a plain-text
// snippet of the rich body (first 60 chars) + a last-updated date.
//
// Collapsible (new, not in vanilla — vanilla's window is user-resizable so
// this never came up there): the list can be tucked away into a slim rail
// so the editor gets the width back, for people who mostly want to just
// write and only dip into the list occasionally. Collapsed state is a pure
// UI preference, not app data, so it's owned by NotesTab.tsx and persisted
// to localStorage the same way BoardTab's view-mode/expanded-groups are.
import { ChevronsLeft, ChevronsRight, Plus } from 'lucide-react';
import type { Note } from '../types';
import { htmlToPlainText } from '../utils';

export default function NoteSidebar({
  notes,
  selectedNoteId,
  onSelect,
  onCreate,
  collapsed,
  onToggleCollapsed,
}: {
  notes: Note[];
  selectedNoteId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const sorted = notes.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  if (collapsed) {
    return (
      <div className="ch-notes-sidebar collapsed">
        <button
          type="button"
          className="ch-notes-rail-btn"
          onClick={onToggleCollapsed}
          title="Show notes list"
          aria-label="Show notes list"
        >
          <ChevronsRight size={16} strokeWidth={2.25} />
        </button>
        <button type="button" className="ch-notes-rail-btn accent" onClick={onCreate} title="New note" aria-label="New note">
          <Plus size={16} strokeWidth={2.25} />
        </button>
      </div>
    );
  }

  return (
    <div className="ch-notes-sidebar">
      <div className="ch-notes-sidebar-head">
        <span className="ch-notes-sidebar-title">Notes</span>
        <div className="ch-notes-sidebar-head-actions">
          <button type="button" className="ch-btn ch-btn-primary ch-notes-new-btn" onClick={onCreate}>
            <Plus size={15} strokeWidth={2.25} />
            New note
          </button>
          <button
            type="button"
            className="ch-notes-collapse-btn"
            onClick={onToggleCollapsed}
            title="Collapse notes list"
            aria-label="Collapse notes list"
          >
            <ChevronsLeft size={16} strokeWidth={2.25} />
          </button>
        </div>
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
