// Shared helpers for the Horizon Edge Functions (horizon-harvest,
// horizon-brief, horizon-scheduler, horizon-learn, ...).
//
// Per BRD §5: "the LLM's job is judgement and writing, not sorting."
// Everything here is pure, deterministic TypeScript — no Claude calls, no
// DB access — so it can be unit-tested in isolation (see horizon.test.ts)
// and reused unchanged from any Edge Function.

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

// ============================================================
// URL canonicalization + hashing (BRD HZ-HV-04)
// ============================================================

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "gclsrc", "msclkid", "mc_cid", "mc_eid", "igshid",
  "ref", "ref_src", "ref_url", "spm", "s", "si", "cmpid", "ito",
]);

// Strips tracking params, normalises scheme/host/trailing slash so the same
// real-world page always hashes to the same value regardless of which
// search result or share link it was found through.
export function canonicalizeUrl(rawUrl: string): string {
  const u = new URL(rawUrl);
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
    u.port = "";
  }
  const keep = new URLSearchParams();
  for (const [key, value] of u.searchParams) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower)) continue;
    if (TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))) continue;
    keep.append(key, value);
  }
  keep.sort();
  u.search = keep.toString();
  let pathname = u.pathname.replace(/\/+$/, "");
  if (pathname === "") pathname = "/";
  u.pathname = pathname;
  return u.toString();
}

export async function hashUrl(canonicalUrl: string): Promise<string> {
  const data = new TextEncoder().encode(canonicalUrl);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================
// Ranking configuration (BRD §5) — weights live here, not scattered
// through the code, so they can be tuned without a rewrite.
// ============================================================

export const RANKING_CONFIG = {
  weights: {
    interest: 0.35,
    recency: 0.15,
    credibility: 0.10,
    momentum: 0.10,
    proximity: 0.15,
    novelty: 0.10,
    fatigue: 0.15,
  },
  epsilon: 0.18, // exploration rate — share of final slots drawn from off-profile candidates
  explorationBonus: 0.12,
  recencyHalfLifeHours: 18, // exp(-hours/18)
  fatigueWindowDays: 3,
  fatigueCapCount: 5, // servings beyond this stop adding further penalty
  candidateWindowHours: 36, // §5 pipeline step 1: last 36h
  diversityMaxPerCluster: 2,
  diversityMaxPerPublisher: 2,
  topCandidateCount: 25,
};

// ============================================================
// Scoring inputs — plain shapes mirroring the DB rows, not full
// Supabase types, so this file has zero DB/SDK dependency.
// ============================================================

export interface ScoringStory {
  id: string;
  title?: string; // not used in scoring, but carried through for downstream (e.g. the LLM selection prompt)
  cluster_id: string | null;
  publisher: string | null;
  domain: string | null;
  published_at: string | null; // ISO
  topics: string[];
  entities: string[];
  region: string | null;
  lens_hint: string | null;
  credibility_tier: number | null; // 1 (best) .. 4
  is_primary_source: boolean | null;
  cluster_story_count?: number; // joined from horizon_story_clusters
  cluster_velocity?: number | null;
}

export interface InterestNode {
  kind: "topic" | "entity" | "skill" | "region" | "source" | "format";
  label: string;
  weight: number; // -1..1
}

export interface ScoringUserContext {
  interests: InterestNode[];
  country: string | null;
  city: string | null;
  industry: string | null;
  company: string | null;
  seenClusterIds: Set<string>; // clusters already served to this user, ever
  topicServedCounts: Record<string, number>; // topic -> count served in last N days (fatigueWindowDays)
  isExplorationCandidate?: boolean; // caller marks ε-selected off-profile picks
}

// interest_match: Σ over matched graph nodes of weight × match_strength,
// normalised to 0..1 via a soft cap rather than a hard clamp so a story
// matching many interests still ranks above one matching a single strong
// interest, without letting an outlier blow the whole score past 1.
function scoreInterestMatch(story: ScoringStory, ctx: ScoringUserContext): number {
  if (ctx.interests.length === 0) return 0;
  const storyLabels = new Set([
    ...story.topics.map((t) => t.toLowerCase()),
    ...story.entities.map((e) => e.toLowerCase()),
  ]);
  let raw = 0;
  for (const node of ctx.interests) {
    if (node.kind !== "topic" && node.kind !== "entity" && node.kind !== "skill") continue;
    if (storyLabels.has(node.label.toLowerCase())) {
      raw += Math.max(0, node.weight); // negative-weight (disliked) nodes only ever pull score down elsewhere, never add here
    }
  }
  return raw / (raw + 1); // 0..1, diminishing returns
}

function scoreRecency(story: ScoringStory, now: Date): number {
  if (!story.published_at) return 0;
  const hours = (now.getTime() - new Date(story.published_at).getTime()) / 3_600_000;
  if (hours < 0) return 1;
  return Math.exp(-hours / RANKING_CONFIG.recencyHalfLifeHours);
}

function scoreCredibility(story: ScoringStory): number {
  const tier = story.credibility_tier ?? 3;
  const base = (5 - tier) / 4;
  return Math.min(1, base + (story.is_primary_source ? 0.1 : 0));
}

function scoreMomentum(story: ScoringStory): number {
  const count = story.cluster_story_count ?? 1;
  const velocity = story.cluster_velocity ?? 0;
  const raw = Math.log(1 + count) * Math.max(0, velocity);
  return raw / (raw + 1); // normalised 0..1
}

function scoreProximity(story: ScoringStory, ctx: ScoringUserContext): number {
  const region = story.region?.toLowerCase();
  const userCountry = ctx.country?.toLowerCase();
  const exact =
    (region && userCountry && region === userCountry) ||
    (story.entities.some((e) => ctx.company && e.toLowerCase() === ctx.company.toLowerCase())) ||
    (story.topics.some((t) => ctx.industry && t.toLowerCase() === ctx.industry.toLowerCase()));
  if (exact) return 1;
  const partial = region === "global" || (userCountry && story.entities.some((e) => e.toLowerCase().includes(userCountry)));
  return partial ? 0.5 : 0;
}

function scoreNovelty(story: ScoringStory, ctx: ScoringUserContext): number {
  if (!story.cluster_id) return 1;
  return ctx.seenClusterIds.has(story.cluster_id) ? 0 : 1;
}

function scoreFatigue(story: ScoringStory, ctx: ScoringUserContext): number {
  let servedCount = 0;
  for (const topic of story.topics) {
    servedCount = Math.max(servedCount, ctx.topicServedCounts[topic.toLowerCase()] ?? 0);
  }
  return Math.min(servedCount, RANKING_CONFIG.fatigueCapCount) / RANKING_CONFIG.fatigueCapCount;
}

export interface ScoreBreakdown {
  total: number;
  interest: number;
  recency: number;
  credibility: number;
  momentum: number;
  proximity: number;
  novelty: number;
  fatigue: number;
  explorationBonus: number;
}

// Pure, deterministic — the whole point of BRD §5's "score in code, not by
// LLM" rule. now is passed in explicitly (not read from Date.now() inside)
// so callers/tests get reproducible results.
export function scoreStory(story: ScoringStory, ctx: ScoringUserContext, now: Date): ScoreBreakdown {
  const w = RANKING_CONFIG.weights;
  const interest = scoreInterestMatch(story, ctx);
  const recency = scoreRecency(story, now);
  const credibility = scoreCredibility(story);
  const momentum = scoreMomentum(story);
  const proximity = scoreProximity(story, ctx);
  const novelty = scoreNovelty(story, ctx);
  const fatigue = scoreFatigue(story, ctx);
  const explorationBonus = ctx.isExplorationCandidate ? RANKING_CONFIG.explorationBonus : 0;

  const total =
    w.interest * interest +
    w.recency * recency +
    w.credibility * credibility +
    w.momentum * momentum +
    w.proximity * proximity +
    w.novelty * novelty -
    w.fatigue * fatigue +
    explorationBonus;

  return { total, interest, recency, credibility, momentum, proximity, novelty, fatigue, explorationBonus };
}

// ============================================================
// Diversity constraints (BRD §5 pipeline step 3)
// ============================================================

export interface ScoredCandidate {
  story: ScoringStory;
  score: ScoreBreakdown;
}

// Greedy top-N subject to max-per-cluster / max-per-publisher caps. Input
// must already be sorted by score.total desc.
export function applyDiversityConstraints(sorted: ScoredCandidate[], limit: number): ScoredCandidate[] {
  const clusterCounts = new Map<string, number>();
  const publisherCounts = new Map<string, number>();
  const out: ScoredCandidate[] = [];

  for (const candidate of sorted) {
    if (out.length >= limit) break;
    const clusterKey = candidate.story.cluster_id ?? candidate.story.id;
    const publisherKey = candidate.story.publisher ?? candidate.story.domain ?? "unknown";
    const clusterCount = clusterCounts.get(clusterKey) ?? 0;
    const publisherCount = publisherCounts.get(publisherKey) ?? 0;
    if (clusterCount >= RANKING_CONFIG.diversityMaxPerCluster) continue;
    if (publisherCount >= RANKING_CONFIG.diversityMaxPerPublisher) continue;
    out.push(candidate);
    clusterCounts.set(clusterKey, clusterCount + 1);
    publisherCounts.set(publisherKey, publisherCount + 1);
  }
  return out;
}

// Selects ~epsilon share of `finalSlotCount` from the off-profile pool
// (candidates that scored low on interest_match but aren't already in
// `selected`) and marks them as exploration for the score breakdown.
export function selectExplorationCandidates(
  allScored: ScoredCandidate[],
  selected: ScoredCandidate[],
  finalSlotCount: number
): ScoredCandidate[] {
  const selectedIds = new Set(selected.map((c) => c.story.id));
  const explorationSlots = Math.max(1, Math.round(finalSlotCount * RANKING_CONFIG.epsilon));
  const offProfilePool = allScored
    .filter((c) => !selectedIds.has(c.story.id) && c.score.interest < 0.2)
    .sort((a, b) => b.score.total - a.score.total);
  return offProfilePool.slice(0, explorationSlots);
}

// ============================================================
// Config for the learning loop (BRD §3.6 / HZ-LN-08) — lives here so
// horizon-learn (Phase 2) and any future tuning UI share one source.
// ============================================================

export const SIGNAL_WEIGHTS: Record<string, number> = {
  add_to_compass: 1.0,
  share: 0.9,
  save: 0.8,
  up: 0.7,
  open: 0.4,
  dwell: 0.2, // only counted when value (seconds) > 8
  skip: -0.2, // only applied after 3+ repeats on the same topic
  down: -0.7, // modulated by reason at apply time
  mute_topic: -1.0,
  mute_source: -1.0,
};

export const LEARNING_CONFIG = {
  maxDailyWeightDeltaPerNode: 0.15,
  decayHalfLifeDays: 90,
  muteDefaultDays: 30,
};
