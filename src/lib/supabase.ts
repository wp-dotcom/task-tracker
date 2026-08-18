import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True when both env vars are present. Checked by <App> before it renders
 * anything that depends on Supabase, so a missing/incorrect .env shows a
 * clear on-screen message instead of a blank white page (throwing here, at
 * module-evaluation time, would crash the whole script before React ever
 * gets a chance to mount and show an error).
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Fall back to harmless placeholder values so createClient() itself never
// throws. If isSupabaseConfigured is false, App renders a setup screen and
// this client is never actually used to make a request.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
