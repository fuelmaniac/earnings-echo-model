/**
 * Helper function to format dates as YYYY-MM-DD
 */
function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default async function handler(req, res) {
  // Set CORS and cache headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { symbol } = req.query;

  // Validate symbol parameter
  if (!symbol) {
    return res.status(400).json({ error: 'Missing required parameter: symbol' });
  }

  const upperSymbol = symbol.toUpperCase().trim();

  // Basic symbol validation (alphanumeric, 1-5 characters typical for stocks)
  if (!/^[A-Z]{1,5}$/.test(upperSymbol)) {
    return res.status(400).json({ error: 'Invalid symbol format' });
  }

  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    console.error('FINNHUB_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // TIER 1: Try calendar/earnings for future earnings dates
    const today = new Date();
    const oneYearLater = new Date(today);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const fromDate = toISODate(today);
    const toDate = toISODate(oneYearLater);

    const calendarUrl = `https://finnhub.io/api/v1/calendar/earnings?symbol=${upperSymbol}&from=${fromDate}&to=${toDate}&token=${apiKey}`;

    const calendarResponse = await fetch(calendarUrl);

    // Handle rate limiting
    if (calendarResponse.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    // Check if calendar endpoint is available (not plan-restricted)
    if (calendarResponse.status !== 402 && calendarResponse.status !== 403) {
      if (calendarResponse.ok) {
        const calendarData = await calendarResponse.json();

        // Check if we have future earnings data
        if (calendarData.earningsCalendar && calendarData.earningsCalendar.length > 0) {
          const nextEarnings = calendarData.earningsCalendar[0];

          return res.status(200).json({
            mode: 'next',
            symbol: upperSymbol,
            date: nextEarnings.date || null,
            hour: nextEarnings.hour || null,
            epsActual: nextEarnings.epsActual ?? null,
            epsEstimate: nextEarnings.epsEstimate ?? null,
            surprise: null,
            surprisePercent: null,
            year: nextEarnings.year ?? null,
            quarter: nextEarnings.quarter ?? null,
            revenueActual: nextEarnings.revenueActual ?? null,
            revenueEstimate: nextEarnings.revenueEstimate ?? null
          });
        }
      } else {
        console.error(`Calendar API error: ${calendarResponse.status} ${calendarResponse.statusText}`);
      }
    }

    // TIER 2: Fall back to stock/earnings for last reported earnings
    const earningsUrl = `https://finnhub.io/api/v1/stock/earnings?symbol=${upperSymbol}&limit=1&token=${apiKey}`;

    const earningsResponse = await fetch(earningsUrl);

    // Handle rate limiting
    if (earningsResponse.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    // Handle other non-OK responses
    if (!earningsResponse.ok) {
      console.error(`Earnings API error: ${earningsResponse.status} ${earningsResponse.statusText}`);
      return res.status(500).json({ error: 'Failed to fetch earnings data' });
    }

    const earningsData = await earningsResponse.json();

    // Check if we have earnings data
    if (!earningsData || earningsData.length === 0) {
      return res.status(404).json({ error: `No earnings data available for symbol: ${upperSymbol}` });
    }

    const lastEarnings = earningsData[0];

    return res.status(200).json({
      mode: 'last',
      symbol: upperSymbol,
      date: lastEarnings.period || null,
      hour: null,
      epsActual: lastEarnings.actual ?? null,
      epsEstimate: lastEarnings.estimate ?? null,
      surprise: lastEarnings.surprise ?? null,
      surprisePercent: lastEarnings.surprisePercent ?? null,
      year: lastEarnings.year ?? null,
      quarter: lastEarnings.quarter ?? null,
      revenueActual: null,
      revenueEstimate: null
    });

  } catch (error) {
    console.error('Error fetching earnings info:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
