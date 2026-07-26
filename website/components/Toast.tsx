'use client';

import { ToastState } from './useToast';

export default function Toast({ toast }: { toast: ToastState }) {
  return (
    <div className={`ch-toast ${toast.visible ? 'show' : ''} toast-${toast.kind}`} role="status" aria-live="polite">
      {toast.message}
    </div>
  );
}
