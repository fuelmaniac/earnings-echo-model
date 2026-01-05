import { kv } from "@vercel/kv";

/**
 * Admin endpoint: GET /api/admin/raw-news
 *
 * Returns the last run snapshot from news-watchdog for debugging.
 *
 * Query params:
 * - admin=1: Required
 * - secret: Must match NEWS_WATCHDOG_CRON_SECRET
 * - limit: Max items to return (default 50)
 *
 * Returns snapshot with:
 * - ts, ok
 * - primary: { provider, status, fetchedCount }
 * - fallback: { provider, used, status, fetchedCount }
 * - keptCount, droppedCount
 * - items: [{ headline, source, url, timestamp, provider, macroMatch, tier }]
 * - health: { ts, level, provider, status, message, error } (if any recent health issues)
 */

const SNAPSHOT_KEY = "news:lastRawSnapshot";
const HEALTH_KEY = "news:health:last";

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Check admin flag
  if (req.query.admin !== '1') {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }

  // Check secret
  const cronSecret = process.env.NEWS_WATCHDOG_CRON_SECRET;
  if (cronSecret && req.query.secret !== cronSecret) {
    return res.status(401).json({ ok: false, error: 'Invalid secret' });
  }

  // Check KV configuration
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: 'Vercel KV is not configured'
    });
  }

  try {
    // Get limit from query
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    // Fetch snapshot
    const snapshot = await kv.get(SNAPSHOT_KEY);

    // Fetch health status
    const health = await kv.get(HEALTH_KEY);

    if (!snapshot) {
      return res.status(200).json({
        ok: true,
        snapshot: null,
        health,
        message: 'No snapshot available yet. Run news-watchdog first.'
      });
    }

    // Limit items if needed
    const limitedSnapshot = {
      ...snapshot,
      items: (snapshot.items || []).slice(0, limit)
    };

    return res.status(200).json({
      ok: true,
      snapshot: limitedSnapshot,
      health,
      itemsTotal: (snapshot.items || []).length,
      itemsReturned: limitedSnapshot.items.length
    });

  } catch (error) {
    console.error('Admin raw-news error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to fetch snapshot',
      message: error.message
    });
  }
}
