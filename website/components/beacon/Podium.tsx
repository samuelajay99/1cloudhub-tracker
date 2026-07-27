'use client';

import { useEffect, useState } from 'react';
import { LeaderboardRow } from './Leaderboard';

// Reveals 3rd, then 2nd, then 1st — building toward the biggest moment
// last, the way every real awards-show finale paces a podium reveal.
const COLUMN_ORDER = [3, 2, 1] as const;
const COLUMN_STYLE: Record<number, { height: number; color: string; medal: string }> = {
  1: { height: 190, color: '#EAB308', medal: '🥇' },
  2: { height: 140, color: '#94A3B8', medal: '🥈' },
  3: { height: 100, color: '#C2703D', medal: '🥉' },
};

export default function Podium({ rows }: { rows: LeaderboardRow[] }) {
  const [revealed, setRevealed] = useState<number[]>([]);
  const byRank = new Map(rows.map((r) => [r.rank, r]));

  useEffect(() => {
    setRevealed([]);
    const timers = COLUMN_ORDER.filter((rank) => byRank.has(rank)).map((rank, i) =>
      setTimeout(() => setRevealed((r) => [...r, rank]), i * 1100)
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => r.participant_id).join('|')]);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 20, minHeight: 280 }}>
      {[2, 1, 3].map((rank) => {
        const row = byRank.get(rank);
        if (!row) return <div key={rank} style={{ width: 140 }} />;
        const style = COLUMN_STYLE[rank];
        const isRevealed = revealed.includes(rank);
        return (
          <div
            key={rank}
            style={{
              width: 140,
              textAlign: 'center',
              opacity: isRevealed ? 1 : 0,
              transform: isRevealed ? 'translateY(0)' : 'translateY(24px)',
              transition: 'opacity 500ms ease, transform 500ms ease',
            }}
          >
            <div style={{ fontSize: rank === 1 ? 40 : 30, marginBottom: 8 }}>{style.medal}</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: rank === 1 ? 'var(--text-lg)' : 'var(--text-md)', marginBottom: 4 }}>
              {row.name}
            </div>
            <div style={{ color: style.color, fontWeight: 700, fontSize: 'var(--text-md)', marginBottom: 10 }}>{row.score} pts</div>
            <div
              style={{
                height: style.height,
                borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                background: `linear-gradient(180deg, ${style.color}, ${style.color}CC)`,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: 12,
                color: '#fff',
                fontWeight: 700,
                fontSize: 'var(--text-2xl)',
                boxShadow: '0 8px 24px rgba(0,0,0,.35)',
              }}
            >
              {rank}
            </div>
          </div>
        );
      })}
    </div>
  );
}
