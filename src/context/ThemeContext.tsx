import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'mhf-theme-preference';

/**
 * Reads the same localStorage key the no-flash inline script in index.html
 * reads before React even loads — keep these two in sync if this key ever
 * changes.
 */
function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;
}

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(preference));

  const applyResolved = useCallback((next: ResolvedTheme) => {
    setResolved(next);
    document.documentElement.setAttribute('data-theme', next);
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      localStorage.setItem(STORAGE_KEY, next);
      applyResolved(resolve(next));
    },
    [applyResolved],
  );

  // Belt-and-braces: the inline script in index.html already sets the DOM
  // attribute before paint (that's what avoids a flash of the wrong theme),
  // but this makes ThemeProvider correct on its own too — e.g. in a
  // preview/sandbox harness that doesn't include that script — by applying
  // the resolved value once more on mount. Setting the same value twice is
  // harmless.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolve(preference));
  }, [preference]);

  // Follow the OS-level setting live while on "System", the same way the
  // rest of the OS/other apps would (e.g. it flips at sunset with an
  // auto dark mode schedule) — without needing a page reload.
  useEffect(() => {
    if (preference !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyResolved(resolve('system'));
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [preference, applyResolved]);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
