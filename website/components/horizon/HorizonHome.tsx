'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import BriefView from './BriefView';
import { RefreshCw, Sparkles } from 'lucide-react';

type BriefStatus = 'queued' | 'generating' | 'ready' | 'failed';

interface BriefRow {
  id: string;
  brief_date: string;
  status: BriefStatus;
  sixty_second: string | null;
  is_quiet_day: boolean;
  error: string | null;
}

export default function HorizonHome({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [today, setToday] = useState<BriefRow | null>(null);
  const [fallback, setFallback] = useState<BriefRow | null>(null);
  const [starting, setStarting] = useState(false);
  const [invokeError, setInvokeError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function load() {
    setLoading(true);
    const { data: profile } = await supabase.from('horizon_profiles').select('timezone, onboarding_done').eq('user_id', userId).maybeSingle();
    if (!profile || !profile.onboarding_done) {
      router.replace('/horizon/onboarding');
      return;
    }
    const tz = profile.timezone || 'Asia/Kolkata';
    setTimezone(tz);
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

    const { data: todayBrief } = await supabase
      .from('horizon_briefs')
      .select('id, brief_date, status, sixty_second, is_quiet_day, error')
      .eq('user_id', userId)
      .eq('brief_date', todayStr)
      .maybeSingle();

    if (todayBrief) {
      setToday(todayBrief as BriefRow);
      if (todayBrief.status === 'generating' || todayBrief.status === 'queued') startPolling(todayBrief.id);
      if (todayBrief.status === 'failed') await loadFallback(todayStr);
    } else {
      setToday(null);
      await loadFallback(todayStr);
    }
    setLoading(false);
  }

  async function loadFallback(excludeDate: string) {
    const { data } = await supabase
      .from('horizon_briefs')
      .select('id, brief_date, status, sixty_second, is_quiet_day, error')
      .eq('user_id', userId)
      .eq('status', 'ready')
      .lt('brief_date', excludeDate)
      .order('brief_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    setFallback((data as BriefRow) ?? null);
  }

  function startPolling(briefId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('horizon_briefs')
        .select('id, brief_date, status, sixty_second, is_quiet_day, error')
        .eq('id', briefId)
        .single();
      if (data && (data.status === 'ready' || data.status === 'failed')) {
        if (pollRef.current) clearInterval(pollRef.current);
        setToday(data as BriefRow);
        if (data.status === 'failed') {
          const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
          await loadFallback(todayStr);
        }
      }
    }, 2000);
  }

  async function generateToday(force = false) {
    setStarting(true);
    setInvokeError('');
    const { data, error } = await supabase.functions.invoke('horizon-brief', { body: force ? { force: true } : {} });
    setStarting(false);
    if (error) {
      // supabase-js's FunctionsHttpError carries the real response on
      // `.context` — read the body text so a 4xx/5xx from horizon-brief
      // (e.g. "Horizon profile not found") is visible instead of a bare
      // "Edge Function returned a non-2xx status code".
      let detail = error.message;
      const context = (error as { context?: Response }).context;
      if (context && typeof context.text === 'function') {
        try {
          const bodyText = await context.clone().text();
          const parsed = JSON.parse(bodyText);
          if (parsed?.error) detail = parsed.error;
        } catch {
          // fall back to error.message
        }
      }
      console.error('horizon-brief invoke failed:', detail, data);
      setInvokeError(detail);
      return;
    }
    await load();
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-secondary)' }}>Loading your brief…</div>;
  }

  const greeting = timeOfDayGreeting();
  const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <p className="ch-kicker">
          <span className="rule" /> {dateLabel}
        </p>
        <h1 style={{ fontSize: 'var(--text-2xl)', marginTop: 6 }}>{greeting}</h1>
      </div>

      {today?.status === 'generating' || today?.status === 'queued' ? (
        <GeneratingCard />
      ) : today?.status === 'ready' ? (
        <>
          <BriefView briefId={today.id} userId={userId} sixtySecond={today.sixty_second ?? ''} isQuietDay={today.is_quiet_day} />
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button className="ch-btn ch-btn-secondary" onClick={() => generateToday(true)} disabled={starting}>
              <RefreshCw size={15} strokeWidth={2} /> {starting ? 'Regenerating…' : "Regenerate today's brief"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="ch-card pad-lg" style={{ textAlign: 'center', marginBottom: 28 }}>
            {today?.status === 'failed' ? (
              <>
                <h2 style={{ fontSize: 'var(--text-lg)', color: 'var(--red-600)' }}>Today&apos;s brief hit a snag</h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '8px 0 16px' }}>
                  {today.error || 'Generation failed — you can retry below.'} Showing your most recent brief in the meantime.
                </p>
              </>
            ) : (
              <>
                <Sparkles size={28} strokeWidth={1.5} color="var(--blue-600)" style={{ margin: '0 auto 10px' }} />
                <h2 style={{ fontSize: 'var(--text-lg)' }}>No brief yet for today</h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '8px 0 16px' }}>
                  Generate it now, or wait for your scheduled delivery time.
                </p>
              </>
            )}
            <button className="ch-btn ch-btn-primary" onClick={() => generateToday(false)} disabled={starting}>
              {starting ? 'Starting…' : "Generate today's brief"}
            </button>
            {invokeError && (
              <p style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--red-600)', background: 'var(--red-100)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginTop: 14, wordBreak: 'break-word' }}>
                {invokeError}
              </p>
            )}
          </div>
          {fallback && (
            <>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 12 }}>
                Your brief from {new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(new Date(fallback.brief_date))}:
              </p>
              <BriefView briefId={fallback.id} userId={userId} sixtySecond={fallback.sixty_second ?? ''} isQuietDay={fallback.is_quiet_day} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function GeneratingCard() {
  return (
    <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
      <Sparkles size={28} strokeWidth={1.5} color="var(--blue-600)" className="ch-spin-slow" style={{ margin: '0 auto 10px' }} />
      <h2 style={{ fontSize: 'var(--text-lg)' }}>Writing your brief…</h2>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 8 }}>This usually takes under a minute.</p>
    </div>
  );
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning.';
  if (hour < 18) return 'Good afternoon.';
  return 'Good evening.';
}
