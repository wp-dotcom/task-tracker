import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { CreateTaskTemplateInput, TaskTemplate, UpdateTaskTemplateInput } from '../types';

/** Admin's reusable task presets. Only ever used from admin-only screens. */
export function useTaskTemplates() {
  const { session } = useAuth();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await api.fetchTaskTemplates();
      setTemplates(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createTemplate = useCallback(
    async (input: CreateTaskTemplateInput) => {
      if (!session) throw new Error('Not signed in');
      const created = await api.createTaskTemplate(input, session.user.id);
      await refresh();
      return created;
    },
    [session, refresh],
  );

  const updateTemplate = useCallback(
    async (templateId: string, input: UpdateTaskTemplateInput) => {
      await api.updateTaskTemplate(templateId, input);
      await refresh();
    },
    [refresh],
  );

  const deleteTemplate = useCallback(async (templateId: string) => {
    await api.deleteTaskTemplate(templateId);
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
  }, []);

  return { templates, loading, error, refresh, createTemplate, updateTemplate, deleteTemplate };
}
