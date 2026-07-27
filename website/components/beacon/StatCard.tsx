'use client';

import { LucideIcon } from 'lucide-react';

const TONE_COLORS: Record<string, { bg: string; fg: string }> = {
  blue: { bg: 'var(--blue-100)', fg: 'var(--blue-600)' },
  sky: { bg: 'var(--sky-100)', fg: 'var(--sky-600)' },
  green: { bg: 'var(--green-100)', fg: 'var(--green-600)' },
  orange: { bg: 'var(--orange-100)', fg: 'var(--orange-600)' },
  violet: { bg: '#EDE4FB', fg: '#7C3AED' },
  pink: { bg: '#FBE0F0', fg: '#DB2777' },
};

export default function StatCard({
  icon: Icon,
  tone = 'blue',
  label,
  value,
}: {
  icon: LucideIcon;
  tone?: keyof typeof TONE_COLORS;
  label: string;
  value: string | number;
}) {
  const c = TONE_COLORS[tone];
  return (
    <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: c.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
        }}
      >
        <Icon size={20} strokeWidth={2} color={c.fg} />
      </div>
      <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
    </div>
  );
}
