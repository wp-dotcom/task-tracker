import * as Sentry from '@sentry/react';
import type { ReactNode } from 'react';

/**
 * Root-level safety net. Without this, an unhandled error anywhere in the
 * render tree unmounts the whole app and leaves a blank white screen with
 * no way back short of knowing to hit refresh — not something to expect
 * from someone on a shop floor mid-task. This catches it and shows a
 * plain "something broke, reload" screen instead.
 *
 * Uses @sentry/react's ErrorBoundary rather than a hand-rolled one so the
 * same component both renders the fallback UI and reports to Sentry (see
 * lib/sentry.ts) in one place — reporting is a no-op if Sentry was never
 * initialized (no VITE_SENTRY_DSN set), so this works identically either
 * way.
 */
export default function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error }) => (
        <div className="auth-screen">
          <div className="auth-card">
            <h1 className="auth-title">Mid Haven Furniture</h1>
            <p className="auth-subtitle">Something went wrong</p>
            <p className="muted" style={{ textAlign: 'center', marginBottom: 20 }}>
              This page ran into an unexpected error. Reloading usually fixes it — if it keeps
              happening, let Will know what you were doing when it broke.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
            {error instanceof Error && (
              <p
                className="muted"
                style={{ fontSize: '0.75rem', marginTop: 16, textAlign: 'center', wordBreak: 'break-word' }}
              >
                {error.message}
              </p>
            )}
          </div>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
