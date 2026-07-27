'use client';

export interface LeaderboardRow {
  participant_id: string;
  name: string;
  score: number;
  rank: number;
}

const MEDALS: Record<number, { emoji: string; color: string }> = {
  1: { emoji: '🥇', color: '#EAB308' },
  2: { emoji: '🥈', color: '#94A3B8' },
  3: { emoji: '🥉', color: '#C2703D' },
};

export default function Leaderboard({ rows, large }: { rows: LeaderboardRow[]; large?: boolean }) {
  return (
    <table className="ch-table">
      <thead>
        <tr>
          <th style={{ width: 60 }}>Rank</th>
          <th>Name</th>
          <th style={{ textAlign: 'right' }}>Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const medal = MEDALS[r.rank];
          return (
            <tr key={r.participant_id}>
              <td style={{ fontWeight: 700, fontSize: large ? 'var(--text-lg)' : undefined, color: medal?.color }}>
                {medal ? medal.emoji : `#${r.rank}`}
              </td>
              <td style={{ fontSize: large ? 'var(--text-lg)' : undefined, fontWeight: medal ? 700 : 500 }}>{r.name}</td>
              <td
                style={{
                  textAlign: 'right',
                  fontWeight: 700,
                  fontSize: large ? 'var(--text-lg)' : undefined,
                  color: medal?.color || 'var(--text-primary)',
                }}
              >
                {r.score}
              </td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>
              No scores yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
