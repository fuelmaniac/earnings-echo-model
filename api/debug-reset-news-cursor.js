import { kv } from "@vercel/kv";

/**
 * Debug endpoint to reset the news watchdog state in Vercel KV
 *
 * GET /api/debug-reset-news-cursor?secret=YOUR_SECRET
 *
 * Query Parameters:
 * - secret (required): Must match NEWS_WATCHDOG_CRON_SECRET env var
 * - clearEvents (optional): If "true", also clears the stored major events
 *
 * Actions:
 * - Always resets news:lastMinId to 0 (for future cursor-based fetching)
 * - Optionally clears major_events when clearEvents=true
 *
 * Environment Variables Required:
 * - NEWS_WATCHDOG_CRON_SECRET: Required for authentication
 * - KV_REST_API_URL: Vercel KV connection
 * - KV_REST_API_TOKEN: Vercel KV auth token
 */

const MAJOR_EVENTS_KEY = "major_events";
const LAST_MIN_ID_KEY = "news:lastMinId";

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for required secret env var
  const cronSecret = process.env.NEWS_WATCHDOG_CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({
      error: 'NEWS_WATCHDOG_CRON_SECRET is not configured'
    });
  }

  // Validate secret query param
  const querySecret = req.query?.secret;
  if (!querySecret || querySecret !== cronSecret) {
    return res.status(401).json({
      error: 'Invalid or missing secret. Provide via ?secret= query param.'
    });
  }

  // Check KV configuration
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({
      error: 'Vercel KV is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN environment variables.'
    });
  }

  try {
    const actions = [];

    // Reset the cursor to 0
    await kv.set(LAST_MIN_ID_KEY, 0);
    actions.push(`Reset ${LAST_MIN_ID_KEY} to 0`);

    // Optionally clear events
    const clearEvents = req.query?.clearEvents === 'true';
    if (clearEvents) {
      await kv.set(MAJOR_EVENTS_KEY, []);
      actions.push(`Cleared ${MAJOR_EVENTS_KEY}`);

      // Clear today's daily count if it exists
      const today = new Date().toISOString().split('T')[0];
      const dailyCountKey = `news:dailyCount:${today}`;
      await kv.del(dailyCountKey);
      actions.push(`Deleted ${dailyCountKey}`);
    }

    return res.status(200).json({
      success: true,
      actions,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Debug reset error:', error);
    return res.status(500).json({
      error: 'Failed to reset news cursor',
      message: error.message
    });
  }
}
