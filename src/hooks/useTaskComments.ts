import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createTaskComment, deleteTaskComment, fetchTaskComments } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { useAuth } from '../context/AuthContext';
import type { TaskComment } from '../types';

/** Two-way notes on a single task. Pass null to skip fetching (modal closed). */
export function useTaskComments(taskId: string | null) {
  const { session } = useAuth();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!taskId) {
      setComments([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTaskComments(taskId);
      setComments(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates while the task's details are open — so a note either side
  // posts shows up for the other without needing to close and reopen.
  useEffect(() => {
    if (!taskId || !session) return;
    const channel = supabase
      .channel(`task-comments-${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_comments', filter: `task_id=eq.${taskId}` },
        () => {
          refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, session, refresh]);

  const addComment = useCallback(
    async (body: string) => {
      if (!taskId || !session) throw new Error('Not signed in');
      await createTaskComment(taskId, body, session.user.id);
      await refresh();
    },
    [taskId, session, refresh],
  );

  const removeComment = useCallback(async (commentId: string) => {
    await deleteTaskComment(commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }, []);

  return { comments, loading, error, addComment, removeComment };
}
