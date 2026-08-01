'use client';

import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

// Generic reusable dialog primitive — doesn't exist yet on the website
// (Beacon/Horizon never needed a modal). Built from the .ch-modal-* classes
// in website/app/globals.css, which reuse the existing design-system tokens.
// Not Compass-specific: any future app in Orbit can import this.
export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ch-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ch-modal" role="dialog" aria-modal="true" aria-label={title}>
        {title ? (
          <div className="ch-modal-header">
            <h2 className="ch-modal-title">{title}</h2>
            <button type="button" className="ch-modal-close" onClick={onClose} aria-label="Close">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <button type="button" className="ch-modal-close ch-modal-close-bare" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        )}
        <div className="ch-modal-body">{children}</div>
      </div>
    </div>
  );
}
