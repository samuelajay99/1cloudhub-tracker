// Beacon: participant registration/rejoin.
// Participants have no Supabase Auth session — this function (running with
// the service-role key) is the only way a browser gets into a
// beacon_participants row. It hands back an opaque session_token (the
// participant row's own id) for the browser to store and reuse on every
// later beacon-submit call and on refresh/rejoin.
//
// Deploy with:  supabase functions deploy beacon-join
// No secrets needed — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are injected
// automatically by the Edge Function runtime.

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, json, toPublicQuestion, computeTallies } from "../_shared/beacon.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  let body: { join_code?: string; name?: string; email?: string; company?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const joinCode = (body.join_code || "").trim();
  const name = (body.name || "").trim().slice(0, 100);
  const email = (body.email || "").trim().toLowerCase().slice(0, 200);
  const company = (body.company || "").trim().slice(0, 150) || null;

  if (!joinCode || !name || !email) {
    return json({ error: "join_code, name, and email are required" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "invalid email address" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: event, error: eventErr } = await supabase
    .from("beacon_events")
    .select("id, title, type, status, current_question_index, current_question_started_at")
    .eq("join_code", joinCode)
    .single();

  if (eventErr || !event) {
    return json({ error: "Event not found" }, 404);
  }

  // Idempotent rejoin: same event + email reuses the existing row (and its
  // id/session_token) rather than creating a duplicate participant. Checked
  // before the status gate below — someone who already registered must be
  // able to reconnect after a refresh even once the host has closed
  // submissions (to see final results), not just while it's still open.
  const { data: existing } = await supabase
    .from("beacon_participants")
    .select("id, name, score")
    .eq("event_id", event.id)
    .eq("email", email)
    .maybeSingle();

  // A brand-new registration is only allowed while the event is actually
  // open to join. An existing participant reconnecting is let through
  // regardless of status, so refresh/reconnect never hard-locks them out.
  if (!existing && event.status !== "published" && event.status !== "live") {
    return json({ error: "This event is not open for registration" }, 403);
  }

  let participant: { id: string; name: string; score: number };
  if (existing) {
    // Only touch company if this request actually supplied one — an older
    // client (or a rejoin call that doesn't resend it) shouldn't blank out
    // a company value that was already captured.
    const updates: { name: string; company?: string } = { name };
    if (company) updates.company = company;
    const { data: updated, error: updateErr } = await supabase
      .from("beacon_participants")
      .update(updates)
      .eq("id", existing.id)
      .select("id, name, score")
      .single();
    if (updateErr || !updated) return json({ error: "Could not join event" }, 500);
    participant = updated;
  } else {
    // Required for a brand-new registration (enforced here too, not just in
    // the join form, since this endpoint is public). Not required to
    // rejoin — an existing participant whose stored session predates this
    // field shouldn't be locked out of reconnecting.
    if (!company) {
      return json({ error: "company is required to join" }, 400);
    }
    const { data: inserted, error: insertErr } = await supabase
      .from("beacon_participants")
      .insert({ event_id: event.id, name, email, company })
      .select("id, name, score")
      .single();
    if (insertErr || !inserted) return json({ error: "Could not join event" }, 500);
    participant = inserted;
  }

  let currentQuestion = null;
  let alreadyAnswered = false;
  let results = null;

  if (event.status === "live" && event.current_question_index !== null) {
    const { data: question } = await supabase
      .from("beacon_questions")
      .select("id, order_index, title, options, correct_option_id, explanation, revealed_at, time_limit_seconds")
      .eq("event_id", event.id)
      .eq("order_index", event.current_question_index)
      .single();

    if (question) {
      currentQuestion = { ...toPublicQuestion(question), started_at: event.current_question_started_at ?? undefined };

      const { data: ownResponse } = await supabase
        .from("beacon_responses")
        .select("id")
        .eq("question_id", question.id)
        .eq("participant_id", participant.id)
        .maybeSingle();
      alreadyAnswered = !!ownResponse;

      if (question.revealed_at) {
        const { data: responses } = await supabase
          .from("beacon_responses")
          .select("option_id")
          .eq("question_id", question.id);
        const { tallies, total_responses } = computeTallies(question.options, responses || []);
        results = {
          tallies,
          total_responses,
          correct_option_id: question.correct_option_id ?? undefined,
          explanation: question.explanation ?? undefined,
        };
      }
    }
  }

  return json({
    session_token: participant.id,
    event: { id: event.id, title: event.title, type: event.type, status: event.status },
    participant: { name: participant.name, score: participant.score },
    current_question: currentQuestion,
    already_answered: alreadyAnswered,
    results,
  });
});
