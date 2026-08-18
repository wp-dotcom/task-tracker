import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../lib/errors';
import * as api from '../lib/api';
import type {
  CreateTaskInput,
  CreateTaskRecurrenceInput,
  Task,
  TaskWithProfiles,
  UpdateTaskInput,
} from '../types';
import { useAuth } from './AuthContext';

interface TasksContextValue {
  tasks: TaskWithProfiles[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  createTaskRecurrence: (input: CreateTaskRecurrenceInput) => Promise<Task>;
  stopRecurrence: (recurrenceId: string) => Promise<void>;
  updateTask: (taskId: string, input: UpdateTaskInput) => Promise<void>;
  rescheduleTask: (taskId: string, dueDate: string, dueTime?: string | null) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  markViewed: (taskId: string) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  reopenTask: (taskId: string) => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

export function TasksProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [tasks, setTasks] = useState<TaskWithProfiles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await api.fetchTasks();
      setTasks(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    // Top up any repeating tasks' generated occurrences for the next ~60
    // days. Best-effort: if this fails (e.g. the account's Supabase project
    // hasn't had the latest schema.sql re-run yet), don't block loading the
    // rest of the tasks. Newly generated rows arrive via the Realtime
    // subscription below, same as any other task change.
    api.ensureRecurringTaskInstances().catch((err) => {
      console.warn('Could not refresh recurring tasks:', err);
    });
    refresh();
  }, [session, refresh]);

  // Realtime: whenever any task row changes (viewed/completed/rescheduled by
  // either party, on any device), refetch so both admin and employee stay in
  // sync without a manual page refresh.
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, refresh]);

  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<Task> => {
      if (!session) throw new Error('Not signed in');
      const created = await api.createTask(input, session.user.id);
      await refresh();
      return created;
    },
    [session, refresh],
  );

  const createTaskRecurrence = useCallback(
    async (input: CreateTaskRecurrenceInput): Promise<Task> => {
      if (!session) throw new Error('Not signed in');
      const created = await api.createTaskRecurrence(input, session.user.id);
      await refresh();
      return created;
    },
    [session, refresh],
  );

  const stopRecurrence = useCallback(
    async (recurrenceId: string) => {
      await api.stopTaskRecurrence(recurrenceId);
      await refresh();
    },
    [refresh],
  );

  const updateTask = useCallback(
    async (taskId: string, input: UpdateTaskInput) => {
      await api.updateTask(taskId, input);
      await refresh();
    },
    [refresh],
  );

  const rescheduleTask = useCallback(
    async (taskId: string, dueDate: string, dueTime?: string | null) => {
      // Optimistic update so the calendar feels instant during drag/drop.
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, due_date: dueDate, ...(dueTime !== undefined ? { due_time: dueTime } : {}) }
            : t,
        ),
      );
      try {
        await api.rescheduleTask(taskId, dueDate, dueTime);
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      await api.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    },
    [],
  );

  const markViewed = useCallback(
    async (taskId: string) => {
      await api.markTaskViewed(taskId);
      await refresh();
    },
    [refresh],
  );

  const completeTask = useCallback(
    async (taskId: string) => {
      await api.completeTask(taskId);
      await refresh();
    },
    [refresh],
  );

  const reopenTask = useCallback(
    async (taskId: string) => {
      await api.reopenTask(taskId);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      tasks,
      loading,
      error,
      refresh,
      createTask,
      createTaskRecurrence,
      stopRecurrence,
      updateTask,
      rescheduleTask,
      deleteTask,
      markViewed,
      completeTask,
      reopenTask,
    }),
    [
      tasks,
      loading,
      error,
      refresh,
      createTask,
      createTaskRecurrence,
      stopRecurrence,
      updateTask,
      rescheduleTask,
      deleteTask,
      markViewed,
      completeTask,
      reopenTask,
    ],
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used within a TasksProvider');
  return ctx;
}
