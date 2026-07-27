'use client';

import { QuestionOption, Tally } from '../../lib/beacon';

const OPTION_COLORS = ['#0568AD', '#F7941D', '#7C3AED', '#4EC9EE', '#DB2777', '#6366F1'];

export default function BarChart({
  options,
  tallies,
  correctOptionId,
  large,
}: {
  options: QuestionOption[];
  tallies: Tally[];
  correctOptionId?: string;
  large?: boolean;
}) {
  const byId = new Map(tallies.map((t) => [t.option_id, t]));
  const leaderPct = Math.max(0, ...tallies.map((t) => t.pct));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: large ? 20 : 12 }}>
      {options.map((opt, i) => {
        const t = byId.get(opt.id) || { option_id: opt.id, count: 0, pct: 0 };
        const isCorrect = correctOptionId && opt.id === correctOptionId;
        const isLeader = !correctOptionId && t.pct > 0 && t.pct === leaderPct;
        const color = isCorrect ? 'var(--green-500)' : OPTION_COLORS[i % OPTION_COLORS.length];
        return (
          <div key={opt.id}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: large ? 'var(--text-lg)' : 'var(--text-sm)',
                fontWeight: isCorrect || isLeader ? 700 : 500,
                color: isCorrect ? 'var(--green-600)' : 'var(--text-primary)',
                marginBottom: 6,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: large ? 12 : 9,
                    height: large ? 12 : 9,
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                  }}
                />
                {opt.label}
                {isCorrect ? ' ✓' : ''}
              </span>
              <span>
                {t.count} · {t.pct}%
              </span>
            </div>
            <div
              style={{
                background: 'var(--surface-card-alt)',
                borderRadius: 'var(--radius-pill)',
                height: large ? 20 : 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${t.pct}%`,
                  height: '100%',
                  background: color,
                  borderRadius: 'var(--radius-pill)',
                  transition: 'width 400ms var(--ease-standard, ease)',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
