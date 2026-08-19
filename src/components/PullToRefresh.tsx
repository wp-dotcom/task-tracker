import { useEffect, useRef, useState } from 'react';

// How far (in px, after the 0.5x damping below) you have to drag down from
// the very top of the page before releasing triggers a reload — tuned to
// feel similar to Mail/Safari's own pull-to-refresh, not a hair-trigger.
const PULL_THRESHOLD = 70;
// Visual cap so the indicator doesn't keep growing forever on a long drag.
const MAX_PULL = 110;
// Don't hijack the gesture inside a modal (which has its own scrolling) or
// the calendar grid (where dragging a task to a new date/time already uses
// touch-drag) — pull-to-refresh should only ever kick in from the very top
// of a plain page.
const IGNORE_SELECTOR = '.modal-overlay, .fc';

/**
 * A native-app-style "drag down from the top to reload" gesture for
 * touchscreens. Installed apps (e.g. added to an iPhone Home Screen) run in
 * their own standalone window without Safari's own browser chrome, so they
 * lose Safari's built-in pull-to-refresh along with it — this recreates it.
 * Desktop/mouse users never see this; it only ever responds to real touch
 * events.
 */
export default function PullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const tracking = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (refreshing) return;
      // e.target is occasionally not an Element (e.g. document/window in
      // some edge cases) — guard rather than assume .closest() exists.
      if (e.target instanceof Element && e.target.closest(IGNORE_SELECTOR)) return;
      if (window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
      tracking.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking.current || startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0 || window.scrollY > 0) {
        tracking.current = false;
        pullRef.current = 0;
        setPullDistance(0);
        return;
      }
      // Take over from the browser's own rubber-band scroll so our
      // indicator (not a native bounce) is what the user sees.
      e.preventDefault();
      const distance = Math.min(delta * 0.5, MAX_PULL);
      pullRef.current = distance;
      setPullDistance(distance);
    }

    function onTouchEnd() {
      if (!tracking.current) return;
      tracking.current = false;
      startY.current = null;
      const distance = pullRef.current;
      pullRef.current = 0;
      if (distance >= PULL_THRESHOLD) {
        setRefreshing(true);
        window.location.reload();
      } else {
        setPullDistance(0);
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [refreshing]);

  if (pullDistance === 0 && !refreshing) return null;

  const ready = refreshing || pullDistance >= PULL_THRESHOLD;

  return (
    <div
      className="pull-to-refresh"
      style={{ height: refreshing ? 48 : pullDistance }}
      aria-hidden="true"
    >
      {refreshing ? (
        <span className="spinner pull-to-refresh-spinner" />
      ) : (
        <span className={`pull-to-refresh-arrow${ready ? ' pull-to-refresh-arrow-ready' : ''}`}>
          &darr;
        </span>
      )}
    </div>
  );
}
