import { useCallback, useEffect, useState } from 'react';
import { fetchAdmins } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { Profile } from '../types';

/**
 * All profiles with role='admin' — lets an employee's "Assigned to" picker
 * offer admins as a taggable option too, the same way useEmployees() feeds
 * the employee half of that same list. Mirrors useEmployees.ts exactly.
 */
export function useAdmins() {
  const [admins, setAdmins] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAdmins();
      setAdmins(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { admins, loading, error, refresh };
}
