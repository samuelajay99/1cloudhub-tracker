// Supabase Edge Function: generates one Horizon brief for one user-date.
// Idempotent on (user_id, brief_date). Implements the BRD §5 pipeline:
// filter -> score in code -> diversity constraints -> top ~25 -> inject
// exploration candidates -> Claude selects/sections/writes -> persist.
//
// User-initiated (called from onboarding on signup, or "Generate now" /
// manual regen from the brief page) — re-verifies the caller's session
// server-side against `profiles` and `app_access`, exactly like
// claude-proxy. Never trusts a client-supplied user_id.
//
// Deploy with:  supabase functions deploy horizon-brief
// Secrets needed:  ANTHROPIC_API_KEY

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CORS_HEADERS,
  json,
  scoreStory,
  applyDiversityConstraints,
  selectExplorationCandidates,
  RANKING_CONFIG,
  type ScoringStory,
  type ScoringUserContext,
  type ScoredCandidate,
  type InterestNode,
} from "../_shared/horizon.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODEL = "claude-sonnet-5";
const MAX_ATTEMPTS = 3; // 1 initial + 2 retries, per HZ-BR-12

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing bearer token" }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "invalid session" }, 401);
  const userId = userData.user.id;

  const { data: profileRow } = await supabase.from("profiles").select("status").eq("id", userId).single();
  if (!profileRow || profileRow.status !== "approved") return json({ error: "account not approved" }, 403);

  const { data: accessRow } = await supabase
    .from("app_access")
    .select("status")
    .eq("user_id", userId)
    .eq("app_id", "horizon")
    .maybeSingle();
  if (!accessRow || accessRow.status !== "approved") return json({ error: "no Horizon access" }, 403);

  let body: { date?: string; force?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // no body — fine
  }

  const { data: horizonProfile } = await supabase
    .from("horizon_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (!horizonProfile) return json({ error: "Horizon profile not found — complete onboarding first" }, 400);

  const timezone = horizonProfile.timezone || "Asia/Kolkata";
  const briefDate = body.date || todayInTimezone(timezone);

  // Idempotency (HZ-BR-01): one brief per (user_id, brief_date).
  const { data: existingBrief } = await supabase
    .from("horizon_briefs")
    .select("*")
    .eq("user_id", userId)
    .eq("brief_date", briefDate)
    .maybeSingle();

  if (existingBrief && existingBrief.status === "generating") {
    return json({ brief_id: existingBrief.id, status: "generating" });
  }
  // HZ-BR-13: at most two manual regenerations per day. `attempts` also
  // counts internal retries (withRetries), so this is a conservative cap,
  // not an exact one — acceptable since the intent is "don't let a user
  // burn unlimited tokens re-rolling the same brief."
  if (existingBrief && existingBrief.status === "ready" && !body.force) {
    return json({ brief_id: existingBrief.id, status: "ready" });
  }
  if (existingBrief && existingBrief.attempts >= 3) {
    return json({ error: "Regeneration limit reached for today", brief_id: existingBrief.id, status: existingBrief.status }, 429);
  }

  let briefId: string;
  if (existingBrief) {
    briefId = existingBrief.id;
    // Regenerating a brief that already produced items (ready, or a failed
    // retry that got partway through) — clear old items first so the
    // (brief_id, story_id) unique constraint doesn't collide on re-insert.
    await supabase.from("horizon_brief_items").delete().eq("brief_id", briefId);
    await supabase.from("horizon_briefs").update({ status: "generating" }).eq("id", briefId);
  } else {
    const { data: created, error: createErr } = await supabase
      .from("horizon_briefs")
      .insert({ user_id: userId, brief_date: briefDate, status: "generating" })
      .select("id")
      .single();
    if (createErr || !created) return json({ error: "could not create brief" }, 500);
    briefId = created.id;
  }

  try {
    const result = await generateBrief(supabase, userId, briefId, horizonProfile);
    return json({ brief_id: briefId, status: "ready", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("horizon_briefs")
      .update({ status: "failed", error: message, attempts: (existingBrief?.attempts ?? 0) + 1 })
      .eq("id", briefId);
    return json({ error: message, brief_id: briefId, status: "failed" }, 502);
  }
});

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

async function generateBrief(
  supabase: SupabaseClient,
  userId: string,
  briefId: string,
  profile: {
    role_title: string | null;
    industry: string | null;
    seniority: string | null;
    company: string | null;
    country: string | null;
    city: string | null;
    goals: string[];
    brief_length: string;
    weekend_mode: string;
    timezone: string;
  }
): Promise<{ item_count: number; is_quiet_day: boolean }> {
  const now = new Date();

  const { data: interestRows } = await supabase
    .from("horizon_interests")
    .select("kind, label, weight, muted_until")
    .eq("user_id", userId);
  const activeInterests: InterestNode[] = (interestRows ?? [])
    .filter((r: { muted_until: string | null }) => !r.muted_until || new Date(r.muted_until) < now)
    .map((r: { kind: string; label: string; weight: number }) => ({ kind: r.kind, label: r.label, weight: r.weight }));
  const mutedTopics = new Set(
    (interestRows ?? [])
      .filter((r: { kind: string; muted_until: string | null }) => r.kind === "topic" && r.muted_until && new Date(r.muted_until) > now)
      .map((r: { label: string }) => r.label.toLowerCase())
  );
  const mutedSources = new Set(
    (interestRows ?? [])
      .filter((r: { kind: string; muted_until: string | null }) => r.kind === "source" && r.muted_until && new Date(r.muted_until) > now)
      .map((r: { label: string }) => r.label.toLowerCase())
  );

  // Candidate pool: last 36h (§5 pipeline step 1), joined with cluster stats.
  const windowStart = new Date(now.getTime() - RANKING_CONFIG.candidateWindowHours * 3_600_000).toISOString();
  const { data: storyRows } = await supabase
    .from("horizon_stories")
    .select("*, horizon_story_clusters(story_count, velocity)")
    .gte("first_seen_at", windowStart)
    .limit(500);

  // Stories/clusters already served to this user, ever — drives novelty
  // and the "not already served" hard filter.
  const { data: priorItems } = await supabase
    .from("horizon_brief_items")
    .select("story_id, horizon_briefs!inner(user_id)")
    .eq("horizon_briefs.user_id", userId);
  const priorStoriesResult = priorItems && priorItems.length > 0
    ? await supabase
        .from("horizon_stories")
        .select("id, cluster_id, topics, first_seen_at")
        .in("id", (priorItems as { story_id: string }[]).map((i) => i.story_id))
    : { data: [] };
  const priorStories: { id: string; cluster_id: string | null; topics: string[]; first_seen_at: string }[] =
    priorStoriesResult.data ?? [];

  const servedStoryIds: Set<string> = new Set(priorStories.map((s) => s.id));
  const seenClusterIds: Set<string> = new Set(
    priorStories.filter((s) => s.cluster_id).map((s) => s.cluster_id as string)
  );
  const fatigueSince = now.getTime() - RANKING_CONFIG.fatigueWindowDays * 24 * 3_600_000;
  const topicServedCounts: Record<string, number> = {};
  for (const s of priorStories) {
    if (new Date(s.first_seen_at).getTime() < fatigueSince) continue;
    for (const topic of s.topics ?? []) {
      const key = topic.toLowerCase();
      topicServedCounts[key] = (topicServedCounts[key] ?? 0) + 1;
    }
  }

  const ctx: ScoringUserContext = {
    interests: activeInterests,
    country: profile.country,
    city: profile.city,
    industry: profile.industry,
    company: profile.company,
    seenClusterIds,
    topicServedCounts,
  };

  const eligibleStories: ScoringStory[] = (storyRows ?? [])
    .filter((s: { id: string; domain: string | null; topics: string[] }) => {
      if (servedStoryIds.has(s.id)) return false;
      if (s.domain && mutedSources.has(s.domain.toLowerCase())) return false;
      if ((s.topics ?? []).some((t: string) => mutedTopics.has(t.toLowerCase()))) return false;
      return true;
    })
    .map((s: {
      id: string; title: string; cluster_id: string | null; publisher: string | null; domain: string | null;
      published_at: string | null; topics: string[]; entities: string[]; region: string | null;
      lens_hint: string | null; credibility_tier: number | null; is_primary_source: boolean | null;
      horizon_story_clusters: { story_count: number; velocity: number | null } | null;
    }) => ({
      id: s.id,
      title: s.title,
      cluster_id: s.cluster_id,
      publisher: s.publisher,
      domain: s.domain,
      published_at: s.published_at,
      topics: s.topics ?? [],
      entities: s.entities ?? [],
      region: s.region,
      lens_hint: s.lens_hint,
      credibility_tier: s.credibility_tier,
      is_primary_source: s.is_primary_source,
      cluster_story_count: s.horizon_story_clusters?.story_count ?? 1,
      cluster_velocity: s.horizon_story_clusters?.velocity ?? 0,
    }));

  const scored: ScoredCandidate[] = eligibleStories
    .map((story) => ({ story, score: scoreStory(story, ctx, now) }))
    .sort((a, b) => b.score.total - a.score.total);

  const isQuietDay = scored.length < 6;

  const targetSlots = weekendAdjustedSlotTarget(profile, now);

  // weekend_mode "off" resolves to 0 slots on a weekend — that means "no
  // brief today," not "unset, fall back to a default." Handle it before
  // any further work rather than let a later `targetSlots || 12`-style
  // fallback silently treat the deliberate 0 as missing input.
  if (targetSlots === 0) {
    await supabase
      .from("horizon_briefs")
      .update({
        status: "ready",
        sixty_second: "Weekend mode is set to off — no brief today. Back to normal on the next weekday.",
        item_count: 0,
        is_quiet_day: false,
        model: MODEL,
        generated_at: now.toISOString(),
      })
      .eq("id", briefId);
    return { item_count: 0, is_quiet_day: false };
  }

  const diversityBudget = Math.max(1, RANKING_CONFIG.topCandidateCount - Math.round(targetSlots * RANKING_CONFIG.epsilon));
  const diversityPicks = applyDiversityConstraints(scored, diversityBudget);
  const explorationPicks = selectExplorationCandidates(scored, diversityPicks, targetSlots);
  const candidatesForClaude = [...diversityPicks, ...explorationPicks].slice(0, RANKING_CONFIG.topCandidateCount);

  if (candidatesForClaude.length === 0) {
    await supabase
      .from("horizon_briefs")
      .update({
        status: "ready",
        sixty_second: "A quiet morning — nothing met the bar for your brief today. Check back this evening.",
        item_count: 0,
        is_quiet_day: true,
        model: MODEL,
        generated_at: now.toISOString(),
      })
      .eq("id", briefId);
    return { item_count: 0, is_quiet_day: true };
  }

  // targetSlots (already computed above from weekend_mode/brief_length) is
  // the real cost lever, not topic count: it caps exactly how many items
  // — and therefore how much Claude writes — this brief is allowed to
  // contain, enforced both in the prompt and again on the parsed result.
  const maxItems = Math.max(6, Math.min(16, targetSlots));
  const explorationIds = new Set(explorationPicks.map((c) => c.story.id));
  const claudeResult = await withRetries(() => callClaudeForSelection(profile, candidatesForClaude, explorationIds, maxItems));

  const itemsToInsert = claudeResult.items.map((item, idx) => ({
    brief_id: briefId,
    story_id: item.story_id,
    section: item.section,
    rank: idx,
    lens: item.lens,
    why_it_matters: item.why_it_matters,
    score: scored.find((c) => c.story.id === item.story_id)?.score.total ?? null,
    is_exploration: explorationIds.has(item.story_id),
  }));

  if (itemsToInsert.length > 0) {
    const { error: itemsErr } = await supabase.from("horizon_brief_items").insert(itemsToInsert);
    if (itemsErr) throw new Error(`failed to persist brief items: ${itemsErr.message}`);
  }

  await supabase
    .from("horizon_briefs")
    .update({
      status: "ready",
      sixty_second: claudeResult.sixty_second,
      item_count: itemsToInsert.length,
      is_quiet_day: claudeResult.must_know_count === 0 && isQuietDay,
      model: MODEL,
      input_tokens: claudeResult.usage.input_tokens,
      output_tokens: claudeResult.usage.output_tokens,
      generated_at: now.toISOString(),
    })
    .eq("id", briefId);

  return { item_count: itemsToInsert.length, is_quiet_day: claudeResult.must_know_count === 0 && isQuietDay };
}

function weekendAdjustedSlotTarget(profile: { weekend_mode: string; brief_length: string; timezone: string }, now: Date): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, weekday: "short" }).format(now);
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  if (isWeekend && profile.weekend_mode === "off") return 0;
  if (isWeekend && profile.weekend_mode === "lighter") return 6;
  if (profile.brief_length === "short") return 8;
  if (profile.brief_length === "long") return 16;
  return 12;
}

interface ClaudeBriefItem {
  story_id: string;
  section: "must_know" | "worth_knowing" | "radar" | "deep_dive" | "wildcard" | "water_cooler";
  lens: "global" | "national" | "local" | "your_world" | "your_craft";
  why_it_matters: string;
}

async function callClaudeForSelection(
  profile: {
    role_title: string | null; industry: string | null; seniority: string | null; company: string | null;
    country: string | null; city: string | null; goals: string[]; brief_length: string;
  },
  candidates: ScoredCandidate[],
  explorationIds: Set<string>,
  maxItems: number
): Promise<{ items: ClaudeBriefItem[]; sixty_second: string; must_know_count: number; usage: { input_tokens: number; output_tokens: number } }> {
  const candidateBlock = candidates
    .map((c) => {
      const flags = [c.score.total.toFixed(2), explorationIds.has(c.story.id) ? "EXPLORATION" : null].filter(Boolean).join(", ");
      return `- id: ${c.story.id}\n  title: ${c.story.title ?? "(untitled)"}\n  publisher: ${c.story.publisher ?? c.story.domain}\n  published_at: ${c.story.published_at ?? "unknown"}\n  topics: ${(c.story.topics ?? []).join(", ")}\n  entities: ${(c.story.entities ?? []).join(", ")}\n  region: ${c.story.region ?? "unknown"}\n  score: ${flags}`;
    })
    .join("\n");

  const profileBlock = [
    `Role: ${profile.role_title ?? "unspecified"}`,
    `Seniority: ${profile.seniority ?? "unspecified"}`,
    `Industry: ${profile.industry ?? "unspecified"}`,
    `Company: ${profile.company ?? "unspecified"}`,
    `Location: ${[profile.city, profile.country].filter(Boolean).join(", ") || "unspecified"}`,
    `Goals: ${(profile.goals ?? []).join(", ") || "unspecified"}`,
  ].join("\n");

  const prompt = `You are building today's personalised intelligence brief for one professional. You are a neutral analyst — report facts, do not push opinions, do not manufacture urgency.

READER PROFILE:
${profileBlock}

CANDIDATE STORIES (already deterministically scored and diversity-filtered — your job is judgement and writing, not re-ranking):
${candidateBlock}

Select AT MOST ${maxItems} of these candidates — fewer is fine, and expected on a quiet day, but never more than ${maxItems} — and produce a brief. Rules:
- Sections: must_know (0-3), worth_knowing (4-6), radar (2-3), deep_dive (1), wildcard (1, must be one of the candidates marked EXPLORATION if any exist), water_cooler (0-1).
- must_know is a SEPARATE judgement, not just top scores: "would a competent peer assume this reader already saw this?" It is completely normal and often correct for must_know to be empty. Never invent urgency to fill it.
- Every item gets exactly one lens: global, national, local, your_world (their company/region/clients), or your_craft (their specific role/skills).
- why_it_matters MUST name something specific to this exact reader — their role, industry, city, employer, or a stated goal. A generic line like "this matters for tech professionals" is a defect — if you cannot write a specific line for a candidate, drop it instead.
- Write a 1-2 sentence "sixty_second" overview of the whole brief.

Respond with ONLY a JSON object (no prose, no markdown fences):
{
  "sixty_second": "...",
  "items": [
    { "story_id": "...", "section": "...", "lens": "...", "why_it_matters": "..." }
  ]
}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      // Scales with maxItems (the real cap on brief size) rather than a
      // flat guess: enough headroom per item to never truncate — a real
      // run previously hit its ceiling exactly (output_tokens ===
      // max_tokens) and silently produced an unparseable response — while
      // a "short" brief doesn't reserve room it'll never use.
      model: MODEL,
      max_tokens: Math.min(8192, maxItems * 450 + 1200),
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`anthropic error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const usage = { input_tokens: data?.usage?.input_tokens ?? 0, output_tokens: data?.usage?.output_tokens ?? 0 };

  // A truncated response (hit max_tokens mid-JSON) must fail loudly and
  // retry, not fall through to the parser below — naive bracket-matching
  // on incomplete JSON can accidentally "succeed" with an empty/garbage
  // result, which is exactly what silently produced an empty-but-"ready"
  // brief on a real run. Treat truncation as a hard error.
  if (data?.stop_reason === "max_tokens") {
    throw new Error(`Claude's brief-selection response was truncated (hit max_tokens=${data?.usage?.output_tokens ?? "?"})`);
  }

  const textBlock = (data?.content ?? []).find((b: { type: string }) => b.type === "text");
  const text: string = textBlock?.text ?? "{}";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Claude did not return a parseable JSON object");

  let parsed: { sixty_second?: string; items?: ClaudeBriefItem[] };
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Claude returned malformed JSON");
  }

  const candidateIds = new Set(candidates.map((c) => c.story.id));
  const items = (parsed.items ?? [])
    .filter((item) => item && candidateIds.has(item.story_id) && item.why_it_matters && item.section && item.lens)
    // Enforced in code, not just asked for in the prompt — the model
    // following instructions isn't a cap, this is.
    .slice(0, maxItems);
  const mustKnowCount = items.filter((i) => i.section === "must_know").length;

  return {
    items,
    sixty_second: parsed.sixty_second ?? "",
    must_know_count: mustKnowCount,
    usage,
  };
}

// HZ-BR-12: retry twice with exponential backoff before giving up. The
// caller (generateBrief's try/catch) marks the brief 'failed' on final
// exhaustion — the UI then falls back to yesterday's brief with a banner.
async function withRetries<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

function todayInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(new Date()); // en-CA gives YYYY-MM-DD
}
