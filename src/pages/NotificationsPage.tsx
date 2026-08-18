import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useFeedToken } from '../hooks/useFeedToken';
import ConfirmDialog from '../components/ConfirmDialog';

const PUSH_STATUS_COPY: Record<string, string> = {
  unsupported: "This browser (or this deployment, if VITE_VAPID_PUBLIC_KEY isn't set) doesn't support push notifications.",
  checking: 'Checking...',
  off: "You'll only see updates while the app is open.",
  on: "You're set — you'll get a notification when a task is assigned to you, due soon, or overdue.",
  denied: 'Notifications are blocked for this site in your browser settings. Enable them there, then reload this page.',
};

export default function NotificationsPage() {
  const { showToast } = useToast();
  const push = usePushNotifications();
  const feed = useFeedToken();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!feed.feedUrl) return;
    try {
      await navigator.clipboard.writeText(feed.feedUrl);
      setCopied(true);
      showToast('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Couldn't copy — select and copy the link manually");
    }
  }

  async function handleRegenerate() {
    await feed.regenerate();
    setConfirmRegenerate(false);
    showToast('Calendar link regenerated — update it in any calendar app you already subscribed from');
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Notifications</h1>
      </div>

      <div className="info-panel">
        <h2>Push notifications</h2>
        <p className="muted">
          Get a notification on this device when a task is assigned to you, coming due soon, or
          overdue — even when the app isn't open.
        </p>

        <p>{PUSH_STATUS_COPY[push.status]}</p>

        {push.error && (
          <div role="alert" className="form-error">
            {push.error}
          </div>
        )}

        {(push.status === 'off' || push.status === 'on') && (
          <button
            type="button"
            className={push.status === 'on' ? 'btn btn-ghost' : 'btn btn-primary'}
            onClick={push.status === 'on' ? push.disable : push.enable}
            disabled={push.busy}
          >
            {push.busy
              ? 'Working...'
              : push.status === 'on'
                ? 'Turn off notifications on this device'
                : 'Enable notifications on this device'}
          </button>
        )}
      </div>

      <div className="info-panel">
        <h2>Calendar sync</h2>
        <p className="muted">
          Subscribe to your tasks and appointments/deliveries from Apple Calendar, Google
          Calendar, or Outlook — they'll show up there automatically and refresh every hour or so.
          This is read-only: completing a task in your calendar app doesn't update it here, so
          keep using this app for that.
        </p>

        {feed.loading ? (
          <p className="muted">Loading your link...</p>
        ) : feed.feedUrl ? (
          <>
            <div className="feed-url-row">
              <code className="code-block feed-url">{feed.feedUrl}</code>
              <button type="button" className="btn btn-secondary" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>

            <details className="feed-instructions">
              <summary>How to add this to your calendar app</summary>
              <p>
                <strong>Apple Calendar (iPhone/iPad/Mac):</strong> File &gt; New Calendar
                Subscription (Mac) or Settings &gt; Calendar &gt; Accounts &gt; Add Account &gt;
                Other &gt; Add Subscribed Calendar (iPhone/iPad), then paste the link above.
              </p>
              <p>
                <strong>Google Calendar:</strong> On the web, "Other calendars" &gt; + &gt; From
                URL, then paste the link above.
              </p>
              <p>
                <strong>Outlook:</strong> Add calendar &gt; Subscribe from web, then paste the
                link above.
              </p>
            </details>

            {feed.error && (
              <div role="alert" className="form-error">
                {feed.error}
              </div>
            )}

            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 14 }}
              onClick={() => setConfirmRegenerate(true)}
              disabled={feed.regenerating}
            >
              {feed.regenerating ? 'Regenerating...' : 'Regenerate link'}
            </button>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>
              Anyone with this link can view your tasks read-only, so treat it like a password —
              regenerate it if you ever share it somewhere you shouldn't have.
            </p>
          </>
        ) : (
          <div role="alert" className="form-error">
            {feed.error ?? "Couldn't load your calendar link."}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmRegenerate}
        title="Regenerate your calendar link?"
        message="Your old link stops working immediately. Any calendar app already subscribed with it will need to be updated with the new one."
        confirmLabel={feed.regenerating ? 'Regenerating...' : 'Regenerate'}
        busy={feed.regenerating}
        onConfirm={handleRegenerate}
        onCancel={() => setConfirmRegenerate(false)}
      />
    </div>
  );
}
