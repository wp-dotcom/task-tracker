import { useEffect, useState } from 'react';

/**
 * Returns the current timestamp and re-renders the calling component every
 * `intervalMs` (default 1 minute). Time-based checks like isTaskDueSoon()
 * are computed fresh on every render, but without this, a task wouldn't
 * actually *start* flashing as its deadline approaches unless something
 * else (a data change, a click) happened to trigger a re-render around the
 * same moment — this keeps it live on an otherwise-idle screen.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
