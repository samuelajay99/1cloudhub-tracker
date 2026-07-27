'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { OrbitBrand } from '../Brand';

type GateState = 'loading' | 'signedOut' | 'notApproved' | 'noRequest' | 'requestPending' | 'requestRejected' | 'ready';

export default function BeaconGate({ children }: { children: (ctx: { userId: string }) => ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>('loading');
  const [userId, setUserId] = useState('');
  const [requesting, setRequesting] = useState(false);

  async function evaluate() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setState('signedOut');
      router.push('/');
      return;
    }
    setUserId(session.user.id);

    const { data: profile } = await supabase.from('profiles').select('status').eq('id', session.user.id).single();
    if (!profile || profile.status !== 'approved') {
      setState('notApproved');
      return;
    }

    const { data: access } = await supabase
      .from('app_access')
      .select('status')
      .eq('user_id', session.user.id)
      .eq('app_id', 'beacon')
      .maybeSingle();

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
    const { error } = await supabase.from('app_access').insert({ user_id: userId, app_id: 'beacon', status: 'pending' });
    setRequesting(false);
    if (!error) setState('requestPending');
  }

  if (state === 'loading' || state === 'signedOut') return null;

  if (state === 'notApproved') {
    return (
      <GateScreen
        title="Account not approved"
        body="You need an approved Orbit account before you can request access to host Beacon events."
      />
    );
  }

  if (state === 'noRequest') {
    return (
      <GateScreen
        title="Request access to host Beacon"
        body="Beacon events are limited to approved hosts. Request access and you'll be able to host as soon as it's granted."
      >
        <button className="ch-btn ch-btn-primary full" disabled={requesting} onClick={requestAccess}>
          {requesting ? 'Requesting…' : 'Request access'}
        </button>
      </GateScreen>
    );
  }

  if (state === 'requestPending') {
    return (
      <GateScreen title="Request pending" body="Your request to host Beacon events is awaiting approval.">
        <button className="ch-btn ch-btn-secondary full" onClick={evaluate}>
          Check again
        </button>
      </GateScreen>
    );
  }

  if (state === 'requestRejected') {
    return <GateScreen title="Access not granted" body="Your request to host Beacon events was not approved." />;
  }

  return <>{children({ userId })}</>;
}

function GateScreen({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="ch-status-page">
      <div className="ch-shell-narrow" style={{ position: 'relative', zIndex: 2 }}>
        <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
          <OrbitBrand center />
          <h1 style={{ fontSize: 'var(--text-xl)' }}>{title}</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '10px 0 22px', lineHeight: 'var(--leading-normal)' }}>
            {body}
          </p>
          {children}
          <a href="/" className="ch-btn ch-btn-secondary full" style={{ marginTop: 10 }}>
            Back to Orbit
          </a>
        </div>
      </div>
    </div>
  );
}
