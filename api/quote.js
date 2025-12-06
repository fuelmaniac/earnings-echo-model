export default async function handler(req, res) {
  // Set CORS and cache headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

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
    const finnhubUrl = `https://finnhub.io/api/v1/quote?symbol=${upperSymbol}&token=${apiKey}`;

    const response = await fetch(finnhubUrl);

    // Handle rate limiting
    if (response.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    // Handle other non-OK responses
    if (!response.ok) {
      console.error(`Finnhub API error: ${response.status} ${response.statusText}`);
      return res.status(500).json({ error: 'Failed to fetch quote data' });
    }

    const data = await response.json();

    // Finnhub returns all zeros when symbol is not found
    if (data.c === 0 && data.h === 0 && data.l === 0 && data.o === 0 && data.pc === 0) {
      return res.status(404).json({ error: `Symbol not found: ${upperSymbol}` });
    }

    // Transform response to a cleaner format
    const quote = {
      symbol: upperSymbol,
      price: data.c,           // Current price
      change: data.d,          // Change
      changePercent: data.dp,  // Percent change
      high: data.h,            // High price of the day
      low: data.l,             // Low price of the day
      open: data.o,            // Open price of the day
      previousClose: data.pc,  // Previous close price
      timestamp: data.t        // Timestamp
    };

    return res.status(200).json(quote);

  } catch (error) {
    console.error('Error fetching quote:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
