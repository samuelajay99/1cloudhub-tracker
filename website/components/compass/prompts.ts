// AI-prompt logic ported near-verbatim from app/index.html's callClaude(),
// extractionPrompt(), the meeting-minutes prompt builder inline in
// generateMinutesForCurrentNote(), the email-generate/apply-change prompts
// inline in the generateEmailBtn/applyRevisionBtn click handlers, and
// cleanTaskField()/parseTaskJson(). Zero logic changes — only the plumbing
// (typed error class instead of throwing + UI-gate side effect, explicit
// prompt-builder functions instead of inline strings) reflects this being a
// standalone module instead of one big inline script.

import { supabase } from '../../lib/supabase';
import { sanitizeNoteText } from './utils';
import type { Task, TaskPriority, TaskType } from './types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// ---------- callClaude ----------
// Vanilla behavior: POST { prompt } to the claude-proxy Edge Function with
// the signed-in user's session bearer token. A 403 means the account's
// approval was revoked mid-session — the vanilla app calls
// refreshGateForCurrentSession() to drop back to the auth gate. That's a
// UI-layer concern this module doesn't own, so instead it throws a
// distinguishable ClaudeCallError with code 'NOT_APPROVED' and leaves it to
// the caller (e.g. redirect to '/', same as CompassGate's own not-approved
// handling) to decide how to react.
export type ClaudeCallErrorCode = 'NOT_SIGNED_IN' | 'NOT_APPROVED' | 'API_ERROR';

export class ClaudeCallError extends Error {
  code: ClaudeCallErrorCode;
  constructor(code: ClaudeCallErrorCode, message: string) {
    super(message);
    this.name = 'ClaudeCallError';
    this.code = code;
  }
}

export async function callClaude(prompt: string): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new ClaudeCallError('NOT_SIGNED_IN', 'NOT_SIGNED_IN');
  }
  const resp = await fetch(SUPABASE_URL + '/functions/v1/claude-proxy', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ prompt }),
  });
  if (resp.status === 403) {
    throw new ClaudeCallError('NOT_APPROVED', 'NOT_APPROVED');
  }
  if (!resp.ok) {
    const errText = await resp.text();
    throw new ClaudeCallError('API_ERROR', 'API_ERROR: ' + resp.status + ' ' + errText);
  }
  const data = await resp.json();
  return data.text || '';
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Extraction prompt (note/quick-add -> structured tasks) ----------
export function extractionPrompt(title: string | null | undefined, body: string, transcript?: string | null): string {
  const today = todayStr();
  const transcriptBlock = transcript
    ? '\nMeeting transcript (also consider this when extracting tasks):\n' + transcript + '\n'
    : '';
  const header =
    'You are extracting structured tasks from a manager note' +
    (transcript ? ' and an accompanying meeting transcript' : '') +
    '. Today date is ' + today + '.';
  const instructions =
    'Return ONLY a JSON array (no markdown, no commentary) of task objects. Each object has exactly these fields: item (string, short actionable phrase), parent (string or null - set only if this is a sub-task that must happen before another item in the SAME note, set to that other item exact item text), type (Task or Follow-up), related (string or null - person/team involved), priority (High, Medium, Low - infer from urgency, default Medium), status (always Open), due (string YYYY-MM-DD or null - resolve relative dates against today), notes (string or null - extra context). If there are no actionable items, return an empty array. If there are multiple distinct actionable items, return multiple objects, using parent to link prerequisite sub-tasks.';
  return (
    header + '\n' + instructions + '\n' + 'Note title: ' + (title || '') + '\n' + 'Note body: ' + body + '\n' + transcriptBlock
  );
}

// ---------- Meeting-minutes prompt ----------
// Ported from generateMinutesForCurrentNote()'s promptParts construction.
// hasTx branch is used whenever a non-empty transcript is passed.
export function minutesPrompt(title: string | null | undefined, plainBody: string, transcript?: string | null): string {
  const hasTx = !!(transcript && transcript.trim());
  const parts: string[] = [];
  if (hasTx) {
    parts.push(
      'Write clean, well-organized meeting minutes from the transcript below. Use short sections: Attendees (if identifiable), Key Discussion Points, Decisions Made, and Action Items. Keep it concise and skimmable, plain text only (no markdown symbols like # or asterisks). Base it primarily on the transcript; use the note title/body for extra context.'
    );
    parts.push('Note title: ' + (title || ''));
    parts.push('Note context: ' + plainBody);
    parts.push('Transcript:');
    parts.push(transcript as string);
  } else {
    parts.push(
      'Write clean, well-organized meeting minutes based on the meeting notes below. The notes may be rough or fragmented - reconstruct them into: Key Discussion Points, Decisions Made, and Action Items (add Attendees only if names are clearly identifiable). Keep it concise and skimmable, plain text only (no markdown symbols like # or asterisks). Do not invent details that are not implied by the notes.'
    );
    parts.push('Note title: ' + (title || ''));
    parts.push('Meeting notes:');
    parts.push(plainBody);
  }
  return parts.join('\n');
}

// ---------- Email prompts ----------
// Ported from the generateEmailBtn and applyRevisionBtn click handlers.
export function emailGeneratePrompt(context: string, instructions: string): string {
  return [
    'You are an email writing assistant. Using the unstructured context and the instructions below, write a clear, well-organized email.',
    'Return ONLY a JSON object with exactly these fields: {"subject": string, "body": string}. No markdown, no commentary, no code fences.',
    'Unstructured context: ' + (context || '(none provided)'),
    'Instructions for tone/content/recipient/length: ' + (instructions || '(use your best judgment)'),
  ].join('\n');
}

export function emailRevisePrompt(currentSubject: string, currentBody: string, revision: string): string {
  return [
    'Here is a current email draft:',
    'Subject: ' + currentSubject,
    'Body: ' + currentBody,
    'The user wants this change applied: ' + revision,
    'Rewrite the email incorporating the requested change, keeping everything else consistent unless the change implies otherwise.',
    'Return ONLY a JSON object with exactly these fields: {"subject": string, "body": string}. No markdown, no commentary, no code fences.',
  ].join('\n');
}

// ---------- Task-extraction response parsing ----------
export function cleanTaskField(s: unknown): string | null {
  if (!s) return s as null;
  return (sanitizeNoteText(String(s)) || '').replace(/\s*\n+\s*/g, ' ').trim();
}

// Strict-JSON parse of the extraction prompt's response, with a raw-fallback
// path (matches raw against /\[[\s\S]*\]/ before parsing — tolerates a model
// wrapping the array in commentary/code fences despite being told not to).
// Throws if the extracted substring still isn't valid JSON; callers (see
// extractFromCurrentNote/quickAddTask in the vanilla app) catch that and
// fall back to a manual/raw-text task instead.
export type ParsedTask = Pick<
  Task,
  'item' | 'parent' | 'type' | 'related' | 'priority' | 'status' | 'due' | 'notes'
>;

export function parseTaskJson(raw: string, fallbackText: string): ParsedTask[] {
  const match = raw.match(/\[[\s\S]*\]/);
  const jsonStr = match ? match[0] : raw;
  let parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) parsed = [parsed];
  return parsed.map((p: Record<string, unknown>) => ({
    item: cleanTaskField(p.item) || cleanTaskField(fallbackText.slice(0, 80)) || '',
    parent: cleanTaskField(p.parent),
    type: (p.type as TaskType) || 'Task',
    related: cleanTaskField(p.related),
    priority: (['High', 'Medium', 'Low'].includes(p.priority as string) ? p.priority : 'Medium') as TaskPriority,
    status: 'Open',
    due: (p.due as string) || null,
    notes: cleanTaskField(p.notes),
  }));
}

// ---------- Email generate/revise response parsing ----------
// Strict-JSON parse of the email-generate/apply-change prompts' response,
// with a raw-fallback path (matches raw against /\{[\s\S]*\}/ before
// parsing — tolerates a model wrapping the object in commentary/code fences
// despite being told not to). Ported from the identical inline
// `raw.match(/\{[\s\S]*\}/)` + `JSON.parse` pair duplicated in both
// generateEmailBtn's and applyRevisionBtn's click handlers in
// app/index.html — vanilla has no shared helper for this (unlike
// extraction's parseTaskJson, which vanilla also inlines but which was
// already factored out above), but pulling it out here keeps EmailTab.tsx
// symmetric with NoteEditor.tsx's use of parseTaskJson. Throws if the
// extracted substring still isn't valid JSON; callers catch this the same
// way vanilla's try/catch around each handler does — there is no
// fallback-object behavior to replicate.
export interface ParsedEmail {
  subject?: string;
  body?: string;
}

export function parseEmailJson(raw: string): ParsedEmail {
  const match = raw.match(/\{[\s\S]*\}/);
  const jsonStr = match ? match[0] : raw;
  return JSON.parse(jsonStr);
}
