import { LucideIcon } from 'lucide-react';

export function Logo({ theme = 'dark', height = 20 }: { theme?: 'dark' | 'light'; height?: number }) {
  const src = theme === 'light' ? '/1cloudhub-logo-white.png' : '/1cloudhub-logo.png';
  return <img src={src} alt="1CloudHub" height={height} style={{ width: 'auto' }} />;
}

export function OrbitMark({ size = 30 }: { size?: number }) {
  return <img src="/orbit-mark.png" alt="" width={size} height={size} style={{ display: 'block', flexShrink: 0 }} />;
}

export function CompassMark({ size = 52 }: { size?: number }) {
  return <img src="/compass-mark.png" alt="Compass" width={size} height={size} style={{ display: 'block', flexShrink: 0 }} />;
}

export function BeaconMark({ size = 52 }: { size?: number }) {
  return <img src="/beacon-mark.png" alt="Beacon" width={size} height={size} style={{ display: 'block', flexShrink: 0 }} />;
}

export function HeaderBrand() {
  return (
    <div className="ch-header-brand">
      <OrbitMark size={30} />
      <span className="ch-orbit-word inverse">
        Orbit
        <small>by 1CloudHub</small>
      </span>
    </div>
  );
}

export function BeaconHeaderBrand() {
  return (
    <a href="/beacon" className="ch-header-brand" style={{ textDecoration: 'none' }}>
      <BeaconMark size={30} />
      <span className="ch-orbit-word inverse">
        Beacon
        <small>by Orbit</small>
      </span>
    </a>
  );
}

export function OrbitBrand({ center = false, theme = 'dark' }: { center?: boolean; theme?: 'dark' | 'light' }) {
  return (
    <div
      className="ch-header-brand"
      style={{ marginBottom: 20, justifyContent: center ? 'center' : 'flex-start' }}
    >
      <OrbitMark size={30} />
      <span className={`ch-orbit-word ${theme === 'light' ? 'inverse' : ''}`}>
        Orbit
        <small>by 1CloudHub</small>
      </span>
    </div>
  );
}

export function BeaconBrand({ center = false, theme = 'dark' }: { center?: boolean; theme?: 'dark' | 'light' }) {
  return (
    <div className="ch-header-brand" style={{ marginBottom: 20, justifyContent: center ? 'center' : 'flex-start' }}>
      <BeaconMark size={30} />
      <span className={`ch-orbit-word ${theme === 'light' ? 'inverse' : ''}`}>
        Beacon
        <small>by Orbit</small>
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
