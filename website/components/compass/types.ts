// Data shapes for Compass, ported near-verbatim from the vanilla Electron
// app's implicit object shapes in app/index.html (see noteToRow/rowToNote,
// taskToRow/rowToTask, and loadEmailData/saveEmailData). These must match
// the Postgres columns in supabase/migrations/0001_init.sql exactly — see
// useCompassData.ts for the row<->object mapping functions.

export type TaskType = 'Task' | 'Follow-up';
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskStatus = 'Open' | 'In Progress' | 'Waiting on Others' | 'Done';
export type MinutesSource = 'note' | 'transcript';

// The two notification-worthy states a task can be in — see
// notifications/taskNotifications.ts for how a task's current bucket is
// computed and compared against these dismissal fields.
export type TaskNotificationBucket = 'due_today' | 'overdue';

export interface Note {
  id: string;
  title: string;
  body: string; // sanitized rich HTML (see utils.ts sanitizeNoteHtml) — NOT plain text
  transcript: string;
  includeTranscriptInExtract: boolean;
  minutes: string | null;
  minutesGeneratedAt: string | null; // ISO timestamp
  minutesSource: MinutesSource | null;
  lastExtractedHash: string | null; // simpleHash() output, stored as a string (see rowToNote)
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface Task {
  id: string;
  item: string;
  parent: string | null; // exact `item` text of a prerequisite task in the same note, or null
  type: TaskType | null;
  related: string | null; // person/team
  priority: TaskPriority | null;
  status: TaskStatus | null;
  due: string | null; // YYYY-MM-DD
  notes: string | null;
  sourceNoteId: string | null;
  sourceNoteTitle: string | null;
  manual: boolean;
  deleted: boolean; // soft-delete flag — Trash/Undo, never a real row delete
  createdAt: string; // ISO timestamp
  // Which notification bucket the user last dismissed this task from, and
  // when — null/null if never dismissed (or dismissed so long ago it no
  // longer matters — see taskNotifications.ts, which compares this against
  // the task's CURRENT bucket rather than trusting these fields alone).
  notifiedDismissedBucket: TaskNotificationBucket | null;
  notifiedDismissedAt: string | null;
}

export interface EmailWorkspace {
  context: string;
  instructions: string;
  subject: string;
  body: string;
}
