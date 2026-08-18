import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { deleteTaskPhoto, fetchTaskPhotos, uploadTaskPhoto } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { useAuth } from '../context/AuthContext';
import type { TaskPhoto } from '../types';

/** Photo attachments on a single task. Pass null to skip fetching (modal closed). */
export function useTaskPhotos(taskId: string | null) {
  const { session } = useAuth();
  const [photos, setPhotos] = useState<TaskPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!taskId) {
      setPhotos([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTaskPhotos(taskId);
      setPhotos(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates while the task's details are open, same pattern as
  // useTaskComments — a photo either side adds shows up without reopening.
  useEffect(() => {
    if (!taskId || !session) return;
    const channel = supabase
      .channel(`task-photos-${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_photos', filter: `task_id=eq.${taskId}` },
        () => {
          refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, session, refresh]);

  const addPhoto = useCallback(
    async (file: File) => {
      if (!taskId || !session) throw new Error('Not signed in');
      await uploadTaskPhoto(taskId, file, session.user.id);
      await refresh();
    },
    [taskId, session, refresh],
  );

  const removePhoto = useCallback(async (photoId: string, storagePath: string) => {
    await deleteTaskPhoto(photoId, storagePath);
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }, []);

  return { photos, loading, error, addPhoto, removePhoto };
}
