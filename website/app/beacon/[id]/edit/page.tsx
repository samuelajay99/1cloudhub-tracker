'use client';

import { use, useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useToast } from '../../../../components/useToast';
import Toast from '../../../../components/Toast';
import { BeaconHeaderBrand, FooterBrand } from '../../../../components/Brand';
import BeaconGate from '../../../../components/beacon/BeaconGate';
import { BeaconEvent, EventType, RaffleEligibility, generateJoinCode, newOptionId } from '../../../../lib/beacon';
import { Plus, Trash2, ArrowUp, ArrowDown, ArrowLeft } from 'lucide-react';

interface EditableOption {
  id: string;
  label: string;
}

interface EditableQuestion {
  key: string;
  title: string;
  options: EditableOption[];
  correctOptionId: string | null;
  points: number;
  explanation: string;
}

function newQuestion(): EditableQuestion {
  const optA = newOptionId();
  const optB = newOptionId();
  return {
    key: crypto.randomUUID(),
    title: '',
    options: [
      { id: optA, label: '' },
      { id: optB, label: '' },
    ],
    correctOptionId: null,
    points: 10,
    explanation: '',
  };
}

export default function BeaconEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BeaconGate>{() => <Editor eventId={id} />}</BeaconGate>;
}

function Editor({ eventId }: { eventId: string }) {
  const { toast, showToast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [event, setEvent] = useState<BeaconEvent | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<EventType>('quiz');
  const [raffleEnabled, setRaffleEnabled] = useState(false);
  const [raffleWinnerCount, setRaffleWinnerCount] = useState(1);
  const [raffleEligibility, setRaffleEligibility] = useState<RaffleEligibility>('completed');
  const [raffleMinScore, setRaffleMinScore] = useState(0);
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(true);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  async function load() {
    const { data: eventRow, error: eventErr } = await supabase.from('beacon_events').select('*').eq('id', eventId).single();
    if (eventErr || !eventRow) {
      showToast('Event not found', 'error');
      setLoaded(true);
      return;
    }
    setEvent(eventRow);
    setTitle(eventRow.title);
    setDescription(eventRow.description || '');
    setType(eventRow.type);
    setRaffleEnabled(eventRow.raffle_enabled);
    setRaffleWinnerCount(eventRow.raffle_winner_count || 1);
    setRaffleEligibility(eventRow.raffle_eligibility || 'completed');
    setRaffleMinScore(eventRow.raffle_min_score || 0);
    setLeaderboardEnabled(eventRow.leaderboard_visible);

    const { data: questionRows } = await supabase
      .from('beacon_questions')
      .select('*')
      .eq('event_id', eventId)
      .order('order_index', { ascending: true });

    setQuestions(
      (questionRows || []).map((q) => ({
        key: q.id,
        title: q.title,
        options: q.options,
        correctOptionId: q.correct_option_id,
        points: q.points,
        explanation: q.explanation || '',
      }))
    );
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, [eventId]);

  const isDraft = event?.status === 'draft';

  function updateQuestion(key: string, patch: Partial<EditableQuestion>) {
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }

  function updateOption(qKey: string, optId: string, label: string) {
    setQuestions((qs) =>
      qs.map((q) => (q.key === qKey ? { ...q, options: q.options.map((o) => (o.id === optId ? { ...o, label } : o)) } : q))
    );
  }

  function addOption(qKey: string) {
    setQuestions((qs) =>
      qs.map((q) => (q.key === qKey ? { ...q, options: [...q.options, { id: newOptionId(), label: '' }] } : q))
    );
  }

  function removeOption(qKey: string, optId: string) {
    setQuestions((qs) =>
      qs.map((q) =>
        q.key === qKey
          ? {
              ...q,
              options: q.options.filter((o) => o.id !== optId),
              correctOptionId: q.correctOptionId === optId ? null : q.correctOptionId,
            }
          : q
      )
    );
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, newQuestion()]);
  }

  function removeQuestion(key: string) {
    setQuestions((qs) => qs.filter((q) => q.key !== key));
  }

  function moveQuestion(key: string, dir: -1 | 1) {
    setQuestions((qs) => {
      const idx = qs.findIndex((q) => q.key === key);
      const swapWith = idx + dir;
      if (idx < 0 || swapWith < 0 || swapWith >= qs.length) return qs;
      const next = [...qs];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }

  function validate(): string | null {
    if (!title.trim()) return 'Give the event a title.';
    if (questions.length === 0) return 'Add at least one question.';
    for (const q of questions) {
      if (!q.title.trim()) return 'Every question needs a title.';
      const filled = q.options.filter((o) => o.label.trim());
      if (filled.length < 2) return `"${q.title || 'A question'}" needs at least 2 options.`;
      if (type === 'quiz' && !q.correctOptionId) return `Pick the correct answer for "${q.title}".`;
    }
    return null;
  }

  async function save(): Promise<boolean> {
    const err = validate();
    if (err) {
      showToast(err, 'error');
      return false;
    }
    setSaving(true);

    const { error: eventErr } = await supabase
      .from('beacon_events')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        type,
        raffle_enabled: raffleEnabled,
        raffle_winner_count: raffleEnabled ? raffleWinnerCount : null,
        raffle_eligibility: raffleEnabled ? raffleEligibility : null,
        raffle_min_score: raffleEnabled && raffleEligibility === 'min_score' ? raffleMinScore : null,
        leaderboard_visible: leaderboardEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (eventErr) {
      showToast(eventErr.message, 'error');
      setSaving(false);
      return false;
    }

    // Question set is only ever editable in draft, and no responses can
    // exist yet in draft — safe to fully replace rather than diff.
    await supabase.from('beacon_questions').delete().eq('event_id', eventId);
    const { error: qErr } = await supabase.from('beacon_questions').insert(
      questions.map((q, index) => ({
        event_id: eventId,
        order_index: index,
        title: q.title.trim(),
        options: q.options.filter((o) => o.label.trim()).map((o) => ({ id: o.id, label: o.label.trim() })),
        correct_option_id: type === 'quiz' ? q.correctOptionId : null,
        points: type === 'quiz' ? q.points : 0,
        explanation: q.explanation.trim() || null,
      }))
    );

    setSaving(false);
    if (qErr) {
      showToast(qErr.message, 'error');
      return false;
    }
    showToast('Saved.', 'success');
    return true;
  }

  async function publish() {
    setPublishing(true);
    const ok = await save();
    if (!ok) {
      setPublishing(false);
      return;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateJoinCode();
      const { error } = await supabase
        .from('beacon_events')
        .update({ status: 'published', published_at: new Date().toISOString(), join_code: code })
        .eq('id', eventId);
      if (!error) {
        showToast('Event published — redirecting to the live control room…', 'success');
        window.location.href = `/beacon/${eventId}/live`;
        return;
      }
      if (error.code !== '23505') {
        showToast(error.message, 'error');
        break;
      }
      // 23505 on join_code collision — retry with a fresh code.
    }
    showToast('Could not publish — please try again.', 'error');
    setPublishing(false);
  }

  if (!loaded) return null;
  if (!event) {
    return (
      <div className="ch-page">
        <header className="ch-header">
          <BeaconHeaderBrand />
        </header>
        <div className="ch-shell-narrow" style={{ padding: '80px 32px', textAlign: 'center' }}>
          <p>Event not found, or you don&apos;t have access to it.</p>
          <a href="/beacon" className="ch-btn ch-btn-secondary" style={{ marginTop: 16 }}>
            <ArrowLeft size={16} strokeWidth={2} /> Back to my events
          </a>
        </div>
      </div>
    );
  }

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

      <div className="ch-shell" style={{ padding: '48px 32px 96px', maxWidth: 760 }}>
        <div className="ch-kicker" style={{ marginBottom: 14 }}>
          {isDraft ? 'Draft' : event.status}
        </div>
        <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 24 }}>Edit event</h1>

        {!isDraft && (
          <div className="ch-card pad-lg" style={{ marginBottom: 24, background: 'var(--surface-card-alt)' }}>
            <p style={{ fontSize: 'var(--text-sm)' }}>
              This event has already been published — questions are locked so completion tracking stays accurate. Manage
              it from the <a href={`/beacon/${eventId}/live`}>live control room</a>.
            </p>
          </div>
        )}

        <div className="ch-card pad-lg" style={{ marginBottom: 24 }}>
          <label className="ch-label">Title</label>
          <input className="ch-field" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="ch-label">Description</label>
          <textarea className="ch-field" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          <label className="ch-label">Type</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className={`ch-btn ${type === 'poll' ? 'ch-btn-primary' : 'ch-btn-secondary'}`}
              disabled={!isDraft}
              onClick={() => setType('poll')}
            >
              Poll
            </button>
            <button
              type="button"
              className={`ch-btn ${type === 'quiz' ? 'ch-btn-primary' : 'ch-btn-secondary'}`}
              disabled={!isDraft}
              onClick={() => setType('quiz')}
            >
              Quiz
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 'var(--text-lg)' }}>Questions</h2>
          {isDraft && (
            <button className="ch-btn ch-btn-secondary" onClick={addQuestion}>
              <Plus size={15} strokeWidth={2} /> Add question
            </button>
          )}
        </div>

        {questions.map((q, index) => (
          <div key={q.key} className="ch-card pad-lg" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <label className="ch-label" style={{ marginTop: 0 }}>
                Question {index + 1}
              </label>
              {isDraft && (
                <div className="ch-row-actions">
                  <button className="ch-btn ch-btn-ghost" onClick={() => moveQuestion(q.key, -1)} title="Move up">
                    <ArrowUp size={14} strokeWidth={2} />
                  </button>
                  <button className="ch-btn ch-btn-ghost" onClick={() => moveQuestion(q.key, 1)} title="Move down">
                    <ArrowDown size={14} strokeWidth={2} />
                  </button>
                  <button className="ch-btn ch-btn-ghost" onClick={() => removeQuestion(q.key)} title="Delete">
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>
            <input
              className="ch-field"
              placeholder="Question title"
              value={q.title}
              disabled={!isDraft}
              onChange={(e) => updateQuestion(q.key, { title: e.target.value })}
            />

            {q.options.map((opt) => (
              <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {type === 'quiz' && (
                  <input
                    type="radio"
                    name={`correct-${q.key}`}
                    checked={q.correctOptionId === opt.id}
                    disabled={!isDraft}
                    onChange={() => updateQuestion(q.key, { correctOptionId: opt.id })}
                  />
                )}
                <input
                  className="ch-field"
                  style={{ margin: 0 }}
                  placeholder="Option"
                  value={opt.label}
                  disabled={!isDraft}
                  onChange={(e) => updateOption(q.key, opt.id, e.target.value)}
                />
                {isDraft && q.options.length > 2 && (
                  <button className="ch-btn ch-btn-ghost" onClick={() => removeOption(q.key, opt.id)} title="Remove option">
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                )}
              </div>
            ))}
            {isDraft && (
              <button className="ch-btn ch-btn-ghost" onClick={() => addOption(q.key)} style={{ marginBottom: 8 }}>
                <Plus size={13} strokeWidth={2} /> Add option
              </button>
            )}

            {type === 'quiz' && (
              <>
                <label className="ch-label">Points</label>
                <input
                  type="number"
                  className="ch-field"
                  min={0}
                  value={q.points}
                  disabled={!isDraft}
                  onChange={(e) => updateQuestion(q.key, { points: Number(e.target.value) })}
                />
                <label className="ch-label">Explanation (optional, shown after results)</label>
                <textarea
                  className="ch-field"
                  rows={2}
                  value={q.explanation}
                  disabled={!isDraft}
                  onChange={(e) => updateQuestion(q.key, { explanation: e.target.value })}
                />
              </>
            )}
          </div>
        ))}

        <div className="ch-card pad-lg" style={{ marginTop: 24 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
            <input type="checkbox" checked={leaderboardEnabled} onChange={(e) => setLeaderboardEnabled(e.target.checked)} />
            Enable leaderboard {type === 'poll' && '(quiz only — has no effect on a poll)'}
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', fontWeight: 600, marginTop: 16 }}>
            <input type="checkbox" checked={raffleEnabled} onChange={(e) => setRaffleEnabled(e.target.checked)} />
            Enable raffle
          </label>
          {raffleEnabled && (
            <>
              <label className="ch-label">Number of winners</label>
              <input
                type="number"
                className="ch-field"
                min={1}
                value={raffleWinnerCount}
                onChange={(e) => setRaffleWinnerCount(Number(e.target.value))}
              />
              <label className="ch-label">Eligibility</label>
              <select
                className="ch-field"
                value={raffleEligibility}
                onChange={(e) => setRaffleEligibility(e.target.value as RaffleEligibility)}
              >
                <option value="all">All registered participants</option>
                <option value="completed">Only participants who completed</option>
                <option value="min_score">Only participants with a minimum score</option>
              </select>
              {raffleEligibility === 'min_score' && (
                <>
                  <label className="ch-label">Minimum score</label>
                  <input
                    type="number"
                    className="ch-field"
                    min={0}
                    value={raffleMinScore}
                    onChange={(e) => setRaffleMinScore(Number(e.target.value))}
                  />
                </>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
          <button className="ch-btn ch-btn-secondary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {isDraft && (
            <button className="ch-btn ch-btn-primary" disabled={publishing} onClick={publish}>
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          )}
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
