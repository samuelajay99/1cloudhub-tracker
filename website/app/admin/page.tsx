'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Profile } from '../../lib/supabase';

export default function AdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState('');

  async function loadProfiles() {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) { setError(err.message); return; }
    setProfiles(data || []);
  }

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) { router.push('/login'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, status')
        .eq('id', session.user.id)
        .single();
      if (!profile?.is_admin) { router.push('/dashboard'); return; }
      await loadProfiles();
      setReady(true);
    })();
  }, []);

  async function setStatus(id: string, status: 'approved' | 'rejected' | 'pending') {
    const { error: err } = await supabase.from('profiles').update({ status }).eq('id', id);
    if (err) { setError(err.message); return; }
    await loadProfiles();
  }

  if (!ready) return null;

  return (
    <div className="shell" style={{ maxWidth: 720 }}>
      <div className="card">
        <div className="brand">
          TRACKER
          <small>Notes &amp; Follow-ups — Admin</small>
        </div>
        <h1>Approve signups</h1>
        <p className="sub">Only you (accounts with is_admin = true) can see this page.</p>
        {error && <p className="status-line error">{error}</p>}
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Status</th>
              <th>Requested</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>{p.email}</td>
                <td><span className={`pill ${p.status}`}>{p.status}</span></td>
                <td>{new Date(p.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="row-actions">
                    {p.status !== 'approved' && (
                      <button className="btn-primary" onClick={() => setStatus(p.id, 'approved')}>Approve</button>
                    )}
                    {p.status !== 'rejected' && (
                      <button className="btn-danger" onClick={() => setStatus(p.id, 'rejected')}>Reject</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="toggle" style={{ marginTop: 20 }}>
          <a href="/dashboard">Back to downloads</a>
        </p>
      </div>
    </div>
  );
}
