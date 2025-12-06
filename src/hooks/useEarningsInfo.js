import { useState, useEffect, useCallback } from 'react';

export function useEarningsInfo(symbol) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEarningsInfo = useCallback(async () => {
    if (!symbol) {
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/earnings-info?symbol=${encodeURIComponent(symbol)}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch earnings info for ${symbol}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message || 'An error occurred while fetching earnings info');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchEarningsInfo();
  }, [fetchEarningsInfo]);

  const refetch = useCallback(() => {
    fetchEarningsInfo();
  }, [fetchEarningsInfo]);

  return { data, loading, error, refetch };
}

export default useEarningsInfo;
