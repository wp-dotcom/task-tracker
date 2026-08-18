// Core domain types shared across the app.
// These mirror the Postgres enums/tables defined in supabase/schema.sql.

export type UserRole = 'admin' | 'employee';

export type TaskUrgency = 'low' | 'normal' | 'high' | 'urgent';

export type TaskStatus = 'open' | 'completed';

export type TaskEventType =
  | 'created'
  | 'viewed'
  | 'completed'
  | 'reopened'
  | 'edited'
  | 'due_date_changed'
  | 'urgency_changed'
  | 'deleted';

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  role: UserRole;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  created_by: string;
  due_date: string; // YYYY-MM-DD
  due_time: string | null; // HH:MM:SS
  urgency: TaskUrgency;
  status: TaskStatus;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Set when this task was generated from a repeating series; see TaskRecurrence. */
  recurrence_id: string | null;
}

/** Task joined with the profiles of the assignee/creator, used for display. */
export interface TaskWithProfiles extends Task {
  assignee?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
  creator?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
  recurrence?: Pick<TaskRecurrence, 'frequency' | 'active'> | null;
}

/** How often a recurring task repeats. */
export type TaskRecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'weekdays';

/**
 * A repeating-task definition. Expanded into individual Task rows (linked
 * via Task.recurrence_id) — see ensure_recurring_task_instances() in
 * schema.sql. Editing/completing a generated task never touches this row.
 */
export interface TaskRecurrence {
  id: string;
  title: string;
  description: string;
  urgency: TaskUrgency;
  assigned_to: string;
  created_by: string;
  frequency: TaskRecurrenceFrequency;
  due_time: string | null;
  start_date: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Payload for starting a new recurring task. */
export interface CreateTaskRecurrenceInput {
  title: string;
  description: string;
  assigned_to: string;
  urgency: TaskUrgency;
  frequency: TaskRecurrenceFrequency;
  due_time: string | null;
  start_date: string;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  user_id: string | null;
  event_type: TaskEventType;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Payload for creating a new task from the admin UI. */
export interface CreateTaskInput {
  title: string;
  description: string;
  assigned_to: string;
  due_date: string;
  due_time: string | null;
  urgency: TaskUrgency;
}

/** Payload for editing an existing task. Only admin-editable fields. */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  assigned_to?: string;
  due_date?: string;
  due_time?: string | null;
  urgency?: TaskUrgency;
}

export type TaskListFilter =
  | 'all'
  | 'open'
  | 'completed'
  | 'overdue'
  | 'not_viewed'
  | 'viewed'
  | 'urgent'
  | 'due_today'
  | 'completed_today';

/** A reusable preset the admin can pick from when creating a task. */
export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  urgency: TaskUrgency;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskTemplateInput {
  title: string;
  description: string;
  urgency: TaskUrgency;
}

export type UpdateTaskTemplateInput = Partial<CreateTaskTemplateInput>;

/** The admin-customizable accent color for one urgency level. */
export interface UrgencySetting {
  urgency: TaskUrgency;
  color: string;
  updated_at: string;
}

/**
 * A shared calendar entry (appointment or delivery) that any employee or
 * admin can add — unlike Task, it isn't assigned to anyone and has no
 * viewed/completed tracking. Always shows who added it.
 */
export type CalendarEventType = 'appointment' | 'delivery';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  event_type: CalendarEventType;
  event_date: string; // YYYY-MM-DD
  event_time: string | null; // HH:MM:SS
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** CalendarEvent joined with the creator's profile, so the UI can show "by <name>". */
export interface CalendarEventWithCreator extends CalendarEvent {
  creator?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
}

export interface CreateCalendarEventInput {
  title: string;
  description: string;
  event_type: CalendarEventType;
  event_date: string;
  event_time: string | null;
}

export interface UpdateCalendarEventInput {
  title?: string;
  description?: string;
  event_type?: CalendarEventType;
  event_date?: string;
  event_time?: string | null;
}

/** A free-form note either side leaves on a task — see task_comments in schema.sql. */
export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
}

/** A photo attached to a task. `url` is the public Storage URL, derived client-side from storage_path. */
export interface TaskPhoto {
  id: string;
  task_id: string;
  uploaded_by: string;
  storage_path: string;
  created_at: string;
  uploader?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
}
