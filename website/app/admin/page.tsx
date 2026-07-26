'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Profile } from '../../lib/supabase';
import { useToast } from '../../components/useToast';
import Toast from '../../components/Toast';
import { HeaderBrand, FooterBrand } from '../../components/Brand';

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

  const pillClass = (status: string) =>
    status === 'approved' ? 'ch-badge success' : status === 'rejected' ? 'ch-badge danger' : 'ch-badge warning';

  return (
    <div className="ch-page">
      <Toast toast={toast} />
      <header className="ch-header">
        <HeaderBrand />
        <div className="ch-header-right">
          <a href="/" className="ch-btn ch-btn-inverse">Back to Orbit</a>
        </div>
      </header>

      <div className="ch-shell" style={{ padding: '48px 32px 96px', maxWidth: 800 }}>
        <div className="ch-kicker" style={{ marginBottom: 14 }}>Admin</div>
        <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 8 }}>Approve signups</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 32 }}>
          Only accounts with admin access can see this page.
        </p>

        <div className="ch-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="ch-table">
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
                  <td><span className={pillClass(p.status)}>{p.status}</span></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="ch-row-actions">
                      {p.status !== 'approved' && (
                        <button className="ch-btn ch-btn-primary" onClick={() => setStatus(p.id, p.email, 'approved')}>Approve</button>
                      )}
                      {p.status !== 'rejected' && (
                        <button className="ch-btn ch-btn-danger" onClick={() => setStatus(p.id, p.email, 'rejected')}>Reject</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>No signups yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="ch-footer">
        <div className="ch-footer-bar" />
        <div className="ch-footer-inner">
          <FooterBrand />
          <span>www.1cloudhub.com</span>
          <span>© 2026 1CloudHub. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
