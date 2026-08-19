import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createTaskReminder, deleteTaskReminder, fetchTaskReminders } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { useAuth } from '../context/AuthContext';
import type { TaskReminder } from '../types';

/** "Remind me before it's due" offsets on a single task. Pass null to skip fetching (modal closed). */
export function useTaskReminders(taskId: string | null) {
  const { session } = useAuth();
  const [reminders, setReminders] = useState<TaskReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!taskId) {
      setReminders([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTaskReminders(taskId);
      setReminders(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates while the task's details are open — so a reminder either
  // side adds/removes shows up for the other without needing to reopen.
  useEffect(() => {
    if (!taskId || !session) return;
    const channel = supabase
      .channel(`task-reminders-${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_reminders', filter: `task_id=eq.${taskId}` },
        () => {
          refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, session, refresh]);

  const addReminder = useCallback(
    async (offsetMinutes: number) => {
      if (!taskId || !session) throw new Error('Not signed in');
      await createTaskReminder(taskId, offsetMinutes, session.user.id);
      await refresh();
    },
    [taskId, session, refresh],
  );

  const removeReminder = useCallback(async (offsetMinutes: number) => {
    const existing = reminders.find((r) => r.offset_minutes === offsetMinutes);
    if (!existing) return;
    setReminders((prev) => prev.filter((r) => r.id !== existing.id));
    try {
      await deleteTaskReminder(existing.id);
    } catch (err) {
      // Roll back the optimistic removal so the checkbox doesn't lie about
      // what's actually saved.
      setReminders((prev) => [...prev, existing].sort((a, b) => a.offset_minutes - b.offset_minutes));
      throw err;
    }
  }, [reminders]);

  return { reminders, loading, error, addReminder, removeReminder };
}
