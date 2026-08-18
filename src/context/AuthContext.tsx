import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';
import { getErrorMessage } from '../lib/errors';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Tracks the previous session so we can tell "the user clicked Log out"
  // apart from "the token expired / was revoked elsewhere" — both fire the
  // same SIGNED_OUT event from supabase-js.
  const previousSessionRef = useRef<Session | null>(null);
  const manualSignOutRef = useRef(false);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      setError(
        'Signed in, but could not load your profile. Ask your admin to confirm your account ' +
          'has a row in the profiles table.',
      );
      setProfile(null);
      return;
    }
    setProfile(data as Profile);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      previousSessionRef.current = data.session;
      if (data.session) {
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);

      if (newSession) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        const hadSessionBefore = Boolean(previousSessionRef.current);
        if (hadSessionBefore && !manualSignOutRef.current) {
          // Session disappeared without the user choosing to log out — most
          // likely their token expired or was revoked. Send them to login
          // with a flag so it can explain why, instead of just vanishing.
          navigate('/login', { state: { expired: true } });
        }
        manualSignOutRef.current = false;
      }

      previousSessionRef.current = newSession;
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile, navigate]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      const message = getErrorMessage(signInError);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const signOut = useCallback(async () => {
    manualSignOutRef.current = true;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({ session, profile, loading, error, signIn, signOut }),
    [session, profile, loading, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
