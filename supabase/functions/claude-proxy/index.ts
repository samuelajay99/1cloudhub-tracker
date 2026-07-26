// Supabase Edge Function: the only place the real Anthropic API key exists.
// The Electron app and website never see it — they call this function with
// the signed-in user's Supabase session token instead.
//
// Deploy with:  supabase functions deploy claude-proxy
// Secret needed:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// the Supabase Edge Function runtime — no need to set those yourself.)

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "missing bearer token" }, 401);
  }

  // Verify the caller's session and look up their approval status. Uses the
  // service role key so this check can't be bypassed by RLS quirks or a
  // stale client — this function is the trust boundary.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: "invalid session" }, 401);
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", userData.user.id)
    .single();

  if (profileErr || !profile) {
    return json({ error: "profile not found" }, 403);
  }
  if (profile.status !== "approved") {
    return json({ error: "account not approved" }, 403);
  }

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (!body.prompt || typeof body.prompt !== "string") {
    return json({ error: "missing prompt" }, 400);
  }

  const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: body.prompt }],
    }),
  });

  if (!anthropicResp.ok) {
    const errText = await anthropicResp.text();
    return json({ error: `anthropic error: ${anthropicResp.status} ${errText}` }, 502);
  }

  const data = await anthropicResp.json();
  const text = data?.content?.[0]?.text || "";
  return json({ text });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
