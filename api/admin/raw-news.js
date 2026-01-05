import { kv } from "@vercel/kv";

/**
 * Admin Raw News Endpoint
 *
 * Returns the last raw news snapshot for debugging.
 * Requires admin=1 and secret query params.
 *
 * GET /api/admin/raw-news?admin=1&secret=<NEWS_WATCHDOG_CRON_SECRET>&limit=50
 */

const RAW_SNAPSHOT_KEY = "news:lastRawSnapshot";
const HEALTH_KEY = "news:health:last";

/**
 * Validates admin authentication
 */
function validateAdminAuth(req) {
  const cronSecret = process.env.NEWS_WATCHDOG_CRON_SECRET;

  // Check admin=1 query param
  if (req.query?.admin !== "1") {
    return { valid: false, error: "Admin mode required (?admin=1)" };
  }

  // If no secret configured, allow (dev mode)
  if (!cronSecret) {
    return { valid: true };
  }

  // Check secret query param
  if (req.query?.secret !== cronSecret) {
    return { valid: false, error: "Invalid or missing secret" };
  }

  return { valid: true };
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow GET
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate admin auth
  const authResult = validateAdminAuth(req);
  if (!authResult.valid) {
    return res.status(401).json({ ok: false, error: authResult.error });
  }

  // Check KV configuration
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "Vercel KV is not configured"
    });
  }

  try {
    // Parse limit (default 50, max 100)
    const limit = Math.min(Math.max(1, parseInt(req.query?.limit) || 50), 100);

    // Get raw snapshot
    const snapshot = await kv.get(RAW_SNAPSHOT_KEY);

    // Get health status
    const health = await kv.get(HEALTH_KEY);

    if (!snapshot) {
      return res.status(200).json({
        ok: true,
        message: "No raw snapshot available yet",
        source: null,
        fetchedCount: 0,
        keptCount: 0,
        droppedCount: 0,
        items: [],
        health: health || null
      });
    }

    // Calculate kept vs dropped (items in snapshot are the ones that were fetched)
    const fetchedCount = snapshot.fetchedCount || 0;
    const items = (snapshot.items || []).slice(0, limit);

    return res.status(200).json({
      ok: true,
      ts: snapshot.ts,
      source: snapshot.source,
      fetchedCount,
      fallbackUsed: snapshot.fallbackUsed || false,
      finnhubStatus: snapshot.finnhubStatus,
      newsapiStatus: snapshot.newsapiStatus,
      itemCount: items.length,
      items,
      health: health || null
    });
  } catch (error) {
    console.error("Admin raw-news error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch raw news data",
      message: error.message
    });
  }
}
