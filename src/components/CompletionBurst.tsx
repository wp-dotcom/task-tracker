import { useEffect } from 'react';

// Exported so callers that need to delay something else (e.g. closing a
// modal) until the burst has actually been seen can key off the same value
// instead of guessing a matching duration.
export const BURST_LIFETIME_MS = 700;

interface CompletionBurstProps {
  /** Called once the burst has finished — the parent unmounts it in response. */
  onDone: () => void;
}

/**
 * The brief checkmark-pop celebration shown right after a task is marked
 * complete (paired with the chime in lib/completionEffects.ts). A plain
 * CSS animation, matching the rest of the app's micro-interactions
 * (badge-pulse, due-soon-flash, etc. in index.css) rather than pulling in
 * an animation library for one effect.
 *
 * Self-timing rather than keying off onAnimationEnd — there are two
 * layered animations here (the icon pop and its expanding ring), and only
 * one of them needs to drive when the whole thing unmounts.
 */
export default function CompletionBurst({ onDone }: CompletionBurstProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, BURST_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="task-complete-burst" aria-hidden="true">
      <span className="task-complete-burst-icon">✓</span>
    </div>
  );
}
