'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Profile } from '../../lib/supabase';
import { useToast } from '../../components/useToast';
import Toast from '../../components/Toast';
import { HeaderBrand, FooterBrand } from '../../components/Brand';
import { AppAccess } from '../../lib/beacon';

export default function AdminPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [appAccess, setAppAccess] = useState<AppAccess[]>([]);

  async function loadProfiles() {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) { showToast(err.message, 'error'); return; }
    setProfiles(data || []);
  }

  async function loadAppAccess() {
    const { data, error: err } = await supabase
      .from('app_access')
      .select('*')
      .order('requested_at', { ascending: false });
    if (err) { showToast(err.message, 'error'); return; }
    setAppAccess(data || []);
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
      await Promise.all([loadProfiles(), loadAppAccess()]);
      setReady(true);
    })();
  }, []);

  async function setStatus(id: string, email: string, status: 'approved' | 'rejected' | 'pending') {
    const { error: err } = await supabase.from('profiles').update({ status }).eq('id', id);
    if (err) { showToast(err.message, 'error'); return; }
    showToast(`${email} ${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'set to pending'}.`, 'success');
    await loadProfiles();
  }

  async function setAppAccessStatus(id: string, email: string, appId: string, status: 'approved' | 'rejected') {
    const { error: err } = await supabase
      .from('app_access')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', id);
    if (err) { showToast(err.message, 'error'); return; }
    showToast(`${email} ${status === 'approved' ? 'approved' : 'rejected'} for ${appId}.`, 'success');
    await loadAppAccess();
  }

  if (!ready) return null;

  const emailFor = (userId: string) => profiles.find((p) => p.id === userId)?.email || userId;

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

        <div className="ch-kicker" style={{ marginTop: 48, marginBottom: 14 }}>App access</div>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 8 }}>App access requests</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 32 }}>
          Being an approved Orbit account isn&apos;t enough to host events in per-app tools like Beacon — approve requests here.
        </p>

        <div className="ch-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="ch-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>App</th>
                <th>Status</th>
                <th>Requested</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {appAccess.map((a) => (
                <tr key={a.id}>
                  <td>{emailFor(a.user_id)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{a.app_id}</td>
                  <td><span className={pillClass(a.status)}>{a.status}</span></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{new Date(a.requested_at).toLocaleDateString()}</td>
                  <td>
                    <div className="ch-row-actions">
                      {a.status !== 'approved' && (
                        <button className="ch-btn ch-btn-primary" onClick={() => setAppAccessStatus(a.id, emailFor(a.user_id), a.app_id, 'approved')}>Approve</button>
                      )}
                      {a.status !== 'rejected' && (
                        <button className="ch-btn ch-btn-danger" onClick={() => setAppAccessStatus(a.id, emailFor(a.user_id), a.app_id, 'rejected')}>Reject</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {appAccess.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>No app access requests yet.</td></tr>
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
