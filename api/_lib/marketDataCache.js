/**
 * Market Data Cache Module
 *
 * Provides KV-cached Tiingo daily bars for outcome computation.
 * Cache key: mkt:v1:tiingo:daily:{symbol}:{YYYY-MM-DD}
 * TTL: 7 days
 */

const TIINGO_BASE_URL = 'https://api.tiingo.com/tiingo/daily';
const CACHE_TTL_DAYS = 7;
const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * Fetch daily bars from Tiingo API
 * @param {string} symbol - Ticker symbol
 * @param {number} days - Number of trading days to fetch
 * @returns {Promise<Array>} Array of { date, open, high, low, close }
 */
async function fetchTiingoBars(symbol, days = 20) {
  const apiKey = process.env.TIINGO_API_KEY;

  if (!apiKey) {
    throw new Error('TIINGO_API_KEY not configured');
  }

  // Calculate date range with buffer for weekends/holidays
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days - 15); // Extra buffer

  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const url = `${TIINGO_BASE_URL}/${symbol.toUpperCase()}/prices?startDate=${startStr}&endDate=${endStr}&token=${apiKey}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 404) {
    throw new Error(`Symbol ${symbol} not found`);
  }

  if (response.status === 429) {
    throw new Error('Tiingo rate limit exceeded');
  }

  if (!response.ok) {
    throw new Error(`Tiingo HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No data for ${symbol}`);
  }

  // Sort by date ascending and normalize shape
  const sorted = data.sort((a, b) => new Date(a.date) - new Date(b.date));

  return sorted.map(bar => ({
    date: bar.date.split('T')[0], // Normalize to YYYY-MM-DD
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close
  }));
}

/**
 * Extract date string from ISO timestamp
 * @param {string} tsISO - ISO timestamp
 * @returns {string} YYYY-MM-DD
 */
function extractDateFromISO(tsISO) {
  return new Date(tsISO).toISOString().split('T')[0];
}

/**
 * Build cache key for daily bars
 * @param {string} symbol - Ticker symbol
 * @param {string} dateStr - Reference date YYYY-MM-DD
 * @returns {string} Cache key
 */
function buildCacheKey(symbol, dateStr) {
  return `mkt:v1:tiingo:daily:${symbol.toUpperCase()}:${dateStr}`;
}

/**
 * Get daily bars with KV caching
 *
 * @param {object} params - { kv, symbol, tsISO }
 * @param {object} params.kv - Vercel KV client
 * @param {string} params.symbol - Ticker symbol
 * @param {string} params.tsISO - Reference timestamp for cache key date
 * @returns {Promise<Array>} Array of { date, open, high, low, close }
 */
export async function getDailyBarsCached({ kv, symbol, tsISO }) {
  if (!symbol) {
    throw new Error('Symbol is required');
  }

  const dateStr = extractDateFromISO(tsISO);
  const cacheKey = buildCacheKey(symbol, dateStr);

  // Try cache first
  if (kv) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch (error) {
      console.warn('Cache read error:', error.message);
      // Continue to fetch
    }
  }

  // Fetch from Tiingo
  const bars = await fetchTiingoBars(symbol, 20);

  // Store in cache
  if (kv && bars.length > 0) {
    try {
      const ttlSeconds = CACHE_TTL_DAYS * SECONDS_PER_DAY;
      await kv.set(cacheKey, bars, { ex: ttlSeconds });
    } catch (error) {
      console.warn('Cache write error:', error.message);
      // Continue without caching
    }
  }

  return bars;
}

/**
 * Get daily bars for outcome computation
 * Fetches enough history for t0 + 5 trading days forward
 *
 * @param {object} params - { kv, symbol, tsISO }
 * @returns {Promise<Array>} Bars array or throws on error
 */
export async function getBarsForOutcome({ kv, symbol, tsISO }) {
  // For outcome computation, we need bars from signal date + 5 days forward
  // Since we're computing outcomes after the fact, we fetch fresh data
  // and use the signal date as reference for caching

  return getDailyBarsCached({ kv, symbol, tsISO });
}
