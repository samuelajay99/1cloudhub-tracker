'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/useToast';
import Toast from '../components/Toast';
import { HeaderBrand, OrbitBrand, FooterBrand, IconTile, CompassMark, BeaconMark, HorizonMark } from '../components/Brand';
import { ShieldCheck, Sparkles, ArrowRight, Apple, MonitorDown } from 'lucide-react';

type Stage = 'loading' | 'signedOut' | 'pending' | 'rejected' | 'approved';

const RELEASES_BASE = 'https://github.com/samuelajay99/1cloudhub-tracker/releases/latest/download';

export default function HomePage() {
  const { toast, showToast } = useToast();
  const [stage, setStage] = useState<Stage>('loading');
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [formEmail, setFormEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function evaluateSession() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setStage('signedOut');
      return;
    }
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('status, is_admin')
      .eq('id', session.user.id)
      .single();
    setEmail(session.user.email || '');
    if (error || !profile) {
      setStage('pending');
      return;
    }
    setIsAdmin(!!profile.is_admin);
    if (profile.status === 'approved') setStage('approved');
    else if (profile.status === 'rejected') setStage('rejected');
    else setStage('pending');
  }

  useEffect(() => {
    evaluateSession();
  }, []);

  async function handleAuthSubmit() {
    if (!formEmail || !password) {
      showToast('Enter an email and password.', 'error');
      return;
    }
    setBusy(true);
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: formEmail, password })
        : await supabase.auth.signUp({ email: formEmail, password });
    if (error) {
      showToast(error.message, 'error');
      setBusy(false);
      return;
    }
    if (!data.session) {
      showToast('Account created — please sign in.', 'success');
      setMode('signin');
      setPassword('');
      setBusy(false);
      return;
    }
    if (mode === 'signup') {
      showToast("Request sent! We'll let you in as soon as an admin approves your account.", 'success');
    } else {
      showToast('Signed in.', 'success');
    }
    await evaluateSession();
    setBusy(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    showToast('Signed out.', 'info');
    setEmail('');
    setIsAdmin(false);
    setStage('signedOut');
  }

  if (stage === 'loading') return null;

  return (
    <div className="ch-page">
      <Toast toast={toast} />

      <header className="ch-header">
        <HeaderBrand />
        <div className="ch-header-right">
          {stage === 'approved' && (
            <>
              <span className="ch-header-user">{email}</span>
              {isAdmin && (
                <a href="/admin" className="ch-btn ch-btn-ghost" style={{ color: '#fff' }}>
                  Admin
                </a>
              )}
              <button className="ch-btn ch-btn-inverse" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          )}
          {stage === 'signedOut' && (
            <a href="#auth" className="ch-btn ch-btn-inverse">
              Sign in
            </a>
          )}
        </div>
      </header>

      {stage === 'signedOut' && (
        <>
          <section className="ch-hero">
            <div className="ch-hero-inner">
              <div className="ch-kicker tone-inverse" style={{ justifyContent: 'center' }}>
                AI apps for everyday life
              </div>
              <h1>
                Your everyday <em>AI</em> toolkit, all in one place.
              </h1>
              <p className="lede">
                Orbit brings together a growing set of AI-powered apps that handle the small — and
                big — decisions in your day. First up: Compass, for notes, tasks, and follow-ups.
                More apps join the same account as they ship.
              </p>
              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 40, flexWrap: 'wrap' }}>
                <a href="#auth" className="ch-btn ch-btn-accent">
                  Get started <ArrowRight size={16} strokeWidth={2} />
                </a>
                <a href="#inside" className="ch-btn ch-btn-inverse">
                  See what&apos;s inside
                </a>
              </div>
            </div>
          </section>

          <section id="auth" className="ch-shell-narrow" style={{ marginTop: -68, marginBottom: 88, position: 'relative', zIndex: 5 }}>
            <div className="ch-card pad-lg" style={{ boxShadow: 'var(--shadow-lg)' }}>
              <OrbitBrand />
              <h2 style={{ fontSize: 'var(--text-xl)' }}>{mode === 'signin' ? 'Sign in' : 'Request access'}</h2>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '6px 0 18px' }}>
                {mode === 'signin' ? 'Sign in with your account.' : 'Create an account, then wait for it to be approved.'}
              </p>
              <input
                className="ch-field"
                type="email"
                placeholder="you@company.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
              <input
                className="ch-field"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
              />
              <button className="ch-btn ch-btn-primary full" disabled={busy} onClick={handleAuthSubmit} style={{ marginTop: 4 }}>
                {mode === 'signin' ? 'Sign in' : 'Request access'}
              </button>
              <p className="ch-toggle-line">
                {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode(mode === 'signin' ? 'signup' : 'signin');
                  }}
                >
                  {mode === 'signin' ? 'Request access' : 'Sign in'}
                </a>
              </p>
            </div>
          </section>

          <section id="inside" className="ch-shell" style={{ padding: '0 32px 96px' }}>
            <div className="ch-kicker" style={{ marginBottom: 16 }}>
              What&apos;s inside
            </div>
            <h2 style={{ fontSize: 'var(--text-2xl)', maxWidth: 580, marginBottom: 40 }}>
              One account. A growing set of apps built for how your day actually works.
            </h2>
            <div className="ch-app-grid">
              <div className="ch-card pad-lg">
                <IconTile icon={ShieldCheck} />
                <h3>Invite-only, on purpose</h3>
                <p className="desc">
                  Every account is reviewed before it can sign in — enforced at the database level,
                  not just in the app. No unapproved account can ever read another user&apos;s data.
                </p>
              </div>
              <div className="ch-card pad-lg accent-top">
                <CompassMark size={52} />
                <h3>Compass</h3>
                <p className="desc">
                  Notes, AI task extraction, a kanban board, and an email-drafting assistant — for
                  staying on top of a manager&apos;s day. Syncs to your account across devices.
                </p>
              </div>
              <div className="ch-card pad-lg">
                <IconTile icon={Sparkles} tone="sky" />
                <h3>More on the way</h3>
                <p className="desc">
                  Compass is the first app in Orbit, not the last. New AI-powered tools land in the
                  same account as they&apos;re built.
                </p>
              </div>
            </div>
          </section>

          <section style={{ padding: '0 32px 100px' }}>
            <div className="ch-shell">
              <div
                style={{
                  background: 'var(--gradient-cta)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '56px 48px',
                  textAlign: 'center',
                  color: '#fff',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <h2 style={{ color: '#fff', fontSize: 'var(--text-2xl)' }}>Ready to bring AI into your day?</h2>
                <p style={{ color: 'rgba(255,255,255,.85)', marginTop: 10, fontSize: 'var(--text-sm)' }}>
                  Request access — you&apos;ll be in as soon as it&apos;s approved.
                </p>
                <a href="#auth" className="ch-btn ch-btn-inverse" style={{ marginTop: 26 }}>
                  Request access
                </a>
              </div>
            </div>
          </section>
        </>
      )}

      {(stage === 'pending' || stage === 'rejected') && (
        <div className="ch-status-page">
          <div className="ch-shell-narrow" style={{ position: 'relative', zIndex: 2 }}>
            <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
              <OrbitBrand center />
              {stage === 'pending' ? (
                <>
                  <h1 style={{ fontSize: 'var(--text-xl)' }}>Request received</h1>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '10px 0 22px', lineHeight: 'var(--leading-normal)' }}>
                    Your account is waiting for approval. You&apos;ll be able to sign in as soon as
                    it&apos;s approved — no need to request access again, just check back or come
                    sign in later.
                  </p>
                  <button className="ch-btn ch-btn-secondary full" style={{ marginBottom: 10 }} onClick={evaluateSession}>
                    Check again
                  </button>
                </>
              ) : (
                <>
                  <h1 style={{ fontSize: 'var(--text-xl)' }}>Access not granted</h1>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '10px 0 22px' }}>
                    This account&apos;s access request was not approved.
                  </p>
                </>
              )}
              <button className="ch-btn ch-btn-secondary full" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'approved' && (
        <div className="ch-shell-wide" style={{ padding: '48px 32px 96px' }}>
          <div className="ch-kicker" style={{ marginBottom: 16 }}>
            Your apps
          </div>
          <div className="ch-app-grid">
            <div className="ch-card pad-lg accent-top">
              <CompassMark size={52} />
              <h3>Compass</h3>
              <p className="desc">
                Notes, AI task extraction, a kanban board, and an email-drafting assistant — for
                staying on top of your day.
              </p>
              <div className="ch-download-list">
                <a className="ch-download-row" href={`${RELEASES_BASE}/Compass-mac-arm64.dmg`}>
                  <div>
                    <span className="name">Download for Mac (Apple Silicon)</span>
                    <span className="platform-sub">.dmg — unsigned, right-click → Open on first launch</span>
                  </div>
                  <Apple size={18} strokeWidth={1.75} />
                </a>
                <a className="ch-download-row" href={`${RELEASES_BASE}/Compass-mac-x64.dmg`}>
                  <div>
                    <span className="name">Download for Mac (Intel)</span>
                    <span className="platform-sub">.dmg — unsigned, right-click → Open on first launch</span>
                  </div>
                  <Apple size={18} strokeWidth={1.75} />
                </a>
                <a className="ch-download-row" href={`${RELEASES_BASE}/Compass-win-x64.exe`}>
                  <div>
                    <span className="name">Download for Windows</span>
                    <span className="platform-sub">.exe — unsigned, click &quot;More info → Run anyway&quot;</span>
                  </div>
                  <MonitorDown size={18} strokeWidth={1.75} />
                </a>
              </div>
              <a href="/install" style={{ display: 'block', textAlign: 'center', marginTop: 14, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--blue-600)' }}>
                Need help installing? Step-by-step guide →
              </a>
            </div>

            <div className="ch-card pad-lg accent-top">
              <BeaconMark size={52} />
              <h3>Beacon</h3>
              <p className="desc">
                Live polls and quizzes for presentations and events — QR-code join, real-time
                results, leaderboards, and raffles.
              </p>
              <a href="/beacon" className="ch-btn ch-btn-primary full" style={{ marginTop: 14 }}>
                Open Beacon
              </a>
            </div>

            <div className="ch-card pad-lg accent-top">
              <HorizonMark size={52} />
              <h3>Horizon</h3>
              <p className="desc">
                A personalised daily intelligence brief — the handful of things worth knowing
                today, prioritised for your role and industry, with a reason each one matters to
                you.
              </p>
              <a href="/horizon" className="ch-btn ch-btn-primary full" style={{ marginTop: 14 }}>
                Open Horizon
              </a>
            </div>

            <div className="ch-empty-card">
              <IconTile icon={Sparkles} tone="sky" />
              <h3 style={{ marginTop: 14, fontSize: 'var(--text-md)' }}>More apps</h3>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 6, maxWidth: 300 }}>
                New AI-powered tools for everyday tasks are on the way — this space will grow.
              </p>
              <span className="ch-badge" style={{ marginTop: 16 }}>
                Coming soon
              </span>
            </div>
          </div>
        </div>
      )}

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
