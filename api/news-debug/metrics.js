import { getMetrics } from "../_lib/newsDebugLog.js";

/**
 * GET /api/news-debug/metrics
 *
 * Returns debug metrics from KV.
 * Admin-only: requires ?admin=1&secret=<NEWS_WATCHDOG_CRON_SECRET>
 *
 * Query params:
 * - admin: must be "1"
 * - secret: must match NEWS_WATCHDOG_CRON_SECRET
 */
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow GET
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Admin gating: require ?admin=1 and ?secret=...
  const cronSecret = process.env.NEWS_WATCHDOG_CRON_SECRET;

  if (!cronSecret) {
    return res.status(500).json({
      ok: false,
      error: "NEWS_WATCHDOG_CRON_SECRET not set",
    });
  }

  const { admin, secret } = req.query;

  if (admin !== "1") {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized: admin=1 required",
    });
  }

  if (secret !== cronSecret) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized: invalid or missing secret",
    });
  }

  try {
    const metrics = await getMetrics();

    return res.status(200).json({
      ok: true,
      metrics,
    });
  } catch (error) {
    console.error("[news-debug/metrics] Error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch metrics",
    });
  }
}
