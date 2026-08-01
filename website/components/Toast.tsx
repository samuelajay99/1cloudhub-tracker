'use client';

import { ToastState } from './useToast';

export default function Toast({ toast }: { toast: ToastState }) {
  return (
    <div className={`ch-toast ${toast.visible ? 'show' : ''} toast-${toast.kind}`} role="status" aria-live="polite">
      <span>{toast.message}</span>
      {toast.action ? (
        <button type="button" className="ch-toast-action" onClick={toast.action.onClick}>
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}
