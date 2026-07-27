'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import BeaconGate from '../../../../components/beacon/BeaconGate';
import QRCode from '../../../../components/beacon/QRCode';
import BarChart from '../../../../components/beacon/BarChart';
import Leaderboard, { LeaderboardRow } from '../../../../components/beacon/Leaderboard';
import RaffleWheel from '../../../../components/beacon/RaffleWheel';
import Podium from '../../../../components/beacon/Podium';
import OptionShape, { optionStyle } from '../../../../components/beacon/OptionShape';
import CountdownRing from '../../../../components/beacon/CountdownRing';
import { useCountdown } from '../../../../components/beacon/useCountdown';
import { useBeaconChannel } from '../../../../components/beacon/useBeaconChannel';
import { BeaconEvent, BeaconMessage, QuestionOption, Tally, leaderboardSort, latestClosingView } from '../../../../lib/beacon';
import { ArrowLeft } from 'lucide-react';

type View = 'waiting' | 'question' | 'results' | 'leaderboard' | 'podium' | 'raffle' | 'closed';

export default function BeaconPresentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BeaconGate>{() => <PresenterView eventId={id} />}</BeaconGate>;
}

function PresenterView({ eventId }: { eventId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [event, setEvent] = useState<BeaconEvent | null>(null);
  const [view, setView] = useState<View>('waiting');

  const [questionTitle, setQuestionTitle] = useState('');
  const [questionOptions, setQuestionOptions] = useState<QuestionOption[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [questionStartedAt, setQuestionStartedAt] = useState<string | undefined>(undefined);
  const [questionTimeLimit, setQuestionTimeLimit] = useState<number | undefined>(undefined);
  const [tallies, setTallies] = useState<Tally[]>([]);
  const [totalResponses, setTotalResponses] = useState(0);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [correctOptionId, setCorrectOptionId] = useState<string | undefined>(undefined);
  const [explanation, setExplanation] = useState<string | undefined>(undefined);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [podiumRows, setPodiumRows] = useState<LeaderboardRow[]>([]);
  const [raffleWinners, setRaffleWinners] = useState<{ participant_id: string; name: string }[]>([]);
  const [raffleInstant, setRaffleInstant] = useState(false);
  const [participantPool, setParticipantPool] = useState<string[]>([]);

  const load = useCallback(async () => {
    const { data: eventRow } = await supabase.from('beacon_events').select('*').eq('id', eventId).single();
    if (!eventRow) {
      setLoaded(true);
      return;
    }
    setEvent(eventRow);

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
        setRaffleWinners(winners.map((w) => ({ participant_id: w.participant_id, name: nameById.get(w.participant_id) || 'Unknown' })));
        setRaffleInstant(true);
        setView('raffle');
      } else if (closingView === 'podium' || closingView === 'leaderboard') {
        const { data: participants } = await supabase
          .from('beacon_participants')
          .select('id, name, score, completed_at')
          .eq('event_id', eventId);
        const sorted = leaderboardSort(participants || []);
        if (closingView === 'podium') {
          setPodiumRows(sorted.slice(0, 3).map((p, i) => ({ participant_id: p.id, name: p.name, score: p.score, rank: i + 1 })));
          setView('podium');
        } else {
          const scope = eventRow.leaderboard_scope || 'full';
          const limit = scope === 'top5' ? 5 : scope === 'top10' ? 10 : sorted.length;
          setLeaderboardRows(sorted.slice(0, limit).map((p, i) => ({ participant_id: p.id, name: p.name, score: p.score, rank: i + 1 })));
          setView('leaderboard');
        }
      } else {
        setView('closed');
      }
    } else if (eventRow.current_question_index != null) {
      const { data: q } = await supabase
        .from('beacon_questions')
        .select('*')
        .eq('event_id', eventId)
        .eq('order_index', eventRow.current_question_index)
        .single();
      if (q) {
        setQuestionTitle(q.title);
        setQuestionOptions(q.options);
        setQuestionIndex(q.order_index);
        setQuestionStartedAt(eventRow.current_question_started_at || undefined);
        setQuestionTimeLimit(q.time_limit_seconds || undefined);
        const { count: qCount } = await supabase.from('beacon_questions').select('id', { count: 'exact', head: true }).eq('event_id', eventId);
        setTotalQuestions(qCount || 0);

        if (q.revealed_at) {
          const { data: responses } = await supabase.from('beacon_responses').select('option_id').eq('question_id', q.id);
          const counts = new Map<string, number>();
          for (const opt of q.options) counts.set(opt.id, 0);
          for (const r of responses || []) counts.set(r.option_id, (counts.get(r.option_id) || 0) + 1);
          const total = (responses || []).length;
          setTallies(q.options.map((opt: QuestionOption) => ({ option_id: opt.id, count: counts.get(opt.id) || 0, pct: total > 0 ? Math.round(((counts.get(opt.id) || 0) / total) * 100) : 0 })));
          setTotalResponses(total);
          setCorrectOptionId(eventRow.type === 'quiz' ? q.correct_option_id || undefined : undefined);
          setExplanation(q.explanation || undefined);
          setView('results');
        } else {
          setView('question');
        }
      }
    } else {
      setView('waiting');
    }
    setLoaded(true);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const onMessage = useCallback(async (msg: BeaconMessage) => {
    if (msg.type === 'question_started') {
      setQuestionTitle(msg.payload.title);
      setQuestionOptions(msg.payload.options);
      setQuestionIndex(msg.payload.index);
      setTotalQuestions(msg.payload.total_questions);
      setQuestionStartedAt(msg.payload.started_at);
      setQuestionTimeLimit(msg.payload.time_limit_seconds);
      setTallies([]);
      setTotalResponses(0);
      setCorrectOptionId(undefined);
      setExplanation(undefined);
      setView('question');
    } else if (msg.type === 'tally_update') {
      setTallies(msg.payload.tallies);
      setTotalResponses(msg.payload.total_responses);
      setRegisteredCount(msg.payload.registered_count);
      setCompletedCount(msg.payload.completed_count);
    } else if (msg.type === 'results_revealed') {
      setTallies(msg.payload.tallies);
      setTotalResponses(msg.payload.total_responses);
      setCorrectOptionId(msg.payload.correct_option_id);
      setExplanation(msg.payload.explanation);
      setView('results');
    } else if (msg.type === 'leaderboard_shown') {
      setLeaderboardRows(msg.payload.rows);
      setView('leaderboard');
    } else if (msg.type === 'podium_shown') {
      setPodiumRows(msg.payload.rows);
      setView('podium');
    } else if (msg.type === 'raffle_drawn') {
      const { data: participants } = await supabase.from('beacon_participants').select('name').eq('event_id', eventId);
      setParticipantPool((participants || []).map((p) => p.name));
      setRaffleWinners(msg.payload.winners);
      setRaffleInstant(false);
      setView('raffle');
    } else if (msg.type === 'event_closed') {
      setView('closed');
    }
  }, [eventId]);

  useBeaconChannel(eventId, { role: 'presenter' }, onMessage);
  const countdown = useCountdown(questionStartedAt, questionTimeLimit);

  if (!loaded || !event) return null;

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/beacon/join/${event.join_code}` : '';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--gradient-hero)',
        color: 'var(--white)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px',
        textAlign: 'center',
        position: 'relative',
      }}
    >
      <a
        href={`/beacon/${eventId}/live`}
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'rgba(255,255,255,.55)',
          fontSize: 'var(--text-xs)',
          textDecoration: 'none',
          zIndex: 10,
          padding: '6px 10px',
          borderRadius: 'var(--radius-pill)',
          transition: 'var(--transition-base)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'rgba(255,255,255,.9)';
          e.currentTarget.style.background = 'rgba(255,255,255,.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'rgba(255,255,255,.55)';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <ArrowLeft size={14} strokeWidth={2} /> Exit presenter view
      </a>

      {view === 'waiting' && (
        <>
          <h1 style={{ fontSize: 'var(--text-4xl)', color: 'var(--white)', marginBottom: 8 }}>{event.title}</h1>
          <p style={{ fontSize: 'var(--text-lg)', color: 'rgba(255,255,255,.8)', marginBottom: 32 }}>
            Scan the QR code to join
          </p>
          <div style={{ background: 'var(--white)', padding: 24, borderRadius: 'var(--radius-lg)' }}>
            <QRCode url={joinUrl} size={320} />
          </div>
          <p style={{ fontSize: 'var(--text-xl)', marginTop: 24, fontFamily: 'var(--font-mono)' }}>{event.join_code}</p>
          <p style={{ fontSize: 'var(--text-md)', color: 'rgba(255,255,255,.7)', marginTop: 20 }}>{registeredCount} joined</p>
        </>
      )}

      {view === 'question' && (
        <>
          <div style={{ fontSize: 'var(--text-md)', color: 'var(--sky-400)', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>
            QUESTION {questionIndex + 1} OF {totalQuestions}
          </div>
          {countdown.active && (
            <div style={{ marginBottom: 20 }}>
              <CountdownRing seconds={countdown.remainingSeconds ?? 0} fraction={countdown.fraction} size={92} />
            </div>
          )}
          <h1 style={{ fontSize: 'var(--text-3xl)', color: 'var(--white)', maxWidth: 900, marginBottom: 32 }}>{questionTitle}</h1>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, width: '100%', maxWidth: 700 }}>
            {questionOptions.map((opt, i) => (
              <div
                key={opt.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '18px 20px',
                  borderRadius: 'var(--radius-md)',
                  background: optionStyle(i).color,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 'var(--text-md)',
                  textAlign: 'left',
                }}
              >
                <OptionShape index={i} size={22} />
                {opt.label}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 'var(--text-xl)', color: 'rgba(255,255,255,.8)', marginTop: 40 }}>
            {completedCount} of {registeredCount} answered
          </p>
        </>
      )}

      {view === 'results' && (
        <div style={{ width: '100%', maxWidth: 800, textAlign: 'left' }}>
          <h1 style={{ fontSize: 'var(--text-3xl)', color: 'var(--white)', textAlign: 'center', marginBottom: 32 }}>{questionTitle}</h1>
          <div style={{ background: 'var(--white)', borderRadius: 'var(--radius-lg)', padding: 32 }}>
            <BarChart options={questionOptions} tallies={tallies} correctOptionId={correctOptionId} large />
          </div>
          <p style={{ fontSize: 'var(--text-md)', color: 'rgba(255,255,255,.8)', textAlign: 'center', marginTop: 16 }}>
            {totalResponses} responses
          </p>
          {explanation && (
            <p style={{ fontSize: 'var(--text-md)', color: 'rgba(255,255,255,.85)', textAlign: 'center', marginTop: 12 }}>{explanation}</p>
          )}
        </div>
      )}

      {view === 'leaderboard' && (
        <div style={{ width: '100%', maxWidth: 700 }}>
          <h1 style={{ fontSize: 'var(--text-3xl)', color: 'var(--white)', marginBottom: 32 }}>Leaderboard</h1>
          <div style={{ background: 'var(--white)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
            <Leaderboard rows={leaderboardRows} large />
          </div>
        </div>
      )}

      {view === 'podium' && (
        <div style={{ width: '100%', maxWidth: 800 }}>
          <h1 style={{ fontSize: 'var(--text-3xl)', color: 'var(--white)', marginBottom: 40 }}>🏆 Final results</h1>
          <Podium rows={podiumRows} />
        </div>
      )}

      {view === 'raffle' && (
        <div style={{ width: '100%', maxWidth: 700 }}>
          <h1 style={{ fontSize: 'var(--text-3xl)', color: 'var(--white)', marginBottom: 16 }}>🎟️ Raffle</h1>
          <RaffleWheel pool={participantPool} winners={raffleWinners} instant={raffleInstant} />
        </div>
      )}

      {view === 'closed' && (
        <>
          <h1 style={{ fontSize: 'var(--text-4xl)', color: 'var(--white)' }}>Thanks for joining!</h1>
          <p style={{ fontSize: 'var(--text-lg)', color: 'rgba(255,255,255,.8)', marginTop: 12 }}>{event.title}</p>
        </>
      )}
    </div>
  );
}
