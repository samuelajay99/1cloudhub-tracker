'use client';

// The real tabbed shell for Compass, replacing the rough tab-button
// precursor that lived directly in app/compass/page.tsx during phases 2-4
// (see that file's git history / prior header comment). Ported from
// app/index.html's `.topbar` + `switchTab()` + the global ⌘K/⌘F/⌘N keydown
// listener (~lines 2247-2254). Esc-closes-modals is NOT re-implemented here
// — every modal in this port (Modal.tsx-based: NoteTasksModal,
// MeetingMinutesModal, TaskDetailModal) already listens for Escape itself
// (see shared/Modal.tsx), which vanilla had to do by hand across 4 separate
// modal ids in one shared listener.
//
// Account controls: vanilla's gear icon opens a modal showing the signed-in
// email + a Sign out button (plus an app version label, meaningless for a
// web page). Rather than porting that gear+modal pattern — which exists
// nowhere else on the site — this follows the root page's own established
// convention instead (see app/page.tsx's header: an email label + inline
// "Sign out" button, no modal), for consistency with the rest of Orbit.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, NotebookPen, KanbanSquare, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCompassData } from './useCompassData';
import { CompassHeaderBrand } from '../Brand';
import NotesTab, { NotesTabHandle } from './notes/NotesTab';
import BoardTab, { BoardTabHandle } from './board/BoardTab';
import EmailTab from './email/EmailTab';

type CompassTab = 'notes' | 'board' | 'email';

const TABS: { id: CompassTab; label: string; icon: typeof NotebookPen }[] = [
  { id: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'board', label: 'Board', icon: KanbanSquare },
  { id: 'email', label: 'Email', icon: Mail },
];

export default function CompassHome({ userId }: { userId: string }) {
  const router = useRouter();
  const data = useCompassData(userId);
  const [tab, setTab] = useState<CompassTab>('notes');
  const [email, setEmail] = useState('');

  const notesRef = useRef<NotesTabHandle>(null);
  const boardRef = useRef<BoardTabHandle>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: sessionData }) => {
      setEmail(sessionData.session?.user.email || '');
    });
  }, []);

  // Ported from the global keydown listener that isn't tied to any one
  // modal (~app/index.html lines 2247-2254): ⌘/Ctrl+K -> Board + focus quick
  // add, ⌘/Ctrl+F -> Board + focus search, ⌘/Ctrl+N -> Notes + create a new
  // note. Runs the tab switch and the focus/create call in the same
  // keydown handler, same as vanilla — the imperative handles on
  // BoardTab/NotesTab make the focus/create call safe to fire immediately
  // even on the render where the tab just switched, since focusing/creating
  // doesn't depend on the newly-visible DOM having painted first (both tabs
  // are always mounted, just display:none-toggled — see the panel markup
  // below).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'k') {
        e.preventDefault();
        setTab('board');
        boardRef.current?.focusQuickAdd();
      } else if (k === 'f') {
        e.preventDefault();
        setTab('board');
        boardRef.current?.focusSearch();
      } else if (k === 'n') {
        e.preventDefault();
        setTab('notes');
        notesRef.current?.createNote();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <div className="ch-page">
      <header className="ch-header">
        <CompassHeaderBrand />
        <div className="ch-header-right">
          <a href="/" className="ch-btn ch-btn-ghost" style={{ color: '#fff' }}>
            <ArrowLeft size={16} strokeWidth={2} /> Back to Orbit
          </a>
          {email ? <span className="ch-header-user">{email}</span> : null}
          <button type="button" className="ch-btn ch-btn-inverse" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="ch-compass-shell">
        {/*
          Primary section nav for the whole app — distinct on purpose from
          BoardTab's own List/Kanban toggle (a small pill control for a
          secondary, in-tab choice). This is top-level navigation, so it
          gets the weight of one: underlined tabs with icons, full-width
          separator beneath, following the same pattern as Notion/Linear's
          section tabs rather than reusing the pill-button styling that was
          here before.
        */}
        <nav className="ch-compass-tabs" role="tablist" aria-label="Compass sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={'ch-compass-tab' + (tab === id ? ' active' : '')}
              onClick={() => setTab(id)}
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </button>
          ))}
        </nav>

        {/*
          All three tabs stay mounted (hidden via CSS, not unmounted) once
          this component mounts — see NoteEditor/QuillEditor's own "construct
          once" rationale. Swapping any of them in/out of the tree on tab
          clicks would tear down Notes' persistent Quill instance the moment
          another tab is ever selected first, and would defeat the ⌘K/⌘F/⌘N
          handlers above, which rely on the target tab's imperative handle
          already being mounted before the keypress that switches to it.
        */}
        <div style={{ display: tab === 'notes' ? 'block' : 'none' }}>
          <NotesTab ref={notesRef} data={data} />
        </div>
        <div style={{ display: tab === 'board' ? 'block' : 'none' }}>
          <BoardTab ref={boardRef} data={data} />
        </div>
        <div style={{ display: tab === 'email' ? 'block' : 'none' }}>
          <EmailTab data={data} />
        </div>
      </div>
    </div>
  );
}
