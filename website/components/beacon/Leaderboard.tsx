'use client';

export interface LeaderboardRow {
  participant_id: string;
  name: string;
  score: number;
  rank: number;
}

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
        {rows.map((r) => (
          <tr key={r.participant_id}>
            <td style={{ fontWeight: 700, fontSize: large ? 'var(--text-lg)' : undefined }}>#{r.rank}</td>
            <td style={{ fontSize: large ? 'var(--text-lg)' : undefined }}>{r.name}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, fontSize: large ? 'var(--text-lg)' : undefined }}>{r.score}</td>
          </tr>
        ))}
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
