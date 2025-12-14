/**
 * Market Stats Module - Phase 3.3
 *
 * Fetches historical price data and computes ATR%, gap risk, and other
 * volatility metrics used by the confidence engine.
 */

const TIINGO_BASE_URL = 'https://api.tiingo.com/tiingo/daily';

/**
 * Fetch historical daily bars from Tiingo
 * @param {string} symbol - Ticker symbol
 * @param {number} days - Number of days of history (default 30)
 * @returns {Promise<Array|null>} - Array of OHLC bars or null on error
 */
async function fetchTiingoHistory(symbol, days = 30) {
  const apiKey = process.env.TIINGO_API_KEY;

  if (!apiKey) {
    console.warn('TIINGO_API_KEY not configured, market stats unavailable');
    return null;
  }

  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days - 10); // Extra buffer for weekends/holidays

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const url = `${TIINGO_BASE_URL}/${symbol.toUpperCase()}/prices?startDate=${startStr}&endDate=${endStr}&token=${apiKey}`;

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 404) {
      console.warn(`Tiingo: Symbol ${symbol} not found`);
      return null;
    }

    if (response.status === 429) {
      console.warn('Tiingo: Rate limit exceeded');
      return null;
    }

    if (!response.ok) {
      console.warn(`Tiingo: HTTP ${response.status} for ${symbol}`);
      return null;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`Tiingo: No data for ${symbol}`);
      return null;
    }

    // Sort by date ascending and take last N days
    const sorted = data.sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted.slice(-days);

  } catch (error) {
    console.error('Tiingo fetch error:', error.message);
    return null;
  }
}

/**
 * Compute True Range for a single bar
 * TR = max(high - low, abs(high - prevClose), abs(low - prevClose))
 */
function computeTrueRange(bar, prevClose) {
  const high = bar.high;
  const low = bar.low;

  if (prevClose === null || prevClose === undefined) {
    return high - low;
  }

  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose)
  );
}

/**
 * Compute ATR (Average True Range) over a period
 * @param {Array} bars - Array of OHLC bars
 * @param {number} period - ATR period (default 14)
 * @returns {number|null} - ATR value or null
 */
function computeATR(bars, period = 14) {
  if (!bars || bars.length < period + 1) {
    return null;
  }

  const trueRanges = [];

  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    const tr = computeTrueRange(bars[i], prevClose);
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) {
    return null;
  }

  // Simple average of last N true ranges
  const recentTRs = trueRanges.slice(-period);
  const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / period;

  return atr;
}

/**
 * Compute gap percentage from most recent day
 * gapPct = abs(open - prevClose) / prevClose * 100
 * @param {Array} bars - Array of OHLC bars
 * @returns {number|null} - Gap percentage or null
 */
function computeGapPct(bars) {
  if (!bars || bars.length < 2) {
    return null;
  }

  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];

  const prevClose = prevBar.close;
  const open = lastBar.open;

  if (!prevClose || prevClose === 0) {
    return null;
  }

  const gapPct = Math.abs(open - prevClose) / prevClose * 100;
  return gapPct;
}

/**
 * Get the most representative ticker from event for market stats
 * @param {object} event - Event object with analysis.sectors
 * @returns {string|null} - Ticker symbol or null
 */
export function getRepresentativeTicker(event) {
  if (!event?.analysis?.sectors) {
    return null;
  }

  // Try to find a major ETF or liquid ticker
  const majorETFs = ['SPY', 'QQQ', 'XLE', 'XLF', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'GLD', 'TLT'];
  const majorStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'XOM', 'CVX'];

  for (const sector of event.analysis.sectors) {
    const tickers = sector.exampleTickers || [];

    // Prefer ETFs
    for (const ticker of tickers) {
      const upper = String(ticker).toUpperCase();
      if (majorETFs.includes(upper)) {
        return upper;
      }
    }

    // Then major stocks
    for (const ticker of tickers) {
      const upper = String(ticker).toUpperCase();
      if (majorStocks.includes(upper)) {
        return upper;
      }
    }
  }

  // Fall back to first ticker in first sector
  const firstSector = event.analysis.sectors[0];
  if (firstSector?.exampleTickers?.length > 0) {
    return String(firstSector.exampleTickers[0]).toUpperCase();
  }

  // Ultimate fallback: SPY
  return 'SPY';
}

/**
 * Fetch market stats for a symbol
 * @param {string} symbol - Ticker symbol
 * @returns {Promise<object|null>} - { atrPct, gapPct, currentPrice, atr } or null
 */
export async function getMarketStats(symbol) {
  if (!symbol) {
    return null;
  }

  const bars = await fetchTiingoHistory(symbol, 30);

  if (!bars || bars.length < 15) {
    console.warn(`Insufficient price history for ${symbol}`);
    return null;
  }

  const lastBar = bars[bars.length - 1];
  const currentPrice = lastBar.close;

  if (!currentPrice || currentPrice === 0) {
    return null;
  }

  // Compute ATR(14)
  const atr = computeATR(bars, 14);

  // Compute ATR%
  const atrPct = atr ? (atr / currentPrice) * 100 : null;

  // Compute gap%
  const gapPct = computeGapPct(bars);

  return {
    symbol,
    currentPrice,
    atr: atr ? Math.round(atr * 100) / 100 : null,
    atrPct: atrPct ? Math.round(atrPct * 100) / 100 : null,
    gapPct: gapPct ? Math.round(gapPct * 100) / 100 : null
  };
}

/**
 * Get market stats for an event, using representative ticker
 * Falls back gracefully if data unavailable
 * @param {object} event - Event object
 * @returns {Promise<object>} - Market stats object (possibly with defaults)
 */
export async function getMarketStatsForEvent(event) {
  const ticker = getRepresentativeTicker(event);

  if (!ticker) {
    console.warn('No representative ticker for event');
    return {
      symbol: null,
      currentPrice: null,
      atr: null,
      atrPct: null,
      gapPct: null,
      fallback: true
    };
  }

  try {
    const stats = await getMarketStats(ticker);

    if (stats) {
      return { ...stats, fallback: false };
    }

    // Fallback with defaults
    return {
      symbol: ticker,
      currentPrice: null,
      atr: null,
      atrPct: null,
      gapPct: null,
      fallback: true
    };

  } catch (error) {
    console.error('Error fetching market stats:', error.message);
    return {
      symbol: ticker,
      currentPrice: null,
      atr: null,
      atrPct: null,
      gapPct: null,
      fallback: true
    };
  }
}
