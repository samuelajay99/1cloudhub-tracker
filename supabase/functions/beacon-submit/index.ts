// Beacon: participant answer submission.
// Resolving session_token to a beacon_participants row IS the auth check —
// participants never had a Supabase Auth session in the first place.
// Correctness/scoring is entirely server-side: the client never sees
// correct_option_id/points before this function computes the result.
//
// Deploy with:  supabase functions deploy beacon-submit
// No secrets needed — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are injected
// automatically by the Edge Function runtime.

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, json, computeTallies, broadcastToChannel } from "../_shared/beacon.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  let body: {
    session_token?: string;
    question_id?: string;
    option_id?: string;
    response_time_ms?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const sessionToken = body.session_token || "";
  const questionId = body.question_id || "";
  const optionId = body.option_id || "";
  const responseTimeMs =
    typeof body.response_time_ms === "number" ? Math.max(0, Math.round(body.response_time_ms)) : null;

  if (!sessionToken || !questionId || !optionId) {
    return json({ error: "session_token, question_id, and option_id are required" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: participant, error: participantErr } = await supabase
    .from("beacon_participants")
    .select("id, event_id")
    .eq("id", sessionToken)
    .single();
  if (participantErr || !participant) {
    return json({ error: "Invalid session" }, 401);
  }

  const { data: question, error: questionErr } = await supabase
    .from("beacon_questions")
    .select("id, event_id, order_index, options, correct_option_id, points, revealed_at")
    .eq("id", questionId)
    .single();
  if (questionErr || !question) {
    return json({ error: "Question not found" }, 404);
  }
  if (question.event_id !== participant.event_id) {
    return json({ error: "Question does not belong to this event" }, 403);
  }

  const { data: event, error: eventErr } = await supabase
    .from("beacon_events")
    .select("id, type, status, current_question_index")
    .eq("id", participant.event_id)
    .single();
  if (eventErr || !event) {
    return json({ error: "Event not found" }, 404);
  }
  if (event.status !== "live") {
    return json({ error: "This event is not currently live" }, 403);
  }
  if (event.current_question_index !== question.order_index) {
    return json({ error: "This question is no longer open" }, 403);
  }

  const options: { id: string; label: string }[] = question.options || [];
  if (!options.some((o) => o.id === optionId)) {
    return json({ error: "Invalid option" }, 400);
  }

  const isCorrect = event.type === "quiz" ? optionId === question.correct_option_id : null;
  const pointsAwarded = isCorrect ? question.points : 0;

  const { error: insertErr } = await supabase.from("beacon_responses").insert({
    event_id: participant.event_id,
    question_id: questionId,
    participant_id: participant.id,
    option_id: optionId,
    is_correct: isCorrect,
    points_awarded: pointsAwarded,
    response_time_ms: responseTimeMs,
  });

  let finalIsCorrect = isCorrect;
  let finalPoints = pointsAwarded;

  if (insertErr) {
    // 23505 = unique_violation on (question_id, participant_id) — a retry
    // of an already-accepted submission (flaky network, double-tap). Not an
    // error: return the already-recorded result. Only the winning insert
    // path above may touch score — this path must never call the
    // increment RPC, or a retry would double-count.
    if (insertErr.code === "23505") {
      const { data: existing } = await supabase
        .from("beacon_responses")
        .select("is_correct, points_awarded")
        .eq("question_id", questionId)
        .eq("participant_id", participant.id)
        .single();
      if (!existing) return json({ error: "Could not record response" }, 500);
      finalIsCorrect = existing.is_correct;
      finalPoints = existing.points_awarded;
    } else {
      return json({ error: "Could not record response" }, 500);
    }
  } else {
    if (pointsAwarded > 0) {
      await supabase.rpc("increment_beacon_score", {
        p_participant_id: participant.id,
        p_delta: pointsAwarded,
      });
    }

    const [{ count: questionCount }, { count: responseCount }] = await Promise.all([
      supabase
        .from("beacon_questions")
        .select("id", { count: "exact", head: true })
        .eq("event_id", participant.event_id),
      supabase
        .from("beacon_responses")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", participant.id),
    ]);
    if (questionCount !== null && responseCount !== null && responseCount >= questionCount) {
      await supabase
        .from("beacon_participants")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", participant.id);
    }

    const { data: allResponses } = await supabase
      .from("beacon_responses")
      .select("option_id")
      .eq("question_id", questionId);
    const { tallies, total_responses } = computeTallies(options, allResponses || []);

    const [{ count: registeredCount }, { count: completedCount }] = await Promise.all([
      supabase
        .from("beacon_participants")
        .select("id", { count: "exact", head: true })
        .eq("event_id", participant.event_id),
      supabase
        .from("beacon_participants")
        .select("id", { count: "exact", head: true })
        .eq("event_id", participant.event_id)
        .not("completed_at", "is", null),
    ]);

    await broadcastToChannel(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, `beacon:event:${participant.event_id}`, {
      type: "tally_update",
      payload: {
        question_id: questionId,
        tallies,
        total_responses,
        registered_count: registeredCount || 0,
        completed_count: completedCount || 0,
        pending_count: (registeredCount || 0) - (completedCount || 0),
      },
    });
  }

  const { data: updatedParticipant } = await supabase
    .from("beacon_participants")
    .select("score")
    .eq("id", participant.id)
    .single();

  return json({
    result: {
      is_correct: finalIsCorrect,
      points_awarded: finalPoints,
      your_score: updatedParticipant?.score ?? 0,
    },
  });
});
