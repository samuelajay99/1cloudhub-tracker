'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function PendingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'pending' | 'rejected'>('checking');

  async function check() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      router.push('/login');
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', session.user.id)
      .single();
    if (profile?.status === 'approved') router.push('/dashboard');
    else if (profile?.status === 'rejected') setStatus('rejected');
    else setStatus('pending');
  }

  useEffect(() => {
    check();
  }, []);

  return (
    <div className="shell">
      <div className="card">
        <div className="brand">
          TRACKER
          <small>Notes &amp; Follow-ups</small>
        </div>
        {status === 'rejected' ? (
          <>
            <h1>Access not granted</h1>
            <p className="sub">This account&apos;s access request was not approved.</p>
          </>
        ) : (
          <>
            <h1>Request received</h1>
            <p className="sub">
              Your account is waiting for approval. Check back later, or hit
              refresh below once you&apos;ve been told you&apos;re approved.
            </p>
          </>
        )}
        <button className="btn-secondary" style={{ width: '100%', marginBottom: 10 }} onClick={check}>
          Check again
        </button>
        <button
          className="btn-secondary"
          style={{ width: '100%' }}
          onClick={async () => {
            await supabase.auth.signOut();
            router.push('/login');
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
