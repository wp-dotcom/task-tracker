import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/errors';

interface LoginLocationState {
  expired?: boolean;
}

export default function LoginPage() {
  const { session, signIn, sendPasswordReset } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<'sign-in' | 'forgot-password'>('sign-in');
  const [resetEmail, setResetEmail] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const expired = (location.state as LoginLocationState | null)?.expired;

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function switchToForgotPassword() {
    setResetEmail(email);
    setResetError(null);
    setResetSent(false);
    setMode('forgot-password');
  }

  function switchToSignIn() {
    setError(null);
    setMode('sign-in');
  }

  async function handleResetSubmit(e: FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetSubmitting(true);
    try {
      await sendPasswordReset(resetEmail.trim());
      setResetSent(true);
    } catch (err) {
      setResetError(getErrorMessage(err));
    } finally {
      setResetSubmitting(false);
    }
  }

  if (mode === 'forgot-password') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="auth-title">Mid Haven Furniture</h1>
          <p className="auth-subtitle">Reset your password</p>

          {resetSent ? (
            <>
              <div className="session-banner" role="status">
                If an account exists for <strong>{resetEmail.trim()}</strong>, a reset link has
                been sent — check your email (and spam folder) for a message from Supabase/Mid
                Haven Furniture.
              </div>
              <button type="button" className="btn btn-secondary btn-block" onClick={switchToSignIn}>
                Back to sign in
              </button>
            </>
          ) : (
            <form onSubmit={handleResetSubmit} className="auth-form">
              <p className="muted" style={{ marginTop: 0 }}>
                Enter the email address on your account and we'll send you a link to set a new
                password.
              </p>

              <label className="field-label" htmlFor="reset-email">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                autoComplete="username"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="field-input"
                placeholder="you@example.com"
              />

              {resetError && (
                <div role="alert" className="form-error">
                  {resetError}
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-block" disabled={resetSubmitting}>
                {resetSubmitting ? 'Sending...' : 'Send reset link'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={switchToSignIn}
                disabled={resetSubmitting}
              >
                Back to sign in
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">Mid Haven Furniture</h1>
        <p className="auth-subtitle">Sign in to continue</p>

        {expired && (
          <div className="session-banner" role="status">
            Your session expired. Please log in again.
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input"
            placeholder="you@example.com"
          />

          <div className="auth-password-label-row">
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <button type="button" className="auth-forgot-link" onClick={switchToForgotPassword}>
              Forgot password?
            </button>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field-input"
            placeholder="••••••••"
          />

          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="auth-footnote">
          Accounts are created by your administrator. Contact them if you need access.
        </p>
      </div>
    </div>
  );
}
