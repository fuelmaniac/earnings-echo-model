import { kv } from "@vercel/kv";

/**
 * GET /api/news-debug
 *
 * Simple endpoint to check last news fetch status.
 * Returns timestamp, count, and last 20 headlines.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = await kv.get("news:lastFetch");
    return res.json(data || { timestamp: null, count: 0, headlines: [] });
  } catch (error) {
    console.error("[news-debug] Error:", error);
    return res.status(500).json({ error: "Failed to fetch data" });
  }
}
