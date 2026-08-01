// Ported near-verbatim from the vanilla Electron app's <script type="module">
// in app/index.html — zero logic changes. See app/CLAUDE.md's "Critical
// lessons already learned" section for the bug history behind escapeHtml.
//
// sanitizeNoteHtml / htmlToPlainText use DOMParser, a browser-only API —
// only call these from client components (everything in components/compass
// is 'use client').

// ---------- escapeHtml ----------
// Never use `innerText` to escape HTML in this codebase: Chromium's
// `innerText` setter silently converts `\n` into `<br>` elements, which
// caused a real data-corruption bug in shipped notes (injected literal
// `<br>` into users' notes for days). escapeHtml is pure string replacement
// — keep it that way.
export function escapeHtml(s: unknown): string {
  return s == null
    ? ''
    : String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ---------- sanitizeNoteText ----------
// Strips <br>/<p>/<div>/&nbsp;/any tags -> newlines. Used for transcript /
// task fields / quick-add — plain-text surfaces, not the rich note body.
export function sanitizeNoteText(s: string | null | undefined): string | null | undefined {
  if (!s) return s;
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<(p|div)[^>]*>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

// ---------- Rich note body sanitization (Quill) ----------
// note.body is allowed to hold real formatting (bold/lists/checklists) as
// sanitized HTML. This is a parallel pipeline to sanitizeNoteText above,
// which keeps its original job for transcript/task fields/quick-add — only
// the note body's shape changes.
const NOTE_HTML_ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'OL', 'UL', 'LI',
  'H1', 'H2', 'BLOCKQUOTE', 'A', 'SPAN',
]);
const NOTE_HTML_ALLOWED_ATTRS: Record<string, string[]> = {
  A: ['href', 'target', 'rel'],
  LI: ['data-list'],
  SPAN: ['class'],
};
// These never make sense to unwrap-and-keep-text (e.g. a <script> tag's
// text content is code, not note content) — drop the whole subtree instead
// of promoting its children the way an unrecognized-but-harmless tag would be.
const NOTE_HTML_DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT']);

function sanitizeHtmlNode(node: ChildNode): void {
  if (node.nodeType === Node.TEXT_NODE) return;
  if (node.nodeType !== Node.ELEMENT_NODE) {
    node.remove();
    return;
  }
  const el = node as Element;
  const tag = el.tagName;
  if (NOTE_HTML_DROP_TAGS.has(tag)) {
    el.remove();
    return;
  }
  Array.from(el.childNodes).forEach((child) => sanitizeHtmlNode(child)); // clean descendants first
  if (!NOTE_HTML_ALLOWED_TAGS.has(tag)) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    return;
  }
  const allowed = NOTE_HTML_ALLOWED_ATTRS[tag] || [];
  Array.from(el.attributes).forEach((attr) => {
    if (!allowed.includes(attr.name.toLowerCase())) el.removeAttribute(attr.name);
  });
  if (tag === 'A') {
    const href = el.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
      el.removeAttribute('href');
    } else {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

// Allowlist sanitizer for the rich note body. DOMParser output is inert
// (no script execution, no image network fetches), so it's safe to run
// this on arbitrary pasted/adversarial HTML before it's ever persisted.
export function sanitizeNoteHtml(html: string | null | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  Array.from(doc.body.childNodes).forEach((child) => sanitizeHtmlNode(child));
  return doc.body.innerHTML;
}

// Plain-text projection of the rich body, for Claude prompts and the
// sidebar preview only — never for DOM insertion of live HTML. Checklist
// items keep their checked/unchecked state as [x]/[ ] instead of being
// silently lost the way a naive tag-strip would lose it.
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines: string[] = [];
  const walkBlock = (el: Element) => {
    const tag = el.tagName;
    if (tag === 'UL' || tag === 'OL') {
      Array.from(el.children).forEach((li) => {
        const listType = li.getAttribute('data-list');
        const prefix = listType === 'checked' ? '[x] ' : listType === 'unchecked' ? '[ ] ' : '- ';
        lines.push(prefix + (li.textContent || '').trim());
      });
    } else if (tag === 'BLOCKQUOTE') {
      lines.push('> ' + (el.textContent || '').trim());
    } else {
      const t = (el.textContent || '').trim();
      if (t) lines.push(t);
    }
  };
  Array.from(doc.body.children).forEach((el) => walkBlock(el));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// A note body is "rich" (new HTML format) once it starts with a real block
// tag. Legacy notes (plain text, or already tag-stripped by the old
// sanitizeNoteText pipeline) fail this test and get converted once.
export function isRichNoteBody(html: string | null | undefined): boolean {
  return /^\s*<(p|h[1-3]|ul|ol|blockquote)[\s>]/i.test(html || '');
}

// Mutates note.body in place, converting plain text -> paragraph HTML.
// Returns true if a migration was actually performed (idempotent — a
// second call on an already-rich body is a no-op and returns false).
export function migrateNoteBodyToHtml(note: { body: string | null | undefined }): boolean {
  const body = note.body || '';
  if (isRichNoteBody(body)) return false;
  const escaped = escapeHtml(body); // pure string escaping — never innerText, see app/CLAUDE.md lesson #1
  note.body = escaped.split('\n').map((line) => `<p>${line || '<br>'}</p>`).join('') || '<p><br></p>';
  return true;
}

// ---------- simpleHash ----------
// Used to skip redundant Claude calls when note content is unchanged for
// Extract Tasks (compared against Note.lastExtractedHash).
export function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}
