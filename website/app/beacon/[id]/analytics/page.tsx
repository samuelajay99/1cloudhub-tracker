'use client';

import { use, useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useToast } from '../../../../components/useToast';
import Toast from '../../../../components/Toast';
import { BeaconHeaderBrand, FooterBrand } from '../../../../components/Brand';
import BeaconGate from '../../../../components/beacon/BeaconGate';
import BarChart from '../../../../components/beacon/BarChart';
import Leaderboard, { LeaderboardRow } from '../../../../components/beacon/Leaderboard';
import StatCard from '../../../../components/beacon/StatCard';
import { BeaconEvent, BeaconParticipant, BeaconQuestion, BeaconResponse, computeTallies, leaderboardSort } from '../../../../lib/beacon';
import { ArrowLeft, Users, CheckCircle2, TrendingUp, Target, Trophy, TrendingDown, Percent, PartyPopper, Archive } from 'lucide-react';

export default function BeaconAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BeaconGate>{() => <Analytics eventId={id} />}</BeaconGate>;
}

function Analytics({ eventId }: { eventId: string }) {
  const { toast, showToast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [event, setEvent] = useState<BeaconEvent | null>(null);
  const [questions, setQuestions] = useState<BeaconQuestion[]>([]);
  const [participants, setParticipants] = useState<BeaconParticipant[]>([]);
  const [responses, setResponses] = useState<BeaconResponse[]>([]);
  const [winners, setWinners] = useState<{ participant_id: string; name: string }[]>([]);

  async function load() {
    const { data: eventRow } = await supabase.from('beacon_events').select('*').eq('id', eventId).single();
    setEvent(eventRow || null);
    if (!eventRow) {
      setLoaded(true);
      return;
    }

    const [{ data: questionRows }, { data: participantRows }, { data: responseRows }, { data: winnerRows }] = await Promise.all([
      supabase.from('beacon_questions').select('*').eq('event_id', eventId).order('order_index', { ascending: true }),
      supabase.from('beacon_participants').select('*').eq('event_id', eventId),
      supabase.from('beacon_responses').select('*').eq('event_id', eventId),
      supabase.from('beacon_raffle_winners').select('participant_id').eq('event_id', eventId),
    ]);

    setQuestions(questionRows || []);
    setParticipants(participantRows || []);
    setResponses(responseRows || []);

    const nameById = new Map((participantRows || []).map((p) => [p.id, p.name]));
    setWinners((winnerRows || []).map((w) => ({ participant_id: w.participant_id, name: nameById.get(w.participant_id) || 'Unknown' })));

    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, [eventId]);

  async function archiveEvent() {
    const { error } = await supabase.from('beacon_events').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', eventId);
    if (error) return showToast(error.message, 'error');
    showToast('Event archived.', 'success');
    await load();
  }

  if (!loaded || !event) {
    return (
      <div className="ch-page">
        <header className="ch-header">
          <BeaconHeaderBrand />
          <div className="ch-header-right">
            <a href="/beacon" className="ch-btn ch-btn-inverse">
              <ArrowLeft size={16} strokeWidth={2} /> My events
            </a>
          </div>
        </header>
        <div className="ch-shell-narrow" style={{ padding: '80px 32px', textAlign: 'center' }}>
          {loaded ? (
            <>
              <p>Event not found, or you don&apos;t have access to it.</p>
              <a href="/beacon" className="ch-btn ch-btn-secondary" style={{ marginTop: 16 }}>
                <ArrowLeft size={16} strokeWidth={2} /> Back to my events
              </a>
            </>
          ) : (
            <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
          )}
        </div>
      </div>
    );
  }

  const registrations = participants.length;
  const completions = participants.filter((p) => p.completed_at).length;
  const completionRate = registrations > 0 ? Math.round((completions / registrations) * 100) : 0;

  const scores = participants.map((p) => p.score);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const highScore = scores.length > 0 ? Math.max(...scores) : 0;
  const lowScore = scores.length > 0 ? Math.min(...scores) : 0;
  const correctResponses = responses.filter((r) => r.is_correct).length;
  const correctPct = responses.length > 0 ? Math.round((correctResponses / responses.length) * 100) : 0;

  const leaderboardRows: LeaderboardRow[] = leaderboardSort(participants).map((p, i) => ({
    participant_id: p.id,
    name: p.name,
    score: p.score,
    rank: i + 1,
  }));

  return (
    <div className="ch-page">
      <Toast toast={toast} />
      <header className="ch-header">
        <BeaconHeaderBrand />
        <div className="ch-header-right">
          <a href="/beacon" className="ch-btn ch-btn-inverse">
            <ArrowLeft size={16} strokeWidth={2} /> My events
          </a>
        </div>
      </header>

      <div className="ch-shell" style={{ padding: '48px 32px 96px', maxWidth: 860 }}>
        <a
          href={`/beacon/${eventId}/live`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--blue-600)', marginBottom: 20 }}
        >
          <ArrowLeft size={15} strokeWidth={2} /> Back to this event
        </a>
        <div className="ch-kicker" style={{ marginBottom: 14 }}>
          {event.status}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 24 }}>{event.title} — analytics</h1>
          {event.status === 'closed' && (
            <button className="ch-btn ch-btn-secondary" onClick={archiveEvent}>
              <Archive size={15} strokeWidth={2} /> Archive event
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 32 }}>
          <StatCard icon={Users} tone="blue" label="Registrations" value={registrations} />
          <StatCard icon={CheckCircle2} tone="green" label="Completions" value={completions} />
          <StatCard icon={TrendingUp} tone="orange" label="Completion rate" value={`${completionRate}%`} />
        </div>

        {event.type === 'quiz' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
            <StatCard icon={Target} tone="violet" label="Average score" value={avgScore} />
            <StatCard icon={Trophy} tone="orange" label="Highest score" value={highScore} />
            <StatCard icon={TrendingDown} tone="sky" label="Lowest score" value={lowScore} />
            <StatCard icon={Percent} tone="green" label="Correct responses" value={`${correctPct}%`} />
          </div>
        )}

        <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 16 }}>Question results</h2>
        {questions.map((q, i) => {
          const questionResponses = responses.filter((r) => r.question_id === q.id);
          const { tallies, total_responses } = computeTallies(q.options, questionResponses);
          return (
            <div key={q.id} className="ch-card pad-lg accent-top" style={{ marginBottom: 16 }}>
              <div className="ch-kicker" style={{ marginBottom: 10 }}>
                Question {i + 1}
              </div>
              <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 16 }}>{q.title}</h3>
              <BarChart options={q.options} tallies={tallies} correctOptionId={event.type === 'quiz' ? q.correct_option_id || undefined : undefined} />
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 12 }}>{total_responses} responses</p>
            </div>
          );
        })}

        {event.type === 'quiz' && (
          <>
            <h2 style={{ fontSize: 'var(--text-lg)', margin: '32px 0 16px' }}>Final leaderboard</h2>
            <div className="ch-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
              <Leaderboard rows={leaderboardRows} />
            </div>
          </>
        )}

        {event.raffle_enabled && (
          <>
            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 16 }}>Raffle winners</h2>
            {winners.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {winners.map((w) => (
                  <div
                    key={w.participant_id}
                    className="ch-card"
                    style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-card-alt)' }}
                  >
                    <PartyPopper size={18} strokeWidth={2} color="#DB2777" />
                    <span style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>{w.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>No raffle has been run for this event yet.</p>
            )}
          </>
        )}
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
