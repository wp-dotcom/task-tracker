import { useState } from 'react';
import { useTaskReminders } from '../hooks/useTaskReminders';
import { getErrorMessage } from '../lib/errors';
import ReminderOffsetPicker from './ReminderOffsetPicker';

/**
 * "Remind me before it's due" push notifications for a saved task — visible
 * to anyone who can already open this task's details (see can_access_task()
 * in schema.sql), same as TaskComments/TaskPhotos, not just an admin. This
 * is deliberately its own table (task_reminders) rather than a field on the
 * task itself, specifically so an employee can set reminders on a task an
 * admin assigned them, even though they can't otherwise edit that task —
 * see the comment above task_reminders in schema.sql for why.
 *
 * Toggling a chip saves/removes it immediately (no separate Save button),
 * the same pattern TaskComments/TaskPhotos already use for their own
 * add/remove actions.
 */
export default function TaskReminders({ taskId }: { taskId: string }) {
  const { reminders, loading, addReminder, removeReminder } = useTaskReminders(taskId);
  const [pending, setPending] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(offsetMinutes: number, nextSelected: boolean) {
    setPending((prev) => [...prev, offsetMinutes]);
    setError(null);
    try {
      if (nextSelected) {
        await addReminder(offsetMinutes);
      } else {
        await removeReminder(offsetMinutes);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending((prev) => prev.filter((m) => m !== offsetMinutes));
    }
  }

  return (
    <div className="task-reminders">
      <h3>Reminders</h3>
      <p className="muted task-reminders-hint">
        Get a push notification before this task is due
        {!loading && reminders.length === 0 ? ' — none set.' : '.'}
      </p>
      <ReminderOffsetPicker
        value={reminders.map((r) => r.offset_minutes)}
        onToggle={handleToggle}
        pendingOffsets={pending}
      />
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
    </div>
  );
}
