'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { HorizonBrand } from '../Brand';
import { ArrowLeft, ArrowRight, Check, Sparkles, Sunrise } from 'lucide-react';
import {
  ROLE_TITLE_SEED,
  INDUSTRIES,
  SENIORITY_OPTIONS,
  TOPIC_SEED,
  GOAL_OPTIONS,
  LENS_LABELS,
} from '../../lib/horizonOnboarding';

const TOTAL_STEPS = 7;
const MIN_TOPICS = 5;
const MIN_GOALS = 2;
const MAX_GOALS = 3;

type Seniority = 'ic' | 'lead' | 'head' | 'cxo' | '';
type WeekendMode = 'off' | 'lighter' | 'same';

interface WizardState {
  roleTitle: string;
  company: string;
  industry: string;
  seniority: Seniority;
  topics: string[];
  country: string;
  city: string;
  lenses: Record<string, boolean>;
  goals: string[];
  deliveryTime: string;
  timezone: string;
  weekendMode: WeekendMode;
}

const DEFAULT_LENSES = { global: true, national: true, local: true, your_world: true, your_craft: true };

function defaultState(): WizardState {
  let tz = 'Asia/Kolkata';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
  } catch {
    // keep default
  }
  return {
    roleTitle: '',
    company: '',
    industry: '',
    seniority: '',
    topics: [],
    country: '',
    city: '',
    lenses: { ...DEFAULT_LENSES },
    goals: [],
    deliveryTime: '07:00',
    timezone: tz,
    weekendMode: 'lighter',
  };
}

export default function OnboardingWizard({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(defaultState());
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genPhase, setGenPhase] = useState<'queued' | 'generating' | 'ready' | 'failed'>('queued');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: profile } = await supabase.from('horizon_profiles').select('*').eq('user_id', userId).maybeSingle();
      const { data: interests } = await supabase
        .from('horizon_interests')
        .select('label')
        .eq('user_id', userId)
        .eq('kind', 'topic')
        .eq('provenance', 'onboarding');

      if (profile) {
        setState((prev) => ({
          ...prev,
          roleTitle: profile.role_title ?? '',
          company: profile.company ?? '',
          industry: profile.industry ?? '',
          seniority: (profile.seniority ?? '') as Seniority,
          country: profile.country ?? '',
          city: profile.city ?? '',
          lenses: profile.lenses ?? DEFAULT_LENSES,
          goals: profile.goals ?? [],
          deliveryTime: profile.delivery_time ? profile.delivery_time.slice(0, 5) : prev.deliveryTime,
          timezone: profile.timezone ?? prev.timezone,
          weekendMode: (profile.weekend_mode ?? 'lighter') as WeekendMode,
          topics: (interests ?? []).map((i) => i.label),
        }));
        if (profile.onboarding_done) {
          router.replace('/horizon');
          return;
        }
        setStep(Math.min(profile.onboarding_step ?? 0, TOTAL_STEPS - 1));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  const canProceed = useMemo(() => {
    switch (step) {
      case 0:
        return state.roleTitle.trim().length > 0;
      case 1:
        return state.industry.length > 0;
      case 2:
        return state.seniority.length > 0;
      case 3:
        return state.topics.length >= MIN_TOPICS;
      case 4:
        return true; // location optional, lenses have sane defaults
      case 5:
        return state.goals.length >= MIN_GOALS;
      case 6:
        return state.deliveryTime.length > 0 && state.timezone.length > 0;
      default:
        return false;
    }
  }, [step, state]);

  async function persistProgress(nextStep: number) {
    setSaving(true);
    await supabase.from('horizon_profiles').upsert(
      {
        user_id: userId,
        role_title: state.roleTitle || null,
        company: state.company || null,
        industry: state.industry || null,
        seniority: state.seniority || null,
        country: state.country || null,
        city: state.city || null,
        lenses: state.lenses,
        goals: state.goals,
        delivery_time: state.deliveryTime,
        timezone: state.timezone,
        weekend_mode: state.weekendMode,
        onboarding_step: nextStep,
      },
      { onConflict: 'user_id' }
    );
    setSaving(false);
  }

  async function goNext() {
    if (!canProceed || saving) return;
    if (step === TOTAL_STEPS - 1) {
      await finish();
      return;
    }
    const next = step + 1;
    await persistProgress(next);
    setStep(next);
  }

  function goBack() {
    if (step === 0) return;
    setStep(step - 1);
  }

  async function finish() {
    setSaving(true);
    setError('');
    await supabase.from('horizon_profiles').upsert(
      {
        user_id: userId,
        role_title: state.roleTitle || null,
        company: state.company || null,
        industry: state.industry || null,
        seniority: state.seniority || null,
        country: state.country || null,
        city: state.city || null,
        lenses: state.lenses,
        goals: state.goals,
        delivery_time: state.deliveryTime,
        timezone: state.timezone,
        weekend_mode: state.weekendMode,
        onboarding_step: TOTAL_STEPS,
        onboarding_done: true,
      },
      { onConflict: 'user_id' }
    );

    // Replace onboarding-seeded topic interests wholesale — simplest
    // correct behavior for a user who goes back and changes their topic
    // selection before finishing.
    await supabase
      .from('horizon_interests')
      .delete()
      .eq('user_id', userId)
      .eq('kind', 'topic')
      .eq('provenance', 'onboarding');
    if (state.topics.length > 0) {
      await supabase.from('horizon_interests').insert(
        state.topics.map((label) => ({ user_id: userId, kind: 'topic', label, weight: 0.6, provenance: 'onboarding' }))
      );
    }

    setSaving(false);
    setGenerating(true);
    setGenPhase('queued');

    const { error: fnError } = await supabase.functions.invoke('horizon-brief', { body: {} });
    if (fnError) {
      setError('Could not start your first brief — you can still open Horizon and generate it from there.');
      setGenerating(false);
      return;
    }

    pollForBrief();
  }

  function pollForBrief() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: state.timezone }).format(new Date());
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const { data } = await supabase
        .from('horizon_briefs')
        .select('status')
        .eq('user_id', userId)
        .eq('brief_date', today)
        .maybeSingle();
      if (data?.status === 'ready') {
        clearInterval(interval);
        setGenPhase('ready');
        setTimeout(() => router.push('/horizon'), 600);
        return;
      }
      if (data?.status === 'failed') {
        clearInterval(interval);
        setGenPhase('failed');
        setError('Brief generation hit an error. You can retry from the Horizon page.');
        return;
      }
      if (data?.status) setGenPhase(data.status as 'queued' | 'generating');
      if (attempts > 40) {
        clearInterval(interval);
        setError('Still working — this is taking longer than usual. Opening Horizon now.');
        router.push('/horizon');
      }
    }, 1500);
  }

  if (loading) {
    return (
      <div className="ch-status-page">
        <div className="ch-shell-narrow" style={{ position: 'relative', zIndex: 2 }}>
          <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
            <HorizonBrand center />
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (generating) {
    return <GeneratingScreen phase={genPhase} error={error} />;
  }

  return (
    <div className="ch-status-page" style={{ alignItems: 'flex-start', paddingTop: 64 }}>
      <div className="ch-shell-narrow" style={{ position: 'relative', zIndex: 2, width: '100%' }}>
        <div className="ch-card pad-lg">
          <HorizonBrand center />
          <div className="ch-progress-track">
            <div className="ch-progress-fill" style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} />
          </div>
          <div className="ch-wizard-step">
            Step {step + 1} of {TOTAL_STEPS}
          </div>

          {step === 0 && <StepRole state={state} update={update} />}
          {step === 1 && <StepIndustry state={state} update={update} />}
          {step === 2 && <StepSeniority state={state} update={update} />}
          {step === 3 && <StepTopics state={state} update={update} />}
          {step === 4 && <StepLocation state={state} update={update} />}
          {step === 5 && <StepGoals state={state} update={update} />}
          {step === 6 && <StepDelivery state={state} update={update} />}

          {error && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--red-600)', marginTop: 12 }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            {step > 0 && (
              <button className="ch-btn ch-btn-secondary" onClick={goBack} disabled={saving}>
                <ArrowLeft size={16} strokeWidth={2} /> Back
              </button>
            )}
            <button className="ch-btn ch-btn-primary full" onClick={goNext} disabled={!canProceed || saving}>
              {saving ? 'Saving…' : step === TOTAL_STEPS - 1 ? 'Finish' : 'Continue'}
              {!saving && <ArrowRight size={16} strokeWidth={2} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h1 style={{ fontSize: 'var(--text-xl)' }}>{title}</h1>
      {sub && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

function StepRole({ state, update }: { state: WizardState; update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  const [showList, setShowList] = useState(false);
  const matches = useMemo(() => {
    const q = state.roleTitle.trim().toLowerCase();
    if (q.length === 0) return [];
    return ROLE_TITLE_SEED.filter((t) => t.toLowerCase().includes(q)).slice(0, 8);
  }, [state.roleTitle]);

  return (
    <>
      <StepHeading title="What's your role?" sub="This drives what altitude and depth your brief is written at." />
      <div className="ch-autocomplete" style={{ marginBottom: 14 }}>
        <label className="ch-label">Job title</label>
        <input
          className="ch-field"
          placeholder="e.g. Solution Architect"
          value={state.roleTitle}
          onChange={(e) => {
            update('roleTitle', e.target.value);
            setShowList(true);
          }}
          onFocus={() => setShowList(true)}
          onBlur={() => setTimeout(() => setShowList(false), 150)}
        />
        {showList && matches.length > 0 && (
          <div className="ch-autocomplete-list">
            {matches.map((m) => (
              <button key={m} onMouseDown={() => { update('roleTitle', m); setShowList(false); }}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="ch-label">Company (optional)</label>
        <input
          className="ch-field"
          placeholder="e.g. 1CloudHub"
          value={state.company}
          onChange={(e) => update('company', e.target.value)}
        />
      </div>
    </>
  );
}

function StepIndustry({ state, update }: { state: WizardState; update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  return (
    <>
      <StepHeading title="Which industry?" />
      <div className="ch-chip-group">
        {INDUSTRIES.map((ind) => (
          <button
            key={ind}
            className={`ch-chip${state.industry === ind ? ' selected' : ''}`}
            onClick={() => update('industry', ind)}
            type="button"
          >
            {ind}
          </button>
        ))}
      </div>
    </>
  );
}

function StepSeniority({ state, update }: { state: WizardState; update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  return (
    <>
      <StepHeading title="What's your seniority?" sub="This shapes altitude, not just tone." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SENIORITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`ch-option-card${state.seniority === opt.value ? ' selected' : ''}`}
            onClick={() => update('seniority', opt.value)}
          >
            <span className="title">{opt.title}</span>
            <span className="sub">{opt.sub}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function StepTopics({ state, update }: { state: WizardState; update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  const [customInput, setCustomInput] = useState('');
  function toggle(topic: string) {
    const has = state.topics.includes(topic);
    update('topics', has ? state.topics.filter((t) => t !== topic) : [...state.topics, topic]);
  }
  function addCustom() {
    const t = customInput.trim();
    if (t.length === 0 || state.topics.includes(t)) return;
    update('topics', [...state.topics, t]);
    setCustomInput('');
  }
  return (
    <>
      <StepHeading title="What do you want to track?" sub={`Pick at least ${MIN_TOPICS} — you can refine this anytime.`} />
      <div className="ch-chip-group" style={{ marginBottom: 14 }}>
        {TOPIC_SEED.map((topic) => (
          <button
            key={topic}
            type="button"
            className={`ch-chip${state.topics.includes(topic) ? ' selected' : ''}`}
            onClick={() => toggle(topic)}
          >
            {topic}
          </button>
        ))}
        {state.topics.filter((t) => !TOPIC_SEED.includes(t)).map((topic) => (
          <button key={topic} type="button" className="ch-chip selected" onClick={() => toggle(topic)}>
            {topic}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="ch-field"
          placeholder="Add a custom topic…"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
        />
        <button className="ch-btn ch-btn-secondary" type="button" onClick={addCustom}>Add</button>
      </div>
      <p style={{ fontSize: 'var(--text-xs)', color: state.topics.length >= MIN_TOPICS ? 'var(--green-600)' : 'var(--text-muted)', marginTop: 10 }}>
        {state.topics.length} selected {state.topics.length >= MIN_TOPICS ? '✓' : `(${MIN_TOPICS - state.topics.length} more needed)`}
      </p>
    </>
  );
}

function StepLocation({ state, update }: { state: WizardState; update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  function toggleLens(key: string) {
    update('lenses', { ...state.lenses, [key]: !state.lenses[key] });
  }
  return (
    <>
      <StepHeading title="Where are you?" sub="Used for national/local relevance and to filter what lenses appear in your brief." />
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <label className="ch-label">Country</label>
          <input className="ch-field" placeholder="e.g. India" value={state.country} onChange={(e) => update('country', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="ch-label">City</label>
          <input className="ch-field" placeholder="e.g. Bengaluru" value={state.city} onChange={(e) => update('city', e.target.value)} />
        </div>
      </div>
      <label className="ch-label">Lenses to include</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
        {Object.entries(LENS_LABELS).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            className={`ch-option-card${state.lenses[key] ? ' selected' : ''}`}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            onClick={() => toggleLens(key)}
          >
            <span>
              <span className="title">{meta.label}</span>
              <span className="sub" style={{ display: 'block' }}>{meta.hint}</span>
            </span>
            {state.lenses[key] && <Check size={18} strokeWidth={2.5} color="var(--blue-600)" />}
          </button>
        ))}
      </div>
    </>
  );
}

function StepGoals({ state, update }: { state: WizardState; update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  function toggle(value: string) {
    const has = state.goals.includes(value);
    if (has) {
      update('goals', state.goals.filter((g) => g !== value));
    } else {
      if (state.goals.length >= MAX_GOALS) return;
      update('goals', [...state.goals, value]);
    }
  }
  return (
    <>
      <StepHeading title="What are you optimising for?" sub={`Pick ${MIN_GOALS}-${MAX_GOALS}.`} />
      <div className="ch-chip-group">
        {GOAL_OPTIONS.map((g) => (
          <button
            key={g.value}
            type="button"
            className={`ch-chip${state.goals.includes(g.value) ? ' selected' : ''}`}
            onClick={() => toggle(g.value)}
          >
            {g.label}
          </button>
        ))}
      </div>
    </>
  );
}

function StepDelivery({ state, update }: { state: WizardState; update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  return (
    <>
      <StepHeading title="When should your brief arrive?" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <label className="ch-label">Preferred time</label>
          <input
            className="ch-field"
            type="time"
            value={state.deliveryTime}
            onChange={(e) => update('deliveryTime', e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="ch-label">Timezone</label>
          <input className="ch-field" value={state.timezone} onChange={(e) => update('timezone', e.target.value)} />
        </div>
      </div>
      <label className="ch-label">Weekend mode</label>
      <div className="ch-chip-group" style={{ marginTop: 6 }}>
        {(['off', 'lighter', 'same'] as WeekendMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`ch-chip${state.weekendMode === mode ? ' selected' : ''}`}
            onClick={() => update('weekendMode', mode)}
          >
            {mode === 'off' ? 'No brief on weekends' : mode === 'lighter' ? 'Lighter brief' : 'Same as weekdays'}
          </button>
        ))}
      </div>
    </>
  );
}

function GeneratingScreen({ phase, error }: { phase: 'queued' | 'generating' | 'ready' | 'failed'; error: string }) {
  const stages = [
    { key: 'queued', label: 'Scanning your sources…' },
    { key: 'generating', label: 'Filtering and prioritising for you…' },
    { key: 'ready', label: 'Writing your brief…' },
  ];
  const activeIndex = stages.findIndex((s) => s.key === phase);
  return (
    <div className="ch-status-page">
      <div className="ch-shell-narrow" style={{ position: 'relative', zIndex: 2 }}>
        <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
          <div style={{ margin: '0 auto 20px', display: 'flex', justifyContent: 'center' }}>
            {phase === 'failed' ? (
              <Sunrise size={40} strokeWidth={1.5} color="var(--red-500)" />
            ) : (
              <Sparkles size={40} strokeWidth={1.5} color="var(--blue-600)" className="ch-spin-slow" />
            )}
          </div>
          <h1 style={{ fontSize: 'var(--text-xl)' }}>
            {phase === 'failed' ? "Couldn't finish your brief" : 'Building your first brief'}
          </h1>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
            {stages.map((s, i) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: phase === 'failed' ? 0.4 : i <= activeIndex || phase === 'ready' ? 1 : 0.35 }}>
                {i < activeIndex || phase === 'ready' ? (
                  <Check size={16} strokeWidth={2.5} color="var(--green-600)" />
                ) : (
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--blue-200)', borderTopColor: i === activeIndex ? 'var(--blue-600)' : 'transparent' }} />
                )}
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{s.label}</span>
              </div>
            ))}
          </div>
          {error && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--red-600)', marginTop: 16 }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
