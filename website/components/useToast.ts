'use client';

import { useCallback, useRef, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastState {
  message: string;
  kind: ToastKind;
  visible: boolean;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ message: '', kind: 'info', visible: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, kind: ToastKind = 'info', durationMs = 4000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, kind, visible: true });
    timerRef.current = setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, durationMs);
  }, []);

  return { toast, showToast };
}
