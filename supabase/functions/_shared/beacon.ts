// Shared helpers for the Beacon Edge Functions (beacon-join, beacon-submit).
// Participants never get a Supabase Auth session — these two functions,
// running with the service-role key, are the entire trust boundary for
// anonymous event participation. Keep answer keys (correct_option_id,
// explanation) out of anything returned here unless a question's
// revealed_at is already set.

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

export interface PublicQuestion {
  id: string;
  index: number;
  title: string;
  options: { id: string; label: string }[];
  time_limit_seconds?: number;
}

// Strips correct_option_id/explanation — the only place that boundary is
// enforced, so every caller must go through this rather than forwarding a
// raw question row.
export function toPublicQuestion(q: {
  id: string;
  order_index: number;
  title: string;
  options: { id: string; label: string }[];
  time_limit_seconds?: number | null;
}): PublicQuestion {
  return {
    id: q.id,
    index: q.order_index,
    title: q.title,
    options: q.options,
    time_limit_seconds: q.time_limit_seconds ?? undefined,
  };
}

// Kahoot-style speed bonus — mirrored in website/lib/beacon.ts for
// client-side display; this copy is the actual source of truth since
// scoring happens here, server-side, from a server-measured elapsed time.
export function computeSpeedPoints(basePoints: number, elapsedMs: number, timeLimitSeconds: number | null | undefined): number {
  if (!timeLimitSeconds || timeLimitSeconds <= 0) return basePoints;
  const clampedElapsed = Math.max(0, Math.min(elapsedMs, timeLimitSeconds * 1000));
  const speedFactor = 1 - (clampedElapsed / (timeLimitSeconds * 1000)) * 0.5;
  return Math.round(basePoints * speedFactor);
}

export interface Tally {
  option_id: string;
  count: number;
  pct: number;
}

// Server-side broadcast via Realtime's REST endpoint, not the websocket
// client. An Edge Function invocation is short-lived — subscribing a
// websocket channel just to send one message and tear it down again adds a
// handshake round-trip and a real chance of sending before the socket has
// finished joining. The REST endpoint sends the message immediately over
// plain HTTP, which is what Supabase recommends for exactly this case.
export async function broadcastToChannel(
  supabaseUrl: string,
  serviceRoleKey: string,
  topic: string,
  message: unknown
): Promise<void> {
  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      messages: [{ topic, event: "beacon", payload: message, private: false }],
    }),
  });
}

export function computeTallies(
  options: { id: string; label: string }[],
  responses: { option_id: string }[]
): { tallies: Tally[]; total_responses: number } {
  const counts = new Map<string, number>();
  for (const opt of options) counts.set(opt.id, 0);
  for (const r of responses) counts.set(r.option_id, (counts.get(r.option_id) || 0) + 1);
  const total = responses.length;
  const tallies = options.map((opt) => {
    const count = counts.get(opt.id) || 0;
    return { option_id: opt.id, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
  return { tallies, total_responses: total };
}
