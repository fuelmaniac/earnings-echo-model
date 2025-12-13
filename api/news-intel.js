import { analyzeNews } from "./_lib/newsIntel.js";

/**
 * News Intelligence API - Analyze news headlines for market impact
 *
 * POST /api/news-intel
 * Body: { "headline": "...", "body": "..." (optional) }
 *
 * Returns GPT-5.1 analysis of the news event including:
 * - Importance score (0-100)
 * - Category (macro_shock, sector_shock, noise)
 * - Affected sectors with bullish/bearish direction
 * - Example tickers
 * - Impact horizon
 * - Risk notes
 */

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  // Parse and validate request body
  let headline, body;
  try {
    const requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    headline = requestBody?.headline;
    body = requestBody?.body;
  } catch (parseError) {
    console.error('Failed to parse request body:', parseError);
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Validate headline is present
  if (!headline || typeof headline !== 'string' || headline.trim().length === 0) {
    return res.status(400).json({ error: 'headline is required' });
  }

  try {
    const analysis = await analyzeNews(headline, body);
    return res.status(200).json(analysis);

  } catch (error) {
    console.error('Error calling OpenAI API:', error);

    // Handle specific OpenAI errors
    if (error?.status === 401 || error.message?.includes('Invalid API key')) {
      return res.status(500).json({ error: 'Invalid OpenAI API key' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ error: 'OpenAI rate limit exceeded. Please try again later.' });
    }
    if (error?.status === 503) {
      return res.status(503).json({ error: 'OpenAI service temporarily unavailable' });
    }

    return res.status(500).json({ error: 'Failed to process news intelligence request' });
  }
}
