import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { fetchUrgencySettings, updateUrgencyColor as apiUpdateUrgencyColor } from '../lib/api';
import { buildUrgencyMeta, DEFAULT_URGENCY_COLORS, URGENCY_META as DEFAULT_META } from '../lib/urgency';
import type { UrgencyMeta } from '../lib/urgency';
import type { TaskUrgency } from '../types';
import { getErrorMessage } from '../lib/errors';
import { useAuth } from './AuthContext';

interface UrgencyContextValue {
  urgencyMeta: Record<TaskUrgency, UrgencyMeta>;
  loading: boolean;
  error: string | null;
  updateColor: (urgency: TaskUrgency, color: string) => Promise<void>;
}

const UrgencyContext = createContext<UrgencyContextValue | undefined>(undefined);

/**
 * Loads the admin-customizable urgency colors from the database and keeps
 * them live via Realtime. Wraps the authenticated part of the app so both
 * admin and employee views render the same, current colors. Falls back to
 * the built-in defaults if the fetch fails, so a network hiccup never
 * breaks urgency badges — it just means colors momentarily aren't
 * customized.
 */
export function UrgencyProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [urgencyMeta, setUrgencyMeta] = useState<Record<TaskUrgency, UrgencyMeta>>(DEFAULT_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const rows = await fetchUrgencySettings();
      const colors = { ...DEFAULT_URGENCY_COLORS };
      rows.forEach((row) => {
        colors[row.urgency] = row.color;
      });
      setUrgencyMeta(buildUrgencyMeta(colors));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) refresh();
  }, [session, refresh]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel('urgency-settings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'urgency_settings' }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, refresh]);

  const updateColor = useCallback(
    async (urgency: TaskUrgency, color: string) => {
      await apiUpdateUrgencyColor(urgency, color);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ urgencyMeta, loading, error, updateColor }),
    [urgencyMeta, loading, error, updateColor],
  );

  return <UrgencyContext.Provider value={value}>{children}</UrgencyContext.Provider>;
}

export function useUrgency(): UrgencyContextValue {
  const ctx = useContext(UrgencyContext);
  if (!ctx) throw new Error('useUrgency must be used within an UrgencyProvider');
  return ctx;
}
