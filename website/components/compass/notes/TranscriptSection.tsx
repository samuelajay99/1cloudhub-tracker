'use client';

// Collapsible transcript panel — ported from app/index.html's transcript
// markup inside renderEditor() (the `showTranscript` block) plus its
// attach-file wiring (extractTextFromDocx / plain .txt read / paste).
import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { FileText, ChevronUp } from 'lucide-react';
import { sanitizeNoteText } from '../utils';

// Ported near-verbatim from app/index.html's extractTextFromDocx(): a
// .docx is a zip; word/document.xml holds the document body as WordML,
// where each <w:p> is a paragraph and each <w:t> inside it is a run of
// text. Concatenating <w:t> text per <w:p>, joined by newlines, is a good
// enough plain-text projection for transcript purposes (no styling needed).
async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('Not a valid .docx file');
  const xmlStr = await docXmlFile.async('string');
  const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  const lines = paragraphs.map((p) => {
    const textNodes = Array.from(p.getElementsByTagName('w:t'));
    return textNodes.map((n) => n.textContent).join('');
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const MARKUP_RE = /<br\s*\/?>|<\/?(p|div)[^>]*>|&nbsp;/i;

export default function TranscriptSection({
  transcript,
  includeTranscriptInExtract,
  open,
  onOpen,
  onHide,
  onTranscriptChange,
  onTranscriptAttached,
  onIncludeChange,
  disabled,
}: {
  transcript: string;
  includeTranscriptInExtract: boolean;
  open: boolean;
  onOpen: () => void;
  onHide: () => void;
  onTranscriptChange: (value: string) => void;
  /** Fired after a file attach completes (merged text) — saved immediately, no debounce, matching vanilla. */
  onTranscriptAttached: (mergedText: string) => void;
  onIncludeChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachStatus, setAttachStatus] = useState('');
  const hasTranscript = !!(transcript && transcript.trim());

  if (disabled) return null;

  if (!open) {
    return (
      <button type="button" className="ch-transcript-toggle" onClick={onOpen}>
        <FileText size={14} strokeWidth={2} />
        {hasTranscript ? 'Show meeting transcript ✓' : 'Add meeting transcript'}
      </button>
    );
  }

  function handleTextareaChange(v: string) {
    // Cursor-safety: only run the cleaner when a stray tag is actually
    // present (matches vanilla's liveCleanIfNeeded — avoids touching the
    // cursor on every ordinary keystroke).
    const cleaned = MARKUP_RE.test(v) ? sanitizeNoteText(v) || '' : v;
    onTranscriptChange(cleaned);
  }

  async function handleFile(file: File) {
    setAttachStatus('Reading ' + file.name + '…');
    try {
      const raw = /\.docx$/i.test(file.name) ? await extractTextFromDocx(file) : await file.text();
      const text = sanitizeNoteText(raw) || '';
      const merged = transcript.trim() ? transcript.trim() + '\n\n' + text : text;
      onTranscriptAttached(merged);
      setAttachStatus('Attached: ' + file.name);
    } catch {
      setAttachStatus('Could not read ' + file.name + ' — try pasting the text instead.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="ch-transcript-section">
      <div className="ch-transcript-head">
        <label className="ch-label" style={{ margin: 0 }}>
          Meeting transcript (optional)
        </label>
        <button type="button" className="ch-transcript-hide" onClick={onHide} title="Collapse — your transcript is kept">
          Hide <ChevronUp size={13} strokeWidth={2} />
        </button>
      </div>
      <div className="ch-transcript-attach-row">
        <button type="button" className="ch-transcript-attach-btn" onClick={() => fileInputRef.current?.click()}>
          Attach .docx or .txt file
        </button>
        <span className="ch-transcript-or">or paste directly below</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.txt"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleFile(file);
          }}
        />
      </div>
      {attachStatus ? <div className="ch-transcript-attach-status">{attachStatus}</div> : null}
      <textarea
        className="ch-transcript-textarea"
        value={transcript}
        placeholder="Paste the call/meeting transcript here, or attach a file above..."
        onChange={(e) => handleTextareaChange(e.target.value)}
      />
      <div className="ch-transcript-checkbox-row">
        <input
          type="checkbox"
          id="includeTranscriptCheck"
          checked={includeTranscriptInExtract}
          onChange={(e) => onIncludeChange(e.target.checked)}
        />
        <label htmlFor="includeTranscriptCheck">Include this transcript when extracting tasks</label>
      </div>
    </div>
  );
}
