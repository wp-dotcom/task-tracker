// Browser-side Web Push helpers. The actual sending happens server-side
// (supabase/functions/check-due-tasks), invoked on a schedule — this file
// only handles the one-time "register this browser to receive them" step.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** True when this browser + this deployment are capable of push notifications at all. */
export const isPushSupported =
  'serviceWorker' in navigator && 'PushManager' in window && Boolean(VAPID_PUBLIC_KEY);

// The Push API wants the VAPID public key as a raw Uint8Array, but it's
// distributed/copy-pasted as a URL-safe base64 string — this is the
// standard conversion (from the Web Push spec's own examples).
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported) return null;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

/** Requests notification permission (if needed) and subscribes this browser. Returns null if denied/unsupported. */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported || !VAPID_PUBLIC_KEY) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const registration = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });
}

export async function unsubscribeFromPush(subscription: PushSubscription): Promise<void> {
  await subscription.unsubscribe();
}

/** Shapes a browser PushSubscription for the push_subscriptions table (endpoint + the two Push API keys). */
export function subscriptionToRecord(subscription: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
} {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  };
}
