'use client';

import { useEffect, useState } from 'react';

// Ticks off an absolute deadline (startedAt + limitSeconds) rather than
// decrementing a local counter, so it can't drift and stays correct even
// if the tab was backgrounded for a while. Purely a display concern —
// beacon-submit is the actual authority on whether an answer was in time.
export function useCountdown(startedAt: string | undefined, limitSeconds: number | undefined) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt || !limitSeconds) {
      setRemainingMs(null);
      return;
    }
    const deadline = new Date(startedAt).getTime() + limitSeconds * 1000;
    function tick() {
      setRemainingMs(Math.max(0, deadline - Date.now()));
    }
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [startedAt, limitSeconds]);

  const active = !!startedAt && !!limitSeconds;
  return {
    remainingMs,
    remainingSeconds: remainingMs != null ? Math.ceil(remainingMs / 1000) : null,
    fraction: active && limitSeconds ? Math.max(0, Math.min(1, (remainingMs ?? 0) / (limitSeconds * 1000))) : 1,
    expired: active && remainingMs !== null && remainingMs <= 0,
    active,
  };
}
