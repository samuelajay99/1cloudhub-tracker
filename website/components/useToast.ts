'use client';

import { useCallback, useRef, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastState {
  message: string;
  kind: ToastKind;
  visible: boolean;
  // Optional action button (e.g. "Undo" on Board's soft-delete). Additive —
  // every existing call site keeps working unchanged since this is never
  // required.
  action?: ToastAction;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ message: '', kind: 'info', visible: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, kind: ToastKind = 'info', durationMs = 4000, action?: ToastAction) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, kind, visible: true, action });
    timerRef.current = setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, durationMs);
  }, []);

  return { toast, showToast };
}
