import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/**
 * Error tracking is entirely optional — the app behaves identically with
 * or without it. Set VITE_SENTRY_DSN (see .env.example / README "Error
 * tracking") to start reporting unhandled errors to a Sentry project;
 * leave it unset and this quietly does nothing. Every `Sentry.*` call
 * elsewhere in the app (see ErrorBoundary.tsx) is a safe no-op when
 * Sentry was never initialized, so nothing else needs to branch on this.
 */
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    // Keep this to "tell me when something broke" — no session replay, no
    // performance tracing. A shop-floor task tracker doesn't need more
    // than crash reports, and every extra feature here is another thing
    // to account for privacy-wise.
    tracesSampleRate: 0,
  });
}
