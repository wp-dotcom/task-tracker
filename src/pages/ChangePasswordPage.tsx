import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { supabase } from '../lib/supabase';

const MIN_PASSWORD_LENGTH = 6;

/**
 * Reached by tapping your own name in the sidebar (desktop) or the mobile
 * menu. Unlike ResetPasswordPage (reached only via an emailed recovery
 * link, for when you're locked out), this is for someone who's already
 * signed in and just wants to change their password.
 *
 * supabase.auth.updateUser({ password }) only requires *an* active
 * session — it doesn't ask for the current password itself. Without a
 * check of our own, anyone at an already-unlocked, still-logged-in device
 * (a shared shop computer, say) could silently take over the account by
 * setting a new password. So this re-authenticates with the current
 * password first via signInWithPassword, and only calls updateUser if
 * that succeeds.
 */
export default function ChangePasswordPage() {
  const { session, updatePassword } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    const email = session?.user.email;
    if (!email) {
      setError('Could not confirm your account email. Try signing out and back in.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (verifyError) {
        setError('Current password is incorrect.');
        return;
      }

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
    <div className="page">
      <div className="page-header">
        <h1>Change password</h1>
      </div>

      <div className="info-panel">
        <p className="muted">
          Enter your current password and choose a new one. This only affects this account — it
          doesn't sign you out here, but other devices you're signed in on will need the new
          password next time they need to reconnect.
        </p>

        <form onSubmit={handleSubmit} className="auth-form" style={{ maxWidth: 360 }}>
          <label className="field-label" htmlFor="current-password">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="field-input"
            placeholder="••••••••"
          />

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

          <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 4 }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save new password'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate('/', { replace: true })}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
