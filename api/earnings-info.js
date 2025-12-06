/**
 * Helper function to format dates as YYYY-MM-DD
 */
function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Helper function to estimate next earnings date (last date + 90 days)
 * Returns formatted string like "Jan 2025"
 */
function estimateNextEarnings(lastDateStr) {
  if (!lastDateStr) return null;
  const date = new Date(lastDateStr + 'T00:00:00Z');
  date.setDate(date.getDate() + 90); // Quarterly
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Helper function to calculate approximate months until a date
 */
function monthsUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00Z');
  const today = new Date();
  const diffMs = target - today;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays / 30; // Approximate months
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
    // Build URLs for both endpoints
    const earningsUrl = `https://finnhub.io/api/v1/stock/earnings?symbol=${upperSymbol}&limit=1&token=${apiKey}`;

    const today = new Date();
    const oneYearLater = new Date(today);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    const fromDate = toISODate(today);
    const toDate = toISODate(oneYearLater);
    const calendarUrl = `https://finnhub.io/api/v1/calendar/earnings?symbol=${upperSymbol}&from=${fromDate}&to=${toDate}&token=${apiKey}`;

    // Fetch BOTH endpoints in parallel
    const [earningsResponse, calendarResponse] = await Promise.all([
      fetch(earningsUrl),
      fetch(calendarUrl)
    ]);

    // Handle rate limiting on earnings endpoint
    if (earningsResponse.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    // Handle earnings endpoint failure (required for last data)
    if (!earningsResponse.ok) {
      if (earningsResponse.status === 404) {
        return res.status(404).json({ error: `No earnings data available for symbol: ${upperSymbol}` });
      }
      console.error(`Earnings API error: ${earningsResponse.status} ${earningsResponse.statusText}`);
      return res.status(500).json({ error: 'Failed to fetch earnings data' });
    }

    const earningsData = await earningsResponse.json();

    // Check if we have earnings data
    if (!earningsData || earningsData.length === 0) {
      return res.status(404).json({ error: `No earnings data available for symbol: ${upperSymbol}` });
    }

    // Build "last" object from stock/earnings response
    const lastEarnings = earningsData[0];
    const last = {
      date: lastEarnings.period || null,
      epsActual: lastEarnings.actual ?? null,
      epsEstimate: lastEarnings.estimate ?? null,
      surprise: lastEarnings.surprise ?? null,
      surprisePercent: lastEarnings.surprisePercent ?? null,
      revenueActual: lastEarnings.revenueActual ?? null,
      revenueEstimate: lastEarnings.revenueEstimate ?? null
    };

    // Build "next" object
    let next = {
      confirmed: false,
      date: null,
      estimatedDate: estimateNextEarnings(last.date),
      hour: null
    };

    // Try to get confirmed next earnings from calendar endpoint
    // Skip if calendar endpoint returned 402/403 (plan-restricted) or rate limited
    if (calendarResponse.status !== 402 && calendarResponse.status !== 403 && calendarResponse.status !== 429) {
      if (calendarResponse.ok) {
        const calendarData = await calendarResponse.json();

        // Check if we have future earnings data
        if (calendarData.earningsCalendar && calendarData.earningsCalendar.length > 0) {
          const nextEarnings = calendarData.earningsCalendar[0];
          const confirmedDate = nextEarnings.date || null;

          // Apply 3-month distance check
          // If confirmed date is more than 3 months away, treat as unconfirmed
          if (confirmedDate && monthsUntil(confirmedDate) <= 3) {
            // Date is within 3 months - use confirmed data
            next = {
              confirmed: true,
              date: confirmedDate,
              estimatedDate: null,
              hour: nextEarnings.hour || null
            };
          }
          // If > 3 months away, keep the default estimated date (already set above)
        }
      } else {
        console.error(`Calendar API error: ${calendarResponse.status} ${calendarResponse.statusText}`);
        // Continue with estimated date (already set above)
      }
    }

    return res.status(200).json({
      symbol: upperSymbol,
      last,
      next
    });

  } catch (error) {
    console.error('Error fetching earnings info:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
