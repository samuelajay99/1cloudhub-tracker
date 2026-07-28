'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ThumbsUp, ThumbsDown, Bookmark, ExternalLink, Clock, ShieldCheck } from 'lucide-react';

const SECTION_ORDER = ['must_know', 'worth_knowing', 'radar', 'deep_dive', 'wildcard', 'water_cooler'] as const;
type Section = (typeof SECTION_ORDER)[number];

const SECTION_META: Record<Section, { title: string; hint: string }> = {
  must_know: { title: 'Must Know', hint: 'Would a peer assume you already saw this?' },
  worth_knowing: { title: 'Worth Knowing', hint: '' },
  radar: { title: 'On Your Radar', hint: 'Early signal, worth watching' },
  deep_dive: { title: 'Deep Dive', hint: 'One story worth the extra minutes' },
  wildcard: { title: 'Wildcard', hint: 'Off your usual beat, on purpose' },
  water_cooler: { title: 'Water Cooler', hint: '' },
};

const DOWNVOTE_REASONS: { value: string; label: string }[] = [
  { value: 'not_relevant', label: 'Not relevant' },
  { value: 'already_knew', label: 'Already knew this' },
  { value: 'too_basic', label: 'Too basic' },
  { value: 'too_technical', label: 'Too technical' },
  { value: 'distrust_source', label: "Don't trust this source" },
  { value: 'wrong_region', label: 'Wrong region' },
];

interface BriefItemRow {
  id: string;
  story_id: string;
  section: Section;
  rank: number;
  lens: string;
  why_it_matters: string;
  is_exploration: boolean;
  is_read: boolean;
  horizon_stories: {
    title: string;
    summary: string;
    url: string;
    publisher: string | null;
    domain: string | null;
    published_at: string | null;
    credibility_tier: number | null;
    is_primary_source: boolean | null;
    read_minutes: number | null;
    topics: string[];
  };
}

export default function BriefView({
  briefId,
  userId,
  sixtySecond,
  isQuietDay,
}: {
  briefId: string;
  userId: string;
  sixtySecond: string;
  isQuietDay: boolean;
}) {
  const [items, setItems] = useState<BriefItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [votes, setVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [reasonPickerFor, setReasonPickerFor] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('horizon_brief_items')
        .select('*, horizon_stories(*)')
        .eq('brief_id', briefId)
        .order('section')
        .order('rank');
      const rows = (data ?? []) as unknown as BriefItemRow[];
      setItems(rows);

      const itemIds = rows.map((r) => r.id);
      const storyIds = rows.map((r) => r.story_id);
      if (itemIds.length > 0) {
        const { data: feedback } = await supabase
          .from('horizon_feedback')
          .select('brief_item_id, signal')
          .eq('user_id', userId)
          .in('brief_item_id', itemIds)
          .in('signal', ['up', 'down']);
        const voteState: Record<string, 'up' | 'down'> = {};
        for (const f of feedback ?? []) {
          if (f.brief_item_id) voteState[f.brief_item_id] = f.signal as 'up' | 'down';
        }
        setVotes(voteState);
      }
      if (storyIds.length > 0) {
        const { data: savedRows } = await supabase.from('horizon_saved').select('story_id').eq('user_id', userId).in('story_id', storyIds);
        const savedState: Record<string, boolean> = {};
        for (const s of savedRows ?? []) savedState[s.story_id] = true;
        setSaved(savedState);
      }
      setLoading(false);
    })();
  }, [briefId, userId]);

  const grouped = useMemo(() => {
    const map = new Map<Section, BriefItemRow[]>();
    for (const section of SECTION_ORDER) map.set(section, []);
    for (const item of items) map.get(item.section)?.push(item);
    return map;
  }, [items]);

  const readCount = items.filter((i) => i.is_read).length;

  async function recordSignal(item: BriefItemRow, signal: string, reason?: string, value?: number) {
    await supabase.from('horizon_feedback').insert({
      user_id: userId,
      brief_item_id: item.id,
      story_id: item.story_id,
      signal,
      reason: reason ?? null,
      value: value ?? null,
    });
  }

  function handleUp(item: BriefItemRow) {
    if (votes[item.id] === 'up') return;
    setVotes((prev) => ({ ...prev, [item.id]: 'up' }));
    recordSignal(item, 'up');
  }

  function handleDownClick(item: BriefItemRow) {
    if (votes[item.id] === 'down') return;
    setReasonPickerFor(reasonPickerFor === item.id ? null : item.id);
  }

  function handleReason(item: BriefItemRow, reason: string) {
    setVotes((prev) => ({ ...prev, [item.id]: 'down' }));
    setReasonPickerFor(null);
    recordSignal(item, 'down', reason);
  }

  async function toggleSave(item: BriefItemRow) {
    const isSaved = !!saved[item.story_id];
    setSaved((prev) => ({ ...prev, [item.story_id]: !isSaved }));
    if (isSaved) {
      await supabase.from('horizon_saved').delete().eq('user_id', userId).eq('story_id', item.story_id);
    } else {
      await supabase.from('horizon_saved').upsert({ user_id: userId, story_id: item.story_id }, { onConflict: 'user_id,story_id' });
      recordSignal(item, 'save');
    }
  }

  async function handleOpen(item: BriefItemRow, e: React.MouseEvent) {
    e.preventDefault();
    recordSignal(item, 'open');
    if (!item.is_read) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_read: true } : i)));
      await supabase.from('horizon_brief_items').update({ is_read: true }).eq('id', item.id);
    }
    window.open(item.horizon_stories.url, '_blank', 'noopener,noreferrer');
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Loading your brief…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="ch-card pad-lg" style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Quieter morning</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 8 }}>
          {sixtySecond || "Nothing cleared the bar for your brief today — that's a feature, not a bug. Check back this evening."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="ch-card pad-lg" style={{ marginBottom: 32 }}>
        {isQuietDay && (
          <span className="ch-badge warning mono" style={{ marginBottom: 10, display: 'inline-block' }}>
            Quiet day
          </span>
        )}
        <p style={{ fontSize: 'var(--text-md)', lineHeight: 'var(--leading-normal)', fontWeight: 'var(--weight-medium)' }}>{sixtySecond}</p>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 10 }}>
          {readCount} of {items.length} read
        </p>
      </div>

      {SECTION_ORDER.map((section) => {
        const sectionItems = grouped.get(section) ?? [];
        if (sectionItems.length === 0) return null;
        const meta = SECTION_META[section];
        return (
          <div key={section} className={`ch-brief-section${section === 'must_know' ? ' must-know' : ''}`}>
            <div className="ch-brief-section-header">
              <div className="ch-kicker" style={{ marginBottom: 0 }}>
                <span className="rule" />
                <h2 style={{ fontSize: 'var(--text-md)', display: 'inline', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-kicker)' }}>
                  {meta.title}
                </h2>
              </div>
              <span className="count">{sectionItems.length}</span>
              {meta.hint && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>— {meta.hint}</span>}
            </div>

            {sectionItems.map((item) => {
              const story = item.horizon_stories;
              const vote = votes[item.id];
              const isSaved = !!saved[item.story_id];
              return (
                <div key={item.id} className={`ch-brief-item${item.is_read ? ' is-read' : ''}`}>
                  <div className="ch-brief-item-top">
                    <span className={`ch-lens-chip lens-${item.lens}`}>{item.lens.replace('_', ' ')}</span>
                    {item.is_exploration && <span className="ch-badge info mono">Exploring</span>}
                    <span className="ch-credibility-badge">
                      <ShieldCheck size={12} strokeWidth={2} /> {story.publisher || story.domain}
                      {story.is_primary_source && ' · Primary source'}
                    </span>
                    {story.published_at && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>· {relativeTime(story.published_at)}</span>}
                    {story.read_minutes && (
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={11} strokeWidth={2} /> {story.read_minutes} min
                      </span>
                    )}
                  </div>

                  <a href={story.url} onClick={(e) => handleOpen(item, e)} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <h3>
                      {story.title} <ExternalLink size={14} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', color: 'var(--text-muted)' }} />
                    </h3>
                  </a>
                  <p className="summary">{story.summary}</p>

                  <div className="ch-why-matters">
                    <Sparkle />
                    <div>
                      <span className="label">Why this matters to you</span>
                      <p>{item.why_it_matters}</p>
                    </div>
                  </div>

                  <div className="ch-brief-item-actions">
                    <button className={`ch-vote-btn${vote === 'up' ? ' active-up' : ''}`} onClick={() => handleUp(item)} aria-label="Helpful">
                      <ThumbsUp size={15} strokeWidth={2} />
                    </button>
                    <button className={`ch-vote-btn${vote === 'down' ? ' active-down' : ''}`} onClick={() => handleDownClick(item)} aria-label="Not helpful">
                      <ThumbsDown size={15} strokeWidth={2} />
                    </button>
                    <button className={`ch-vote-btn${isSaved ? ' active-save' : ''}`} onClick={() => toggleSave(item)} aria-label="Save">
                      <Bookmark size={15} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  {reasonPickerFor === item.id && (
                    <div className="ch-reason-picker">
                      {DOWNVOTE_REASONS.map((r) => (
                        <button key={r.value} className="ch-reason-chip" onClick={() => handleReason(item, r.value)}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Sparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="icon">
      <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5L8 0Z" fill="currentColor" />
    </svg>
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
