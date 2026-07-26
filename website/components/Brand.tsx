import { LucideIcon } from 'lucide-react';

/** theme 'dark' = colored logo for light backgrounds. 'light' = white knockout for navy backgrounds. */
export function Logo({ theme = 'dark', height = 20 }: { theme?: 'dark' | 'light'; height?: number }) {
  const src = theme === 'light' ? '/1cloudhub-logo-white.png' : '/1cloudhub-logo.png';
  return <img src={src} alt="1CloudHub" height={height} style={{ width: 'auto' }} />;
}

export function HeaderBrand() {
  return (
    <div className="ch-header-brand">
      <Logo theme="light" height={20} />
      <span className="divider" />
      <span className="ch-header-product">
        ORBIT
        <small>AI apps for everyday life</small>
      </span>
    </div>
  );
}

export function OrbitBrand({ center = false, theme = 'dark' }: { center?: boolean; theme?: 'dark' | 'light' }) {
  return (
    <div
      className="ch-header-brand"
      style={{ marginBottom: 20, justifyContent: center ? 'center' : 'flex-start' }}
    >
      <Logo theme={theme} height={20} />
      <span className="divider" style={{ background: theme === 'light' ? 'rgba(255,255,255,.18)' : 'var(--border-default)' }} />
      <span className="ch-header-product" style={{ color: theme === 'light' ? '#fff' : 'var(--navy-700)' }}>
        ORBIT
        <small style={{ color: theme === 'light' ? 'rgba(255,255,255,.6)' : 'var(--text-secondary)' }}>AI apps for everyday life</small>
      </span>
    </div>
  );
}

export function FooterBrand() {
  return <Logo theme="light" height={18} />;
}

export function IconTile({
  icon: Icon,
  size = 22,
  tone = 'default',
}: {
  icon: LucideIcon;
  size?: number;
  tone?: 'default' | 'accent' | 'sky' | 'navy' | 'square';
}) {
  return (
    <div className={`ch-icon-tile ${tone === 'default' ? '' : tone}`} style={{ width: size + 30, height: size + 30 }}>
      <Icon size={size} strokeWidth={1.75} />
    </div>
  );
}
