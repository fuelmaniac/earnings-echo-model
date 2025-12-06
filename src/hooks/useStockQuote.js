import { useState, useEffect, useCallback } from 'react';

export function useStockQuote(symbol) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchQuote = useCallback(async () => {
    if (!symbol) {
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch quote for ${symbol}`);
      }

      const result = await response.json();

      setData({
        symbol: result.symbol,
        price: result.price,
        change: result.change,
        changePercent: result.changePercent,
        high: result.high,
        low: result.low,
        open: result.open,
        previousClose: result.previousClose,
        timestamp: result.timestamp,
      });
    } catch (err) {
      setError(err.message || 'An error occurred while fetching the quote');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  const refetch = useCallback(() => {
    fetchQuote();
  }, [fetchQuote]);

  return { data, loading, error, refetch };
}

export default useStockQuote;
