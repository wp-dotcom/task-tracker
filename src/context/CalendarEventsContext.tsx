import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../lib/errors';
import * as api from '../lib/api';
import type {
  CalendarEventWithCreator,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from '../types';
import { useAuth } from './AuthContext';

interface CalendarEventsContextValue {
  calendarEvents: CalendarEventWithCreator[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createCalendarEvent: (input: CreateCalendarEventInput) => Promise<void>;
  updateCalendarEvent: (eventId: string, input: UpdateCalendarEventInput) => Promise<void>;
  deleteCalendarEvent: (eventId: string) => Promise<void>;
}

const CalendarEventsContext = createContext<CalendarEventsContextValue | undefined>(undefined);

export function CalendarEventsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await api.fetchCalendarEvents();
      setCalendarEvents(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      refresh();
    }
  }, [session, refresh]);

  // Realtime: when anyone adds/edits/removes an appointment or delivery,
  // everyone else's calendar picks it up without a manual refresh.
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel('calendar-events-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
        refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, refresh]);

  const createCalendarEvent = useCallback(
    async (input: CreateCalendarEventInput) => {
      if (!session) throw new Error('Not signed in');
      await api.createCalendarEvent(input, session.user.id);
      await refresh();
    },
    [session, refresh],
  );

  const updateCalendarEvent = useCallback(
    async (eventId: string, input: UpdateCalendarEventInput) => {
      await api.updateCalendarEvent(eventId, input);
      await refresh();
    },
    [refresh],
  );

  const deleteCalendarEvent = useCallback(async (eventId: string) => {
    await api.deleteCalendarEvent(eventId);
    setCalendarEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  const value = useMemo(
    () => ({
      calendarEvents,
      loading,
      error,
      refresh,
      createCalendarEvent,
      updateCalendarEvent,
      deleteCalendarEvent,
    }),
    [calendarEvents, loading, error, refresh, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent],
  );

  return <CalendarEventsContext.Provider value={value}>{children}</CalendarEventsContext.Provider>;
}

export function useCalendarEvents(): CalendarEventsContextValue {
  const ctx = useContext(CalendarEventsContext);
  if (!ctx) throw new Error('useCalendarEvents must be used within a CalendarEventsProvider');
  return ctx;
}
