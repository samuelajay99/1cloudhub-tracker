'use client';

// Notes tab root — owns `selectedNoteId` and lays out the sidebar + editor
// pair. Ported from app/index.html's module-level `selectedNoteId` plus
// renderSidebar()/renderEditor().
//
// Composition choice (documented here because later phases depend on it):
// NotesTab takes the return value of useCompassData(userId) as a prop
// (`data`) rather than calling the hook itself. Board and Email tabs, built
// in later phases, must be handed the SAME hook instance/state — e.g. Board
// needs to see tasks Notes just extracted, without a second Supabase round
// trip or the two tabs' in-memory state diverging. CompassHome (task #108)
// calls `useCompassData(userId)` once and passes `data` down to
// NotesTab/BoardTab/EmailTab as siblings.
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { UseCompassData } from '../useCompassData';
import NoteSidebar from './NoteSidebar';
import NoteEditor from './NoteEditor';

// Imperative handle so CompassHome's global ⌘N shortcut (ported from
// vanilla's `switchTab('notes'); newNoteBtn.click()`) can create-and-select
// a new note without needing `selectedNoteId` lifted out of this component —
// mirrors BoardTabHandle's own forwardRef pattern (see BoardTab.tsx).
export interface NotesTabHandle {
  createNote: () => void;
}

const NotesTab = forwardRef<NotesTabHandle, { data: UseCompassData }>(function NotesTab({ data }, ref) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // If the selected note disappears (deleted from under us, or on first
  // load before anything is selected), fall back to nothing-selected
  // instead of pointing at a stale id.
  useEffect(() => {
    if (selectedNoteId && !data.notes.some((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(null);
    }
  }, [data.notes, selectedNoteId]);

  const selectedNote = data.notes.find((n) => n.id === selectedNoteId) ?? null;

  function handleCreate() {
    const note = data.createNote();
    setSelectedNoteId(note.id);
  }

  useImperativeHandle(ref, () => ({ createNote: handleCreate }));

  if (data.loading) {
    return <div className="ch-notes-loading">Loading notes…</div>;
  }

  return (
    <div className="ch-notes-shell">
      <NoteSidebar notes={data.notes} selectedNoteId={selectedNoteId} onSelect={setSelectedNoteId} onCreate={handleCreate} />
      <NoteEditor note={selectedNote} data={data} onDeleted={() => setSelectedNoteId(null)} />
    </div>
  );
});

export default NotesTab;
