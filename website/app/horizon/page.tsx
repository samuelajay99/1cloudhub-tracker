'use client';

import { HorizonHeaderBrand, FooterBrand } from '../../components/Brand';
import HorizonGate from '../../components/horizon/HorizonGate';
import HorizonHome from '../../components/horizon/HorizonHome';
import { ArrowLeft } from 'lucide-react';

export default function HorizonPage() {
  return <HorizonGate>{({ userId }) => <HorizonPageInner userId={userId} />}</HorizonGate>;
}

function HorizonPageInner({ userId }: { userId: string }) {
  return (
    <div className="ch-page">
      <header className="ch-header">
        <HorizonHeaderBrand />
        <div className="ch-header-right">
          <a href="/" className="ch-btn ch-btn-inverse">
            <ArrowLeft size={16} strokeWidth={2} /> Back to Orbit
          </a>
        </div>
      </header>

      <div style={{ minHeight: 'calc(100vh - 140px)', background: 'var(--surface-card-tint)', padding: '48px 0' }}>
        <div className="ch-shell-narrow" style={{ maxWidth: 640 }}>
          <HorizonHome userId={userId} />
        </div>
      </div>

      <footer className="ch-footer">
        <div className="ch-footer-bar" />
        <div className="ch-footer-inner">
          <FooterBrand />
          <span>www.1cloudhub.com</span>
          <span>© 2026 1CloudHub. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
