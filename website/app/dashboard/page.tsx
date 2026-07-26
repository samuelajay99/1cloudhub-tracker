'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

// GitHub's "latest" alias always resolves to the newest release's asset
// with this exact filename — no need to know the version tag here.
const RELEASES_BASE = 'https://github.com/samuelajay99/1cloudhub-tracker/releases/latest/download';

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.push('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('status, is_admin')
        .eq('id', session.user.id)
        .single();
      if (profile?.status !== 'approved') {
        router.push('/pending');
        return;
      }
      setEmail(session.user.email || '');
      setIsAdmin(!!profile.is_admin);
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  return (
    <div className="shell">
      <div className="card">
        <div className="brand">
          TRACKER
          <small>Notes &amp; Follow-ups</small>
        </div>
        <h1>Downloads</h1>
        <p className="sub">Signed in as {email}. Grab the latest build for your platform.</p>

        <div className="download-row">
          <a className="download-btn" href={`${RELEASES_BASE}/1CloudHub-Tracker-mac-arm64.dmg`}>
            Download for Mac (Apple Silicon)
            <span className="platform-sub">.dmg — unsigned, right-click → Open on first launch</span>
          </a>
          <a className="download-btn" href={`${RELEASES_BASE}/1CloudHub-Tracker-mac-x64.dmg`}>
            Download for Mac (Intel)
            <span className="platform-sub">.dmg — unsigned, right-click → Open on first launch</span>
          </a>
          <a className="download-btn" href={`${RELEASES_BASE}/1CloudHub-Tracker-win-x64.exe`}>
            Download for Windows
            <span className="platform-sub">.exe — unsigned, click &quot;More info → Run anyway&quot;</span>
          </a>
        </div>

        <p className="toggle" style={{ marginTop: 24 }}>
          {isAdmin && <a href="/admin">Admin: approve signups</a>}
        </p>
        <button
          className="btn-secondary"
          style={{ width: '100%', marginTop: 16 }}
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
