// Shared types + pure helpers for Beacon. The Edge Functions
// (supabase/functions/beacon-join, beacon-submit) run in Deno and can't
// import this file directly — their copy of leaderboard/tally logic has to
// be kept in sync by hand.

export type EventType = 'poll' | 'quiz';
export type EventStatus = 'draft' | 'published' | 'live' | 'closed' | 'archived';
export type AppAccessStatus = 'pending' | 'approved' | 'rejected';
export type LeaderboardScope = 'top5' | 'top10' | 'full';
export type RaffleEligibility = 'all' | 'completed' | 'min_score';

export interface AppAccess {
  id: string;
  user_id: string;
  app_id: string;
  status: AppAccessStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export interface QuestionOption {
  id: string;
  label: string;
}

export interface BeaconEvent {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  type: EventType;
  status: EventStatus;
  join_code: string | null;
  current_question_index: number | null;
  current_question_started_at: string | null;
  leaderboard_visible: boolean;
  leaderboard_scope: LeaderboardScope | null;
  raffle_enabled: boolean;
  raffle_winner_count: number | null;
  raffle_eligibility: RaffleEligibility | null;
  raffle_min_score: number | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  live_started_at: string | null;
  closed_at: string | null;
  archived_at: string | null;
}

export interface BeaconQuestion {
  id: string;
  event_id: string;
  order_index: number;
  title: string;
  options: QuestionOption[];
  correct_option_id: string | null;
  points: number;
  time_limit_seconds: number | null;
  explanation: string | null;
  revealed_at: string | null;
  created_at: string;
}

export interface BeaconParticipant {
  id: string;
  event_id: string;
  name: string;
  email: string;
  score: number;
  completed_at: string | null;
  created_at: string;
}

export interface BeaconResponse {
  id: string;
  event_id: string;
  question_id: string;
  participant_id: string;
  option_id: string;
  is_correct: boolean | null;
  points_awarded: number;
  response_time_ms: number | null;
  created_at: string;
}

export interface BeaconRaffleWinner {
  id: string;
  event_id: string;
  participant_id: string;
  drawn_at: string;
}

export interface Tally {
  option_id: string;
  count: number;
  pct: number;
}

export type BeaconMessage =
  | {
      type: 'question_started';
      payload: {
        question_id: string;
        index: number;
        title: string;
        options: QuestionOption[];
        total_questions: number;
        time_limit_seconds?: number;
        started_at: string;
      };
    }
  | {
      type: 'results_revealed';
      payload: {
        question_id: string;
        tallies: Tally[];
        total_responses: number;
        correct_option_id?: string;
        explanation?: string;
      };
    }
  | {
      type: 'tally_update';
      payload: {
        question_id: string;
        tallies: Tally[];
        total_responses: number;
        registered_count: number;
        completed_count: number;
        pending_count: number;
      };
    }
  | {
      type: 'leaderboard_shown';
      payload: { scope: LeaderboardScope; rows: { participant_id: string; name: string; score: number; rank: number }[] };
    }
  | { type: 'raffle_drawn'; payload: { winners: { participant_id: string; name: string }[] } }
  | { type: 'podium_shown'; payload: { rows: { participant_id: string; name: string; score: number; rank: number }[] } }
  | { type: 'event_closed'; payload: Record<string, never> };

// Unambiguous alphabet: no 0/O or 1/I/L confusion when read off a screen.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJoinCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

export function newOptionId(): string {
  return `opt_${Math.random().toString(36).slice(2, 9)}`;
}

// Score desc, then fastest completion time (earliest completed_at) breaks ties.
export function leaderboardSort<T extends { score: number; completed_at: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.completed_at ? new Date(a.completed_at).getTime() : Infinity;
    const bTime = b.completed_at ? new Date(b.completed_at).getTime() : Infinity;
    return aTime - bTime;
  });
}

export function computeTallies(
  options: QuestionOption[],
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

export function beaconChannelTopic(eventId: string): string {
  return `beacon:event:${eventId}`;
}

// Kahoot-style speed bonus: a correct answer is worth 100% of the
// question's points right at the buzzer, decaying linearly down to 50% by
// the time the limit runs out — being right always beats being fast, but
// being fast still matters. Questions with no time limit always award full
// points (today's original, simpler behavior). Mirrored server-side in
// supabase/functions/beacon-submit/index.ts, which is the actual source of
// truth — this copy is for client-side display/preview only.
export function computeSpeedPoints(basePoints: number, elapsedMs: number, timeLimitSeconds: number | null): number {
  if (!timeLimitSeconds || timeLimitSeconds <= 0) return basePoints;
  const clampedElapsed = Math.max(0, Math.min(elapsedMs, timeLimitSeconds * 1000));
  const speedFactor = 1 - (clampedElapsed / (timeLimitSeconds * 1000)) * 0.5;
  return Math.round(basePoints * speedFactor);
}
