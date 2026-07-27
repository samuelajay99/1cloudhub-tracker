'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/useToast';
import Toast from '../../components/Toast';
import { HeaderBrand, FooterBrand } from '../../components/Brand';
import BeaconGate from '../../components/beacon/BeaconGate';
import { BeaconEvent, EventStatus } from '../../lib/beacon';
import { Plus, Copy, Trash2 } from 'lucide-react';

const STATUS_TONE: Record<EventStatus, string> = {
  draft: 'ch-badge',
  published: 'ch-badge info',
  live: 'ch-badge success',
  closed: 'ch-badge warning',
  archived: 'ch-badge',
};

export default function BeaconEventListPage() {
  return (
    <BeaconGate>
      {({ userId }) => <EventList userId={userId} />}
    </BeaconGate>
  );
}

function EventList({ userId }: { userId: string }) {
  const { toast, showToast } = useToast();
  const [events, setEvents] = useState<BeaconEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function loadEvents() {
    const { data, error } = await supabase
      .from('beacon_events')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setEvents(data || []);
    setLoaded(true);
  }

  useEffect(() => {
    loadEvents();
  }, []);

  async function createEvent() {
    const { data, error } = await supabase
      .from('beacon_events')
      .insert({ host_id: userId, title: 'Untitled event', type: 'quiz' })
      .select('id')
      .single();
    if (error || !data) {
      showToast(error?.message || 'Could not create event', 'error');
      return;
    }
    window.location.href = `/beacon/${data.id}/edit`;
  }

  async function duplicateEvent(event: BeaconEvent) {
    const { data: newEvent, error: eventErr } = await supabase
      .from('beacon_events')
      .insert({
        host_id: userId,
        title: `${event.title} (copy)`,
        description: event.description,
        type: event.type,
        leaderboard_visible: event.leaderboard_visible,
        leaderboard_scope: event.leaderboard_scope,
        raffle_enabled: event.raffle_enabled,
        raffle_winner_count: event.raffle_winner_count,
        raffle_eligibility: event.raffle_eligibility,
        raffle_min_score: event.raffle_min_score,
      })
      .select('id')
      .single();
    if (eventErr || !newEvent) {
      showToast(eventErr?.message || 'Could not duplicate event', 'error');
      return;
    }

    const { data: questions } = await supabase
      .from('beacon_questions')
      .select('order_index, title, options, correct_option_id, points, explanation')
      .eq('event_id', event.id)
      .order('order_index', { ascending: true });

    if (questions && questions.length > 0) {
      const { error: qErr } = await supabase.from('beacon_questions').insert(
        questions.map((q) => ({ ...q, event_id: newEvent.id }))
      );
      if (qErr) showToast(`Event duplicated, but questions failed to copy: ${qErr.message}`, 'error');
    }

    showToast('Event duplicated as a new draft.', 'success');
    await loadEvents();
  }

  async function deleteEvent(event: BeaconEvent) {
    if (!confirm(`Delete "${event.title}"? This removes all its questions, participants, and responses.`)) return;
    const { error } = await supabase.from('beacon_events').delete().eq('id', event.id);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showToast('Event deleted.', 'success');
    await loadEvents();
  }

  if (!loaded) return null;

  return (
    <div className="ch-page">
      <Toast toast={toast} />
      <header className="ch-header">
        <HeaderBrand />
        <div className="ch-header-right">
          <a href="/" className="ch-btn ch-btn-inverse">
            Back to Orbit
          </a>
        </div>
      </header>

      <div className="ch-shell" style={{ padding: '48px 32px 96px', maxWidth: 900 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div className="ch-kicker" style={{ marginBottom: 14 }}>
              Beacon
            </div>
            <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 8 }}>My events</h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Launch a poll or quiz, share a QR code, and watch responses come in live.
            </p>
          </div>
          <button className="ch-btn ch-btn-primary" onClick={createEvent}>
            <Plus size={16} strokeWidth={2} /> Create event
          </button>
        </div>

        <div className="ch-card" style={{ padding: 0, overflow: 'hidden', marginTop: 32 }}>
          <table className="ch-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <a href={eventLink(e)} style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>
                      {e.title}
                    </a>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{e.type}</td>
                  <td>
                    <span className={STATUS_TONE[e.status]}>{e.status}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{new Date(e.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="ch-row-actions">
                      <a className="ch-btn ch-btn-secondary" href={eventLink(e)}>
                        Open
                      </a>
                      <button className="ch-btn ch-btn-ghost" title="Duplicate" onClick={() => duplicateEvent(e)}>
                        <Copy size={15} strokeWidth={2} />
                      </button>
                      <button className="ch-btn ch-btn-ghost" title="Delete" onClick={() => deleteEvent(e)}>
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>
                    No events yet — create your first one above.
                  </td>
                </tr>
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

function eventLink(e: BeaconEvent): string {
  if (e.status === 'draft') return `/beacon/${e.id}/edit`;
  if (e.status === 'closed' || e.status === 'archived') return `/beacon/${e.id}/analytics`;
  return `/beacon/${e.id}/live`;
}
