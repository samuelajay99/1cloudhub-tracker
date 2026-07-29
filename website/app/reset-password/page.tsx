'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { OrbitBrand } from '../../components/Brand';
import { useToast } from '../../components/useToast';
import Toast from '../../components/Toast';
import { ArrowLeft } from 'lucide-react';

type Stage = 'checking' | 'invalid' | 'ready' | 'done';

// Reached via the link in Supabase's password-recovery email. supabase-js
// parses the recovery token out of the URL on load and exchanges it for a
// real (but limited) session automatically — by the time this component
// mounts, supabase.auth.getSession() either has that session or the link
// was invalid/expired.
export default function ResetPasswordPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [stage, setStage] = useState<Stage>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setStage(data.session ? 'ready' : 'invalid');
    })();
  }, []);

  async function handleSubmit() {
    if (password.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setStage('done');
  }

  return (
    <div className="ch-status-page">
      <Toast toast={toast} />
      <div className="ch-shell-narrow" style={{ position: 'relative', zIndex: 2 }}>
        <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
          <OrbitBrand center />

          {stage === 'checking' && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Checking your link…</p>
          )}

          {stage === 'invalid' && (
            <>
              <h1 style={{ fontSize: 'var(--text-xl)' }}>This link has expired</h1>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '10px 0 22px', lineHeight: 'var(--leading-normal)' }}>
                Password reset links only work once and expire after a while. Request a new one from the sign-in page.
              </p>
              <a href="/" className="ch-btn ch-btn-primary full">
                <ArrowLeft size={16} strokeWidth={2} /> Back to sign in
              </a>
            </>
          )}

          {stage === 'ready' && (
            <>
              <h1 style={{ fontSize: 'var(--text-xl)' }}>Set a new password</h1>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '10px 0 18px' }}>
                Choose a new password for your account.
              </p>
              <input
                className="ch-field"
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <input
                className="ch-field"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
              <button className="ch-btn ch-btn-primary full" disabled={busy} onClick={handleSubmit} style={{ marginTop: 4 }}>
                {busy ? 'Saving…' : 'Save new password'}
              </button>
            </>
          )}

          {stage === 'done' && (
            <>
              <h1 style={{ fontSize: 'var(--text-xl)' }}>Password updated</h1>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '10px 0 22px' }}>
                You're signed in with your new password.
              </p>
              <button className="ch-btn ch-btn-primary full" onClick={() => router.push('/')}>
                Continue to Orbit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
