'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Profile } from '../../lib/supabase';
import { useToast } from '../../components/useToast';
import Toast from '../../components/Toast';
import { OrbitBrand } from '../../components/Brand';

export default function AdminPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  async function loadProfiles() {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) { showToast(err.message, 'error'); return; }
    setProfiles(data || []);
  }

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) { router.push('/'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, status')
        .eq('id', session.user.id)
        .single();
      if (!profile?.is_admin) { router.push('/'); return; }
      await loadProfiles();
      setReady(true);
    })();
  }, []);

  async function setStatus(id: string, email: string, status: 'approved' | 'rejected' | 'pending') {
    const { error: err } = await supabase.from('profiles').update({ status }).eq('id', id);
    if (err) { showToast(err.message, 'error'); return; }
    showToast(`${email} ${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'set to pending'}.`, 'success');
    await loadProfiles();
  }

  if (!ready) return null;

  return (
    <div className="shell" style={{ maxWidth: 720 }}>
      <Toast toast={toast} />
      <div className="card">
        <OrbitBrand />
        <h1>Approve signups</h1>
        <p className="sub">Only accounts with admin access can see this page.</p>
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
                      <button className="btn-primary" style={{ width: 'auto' }} onClick={() => setStatus(p.id, p.email, 'approved')}>Approve</button>
                    )}
                    {p.status !== 'rejected' && (
                      <button className="btn-danger" onClick={() => setStatus(p.id, p.email, 'rejected')}>Reject</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="toggle" style={{ marginTop: 20 }}>
          <a href="/">Back to Orbit</a>
        </p>
      </div>
    </div>
  );
}
