'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

// Simpler than HorizonGate on purpose: Compass has no per-app app_access
// gate (no self-request-access flow, no own pending/rejected screens) —
// platform approval alone is enough. A signed-out or not-approved user is
// sent back to '/', which already owns the pending/rejected UI for the
// whole Orbit platform.
type GateState = 'loading' | 'signedOut' | 'notApproved' | 'ready';

export default function CompassGate({ children }: { children: (ctx: { userId: string }) => ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>('loading');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function evaluate() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        if (!cancelled) {
          setState('signedOut');
          router.push('/');
        }
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', session.user.id)
        .single();

      if (cancelled) return;

      if (error || !profile || profile.status !== 'approved') {
        setState('notApproved');
        router.push('/');
        return;
      }

      setUserId(session.user.id);
      setState('ready');
    }

    evaluate();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state === 'signedOut' || state === 'notApproved') return null;

  if (state === 'loading') {
    return (
      <div className="ch-status-page">
        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', color: 'var(--text-inverse)' }}>
          <p style={{ fontSize: 'var(--text-sm)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  return <>{children({ userId })}</>;
}
