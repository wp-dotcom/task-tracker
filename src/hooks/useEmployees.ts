import { useCallback, useEffect, useState } from 'react';
import { fetchEmployees } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { Profile } from '../types';

/** All profiles with role='employee', for the assignment dropdown and Employees page. */
export function useEmployees() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchEmployees();
      setEmployees(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { employees, loading, error, refresh };
}
