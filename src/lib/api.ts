import { supabase } from './supabase';
import type {
  CalendarEvent,
  CalendarEventWithCreator,
  CreateCalendarEventInput,
  CreateTaskInput,
  CreateTaskRecurrenceInput,
  CreateTaskTemplateInput,
  Profile,
  PushSubscriptionRecord,
  Task,
  TaskComment,
  TaskEvent,
  TaskPhoto,
  TaskTemplate,
  TaskUrgency,
  TaskWithProfiles,
  UpdateCalendarEventInput,
  UpdateTaskInput,
  UpdateTaskTemplateInput,
  UrgencySetting,
} from '../types';

const TASK_SELECT_WITH_PROFILES = `
  *,
  assignee:profiles!tasks_assigned_to_fkey ( id, full_name, email ),
  creator:profiles!tasks_created_by_fkey ( id, full_name, email ),
  recurrence:task_recurrences!tasks_recurrence_id_fkey ( frequency, active )
`;

/** Fetch tasks visible to the current user (RLS narrows this automatically). */
export async function fetchTasks(): Promise<TaskWithProfiles[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT_WITH_PROFILES)
    .order('due_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as TaskWithProfiles[];
}

export async function fetchTaskById(taskId: string): Promise<TaskWithProfiles> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT_WITH_PROFILES)
    .eq('id', taskId)
    .single();

  if (error) throw error;
  return data as unknown as TaskWithProfiles;
}

export async function createTask(input: CreateTaskInput, createdBy: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      assigned_to: input.assigned_to,
      created_by: createdBy,
      due_date: input.due_date,
      due_time: input.due_time,
      urgency: input.urgency,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.description !== undefined) payload.description = input.description.trim();
  if (input.assigned_to !== undefined) payload.assigned_to = input.assigned_to;
  if (input.due_date !== undefined) payload.due_date = input.due_date;
  if (input.due_time !== undefined) payload.due_time = input.due_time;
  if (input.urgency !== undefined) payload.urgency = input.urgency;

  const { data, error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

/**
 * Admin-only drag-and-drop reschedule — a thin wrapper around updateTask.
 * `dueTime` is only passed when dragging a timed event in week/day view;
 * `undefined` leaves the task's existing due_time untouched, while `null`
 * would clear it (not currently triggered from the calendar).
 */
export async function rescheduleTask(
  taskId: string,
  dueDate: string,
  dueTime?: string | null,
): Promise<Task> {
  const payload: UpdateTaskInput = { due_date: dueDate };
  if (dueTime !== undefined) payload.due_time = dueTime;
  return updateTask(taskId, payload);
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
}

/** Employee opens a task's details — records first_viewed_at/last_viewed_at server-side. */
export async function markTaskViewed(taskId: string): Promise<Task> {
  const { data, error } = await supabase.rpc('mark_task_viewed', { p_task_id: taskId });
  if (error) throw error;
  return data as Task;
}

export async function completeTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase.rpc('complete_task', { p_task_id: taskId });
  if (error) throw error;
  return data as Task;
}

export async function reopenTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase.rpc('reopen_task', { p_task_id: taskId });
  if (error) throw error;
  return data as Task;
}

// ---- Recurring tasks --------------------------------------------------------

/**
 * Starts a new repeating task: inserts the recurrence definition, then asks
 * the database to materialize its occurrences (including the first one,
 * dated `input.start_date`), and returns that first occurrence so the
 * caller can treat it just like a normal newly-created task (e.g. mark it
 * viewed, open its details).
 */
export async function createTaskRecurrence(
  input: CreateTaskRecurrenceInput,
  createdBy: string,
): Promise<Task> {
  const { data: recurrence, error: recurrenceError } = await supabase
    .from('task_recurrences')
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      urgency: input.urgency,
      assigned_to: input.assigned_to,
      created_by: createdBy,
      frequency: input.frequency,
      due_time: input.due_time,
      start_date: input.start_date,
    })
    .select()
    .single();
  if (recurrenceError) throw recurrenceError;

  await ensureRecurringTaskInstances();

  const { data: firstTask, error: firstTaskError } = await supabase
    .from('tasks')
    .select()
    .eq('recurrence_id', recurrence.id)
    .order('due_date', { ascending: true })
    .limit(1)
    .single();
  if (firstTaskError) throw firstTaskError;
  return firstTask as Task;
}

/**
 * Tops up every active recurrence's generated task rows for the next ~60
 * days. Cheap/no-op when already topped up. Called once per session on
 * login, and right after creating a new recurring task.
 */
export async function ensureRecurringTaskInstances(): Promise<void> {
  const { error } = await supabase.rpc('ensure_recurring_task_instances');
  if (error) throw error;
}

/**
 * Ends a repeating series: stops generating new occurrences and removes any
 * still-open, not-yet-due occurrences already generated. Completed/past
 * occurrences are left in place as history.
 */
export async function stopTaskRecurrence(recurrenceId: string): Promise<void> {
  const { error } = await supabase.rpc('stop_task_recurrence', { p_recurrence_id: recurrenceId });
  if (error) throw error;
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function fetchEmployees(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'employee')
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function fetchTaskEvents(taskId: string): Promise<TaskEvent[]> {
  const { data, error } = await supabase
    .from('task_events')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TaskEvent[];
}

// ---- Task templates (presets) --------------------------------------------

export async function fetchTaskTemplates(): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .order('title');
  if (error) throw error;
  return (data ?? []) as TaskTemplate[];
}

export async function createTaskTemplate(
  input: CreateTaskTemplateInput,
  createdBy: string,
): Promise<TaskTemplate> {
  const { data, error } = await supabase
    .from('task_templates')
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      urgency: input.urgency,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TaskTemplate;
}

export async function updateTaskTemplate(
  templateId: string,
  input: UpdateTaskTemplateInput,
): Promise<TaskTemplate> {
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.description !== undefined) payload.description = input.description.trim();
  if (input.urgency !== undefined) payload.urgency = input.urgency;

  const { data, error } = await supabase
    .from('task_templates')
    .update(payload)
    .eq('id', templateId)
    .select()
    .single();
  if (error) throw error;
  return data as TaskTemplate;
}

export async function deleteTaskTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.from('task_templates').delete().eq('id', templateId);
  if (error) throw error;
}

// ---- Urgency colors ---------------------------------------------------------

export async function fetchUrgencySettings(): Promise<UrgencySetting[]> {
  const { data, error } = await supabase.from('urgency_settings').select('*');
  if (error) throw error;
  return (data ?? []) as UrgencySetting[];
}

export async function updateUrgencyColor(urgency: TaskUrgency, color: string): Promise<void> {
  const { error } = await supabase
    .from('urgency_settings')
    .update({ color })
    .eq('urgency', urgency);
  if (error) throw error;
}

// ---- Calendar events (employee-added appointments/deliveries) --------------

const CALENDAR_EVENT_SELECT_WITH_CREATOR = `
  *,
  creator:profiles!calendar_events_created_by_fkey ( id, full_name, email )
`;

/** Fetch every calendar event — shared visibility, so no filtering by user. */
export async function fetchCalendarEvents(): Promise<CalendarEventWithCreator[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(CALENDAR_EVENT_SELECT_WITH_CREATOR)
    .order('event_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CalendarEventWithCreator[];
}

export async function createCalendarEvent(
  input: CreateCalendarEventInput,
  createdBy: string,
): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      event_type: input.event_type,
      event_date: input.event_date,
      event_time: input.event_time,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CalendarEvent;
}

export async function updateCalendarEvent(
  eventId: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEvent> {
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.description !== undefined) payload.description = input.description.trim();
  if (input.event_type !== undefined) payload.event_type = input.event_type;
  if (input.event_date !== undefined) payload.event_date = input.event_date;
  if (input.event_time !== undefined) payload.event_time = input.event_time;

  const { data, error } = await supabase
    .from('calendar_events')
    .update(payload)
    .eq('id', eventId)
    .select()
    .single();
  if (error) throw error;
  return data as CalendarEvent;
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', eventId);
  if (error) throw error;
}

// ---- Task comments (two-way notes) ------------------------------------------

const TASK_COMMENT_SELECT_WITH_AUTHOR = `
  *,
  author:profiles!task_comments_author_id_fkey ( id, full_name, email )
`;

export async function fetchTaskComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase
    .from('task_comments')
    .select(TASK_COMMENT_SELECT_WITH_AUTHOR)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TaskComment[];
}

export async function createTaskComment(
  taskId: string,
  body: string,
  authorId: string,
): Promise<TaskComment> {
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, author_id: authorId, body: body.trim() })
    .select(TASK_COMMENT_SELECT_WITH_AUTHOR)
    .single();
  if (error) throw error;
  return data as unknown as TaskComment;
}

export async function deleteTaskComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('task_comments').delete().eq('id', commentId);
  if (error) throw error;
}

// ---- Task photos (attachments) ----------------------------------------------

const TASK_PHOTO_SELECT_WITH_UPLOADER = `
  *,
  uploader:profiles!task_photos_uploaded_by_fkey ( id, full_name, email )
`;

const TASK_PHOTOS_BUCKET = 'task-photos';

export async function fetchTaskPhotos(taskId: string): Promise<TaskPhoto[]> {
  const { data, error } = await supabase
    .from('task_photos')
    .select(TASK_PHOTO_SELECT_WITH_UPLOADER)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TaskPhoto[];
}

/** Public Storage URL for a photo's storage_path — safe to use directly as an <img src>. */
export function taskPhotoUrl(storagePath: string): string {
  return supabase.storage.from(TASK_PHOTOS_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/**
 * Uploads a photo file to Storage (path "<taskId>/<random>.<ext>", enforced
 * by the task_photos_storage_insert policy) and records it in task_photos.
 * If the metadata insert fails after a successful upload (rare — e.g. a
 * network blip), the now-orphaned Storage object is best-effort cleaned up
 * so it doesn't linger with no matching row.
 */
export async function uploadTaskPhoto(
  taskId: string,
  file: File,
  uploadedBy: string,
): Promise<TaskPhoto> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const random = crypto.randomUUID();
  const storagePath = `${taskId}/${random}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(TASK_PHOTOS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('task_photos')
    .insert({ task_id: taskId, uploaded_by: uploadedBy, storage_path: storagePath })
    .select(TASK_PHOTO_SELECT_WITH_UPLOADER)
    .single();

  if (error) {
    await supabase.storage.from(TASK_PHOTOS_BUCKET).remove([storagePath]).catch(() => {});
    throw error;
  }

  return data as unknown as TaskPhoto;
}

export async function deleteTaskPhoto(photoId: string, storagePath: string): Promise<void> {
  const { error } = await supabase.from('task_photos').delete().eq('id', photoId);
  if (error) throw error;
  // Best-effort — the metadata row (the thing RLS/the UI actually cares
  // about) is already gone even if this second cleanup step fails.
  await supabase.storage.from(TASK_PHOTOS_BUCKET).remove([storagePath]).catch(() => {});
}

// -----------------------------------------------------------------------------
// Calendar subscribe feed
// -----------------------------------------------------------------------------

export async function fetchMyFeedToken(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('feed_token')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return (data as { feed_token: string }).feed_token;
}

/** Regenerates the caller's own feed token (e.g. if the link was shared/leaked) and returns the new one. */
export async function regenerateMyFeedToken(): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_my_feed_token');
  if (error) throw error;
  return data as string;
}

// -----------------------------------------------------------------------------
// Push notifications
// -----------------------------------------------------------------------------

export async function fetchMyPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
  const { data, error } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as PushSubscriptionRecord[];
}

export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
      { onConflict: 'endpoint' },
    );
  if (error) throw error;
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
}
