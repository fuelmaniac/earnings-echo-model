import { kv } from "@vercel/kv";

/**
 * Debug Reset Endpoint for News Watchdog
 *
 * GET /api/debug-reset-news-watchdog?secret=YOUR_SECRET
 *
 * Resets KV state so watchdog will process from scratch.
 * Requires NEWS_WATCHDOG_CRON_SECRET to be set and matching.
 *
 * This is a DEBUG-ONLY endpoint for testing the pipeline end-to-end.
 */

const MAJOR_EVENTS_KEY = "major_events";
const PROCESSED_URLS_KEY = "news:processedUrls";

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

  // Check that secret env var is configured
  const cronSecret = process.env.NEWS_WATCHDOG_CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'NEWS_WATCHDOG_CRON_SECRET not set' });
  }

  // Validate secret from query param
  const querySecret = req.query?.secret;
  if (querySecret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check KV configuration
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({
      error: 'Vercel KV is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN environment variables.'
    });
  }

  try {
    const resetActions = [];

    // 1. Get current state before reset for visibility
    const currentEvents = await kv.get(MAJOR_EVENTS_KEY);
    const eventCountBefore = Array.isArray(currentEvents) ? currentEvents.length : 0;

    // 2. Reset major events list
    await kv.del(MAJOR_EVENTS_KEY);
    resetActions.push({
      key: MAJOR_EVENTS_KEY,
      action: 'deleted',
      previousCount: eventCountBefore
    });

    // 3. Try to reset lastMinId if it exists (for future-proofing)
    const lastMinIdKey = "news:lastMinId";
    const lastMinIdBefore = await kv.get(lastMinIdKey);
    if (lastMinIdBefore !== null) {
      await kv.set(lastMinIdKey, 0);
      resetActions.push({
        key: lastMinIdKey,
        action: 'set to 0',
        previousValue: lastMinIdBefore
      });
    }

    // 4. Reset today's daily GPT count if it exists
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dailyCountKey = `news:dailyCount:${today}`;
    const dailyCountBefore = await kv.get(dailyCountKey);
    if (dailyCountBefore !== null) {
      await kv.del(dailyCountKey);
      resetActions.push({
        key: dailyCountKey,
        action: 'deleted',
        previousValue: dailyCountBefore
      });
    }

    // 5. Clear processed URLs list
    const processedUrlsBefore = await kv.get(PROCESSED_URLS_KEY);
    const processedUrlsCount = Array.isArray(processedUrlsBefore) ? processedUrlsBefore.length : 0;
    if (processedUrlsCount > 0) {
      await kv.del(PROCESSED_URLS_KEY);
      resetActions.push({
        key: PROCESSED_URLS_KEY,
        action: 'deleted',
        previousCount: processedUrlsCount
      });
    } else {
      resetActions.push({
        key: PROCESSED_URLS_KEY,
        action: 'already empty',
        previousCount: 0
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Reset completed',
      timestamp: new Date().toISOString(),
      actions: resetActions
    });

  } catch (error) {
    console.error('Debug reset error:', error);
    return res.status(500).json({
      error: 'Failed to reset news watchdog state',
      message: error.message
    });
  }
}
