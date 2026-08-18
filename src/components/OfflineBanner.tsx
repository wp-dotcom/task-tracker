import { useOnlineStatus } from '../hooks/useOnlineStatus';

/** Shown whenever the browser reports no network connection, so actions that will fail are explained upfront. */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="offline-banner" role="status">
      You're offline — changes won't save until your connection comes back.
    </div>
  );
}
