/**
 * Turns whatever error Supabase (or the browser) throws into a short,
 * plain-language message a non-technical user can act on. Falls back to the
 * raw message if nothing matches, so we never hide real information — we
 * just try to translate the common cases first.
 */

interface FriendlyRule {
  match: RegExp;
  message: string;
}

const FRIENDLY_RULES: FriendlyRule[] = [
  // Auth
  { match: /invalid login credentials/i, message: 'Incorrect email or password. Please try again.' },
  { match: /email not confirmed/i, message: 'This account has not been confirmed yet. Check "Auto confirm user" was set when the account was created, or confirm it from Supabase Authentication → Users.' },
  { match: /user already registered/i, message: 'An account with that email already exists.' },
  { match: /email rate limit exceeded/i, message: 'Too many attempts — please wait a few minutes and try again.' },
  { match: /jwt expired|invalid jwt|refresh_token_not_found/i, message: 'Your session expired. Please log in again.' },

  // Network
  { match: /failed to fetch|networkerror|load failed|network request failed/i, message: "Can't reach the server. Check your internet connection and try again." },
  { match: /timeout/i, message: 'The request took too long and timed out. Please try again.' },

  // Row Level Security / permissions
  { match: /row-level security policy/i, message: "You don't have permission to do that." },
  { match: /permission denied/i, message: "You don't have permission to do that." },

  // Postgres constraint errors
  { match: /violates foreign key constraint/i, message: 'That record refers to something that no longer exists. Try refreshing the page.' },
  { match: /violates not-null constraint/i, message: 'Please fill in all required fields.' },
  { match: /duplicate key value violates unique constraint/i, message: 'That already exists.' },
  { match: /value too long for type/i, message: "That text is too long. Please shorten it and try again." },
];

/** Turn a thrown value (Supabase error, JS Error, or anything else) into a readable string. */
export function getErrorMessage(err: unknown): string {
  const raw = extractRawMessage(err);
  if (!raw) return 'Something went wrong. Please try again.';

  const friendly = FRIENDLY_RULES.find((rule) => rule.match.test(raw));
  return friendly ? friendly.message : raw;
}

function extractRawMessage(err: unknown): string | null {
  if (!err) return null;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return null;
}

/** True if this looks like a network-connectivity failure rather than a server-side error. */
export function isNetworkError(err: unknown): boolean {
  const raw = extractRawMessage(err) ?? '';
  return /failed to fetch|networkerror|load failed|network request failed/i.test(raw);
}
