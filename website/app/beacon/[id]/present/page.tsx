'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import BeaconGate from '../../../../components/beacon/BeaconGate';
import QRCode from '../../../../components/beacon/QRCode';
import BarChart from '../../../../components/beacon/BarChart';
import Leaderboard, { LeaderboardRow } from '../../../../components/beacon/Leaderboard';
import RaffleWheel from '../../../../components/beacon/RaffleWheel';
import { useBeaconChannel } from '../../../../components/beacon/useBeaconChannel';
import { BeaconEvent, BeaconMessage, QuestionOption, Tally } from '../../../../lib/beacon';
import { ArrowLeft } from 'lucide-react';

type View = 'waiting' | 'question' | 'results' | 'leaderboard' | 'raffle' | 'closed';

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
  const [tallies, setTallies] = useState<Tally[]>([]);
  const [totalResponses, setTotalResponses] = useState(0);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [correctOptionId, setCorrectOptionId] = useState<string | undefined>(undefined);
  const [explanation, setExplanation] = useState<string | undefined>(undefined);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [raffleWinners, setRaffleWinners] = useState<{ participant_id: string; name: string }[]>([]);
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
      setView('closed');
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
    } else if (msg.type === 'raffle_drawn') {
      const { data: participants } = await supabase.from('beacon_participants').select('name').eq('event_id', eventId);
      setParticipantPool((participants || []).map((p) => p.name));
      setRaffleWinners(msg.payload.winners);
      setView('raffle');
    } else if (msg.type === 'event_closed') {
      setView('closed');
    }
  }, [eventId]);

  useBeaconChannel(eventId, { role: 'presenter' }, onMessage);

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
          <h1 style={{ fontSize: 'var(--text-4xl)', color: 'var(--white)', maxWidth: 900 }}>{questionTitle}</h1>
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

      {view === 'raffle' && (
        <div style={{ width: '100%', maxWidth: 700 }}>
          <h1 style={{ fontSize: 'var(--text-3xl)', color: 'var(--white)', marginBottom: 16 }}>🎟️ Raffle</h1>
          <RaffleWheel pool={participantPool} winners={raffleWinners} />
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
