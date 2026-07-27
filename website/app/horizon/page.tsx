'use client';

import { HorizonHeaderBrand, HorizonMark, FooterBrand } from '../../components/Brand';
import HorizonGate from '../../components/horizon/HorizonGate';
import { ArrowLeft } from 'lucide-react';

export default function HorizonPage() {
  return <HorizonGate>{() => <ComingSoon />}</HorizonGate>;
}

// Phase 0 placeholder — access control, branding, and the marketplace
// listing are real; onboarding + the brief itself land in Phase 1. This is
// deliberately a real, finished-feeling screen rather than a blank page,
// so an approved user isn't met with nothing.
function ComingSoon() {
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

      <div className="ch-status-page" style={{ minHeight: 'calc(100vh - 140px)' }}>
        <div className="ch-shell-narrow" style={{ position: 'relative', zIndex: 2 }}>
          <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
            <div style={{ margin: '0 auto 20px', display: 'flex', justifyContent: 'center' }}>
              <HorizonMark size={64} />
            </div>
            <h1 style={{ fontSize: 'var(--text-xl)' }}>Horizon is on its way</h1>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                margin: '10px 0 4px',
                lineHeight: 'var(--leading-normal)',
              }}
            >
              A personalised daily intelligence brief — the 10-14 things worth knowing today, prioritised for your
              role, industry and market, with a plain-language reason each one matters to you.
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 16 }}>
              You have access. Onboarding and your first brief are coming in the next build.
            </p>
          </div>
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
