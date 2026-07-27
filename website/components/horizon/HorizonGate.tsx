'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { HorizonBrand } from '../Brand';
import { ArrowLeft } from 'lucide-react';

type GateState = 'loading' | 'signedOut' | 'notApproved' | 'noRequest' | 'requestPending' | 'requestRejected' | 'ready' | 'dbError';

export default function HorizonGate({ children }: { children: (ctx: { userId: string }) => ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>('loading');
  const [userId, setUserId] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');

  async function evaluate() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setState('signedOut');
      router.push('/');
      return;
    }
    setUserId(session.user.id);

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', session.user.id)
      .single();
    if (profileErr) {
      setErrorDetail(profileErr.message);
      setState('dbError');
      return;
    }
    if (!profile || profile.status !== 'approved') {
      setState('notApproved');
      return;
    }

    const { data: access, error: accessErr } = await supabase
      .from('app_access')
      .select('status')
      .eq('user_id', session.user.id)
      .eq('app_id', 'horizon')
      .maybeSingle();

    if (accessErr) {
      // Most common cause: supabase/migrations/0007_horizon.sql hasn't
      // been run yet — surface that instead of silently looking like an
      // unmet access request forever.
      setErrorDetail(accessErr.message);
      setState('dbError');
      return;
    }
    if (!access) {
      setState('noRequest');
      return;
    }
    if (access.status === 'approved') {
      setState('ready');
      return;
    }
    setState(access.status === 'pending' ? 'requestPending' : 'requestRejected');
  }

  useEffect(() => {
    evaluate();
  }, []);

  async function requestAccess() {
    setRequesting(true);
    const { error } = await supabase.from('app_access').insert({ user_id: userId, app_id: 'horizon', status: 'pending' });
    setRequesting(false);
    if (error) {
      setErrorDetail(error.message);
      setState('dbError');
      return;
    }
    setState('requestPending');
  }

  if (state === 'signedOut') return null;

  if (state === 'loading') {
    return (
      <div className="ch-status-page">
        <div className="ch-shell-narrow" style={{ position: 'relative', zIndex: 2 }}>
          <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
            <HorizonBrand center />
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'dbError') {
    return (
      <GateScreen title="Couldn't check Horizon access" body="Something went wrong talking to the database.">
        <p
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--red-600)',
            background: 'var(--red-100)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            textAlign: 'left',
            wordBreak: 'break-word',
            marginBottom: 16,
          }}
        >
          {errorDetail}
        </p>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 16 }}>
          If this mentions <code>app_access</code> or a <code>horizon_</code> table not existing, the Horizon database
          migration (<code>supabase/migrations/0007_horizon.sql</code>) hasn&apos;t been run on this Supabase project
          yet.
        </p>
        <button className="ch-btn ch-btn-secondary full" onClick={evaluate}>
          Try again
        </button>
      </GateScreen>
    );
  }

  if (state === 'notApproved') {
    return (
      <GateScreen
        title="Account not approved"
        body="You need an approved Orbit account before you can request access to Horizon."
      />
    );
  }

  if (state === 'noRequest') {
    return (
      <GateScreen
        title="Request access to Horizon"
        body="Horizon is limited to approved users. Request access and you'll get your first brief as soon as it's granted."
      >
        <button className="ch-btn ch-btn-primary full" disabled={requesting} onClick={requestAccess}>
          {requesting ? 'Requesting…' : 'Request access'}
        </button>
      </GateScreen>
    );
  }

  if (state === 'requestPending') {
    return (
      <GateScreen title="Request pending" body="Your request for Horizon access is awaiting approval.">
        <button className="ch-btn ch-btn-secondary full" onClick={evaluate}>
          Check again
        </button>
      </GateScreen>
    );
  }

  if (state === 'requestRejected') {
    return <GateScreen title="Access not granted" body="Your request for Horizon access was not approved." />;
  }

  return <>{children({ userId })}</>;
}

function GateScreen({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="ch-status-page">
      <div className="ch-shell-narrow" style={{ position: 'relative', zIndex: 2 }}>
        <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
          <HorizonBrand center />
          <h1 style={{ fontSize: 'var(--text-xl)' }}>{title}</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '10px 0 22px', lineHeight: 'var(--leading-normal)' }}>
            {body}
          </p>
          {children}
          <a href="/" className="ch-btn ch-btn-secondary full" style={{ marginTop: 10 }}>
            <ArrowLeft size={16} strokeWidth={2} /> Back to Orbit
          </a>
        </div>
      </div>
    </div>
  );
}
