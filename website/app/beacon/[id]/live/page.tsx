'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useToast } from '../../../../components/useToast';
import Toast from '../../../../components/Toast';
import { BeaconHeaderBrand, FooterBrand } from '../../../../components/Brand';
import BeaconGate from '../../../../components/beacon/BeaconGate';
import QRCode from '../../../../components/beacon/QRCode';
import BarChart from '../../../../components/beacon/BarChart';
import Leaderboard, { LeaderboardRow } from '../../../../components/beacon/Leaderboard';
import StatCard from '../../../../components/beacon/StatCard';
import RaffleWheel from '../../../../components/beacon/RaffleWheel';
import Podium from '../../../../components/beacon/Podium';
import CountdownRing from '../../../../components/beacon/CountdownRing';
import { useCountdown } from '../../../../components/beacon/useCountdown';
import { useBeaconChannel } from '../../../../components/beacon/useBeaconChannel';
import {
  BeaconEvent,
  BeaconQuestion,
  BeaconMessage,
  LeaderboardScope,
  Tally,
  leaderboardSort,
  computeTallies,
  latestClosingView,
} from '../../../../lib/beacon';
import { ExternalLink, ArrowLeft, Users, CheckCircle2, Clock, TrendingUp } from 'lucide-react';

export default function BeaconLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BeaconGate>{() => <LiveControlRoom eventId={id} />}</BeaconGate>;
}

function LiveControlRoom({ eventId }: { eventId: string }) {
  const { toast, showToast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [event, setEvent] = useState<BeaconEvent | null>(null);
  const [questions, setQuestions] = useState<BeaconQuestion[]>([]);
  const [tallies, setTallies] = useState<Tally[]>([]);
  const [totalResponses, setTotalResponses] = useState(0);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[] | null>(null);
  const [podiumRows, setPodiumRows] = useState<LeaderboardRow[] | null>(null);
  const [raffleWinners, setRaffleWinners] = useState<{ participant_id: string; name: string }[] | null>(null);
  const [raffleInstant, setRaffleInstant] = useState(false);
  const [rafflePool, setRafflePool] = useState<string[]>([]);

  const currentQuestion = event?.current_question_index != null ? questions[event.current_question_index] : null;
  const resultsRevealed = !!currentQuestion?.revealed_at;

  const load = useCallback(async () => {
    const { data: eventRow, error: eventErr } = await supabase.from('beacon_events').select('*').eq('id', eventId).single();
    if (eventErr || !eventRow) {
      showToast('Event not found', 'error');
      setLoaded(true);
      return;
    }
    setEvent(eventRow);

    const { data: questionRows } = await supabase
      .from('beacon_questions')
      .select('*')
      .eq('event_id', eventId)
      .order('order_index', { ascending: true });
    setQuestions(questionRows || []);

    const [{ count: registered }, { count: completed }] = await Promise.all([
      supabase.from('beacon_participants').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
      supabase
        .from('beacon_participants')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .not('completed_at', 'is', null),
    ]);
    setRegisteredCount(registered || 0);
    setCompletedCount(completed || 0);

    if (eventRow.current_question_index != null && questionRows) {
      const q = questionRows[eventRow.current_question_index];
      if (q) {
        const { data: responses } = await supabase.from('beacon_responses').select('option_id').eq('question_id', q.id);
        const { tallies: t, total_responses } = computeTallies(q.options, responses || []);
        setTallies(t);
        setTotalResponses(total_responses);
      }
    }

    if (eventRow.status === 'closed' || eventRow.status === 'archived') {
      const { data: winners } = await supabase
        .from('beacon_raffle_winners')
        .select('participant_id, drawn_at')
        .eq('event_id', eventId)
        .order('drawn_at', { ascending: false });
      const closingView = latestClosingView({
        leaderboard_shown_at: eventRow.leaderboard_shown_at,
        podium_shown_at: eventRow.podium_shown_at,
        latest_raffle_drawn_at: winners && winners.length > 0 ? winners[0].drawn_at : null,
      });

      if (closingView === 'raffle' && winners) {
        const { data: participants } = await supabase.from('beacon_participants').select('id, name').eq('event_id', eventId);
        const nameById = new Map((participants || []).map((p) => [p.id, p.name]));
        setRafflePool((participants || []).map((p) => p.name));
        setRaffleWinners(winners.map((w) => ({ participant_id: w.participant_id, name: nameById.get(w.participant_id) || 'Unknown' })));
        setRaffleInstant(true);
      } else if (closingView === 'podium' || closingView === 'leaderboard') {
        const { data: participants } = await supabase
          .from('beacon_participants')
          .select('id, name, score, completed_at')
          .eq('event_id', eventId);
        const sorted = leaderboardSort(participants || []);
        if (closingView === 'podium') {
          setPodiumRows(sorted.slice(0, 3).map((p, i) => ({ participant_id: p.id, name: p.name, score: p.score, rank: i + 1 })));
        } else {
          const scope = eventRow.leaderboard_scope || 'full';
          const limit = scope === 'top5' ? 5 : scope === 'top10' ? 10 : sorted.length;
          setLeaderboardRows(sorted.slice(0, limit).map((p, i) => ({ participant_id: p.id, name: p.name, score: p.score, rank: i + 1 })));
        }
      }
    }

    setLoaded(true);
  }, [eventId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Same defensive self-heal as the presenter view: a second host tab (or
  // this one, after a network hiccup) that misses a broadcast would
  // otherwise sit on stale state indefinitely. load() is a full, idempotent
  // reconstruction, so a periodic re-check plus one on tab focus is a cheap
  // way to recover without needing a manual refresh.
  useEffect(() => {
    const interval = setInterval(load, 20000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const onMessage = useCallback(
    async (msg: BeaconMessage) => {
      if (msg.type === 'tally_update') {
        setTallies(msg.payload.tallies);
        setTotalResponses(msg.payload.total_responses);
        setRegisteredCount(msg.payload.registered_count);
        setCompletedCount(msg.payload.completed_count);
      } else if (msg.type === 'leaderboard_shown') {
        setLeaderboardRows(msg.payload.rows);
      } else if (msg.type === 'podium_shown') {
        setPodiumRows(msg.payload.rows);
      } else if (msg.type === 'raffle_drawn') {
        if (rafflePool.length === 0) {
          const { data: participants } = await supabase.from('beacon_participants').select('name').eq('event_id', eventId);
          setRafflePool((participants || []).map((p) => p.name));
        }
        setRaffleWinners(msg.payload.winners);
        setRaffleInstant(false);
      } else if (msg.type === 'question_started' || msg.type === 'results_revealed' || msg.type === 'event_closed') {
        // Another host tab (or this one, echoed back) changed state — reload from source of truth.
        load();
      }
    },
    [load, eventId, rafflePool.length]
  );

  const { send, connectedCount } = useBeaconChannel(event?.status === 'live' || event?.status === 'published' ? eventId : null, { role: 'host' }, onMessage);
  const countdown = useCountdown(event?.current_question_started_at ?? undefined, currentQuestion?.time_limit_seconds ?? undefined);

  async function goLive() {
    const startedAt = new Date().toISOString();
    const { error } = await supabase
      .from('beacon_events')
      .update({ status: 'live', live_started_at: startedAt, current_question_index: 0, current_question_started_at: startedAt })
      .eq('id', eventId);
    if (error) return showToast(error.message, 'error');
    await load();
    const q = questions[0];
    if (q) {
      await send({
        type: 'question_started',
        payload: {
          question_id: q.id,
          index: 0,
          title: q.title,
          options: q.options,
          total_questions: questions.length,
          time_limit_seconds: q.time_limit_seconds ?? undefined,
          started_at: startedAt,
        },
      });
    }
  }

  async function nextQuestion() {
    if (!event || event.current_question_index == null) return;
    const nextIndex = event.current_question_index + 1;
    if (nextIndex >= questions.length) return;
    const startedAt = new Date().toISOString();
    const { error } = await supabase
      .from('beacon_events')
      .update({ current_question_index: nextIndex, current_question_started_at: startedAt })
      .eq('id', eventId);
    if (error) return showToast(error.message, 'error');
    setTallies([]);
    setTotalResponses(0);
    await load();
    const q = questions[nextIndex];
    await send({
      type: 'question_started',
      payload: {
        question_id: q.id,
        index: nextIndex,
        title: q.title,
        options: q.options,
        total_questions: questions.length,
        time_limit_seconds: q.time_limit_seconds ?? undefined,
        started_at: startedAt,
      },
    });
  }

  async function revealResults() {
    if (!currentQuestion || !event) return;
    const { error } = await supabase
      .from('beacon_questions')
      .update({ revealed_at: new Date().toISOString() })
      .eq('id', currentQuestion.id);
    if (error) return showToast(error.message, 'error');

    const { data: responses } = await supabase.from('beacon_responses').select('option_id').eq('question_id', currentQuestion.id);
    const { tallies: t, total_responses } = computeTallies(currentQuestion.options, responses || []);
    setTallies(t);
    setTotalResponses(total_responses);
    await load();
    await send({
      type: 'results_revealed',
      payload: {
        question_id: currentQuestion.id,
        tallies: t,
        total_responses,
        correct_option_id: event.type === 'quiz' ? currentQuestion.correct_option_id || undefined : undefined,
        explanation: currentQuestion.explanation || undefined,
      },
    });
  }

  async function closeSubmissions() {
    const { error } = await supabase
      .from('beacon_events')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', eventId);
    if (error) return showToast(error.message, 'error');
    await load();
    await send({ type: 'event_closed', payload: {} });
  }

  async function showLeaderboard(scope: LeaderboardScope) {
    const { data: participants } = await supabase
      .from('beacon_participants')
      .select('id, name, score, completed_at')
      .eq('event_id', eventId);
    const sorted = leaderboardSort(participants || []);
    const limit = scope === 'top5' ? 5 : scope === 'top10' ? 10 : sorted.length;
    const rows: LeaderboardRow[] = sorted.slice(0, limit).map((p, i) => ({
      participant_id: p.id,
      name: p.name,
      score: p.score,
      rank: i + 1,
    }));
    await supabase.from('beacon_events').update({ leaderboard_scope: scope, leaderboard_shown_at: new Date().toISOString() }).eq('id', eventId);
    setLeaderboardRows(rows);
    await send({ type: 'leaderboard_shown', payload: { scope, rows } });
  }

  async function showPodium() {
    const { data: participants } = await supabase
      .from('beacon_participants')
      .select('id, name, score, completed_at')
      .eq('event_id', eventId);
    const sorted = leaderboardSort(participants || []);
    const rows: LeaderboardRow[] = sorted.slice(0, 3).map((p, i) => ({
      participant_id: p.id,
      name: p.name,
      score: p.score,
      rank: i + 1,
    }));
    await supabase.from('beacon_events').update({ podium_shown_at: new Date().toISOString() }).eq('id', eventId);
    setPodiumRows(rows);
    await send({ type: 'podium_shown', payload: { rows } });
  }

  async function runRaffle() {
    if (!event) return;
    const { data: existingWinners } = await supabase.from('beacon_raffle_winners').select('participant_id').eq('event_id', eventId);
    const excluded = new Set((existingWinners || []).map((w) => w.participant_id));

    let query = supabase.from('beacon_participants').select('id, name, score, completed_at').eq('event_id', eventId);
    const { data: pool } = await query;
    setRafflePool((pool || []).map((p) => p.name));
    let eligible = (pool || []).filter((p) => !excluded.has(p.id));
    if (event.raffle_eligibility === 'completed') eligible = eligible.filter((p) => p.completed_at);
    if (event.raffle_eligibility === 'min_score') eligible = eligible.filter((p) => p.score >= (event.raffle_min_score || 0));

    if (eligible.length === 0) {
      showToast('No eligible participants left to draw from.', 'error');
      return;
    }

    // Fisher-Yates shuffle.
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    const winnerCount = Math.min(event.raffle_winner_count || 1, eligible.length);
    const winners = eligible.slice(0, winnerCount);

    const { error } = await supabase
      .from('beacon_raffle_winners')
      .insert(winners.map((w) => ({ event_id: eventId, participant_id: w.id })));
    if (error) return showToast(error.message, 'error');

    const winnerPayload = winners.map((w) => ({ participant_id: w.id, name: w.name }));
    setRaffleWinners(winnerPayload);
    setRaffleInstant(false);
    await send({ type: 'raffle_drawn', payload: { winners: winnerPayload } });
  }

  if (!loaded || !event || event.status === 'draft') {
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
          {!loaded ? (
            <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
          ) : !event ? (
            <>
              <p>Event not found, or you don&apos;t have access to it.</p>
              <a href="/beacon" className="ch-btn ch-btn-secondary" style={{ marginTop: 16 }}>
                <ArrowLeft size={16} strokeWidth={2} /> Back to my events
              </a>
            </>
          ) : (
            <>
              <p>This event hasn&apos;t been published yet.</p>
              <a href={`/beacon/${eventId}/edit`} className="ch-btn ch-btn-primary" style={{ marginTop: 16 }}>
                Go to editor
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/beacon/join/${event.join_code}` : '';
  const pendingCount = registeredCount - completedCount;

  return (
    <div className="ch-page">
      <Toast toast={toast} />
      <header className="ch-header">
        <BeaconHeaderBrand />
        <div className="ch-header-right">
          <a href={`/beacon/${eventId}/present`} target="_blank" rel="noopener noreferrer" className="ch-btn ch-btn-inverse">
            Open presenter view <ExternalLink size={14} strokeWidth={2} />
          </a>
          <a href="/beacon" className="ch-btn ch-btn-inverse">
            <ArrowLeft size={16} strokeWidth={2} /> My events
          </a>
        </div>
      </header>

      <div className="ch-shell" style={{ padding: '48px 32px 96px', maxWidth: 900 }}>
        <div className="ch-kicker" style={{ marginBottom: 14 }}>
          {event.status} {connectedCount > 0 && `· ${connectedCount} connected`}
        </div>
        <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 24 }}>{event.title}</h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
          <StatCard icon={Users} tone="blue" label="Registered" value={registeredCount} />
          <StatCard icon={CheckCircle2} tone="green" label="Completed" value={completedCount} />
          <StatCard icon={Clock} tone="orange" label="Pending" value={pendingCount} />
          <StatCard
            icon={TrendingUp}
            tone="violet"
            label="Completion"
            value={registeredCount > 0 ? `${Math.round((completedCount / registeredCount) * 100)}%` : '—'}
          />
        </div>

        {event.status === 'published' && (
          <div className="ch-card pad-lg" style={{ marginBottom: 24, textAlign: 'center' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 16 }}>Waiting room</h2>
            <QRCode url={joinUrl} size={220} />
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '16px 0' }}>{joinUrl}</p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 20 }}>
              Join code: <strong>{event.join_code}</strong>
            </p>
            <button className="ch-btn ch-btn-primary" onClick={goLive}>
              Go live
            </button>
          </div>
        )}

        {event.status === 'live' && currentQuestion && (
          <div className="ch-card pad-lg" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="ch-kicker" style={{ marginBottom: 0 }}>
                Question {event.current_question_index! + 1} of {questions.length}
              </div>
              {countdown.active && !resultsRevealed && (
                <CountdownRing seconds={countdown.remainingSeconds ?? 0} fraction={countdown.fraction} size={40} />
              )}
            </div>
            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 16 }}>{currentQuestion.title}</h2>
            <BarChart
              options={currentQuestion.options}
              tallies={tallies}
              correctOptionId={resultsRevealed && event.type === 'quiz' ? currentQuestion.correct_option_id || undefined : undefined}
            />
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 12 }}>{totalResponses} responses</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              {!resultsRevealed && (
                <button className="ch-btn ch-btn-secondary" onClick={revealResults}>
                  Reveal results
                </button>
              )}
              {event.current_question_index! + 1 < questions.length ? (
                <button className="ch-btn ch-btn-primary" onClick={nextQuestion}>
                  Next question
                </button>
              ) : (
                <button className="ch-btn ch-btn-primary" onClick={closeSubmissions}>
                  Close submissions
                </button>
              )}
            </div>
          </div>
        )}

        {(event.status === 'closed' || event.status === 'archived') && (
          <>
            <div className="ch-card pad-lg" style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 'var(--text-sm)', marginBottom: 12 }}>Submissions are closed.</p>
              <a href={`/beacon/${eventId}/analytics`} className="ch-btn ch-btn-secondary">
                View analytics
              </a>
            </div>

            {event.leaderboard_visible && event.type === 'quiz' && (
              <div className="ch-card pad-lg" style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 16 }}>Leaderboard</h2>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                  <button className="ch-btn ch-btn-secondary" onClick={() => showLeaderboard('top5')}>
                    Top 5
                  </button>
                  <button className="ch-btn ch-btn-secondary" onClick={() => showLeaderboard('top10')}>
                    Top 10
                  </button>
                  <button className="ch-btn ch-btn-secondary" onClick={() => showLeaderboard('full')}>
                    Full
                  </button>
                  <button className="ch-btn ch-btn-primary" onClick={showPodium}>
                    🏆 Reveal podium
                  </button>
                </div>
                {leaderboardRows && <Leaderboard rows={leaderboardRows} />}
                {podiumRows && (
                  <div style={{ background: 'var(--gradient-hero)', borderRadius: 'var(--radius-lg)', padding: '24px', marginTop: 16 }}>
                    <Podium rows={podiumRows} />
                  </div>
                )}
              </div>
            )}

            {event.raffle_enabled && (
              <div className="ch-card pad-lg" style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 16 }}>Raffle</h2>
                <button className="ch-btn ch-btn-primary" onClick={runRaffle} style={{ marginBottom: 16 }}>
                  Run raffle
                </button>
                {raffleWinners && (
                  <div style={{ background: 'var(--gradient-hero)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
                    <RaffleWheel pool={rafflePool} winners={raffleWinners} instant={raffleInstant} />
                  </div>
                )}
              </div>
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
