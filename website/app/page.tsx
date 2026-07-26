'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/useToast';
import Toast from '../components/Toast';
import { OrbitBrand, CompassIcon } from '../components/Brand';

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
      // Shouldn't normally happen with email confirmation off, but handle it
      // gracefully rather than leaving the user with no feedback at all.
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
    <>
      <Toast toast={toast} />

      {stage === 'approved' && (
        <div className="shell-wide">
          <div className="orbit-header">
            <OrbitBrand />
            <div className="user-chip">
              <span>{email}</span>
              {isAdmin && <a href="/admin">Admin</a>}
              <button className="btn-secondary" onClick={handleSignOut}>Sign out</button>
            </div>
          </div>

          <p className="section-label">Your apps</p>
          <div className="app-grid">
            <div className="app-card">
              <div className="app-card-icon"><CompassIcon gradientId="cardIconGrad" /></div>
              <h3>Compass</h3>
              <p>Notes, AI task extraction, a kanban board, and an email-drafting assistant — for staying on top of your day.</p>
              <div className="download-row" style={{ marginTop: 4 }}>
                <a className="download-btn" href={`${RELEASES_BASE}/Compass-mac-arm64.dmg`}>
                  Download for Mac (Apple Silicon)
                  <span className="platform-sub">.dmg — unsigned, right-click → Open on first launch</span>
                </a>
                <a className="download-btn" href={`${RELEASES_BASE}/Compass-mac-x64.dmg`}>
                  Download for Mac (Intel)
                  <span className="platform-sub">.dmg — unsigned, right-click → Open on first launch</span>
                </a>
                <a className="download-btn" href={`${RELEASES_BASE}/Compass-win-x64.exe`}>
                  Download for Windows
                  <span className="platform-sub">.exe — unsigned, click &quot;More info → Run anyway&quot;</span>
                </a>
              </div>
            </div>

            <div className="app-card coming-soon">
              <div className="app-card-icon" style={{ background: 'rgba(20,41,71,0.06)' }}>✦</div>
              <h3>More apps</h3>
              <p>New AI-powered tools for everyday tasks are on the way — this space will grow.</p>
              <span className="app-card-more">Coming soon</span>
            </div>
          </div>
        </div>
      )}

      {stage === 'pending' && (
        <div className="shell">
          <div className="card" style={{ textAlign: 'center' }}>
            <OrbitBrand center />
            <h1>Request received</h1>
            <p className="sub">
              Your account is waiting for approval. You&apos;ll be able to sign in as soon as it&apos;s approved —
              no need to request access again, just check back or come sign in later.
            </p>
            <button className="btn-secondary" style={{ width: '100%', marginBottom: 10 }} onClick={evaluateSession}>
              Check again
            </button>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      )}

      {stage === 'rejected' && (
        <div className="shell">
          <div className="card" style={{ textAlign: 'center' }}>
            <OrbitBrand center />
            <h1>Access not granted</h1>
            <p className="sub">This account&apos;s access request was not approved.</p>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      )}

      {stage === 'signedOut' && (
        <>
          <div className="hero">
            <OrbitBrand center />
            <h1>Your everyday AI toolkit</h1>
            <p className="sub">
              Orbit brings together a growing set of AI-powered apps to help with the small (and big) things in
              your day. First up: <strong>Compass</strong>, for notes, tasks, and follow-ups. More on the way.
              Invite-only for now — sign in below, or request access.
            </p>
          </div>

          <div className="inline-auth">
            <div className="card">
              <h2>{mode === 'signin' ? 'Sign in' : 'Request access'}</h2>
              <p className="sub" style={{ marginBottom: 16 }}>
                {mode === 'signin'
                  ? 'Sign in with your account.'
                  : 'Create an account, then wait for it to be approved.'}
              </p>
              <input
                type="email"
                placeholder="you@company.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
              />
              <button className="btn-primary" disabled={busy} onClick={handleAuthSubmit}>
                {mode === 'signin' ? 'Sign in' : 'Request access'}
              </button>
              <p className="toggle">
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
          </div>
        </>
      )}
    </>
  );
}
