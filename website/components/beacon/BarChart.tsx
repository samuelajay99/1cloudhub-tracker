'use client';

import { QuestionOption, Tally } from '../../lib/beacon';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: large ? 20 : 12 }}>
      {options.map((opt) => {
        const t = byId.get(opt.id) || { option_id: opt.id, count: 0, pct: 0 };
        const isCorrect = correctOptionId && opt.id === correctOptionId;
        return (
          <div key={opt.id}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: large ? 'var(--text-lg)' : 'var(--text-sm)',
                fontWeight: isCorrect ? 700 : 500,
                color: isCorrect ? 'var(--green-600)' : 'var(--text-primary)',
                marginBottom: 6,
              }}
            >
              <span>
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
                  background: isCorrect ? 'var(--green-500)' : 'var(--gradient-accent)',
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
