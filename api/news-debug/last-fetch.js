import { getRawItems, getMetrics } from "../_lib/newsDebugLog.js";

/**
 * GET /api/news-debug/last-fetch
 *
 * Quick endpoint to see what headlines were fetched in the last run.
 * Returns headlines from the last ~10 minutes based on timestamp.
 *
 * Admin-only: requires ?admin=1&secret=<NEWS_WATCHDOG_CRON_SECRET>
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

  // Admin gating
  const cronSecret = process.env.NEWS_WATCHDOG_CRON_SECRET;

  if (!cronSecret) {
    return res.status(500).json({
      ok: false,
      error: "NEWS_WATCHDOG_CRON_SECRET not set",
    });
  }

  const { admin, secret } = req.query;

  if (admin !== "1" || secret !== cronSecret) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
  }

  try {
    // Get metrics to find lastRunAt
    const metrics = await getMetrics();
    const lastRunAt = metrics.lastRunAt ? new Date(metrics.lastRunAt) : null;

    // Get raw items
    const rawItems = await getRawItems(100);

    // Filter to items from the last run (within 10 minutes of lastRunAt, or last 10 minutes if no lastRunAt)
    const cutoffTime = lastRunAt
      ? new Date(lastRunAt.getTime() - 60 * 1000) // 1 minute before lastRunAt
      : new Date(Date.now() - 10 * 60 * 1000); // last 10 minutes

    const recentItems = rawItems.filter((item) => {
      const itemTime = new Date(item.ts);
      return itemTime >= cutoffTime;
    });

    // Return simplified list of headlines
    return res.status(200).json({
      ok: true,
      lastRunAt: metrics.lastRunAt || null,
      rawFetchedLastRun: metrics.rawFetchedLastRun || 0,
      count: recentItems.length,
      headlines: recentItems.map((item) => ({
        headline: item.headline,
        source: item.source,
        providerId: item.providerId,
        ts: item.ts,
      })),
    });
  } catch (error) {
    console.error("[news-debug/last-fetch] Error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch last run data",
    });
  }
}
