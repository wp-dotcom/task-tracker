import { useCallback, useEffect, useState } from 'react';
import { fetchTaskEvents } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { TaskEvent } from '../types';

/** Activity timeline for a single task. Pass null to skip fetching. */
export function useTaskEvents(taskId: string | null) {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!taskId) {
      setEvents([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTaskEvents(taskId);
      setEvents(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { events, loading, error, refresh };
}
