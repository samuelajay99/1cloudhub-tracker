// Unit tests for the pure ranking/URL logic in horizon.ts.
// Run with: deno test supabase/functions/_shared/horizon.test.ts

import { assert, assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canonicalizeUrl,
  hashUrl,
  scoreStory,
  applyDiversityConstraints,
  selectExplorationCandidates,
  RANKING_CONFIG,
  type ScoringStory,
  type ScoringUserContext,
  type ScoredCandidate,
} from "./horizon.ts";

// ---------- canonicalizeUrl ----------

Deno.test("canonicalizeUrl strips utm/tracking params", () => {
  const url = canonicalizeUrl("https://Example.com/Post/?utm_source=twitter&utm_medium=social&id=42");
  assertEquals(url, "https://example.com/Post?id=42");
});

Deno.test("canonicalizeUrl strips www, trailing slash, fragment, default port", () => {
  const url = canonicalizeUrl("http://www.example.com:80/news/story/#comments");
  assertEquals(url, "https://example.com/news/story");
});

Deno.test("canonicalizeUrl produces same output regardless of tracking-param order", () => {
  const a = canonicalizeUrl("https://example.com/a?fbclid=1&id=9&utm_campaign=x");
  const b = canonicalizeUrl("https://example.com/a?id=9&fbclid=2&utm_campaign=y");
  assertEquals(a, b);
});

Deno.test("hashUrl is stable for equivalent URLs and differs for different ones", async () => {
  const h1 = await hashUrl(canonicalizeUrl("https://example.com/x?utm_source=a"));
  const h2 = await hashUrl(canonicalizeUrl("https://www.example.com/x/?utm_source=b"));
  const h3 = await hashUrl(canonicalizeUrl("https://example.com/y"));
  assertEquals(h1, h2);
  assert(h1 !== h3);
  assertEquals(h1.length, 64); // sha256 hex
});

// ---------- scoreStory ----------

function baseStory(overrides: Partial<ScoringStory> = {}): ScoringStory {
  return {
    id: "s1",
    cluster_id: "c1",
    publisher: "TechCrunch",
    domain: "techcrunch.com",
    published_at: new Date().toISOString(),
    topics: ["cloud"],
    entities: ["AWS"],
    region: "global",
    lens_hint: "global",
    credibility_tier: 2,
    is_primary_source: false,
    cluster_story_count: 3,
    cluster_velocity: 1.2,
    ...overrides,
  };
}

function baseCtx(overrides: Partial<ScoringUserContext> = {}): ScoringUserContext {
  return {
    interests: [{ kind: "topic", label: "cloud", weight: 0.8 }],
    country: "IN",
    city: "Bengaluru",
    industry: "IT Services",
    company: "1CloudHub",
    seenClusterIds: new Set(),
    topicServedCounts: {},
    ...overrides,
  };
}

Deno.test("scoreStory: a fresh, on-interest, credible story scores well above zero", () => {
  const result = scoreStory(baseStory(), baseCtx(), new Date());
  assert(result.total > 0.3, `expected > 0.3, got ${result.total}`);
  assertAlmostEquals(result.recency, 1, 0.05); // just published
});

Deno.test("scoreStory: recency decays with hours since publication", () => {
  const now = new Date();
  const fresh = scoreStory(baseStory({ published_at: now.toISOString() }), baseCtx(), now);
  const oldDate = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const old = scoreStory(baseStory({ published_at: oldDate }), baseCtx(), now);
  assert(fresh.recency > old.recency);
});

Deno.test("scoreStory: novelty is 0 for an already-seen cluster, 1 for a new one", () => {
  const now = new Date();
  const seen = scoreStory(baseStory({ cluster_id: "c1" }), baseCtx({ seenClusterIds: new Set(["c1"]) }), now);
  const fresh = scoreStory(baseStory({ cluster_id: "c1" }), baseCtx({ seenClusterIds: new Set(["c9"]) }), now);
  assertEquals(seen.novelty, 0);
  assertEquals(fresh.novelty, 1);
});

Deno.test("scoreStory: fatigue penalises topics served heavily in the last 3 days", () => {
  const now = new Date();
  const rested = scoreStory(baseStory({ topics: ["cloud"] }), baseCtx({ topicServedCounts: {} }), now);
  const fatigued = scoreStory(
    baseStory({ topics: ["cloud"] }),
    baseCtx({ topicServedCounts: { cloud: RANKING_CONFIG.fatigueCapCount } }),
    now
  );
  assert(fatigued.total < rested.total);
  assertEquals(fatigued.fatigue, 1);
});

Deno.test("scoreStory: primary-source credibility bonus increases score", () => {
  const now = new Date();
  const secondary = scoreStory(baseStory({ is_primary_source: false, credibility_tier: 2 }), baseCtx(), now);
  const primary = scoreStory(baseStory({ is_primary_source: true, credibility_tier: 2 }), baseCtx(), now);
  assert(primary.credibility > secondary.credibility);
});

Deno.test("scoreStory: exploration bonus only applies when explicitly flagged", () => {
  const now = new Date();
  const normal = scoreStory(baseStory(), baseCtx(), now);
  const exploring = scoreStory(baseStory(), baseCtx({ isExplorationCandidate: true }), now);
  assertAlmostEquals(exploring.total - normal.total, RANKING_CONFIG.explorationBonus, 1e-9);
});

// ---------- applyDiversityConstraints ----------

function candidate(id: string, clusterId: string, publisher: string, score: number): ScoredCandidate {
  return {
    story: baseStory({ id, cluster_id: clusterId, publisher }),
    score: { total: score, interest: 0, recency: 0, credibility: 0, momentum: 0, proximity: 0, novelty: 0, fatigue: 0, explorationBonus: 0 },
  };
}

Deno.test("applyDiversityConstraints caps items per cluster", () => {
  const sorted = [
    candidate("1", "clusterA", "PubA", 0.9),
    candidate("2", "clusterA", "PubB", 0.8),
    candidate("3", "clusterA", "PubC", 0.7), // 3rd from same cluster — dropped
    candidate("4", "clusterB", "PubD", 0.6),
  ];
  const out = applyDiversityConstraints(sorted, 10);
  assertEquals(out.map((c) => c.story.id), ["1", "2", "4"]);
});

Deno.test("applyDiversityConstraints caps items per publisher", () => {
  const sorted = [
    candidate("1", "clusterA", "SamePub", 0.9),
    candidate("2", "clusterB", "SamePub", 0.8),
    candidate("3", "clusterC", "SamePub", 0.7), // 3rd from same publisher — dropped
    candidate("4", "clusterD", "OtherPub", 0.6),
  ];
  const out = applyDiversityConstraints(sorted, 10);
  assertEquals(out.map((c) => c.story.id), ["1", "2", "4"]);
});

Deno.test("applyDiversityConstraints respects the overall limit", () => {
  const sorted = [
    candidate("1", "c1", "p1", 0.9),
    candidate("2", "c2", "p2", 0.8),
    candidate("3", "c3", "p3", 0.7),
  ];
  const out = applyDiversityConstraints(sorted, 2);
  assertEquals(out.length, 2);
});

// ---------- selectExplorationCandidates ----------

Deno.test("selectExplorationCandidates draws only from low-interest, unselected candidates", () => {
  const onInterest = { ...candidate("on", "c1", "p1", 0.9), score: { ...candidate("x", "c1", "p1", 0).score, total: 0.9, interest: 0.8 } };
  const offInterestA = { ...candidate("off-a", "c2", "p2", 0.5), score: { ...candidate("x", "c1", "p1", 0).score, total: 0.5, interest: 0.05 } };
  const offInterestB = { ...candidate("off-b", "c3", "p3", 0.4), score: { ...candidate("x", "c1", "p1", 0).score, total: 0.4, interest: 0.1 } };
  const all = [onInterest, offInterestA, offInterestB];
  const selected = [onInterest];

  const exploration = selectExplorationCandidates(all, selected, 10);
  assert(exploration.every((c) => c.score.interest < 0.2));
  assert(exploration.every((c) => c.story.id !== "on"));
});
