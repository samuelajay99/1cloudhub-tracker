'use client';

import { useEffect, useRef, useState } from 'react';

// Winners are already decided server-side (see runRaffle() in the host
// live-control room) — this is a cosmetic name-cycling reveal, not a live
// draw. Cycling through the real participant pool before landing on the
// true winner gives the suspense of a spinning wheel without the
// implementation/design risk of an actual wheel graphic.
export default function RaffleWheel({ pool, winners }: { pool: string[]; winners: { participant_id: string; name: string }[] }) {
  const [cycling, setCycling] = useState(true);
  const [displayName, setDisplayName] = useState(pool[0] || '');
  const [revealedIndex, setRevealedIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (pool.length === 0) {
      setCycling(false);
      return;
    }
    let tick = 0;
    intervalRef.current = setInterval(() => {
      setDisplayName(pool[Math.floor(Math.random() * pool.length)]);
      tick++;
      if (tick > 18) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setCycling(false);
      }
    }, 90);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.join('|')]);

  useEffect(() => {
    if (cycling || revealedIndex >= winners.length) return;
    const t = setTimeout(() => setRevealedIndex((i) => i + 1), 1200);
    return () => clearTimeout(t);
  }, [cycling, revealedIndex, winners.length]);

  if (cycling) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div style={{ fontSize: 'var(--text-4xl)', fontWeight: 700, color: 'var(--blue-600)' }}>{displayName}</div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {winners.slice(0, revealedIndex + 1).map((w, i) => (
        <div
          key={w.participant_id}
          style={{
            fontSize: 'var(--text-4xl)',
            fontWeight: 700,
            color: 'var(--green-600)',
            animation: i === revealedIndex ? 'beacon-raffle-pop 500ms var(--ease-standard, ease)' : undefined,
          }}
        >
          🎉 {w.name}
        </div>
      ))}
      <style>{`
        @keyframes beacon-raffle-pop {
          0% { transform: scale(0.6); opacity: 0; }
          70% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
