import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchMyFeedToken, regenerateMyFeedToken } from '../lib/api';
import { getErrorMessage } from '../lib/errors';

/** The calendar-feed Edge Function's base URL, derived from the same project URL the app already talks to. */
function feedFunctionBaseUrl(): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/calendar-feed`;
}

/** Drives the "Calendar sync" section of the Notifications page. */
export function useFeedToken() {
  const { profile } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    setLoading(true);
    fetchMyFeedToken(profile.id)
      .then((t) => {
        if (active) setToken(t);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profile]);

  const regenerate = useCallback(async () => {
    setRegenerating(true);
    setError(null);
    try {
      const newToken = await regenerateMyFeedToken();
      setToken(newToken);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRegenerating(false);
    }
  }, []);

  const feedUrl = token ? `${feedFunctionBaseUrl()}?token=${token}` : null;

  return { feedUrl, loading, error, regenerating, regenerate };
}
