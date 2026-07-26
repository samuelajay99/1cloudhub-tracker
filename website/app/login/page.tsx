'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function routeAfterAuth(userId: string) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .single();
    if (profile?.status === 'approved') router.push('/dashboard');
    else router.push('/pending');
  }

  async function handleSubmit() {
    if (!email || !password) {
      setStatus('Enter an email and password.');
      return;
    }
    setBusy(true);
    setStatus(mode === 'signin' ? 'Signing in…' : 'Creating your account…');
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) {
      setStatus(error.message);
      setBusy(false);
      return;
    }
    if (data.user) await routeAfterAuth(data.user.id);
    setBusy(false);
  }

  return (
    <div className="shell">
      <div className="card">
        <div className="brand">
          TRACKER
          <small>Notes &amp; Follow-ups</small>
        </div>
        <h1>{mode === 'signin' ? 'Sign in' : 'Request access'}</h1>
        <p className="sub">
          {mode === 'signin'
            ? 'Invite-only. Sign in with your account.'
            : 'Create an account, then wait for it to be approved.'}
        </p>
        <input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <div className="status-line">{status}</div>
        <button className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {mode === 'signin' ? 'Sign in' : 'Request access'}
        </button>
        <p className="toggle">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'signin' ? 'signup' : 'signin'); setStatus(''); }}>
            {mode === 'signin' ? 'Request access' : 'Sign in'}
          </a>
        </p>
      </div>
    </div>
  );
}
