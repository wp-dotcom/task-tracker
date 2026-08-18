import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getExistingPushSubscription,
  isPushSupported,
  subscribeToPush,
  subscriptionToRecord,
  unsubscribeFromPush,
} from '../lib/push';
import { deletePushSubscriptionByEndpoint, savePushSubscription } from '../lib/api';
import { getErrorMessage } from '../lib/errors';

export type PushStatus = 'unsupported' | 'checking' | 'off' | 'on' | 'denied';

/** Drives the "Enable push notifications" toggle on the Notifications page. */
export function usePushNotifications() {
  const { profile } = useAuth();
  const [status, setStatus] = useState<PushStatus>(isPushSupported ? 'checking' : 'unsupported');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    let active = true;
    getExistingPushSubscription().then((sub) => {
      if (active) setStatus(sub ? 'on' : 'off');
    });
    return () => {
      active = false;
    };
  }, []);

  const enable = useCallback(async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const subscription = await subscribeToPush();
      if (!subscription) {
        setStatus(Notification.permission === 'denied' ? 'denied' : 'off');
        return;
      }
      await savePushSubscription(profile.id, subscriptionToRecord(subscription));
      setStatus('on');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [profile]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const subscription = await getExistingPushSubscription();
      if (subscription) {
        await deletePushSubscriptionByEndpoint(subscription.endpoint);
        await unsubscribeFromPush(subscription);
      }
      setStatus('off');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, error, enable, disable };
}
