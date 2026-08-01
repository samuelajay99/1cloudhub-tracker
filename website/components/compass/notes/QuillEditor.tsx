'use client';

// Persistent-instance Quill wrapper. Ported from app/index.html's
// ensureQuill()/quillEditingNoteId pattern (see app/CLAUDE.md lesson #4):
// a naive `new Quill(...)` per render (or per note switch) would leak
// instances, stack duplicate `text-change` listeners, and reset cursor
// position on every keystroke. Instead:
//
//   - The Quill instance is constructed exactly once, in an empty-deps
//     effect, attached to a host <div> that this component owns.
//   - The `text-change` listener is registered once in that same effect.
//     It reads the latest `onChange` via a ref so the listener never needs
//     to be torn down and re-added as the callback identity changes across
//     parent re-renders.
//   - Content is only reloaded via `setContents()` in a SEPARATE effect
//     keyed on `noteId`, guarded so an unchanged id is a no-op — this is
//     the direct equivalent of vanilla's `quillEditingNoteId` check.
//
// This component must stay mounted for the entire lifetime of the Notes
// tab being visible (rendered unconditionally by NoteEditor, never behind
// `{note && <QuillEditor/>}`) or the "construct once" property breaks.
//
// One deliberate improvement over vanilla: vanilla's renderEditor() calls
// setContents() for the newly-selected note synchronously, with no regard
// for whatever the abandoned note's still-pending 800ms save debounce was
// about to write — a fast switch away from a note loses up to the last
// 800ms of typing (setContents overwrites quill.root before the old
// timer fires, and by the time it does fire, quillEditingNoteId already
// points at the new note, so the stale save is silently swallowed). Here,
// switching notes flushes the outgoing note's pending body edit
// synchronously (via the `noteId` effect, using the OLD id) before the new
// note's content is loaded, so rapid note-switching never drops content.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
// Type-only import — erased at compile time, so it can't trigger the runtime
// problem below. The real `quill` module is loaded dynamically inside the
// mount effect instead of via a top-level `import`: Quill's package touches
// `document` during module evaluation (not just when constructed), which
// crashes Next.js's server-side render of this 'use client' component
// (`ReferenceError: document is not defined` — 'use client' only controls
// hydration, it does not stop the component's module from being evaluated
// on the server for the initial HTML). Deferring the import into an effect
// guarantees it only ever runs in the browser.
import type Quill from 'quill';

const SAVE_DEBOUNCE_MS = 800;

export interface QuillEditorProps {
  /** The currently-selected note's id, or null when nothing is selected. */
  noteId: string | null;
  /** HTML to load into the editor whenever `noteId` changes to a new value. */
  initialHtml: string;
  /**
   * Fired ~800ms after the user stops typing in a given note, and once
   * more (synchronously, no debounce) as a flush right before switching
   * away from that note or unmounting. `noteId` identifies which note the
   * `html` belongs to — it is NOT necessarily the note currently selected
   * in the parent by the time this fires, so callers must target it
   * explicitly (e.g. `updateNote(noteId, { body: html })`) rather than
   * assuming it matches whatever is currently selected.
   */
  onChange: (noteId: string, html: string) => void;
  placeholder?: string;
}

// Imperative escape hatch for actions that need the LIVE editor content
// right now, synchronously — Extract Tasks and Meeting Minutes both need
// this, mirroring vanilla's saveCurrentNote(false) call at the top of
// extractFromCurrentNote()/generateMinutesForCurrentNote(), which re-reads
// quill.root.innerHTML into note.body before doing anything else so the
// action never operates on stale (pre-debounce) content.
export interface QuillEditorHandle {
  /** Current live HTML straight from the DOM, unsanitized. */
  getHtml: () => string;
  /** Cancels the pending debounced save (if any) and fires onChange immediately for the active note. */
  flush: () => void;
}

const QuillEditor = forwardRef<QuillEditorHandle, QuillEditorProps>(function QuillEditor(
  { noteId, initialHtml, onChange, placeholder },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  const lastLoadedNoteIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flips true once the dynamically-imported Quill instance finishes
  // constructing, so the noteId-reload effect (below) re-evaluates against
  // whatever noteId is current at that point — without this, a noteId that
  // arrives while the dynamic import is still in flight would be missed
  // (the reload effect would have already run once with quillRef.current
  // still null and silently no-opped, with nothing to re-trigger it).
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () => quillRef.current?.root.innerHTML ?? '',
      flush: () => {
        const quill = quillRef.current;
        if (!quill) return;
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        const activeId = lastLoadedNoteIdRef.current;
        if (activeId) onChangeRef.current(activeId, quill.root.innerHTML);
      },
    }),
    []
  );

  // Construct exactly once. The `quill` package (and its CSS) is imported
  // dynamically here — not at module top-level — specifically so its
  // document-touching module-evaluation code never runs during Next.js's
  // server render of this component (see the import comment above).
  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;

    (async () => {
      const [{ default: QuillCtor }] = await Promise.all([import('quill'), import('quill/dist/quill.snow.css')]);
      if (cancelled || !hostRef.current) return;

      const quill = new QuillCtor(hostRef.current, {
        theme: 'snow',
        placeholder:
          placeholder || "Write anything — a task, a follow-up, a meeting recap. When you're ready, click Extract Tasks.",
        modules: {
          toolbar: [
            ['bold', 'italic', 'underline', 'strike'],
            [{ header: 1 }, { header: 2 }],
            [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
            ['blockquote', 'link'],
          ],
        },
      });
      quill.enable(false); // nothing selected yet — the noteId effect (re-)runs once `ready` flips, below
      quill.on('text-change', (_delta, _oldDelta, source) => {
        if (source !== 'user') return; // ignore programmatic loads from setContents() during note switch
        const activeId = lastLoadedNoteIdRef.current;
        if (!activeId) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null;
          onChangeRef.current(activeId, quill.root.innerHTML);
        }, SAVE_DEBOUNCE_MS);
      });
      quillRef.current = quill;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      const quill = quillRef.current;
      if (!quill) return;
      // Flush a pending save before the wrapper itself is torn down (e.g.
      // the whole Notes tab unmounts) — vanilla never needs this because
      // it's a single-page app that never unmounts its Quill instance, but
      // React's tree can. Without this, the last <800ms of typing before
      // navigating away would be silently dropped.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        const activeId = lastLoadedNoteIdRef.current;
        if (activeId) onChangeRef.current(activeId, quill.root.innerHTML);
      }
      quillRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload content only when the note id actually changes — the direct
  // equivalent of vanilla's `if (quillEditingNoteId !== note.id) { ... }`.
  // Also re-runs once `ready` flips true, to cover a noteId that arrived
  // while Quill's dynamic import was still in flight (see `ready`'s comment
  // above) — everything after this guard is unaffected by which of the two
  // dependencies changed.
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    if (lastLoadedNoteIdRef.current === noteId) return;

    const prevId = lastLoadedNoteIdRef.current;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (prevId) onChangeRef.current(prevId, quill.root.innerHTML);
    }

    if (noteId) {
      quill.setContents(quill.clipboard.convert({ html: initialHtml || '<p><br></p>' }), 'silent');
      quill.enable(true);
    } else {
      quill.setContents(quill.clipboard.convert({ html: '<p><br></p>' }), 'silent');
      quill.enable(false);
    }
    lastLoadedNoteIdRef.current = noteId;
    // Deliberately NOT depending on `initialHtml` — reloading content is
    // driven solely by identity change, matching quillEditingNoteId. If
    // initialHtml were a dependency, an unrelated re-render carrying a new
    // (but equivalent) string for the SAME note would blow away live
    // in-progress edits / cursor position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, ready]);

  return <div className="ch-quill-host" ref={hostRef} />;
});

export default QuillEditor;
