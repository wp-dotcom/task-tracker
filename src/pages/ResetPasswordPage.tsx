import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import FullPageSpinner from '../components/FullPageSpinner';

const MIN_PASSWORD_LENGTH = 6;

/**
 * Landed on after clicking the password-reset link emailed via
 * AuthContext.sendPasswordReset. Supabase's client parses the recovery
 * token out of the URL automatically (detectSessionInUrl, see lib/supabase.ts)
 * and turns it into a real, if short-lived-in-intent, session — so by the
 * time this renders, `session` is either already populated or never will be
 * (an expired/already-used link never produces one).
 */
export default function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return <FullPageSpinner label="Checking your link..." />;
  }

  if (!session) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="auth-title">Mid Haven Furniture</h1>
          <p className="auth-subtitle">This link isn't valid</p>
          <div role="alert" className="form-error">
            This password reset link has expired or has already been used. Request a new one from
            the sign-in page.
          </div>
          <Link to="/login" className="btn btn-primary btn-block" style={{ marginTop: 16 }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(password);
      showToast('Password updated');
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">Mid Haven Furniture</h1>
        <p className="auth-subtitle">Set a new password</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field-label" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field-input"
            placeholder="••••••••"
          />

          <label className="field-label" htmlFor="confirm-password">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="field-input"
            placeholder="••••••••"
          />

          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save new password'}
          </button>
        </form>
      </div>
    </div>
  );
}
