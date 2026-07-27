'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../../../components/useToast';
import Toast from '../../../../components/Toast';
import { OrbitBrand } from '../../../../components/Brand';
import BarChart from '../../../../components/beacon/BarChart';
import Leaderboard, { LeaderboardRow } from '../../../../components/beacon/Leaderboard';
import { useBeaconChannel } from '../../../../components/beacon/useBeaconChannel';
import { BeaconMessage, QuestionOption, Tally } from '../../../../lib/beacon';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

type Stage =
  | 'loading'
  | 'registering'
  | 'waiting_room'
  | 'question_open'
  | 'answered_waiting'
  | 'results_shown'
  | 'leaderboard_shown'
  | 'closed'
  | 'error';

interface CurrentQuestion {
  id: string;
  index: number;
  title: string;
  options: QuestionOption[];
  total_questions: number;
}

interface Results {
  tallies: Tally[];
  total_responses: number;
  correct_option_id?: string;
  explanation?: string;
}

async function callFunction<T>(name: string, body: unknown): Promise<{ data: T | null; error: string | null }> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    if (!resp.ok) return { data: null, error: json.error || 'Something went wrong' };
    return { data: json, error: null };
  } catch {
    return { data: null, error: 'Network error — check your connection and try again.' };
  }
}

export default function BeaconJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { toast, showToast } = useToast();

  const [stage, setStage] = useState<Stage>('loading');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [eventId, setEventId] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<'poll' | 'quiz'>('poll');
  const [sessionToken, setSessionToken] = useState('');
  const [score, setScore] = useState(0);
  const [question, setQuestion] = useState<CurrentQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [ownResult, setOwnResult] = useState<{ is_correct: boolean | null; points_awarded: number } | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[] | null>(null);
  const questionStartedAt = useRef<number>(0);

  const storageKey = `beacon_participant_${code}`;

  const applyJoinResponse = useCallback((data: any) => {
    setEventId(data.event.id);
    setEventTitle(data.event.title);
    setEventType(data.event.type);
    setSessionToken(data.session_token);
    setScore(data.participant.score);

    if (data.results) {
      setResults(data.results);
      setQuestion(data.current_question);
      setStage('results_shown');
    } else if (data.current_question) {
      setQuestion(data.current_question);
      questionStartedAt.current = Date.now();
      if (data.already_answered) {
        setStage('answered_waiting');
      } else {
        setSelectedOption(null);
        setStage('question_open');
      }
    } else if (data.event.status === 'closed' || data.event.status === 'archived') {
      setStage('closed');
    } else {
      setStage('waiting_room');
    }
  }, []);

  async function join(joinName: string, joinEmail: string) {
    const { data, error } = await callFunction<any>('beacon-join', { join_code: code, name: joinName, email: joinEmail });
    if (error || !data) {
      setErrorMsg(error || 'Could not join this event.');
      setStage('error');
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify({ name: joinName, email: joinEmail }));
    applyJoinResponse(data);
  }

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const { name: n, email: e } = JSON.parse(stored);
      setName(n);
      setEmail(e);
      join(n, e);
    } else {
      setStage('registering');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const onMessage = useCallback(
    (msg: BeaconMessage) => {
      if (msg.type === 'question_started') {
        const p = msg.payload;
        setQuestion({ id: p.question_id, index: p.index, title: p.title, options: p.options, total_questions: p.total_questions });
        setSelectedOption(null);
        setOwnResult(null);
        setResults(null);
        questionStartedAt.current = Date.now();
        setStage('question_open');
      } else if (msg.type === 'results_revealed') {
        setResults(msg.payload);
        setStage((s) => (s === 'closed' ? s : 'results_shown'));
      } else if (msg.type === 'leaderboard_shown') {
        setLeaderboardRows(msg.payload.rows);
        setStage('leaderboard_shown');
      } else if (msg.type === 'event_closed') {
        setStage((s) => (s === 'leaderboard_shown' ? s : 'closed'));
      }
    },
    []
  );

  useBeaconChannel(eventId || null, { role: 'participant', participant_id: sessionToken }, onMessage);

  async function handleRegister() {
    if (!name.trim() || !email.trim()) {
      showToast('Enter your name and email.', 'error');
      return;
    }
    setSubmitting(true);
    await join(name.trim(), email.trim());
    setSubmitting(false);
  }

  async function submitAnswer() {
    if (!question || !selectedOption) return;
    setSubmitting(true);
    const responseTimeMs = Date.now() - questionStartedAt.current;
    const { data, error } = await callFunction<{ result: { is_correct: boolean | null; points_awarded: number; your_score: number } }>(
      'beacon-submit',
      { session_token: sessionToken, question_id: question.id, option_id: selectedOption, response_time_ms: responseTimeMs }
    );
    setSubmitting(false);
    if (error || !data) {
      showToast(error || 'Could not submit your answer.', 'error');
      return;
    }
    setOwnResult(data.result);
    setScore(data.result.your_score);
    setStage('answered_waiting');
  }

  const subStyle = { fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '10px 0 4px', lineHeight: 'var(--leading-normal)' };
  const titleStyle = { fontSize: 'var(--text-xl)' };

  return (
    <div className="ch-status-page">
      <Toast toast={toast} />
      <div className="ch-shell-narrow" style={{ position: 'relative', zIndex: 2 }}>
        <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
          <OrbitBrand center />

          {stage === 'loading' && <p style={subStyle}>Loading…</p>}

          {stage === 'error' && (
            <>
              <h1 style={titleStyle}>Can&apos;t join this event</h1>
              <p style={subStyle}>{errorMsg}</p>
            </>
          )}

          {stage === 'registering' && (
            <>
              <h1 style={titleStyle}>Join event</h1>
              <p style={subStyle}>Enter your name and email to join.</p>
              <input className="ch-field" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="ch-field" placeholder="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="ch-btn ch-btn-primary full" disabled={submitting} onClick={handleRegister}>
                {submitting ? 'Joining…' : 'Join'}
              </button>
            </>
          )}

          {stage === 'waiting_room' && (
            <>
              <h1 style={titleStyle}>{eventTitle}</h1>
              <p style={subStyle}>You&apos;re in! Waiting for the host to start…</p>
            </>
          )}

          {stage === 'question_open' && question && (
            <>
              <div className="ch-kicker" style={{ justifyContent: 'center', marginBottom: 10 }}>
                Question {question.index + 1} of {question.total_questions}
              </div>
              <h1 style={titleStyle}>{question.title}</h1>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16, textAlign: 'left' }}>
                {question.options.map((opt) => (
                  <button
                    key={opt.id}
                    className={`ch-btn full ${selectedOption === opt.id ? 'ch-btn-primary' : 'ch-btn-secondary'}`}
                    onClick={() => setSelectedOption(opt.id)}
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                className="ch-btn ch-btn-accent full"
                disabled={!selectedOption || submitting}
                onClick={submitAnswer}
                style={{ marginTop: 20 }}
              >
                {submitting ? 'Submitting…' : 'Submit answer'}
              </button>
            </>
          )}

          {stage === 'answered_waiting' && (
            <>
              <h1 style={titleStyle}>Answer submitted</h1>
              <p style={subStyle}>
                {ownResult?.is_correct === true && `Correct! +${ownResult.points_awarded} points.`}
                {ownResult?.is_correct === false && 'Not quite — waiting for results.'}
                {ownResult?.is_correct == null && 'Waiting for the host to reveal results…'}
              </p>
              {eventType === 'quiz' && <p style={subStyle}>Your score: {score}</p>}
            </>
          )}

          {stage === 'results_shown' && question && results && (
            <>
              <h1 style={titleStyle}>{question.title}</h1>
              <div style={{ textAlign: 'left', marginTop: 14 }}>
                <BarChart options={question.options} tallies={results.tallies} correctOptionId={results.correct_option_id} />
              </div>
              {results.explanation && <p style={subStyle}>{results.explanation}</p>}
              {eventType === 'quiz' && <p style={subStyle}>Your score: {score}</p>}
              <p style={subStyle}>Waiting for the next question…</p>
            </>
          )}

          {stage === 'leaderboard_shown' && leaderboardRows && (
            <>
              <h1 style={titleStyle}>Leaderboard</h1>
              <div style={{ textAlign: 'left', marginTop: 14 }}>
                <Leaderboard rows={leaderboardRows} />
              </div>
            </>
          )}

          {stage === 'closed' && (
            <>
              <h1 style={titleStyle}>Thanks for participating!</h1>
              <p style={subStyle}>{eventTitle}</p>
              {eventType === 'quiz' && <p style={subStyle}>Final score: {score}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
