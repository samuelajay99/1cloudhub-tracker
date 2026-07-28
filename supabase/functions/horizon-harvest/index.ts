// Supabase Edge Function: shared harvest pipeline for Horizon.
//
// Searches per BEAT (topic), not per user — cost scales with topic count,
// not user count (BRD HZ-HV-02). Phase 1: beats are hardcoded (10 broad
// professional topics) rather than derived from the union of all users'
// interest graphs — BRD §9 build sequence explicitly asks to verify
// harvest quality manually before wiring it to the real interest graph.
//
// Deploy with:  supabase functions deploy horizon-harvest
// Secrets needed:  ANTHROPIC_API_KEY (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// are injected automatically by the Edge Function runtime).
//
// Trigger: meant for pg_cron (3-4x/day per BRD HZ-HV-01). No human caller
// to verify against `profiles`, so this checks the caller presented a
// service-role token instead. It does NOT re-verify the JWT signature
// itself — Supabase's Edge Function gateway already rejects any request
// whose Authorization bearer token isn't a validly-signed JWT for this
// project before the request ever reaches this code (that's the default
// `verify_jwt` behaviour for a deployed function), so decoding the
// payload here to check `role` is safe, not just convenient. Until
// horizon-scheduler + pg_cron land in Phase 2, invoke manually:
//   curl -X POST https://<project>.supabase.co/functions/v1/horizon-harvest \
//     -H "Authorization: Bearer <service_role key from Settings -> API>"

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, json, canonicalizeUrl, hashUrl } from "../_shared/horizon.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Decodes (does not re-verify — see the comment above) the JWT payload to
// read its `role` claim.
function decodeJwtRole(token: string): string | null {
  try {
    const payloadSegment = token.split(".")[1];
    const padded = payloadSegment.padEnd(payloadSegment.length + ((4 - (payloadSegment.length % 4)) % 4), "=");
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

// Broad professional beats covering Horizon's three personas (BRD §2: IT
// IC, leader, client-facing professional). Phase 2 replaces this with the
// deduplicated union of every active user's interest-graph topics.
const DEFAULT_BEATS = [
  "artificial intelligence and cloud computing industry news",
  "cybersecurity threats, breaches and vulnerabilities",
  "global technology industry mergers, acquisitions and funding",
  "enterprise software and SaaS product launches",
  "India technology and startup ecosystem news",
  "technology regulation, compliance and government policy",
  "DevOps, cloud infrastructure and platform engineering",
  "financial services and fintech industry news",
  "business leadership, strategy and workplace trends",
  "AI agents, large language models and developer tools",
];

const MODEL = "claude-sonnet-5";
const STORY_WINDOW_HOURS_FOR_CLUSTERING = 48;

interface CandidateStory {
  url: string;
  title: string;
  publisher?: string;
  published_at?: string | null;
  summary: string;
  topics?: string[];
  entities?: string[];
  region?: string;
  is_primary_source?: boolean;
  read_minutes?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (decodeJwtRole(token) !== "service_role") {
    return json({ error: "unauthorized — this function is for scheduled/service invocation only" }, 401);
  }

  let body: { beats?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — use defaults
  }
  const beats = body.beats && body.beats.length > 0 ? body.beats : DEFAULT_BEATS;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startedAt = new Date();
  let storiesFound = 0;
  let storiesNew = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const beatErrors: string[] = [];

  // Beats run in parallel, not sequentially — 10 beats x (a Claude call
  // with multiple web_search rounds + per-candidate URL validation) run
  // one after another blows well past the Edge Function platform's
  // wall-clock/compute limit (hit in practice as WORKER_RESOURCE_LIMIT).
  // Running them concurrently keeps total wall time close to the single
  // slowest beat instead of the sum of all ten. Candidate persistence
  // within a beat is parallelized the same way, since URL-liveness
  // validation (a HEAD/GET per candidate) is the other slow part.
  const beatResults = await Promise.allSettled(
    beats.map(async (beat) => {
      const { candidates, allowedUrls, usage } = await searchBeat(beat);
      const persistResults = await Promise.allSettled(
        candidates.map((candidate) => persistCandidate(supabase, candidate, allowedUrls))
      );
      const newCount = persistResults.filter((r) => r.status === "fulfilled" && r.value).length;
      return { foundCount: candidates.length, newCount, usage };
    })
  );

  for (const result of beatResults) {
    if (result.status === "fulfilled") {
      storiesFound += result.value.foundCount;
      storiesNew += result.value.newCount;
      inputTokens += result.value.usage.input_tokens;
      outputTokens += result.value.usage.output_tokens;
    } else {
      beatErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  const finishedAt = new Date();
  await supabase.from("horizon_harvest_runs").insert({
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    beat_count: beats.length,
    stories_found: storiesFound,
    stories_new: storiesNew,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    error: beatErrors.length > 0 ? beatErrors.join(" | ") : null,
  });

  return json({
    beats: beats.length,
    stories_found: storiesFound,
    stories_new: storiesNew,
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    errors: beatErrors,
  });
});

async function searchBeat(
  beat: string
): Promise<{ candidates: CandidateStory[]; allowedUrls: Set<string>; usage: { input_tokens: number; output_tokens: number } }> {
  const prompt = `Search for the most notable, genuinely newsworthy stories from the last 48 hours on this beat: "${beat}".

Find 3-6 distinct real-world stories (not the same event repeated across outlets). For each, write a summary IN YOUR OWN WORDS — never copy source sentences. You may include at most one short quotation (under 15 words) per story, only where the exact wording matters.

After searching, respond with ONLY a JSON array (no prose before or after, no markdown code fences) where each element has exactly these fields:
{
  "url": "the exact URL from your search results — never invent or guess a URL",
  "title": "a clear, rewritten headline (not copied verbatim from the source)",
  "publisher": "outlet or organisation name",
  "published_at": "ISO 8601 date if known, otherwise null",
  "summary": "2-3 sentences in your own words",
  "topics": ["lowercase", "keyword", "tags"],
  "entities": ["Company Or Organisation Names", "Product Names"],
  "region": "ISO-ish region code like 'IN', 'US', or 'global'",
  "is_primary_source": true or false (true only for an official company blog, regulator filing, or press release, not a rewrite of one),
  "read_minutes": estimated minutes to read the ORIGINAL source article, as an integer
}

If nothing genuinely notable happened on this beat in the window, return an empty array [].`;

  // Unlike validateUrl's HEAD/GET checks, this call previously had no
  // timeout — if the Anthropic request ever stalled, the whole function
  // just hung until the platform eventually killed it (this is what
  // produced WORKER_RESOURCE_LIMIT on first live runs). Fail this one
  // beat fast instead so Promise.allSettled can still return the rest.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        // Kept deliberately tight: this is straightforward extraction, not
        // multi-step reasoning, and both knobs directly bound wall-clock
        // time per beat — a real factor on Supabase Edge Functions' worker
        // resource ceiling when several beats run concurrently.
        output_config: { effort: "low" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`anthropic error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const usage = {
    input_tokens: data?.usage?.input_tokens ?? 0,
    output_tokens: data?.usage?.output_tokens ?? 0,
  };

  // HZ-HV-07: a story may only be persisted with a URL that was actually
  // returned by a search result — collect every URL the tool actually
  // surfaced, and treat that as the sole allowlist for the final parse.
  const allowedUrls = new Set<string>();
  for (const block of data?.content ?? []) {
    if (block.type !== "web_search_tool_result") continue;
    const results = Array.isArray(block.content) ? block.content : [];
    for (const r of results) {
      if (typeof r?.url === "string") {
        try {
          allowedUrls.add(canonicalizeUrl(r.url));
        } catch {
          // ignore malformed URLs from the tool
        }
      }
    }
  }

  const textBlock = (data?.content ?? []).find((b: { type: string }) => b.type === "text");
  const text: string = textBlock?.text ?? "[]";
  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]");
  let candidates: CandidateStory[] = [];
  if (jsonStart !== -1 && jsonEnd !== -1) {
    try {
      candidates = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    } catch {
      candidates = [];
    }
  }

  return { candidates, allowedUrls, usage };
}

async function persistCandidate(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  candidate: CandidateStory,
  allowedUrls: Set<string>
): Promise<boolean> {
  if (!candidate.url || !candidate.title || !candidate.summary) return false;

  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeUrl(candidate.url);
  } catch {
    return false; // malformed URL
  }

  // HZ-HV-07: reject any URL the model didn't actually get from a search result.
  if (!allowedUrls.has(canonicalUrl)) return false;

  const urlHash = await hashUrl(canonicalUrl);
  const { data: existing } = await supabase
    .from("horizon_stories")
    .select("id")
    .eq("url_hash", urlHash)
    .maybeSingle();
  if (existing) return false; // duplicate, not new

  // HZ-HV-07: any URL failing a live validation is dropped.
  const isLive = await validateUrl(canonicalUrl);
  if (!isLive) return false;

  const domain = new URL(canonicalUrl).hostname;
  const source = await ensureSource(supabase, domain);
  if (source.is_blocked) return false;

  const clusterId = await assignCluster(supabase, candidate);

  const { error } = await supabase.from("horizon_stories").insert({
    cluster_id: clusterId,
    url: canonicalUrl,
    url_hash: urlHash,
    title: candidate.title,
    publisher: candidate.publisher ?? null,
    domain,
    published_at: candidate.published_at ?? null,
    summary: candidate.summary,
    topics: (candidate.topics ?? []).map((t) => t.toLowerCase()),
    entities: candidate.entities ?? [],
    region: candidate.region ?? null,
    lens_hint: null,
    credibility_tier: source.tier,
    is_primary_source: Boolean(candidate.is_primary_source),
    read_minutes: candidate.read_minutes ?? 3,
  });

  return !error;
}

async function validateUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let resp = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal }).catch(() => null);
    if (!resp || resp.status >= 400) {
      resp = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal }).catch(() => null);
    }
    clearTimeout(timeout);
    return !!resp && resp.status < 400;
  } catch {
    return false;
  }
}

async function ensureSource(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  domain: string
): Promise<{ tier: number; is_blocked: boolean }> {
  const { data: existing } = await supabase
    .from("horizon_sources")
    .select("tier, is_blocked")
    .eq("domain", domain)
    .maybeSingle();
  if (existing) return existing;

  // Auto-register a not-yet-curated domain at a conservative default tier;
  // an admin can raise/lower/block it later (BRD HZ-AD-03, Phase 2).
  const { data: created } = await supabase
    .from("horizon_sources")
    .insert({ domain, tier: 3, is_primary: false, is_blocked: false })
    .select("tier, is_blocked")
    .single();
  return created ?? { tier: 3, is_blocked: false };
}

// Lightweight heuristic clustering (BRD HZ-HV-05 permits "a cheap model
// plus title/entity overlap heuristics" — this is the heuristic half,
// with no extra LLM call, to keep Phase 1 harvest cost and latency low).
async function assignCluster(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  candidate: CandidateStory
): Promise<string | null> {
  const entities = new Set((candidate.entities ?? []).map((e) => e.toLowerCase()));
  const titleTokens = significantTokens(candidate.title);

  const since = new Date(Date.now() - STORY_WINDOW_HOURS_FOR_CLUSTERING * 3_600_000).toISOString();
  const { data: recentData } = await supabase
    .from("horizon_stories")
    .select("id, cluster_id, title, entities")
    .gte("first_seen_at", since)
    .not("cluster_id", "is", null)
    .limit(200);
  const recent: { id: string; cluster_id: string; title: string; entities: string[] }[] = recentData ?? [];

  for (const story of recent) {
    const otherEntities: Set<string> = new Set((story.entities ?? []).map((e: string) => e.toLowerCase()));
    const entityOverlap = jaccard(entities, otherEntities);
    const titleOverlap = jaccard(titleTokens, significantTokens(story.title));
    if (entityOverlap >= 0.5 || titleOverlap >= 0.6) {
      const { data: cluster } = await supabase
        .from("horizon_story_clusters")
        .select("id, story_count, created_at")
        .eq("id", story.cluster_id)
        .single();
      if (cluster) {
        const hoursSinceCreated = Math.max(1, (Date.now() - new Date(cluster.created_at).getTime()) / 3_600_000);
        const newCount = cluster.story_count + 1;
        await supabase
          .from("horizon_story_clusters")
          .update({ story_count: newCount, velocity: newCount / hoursSinceCreated })
          .eq("id", cluster.id);
        return cluster.id;
      }
    }
  }

  const { data: newCluster } = await supabase
    .from("horizon_story_clusters")
    .insert({ canonical_title: candidate.title, canonical_summary: candidate.summary, story_count: 1, velocity: 0 })
    .select("id")
    .single();
  return newCluster?.id ?? null;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "at", "by", "is", "are",
  "as", "it", "its", "from", "that", "this", "will", "after", "over", "into", "new", "amid",
]);

function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
