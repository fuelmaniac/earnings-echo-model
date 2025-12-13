import { kv } from "@vercel/kv";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

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

  try {
    // Parse limit from query params
    let limit = parseInt(req.query?.limit || DEFAULT_LIMIT, 10);
    if (isNaN(limit) || limit < 1) {
      limit = DEFAULT_LIMIT;
    }
    if (limit > MAX_LIMIT) {
      limit = MAX_LIMIT;
    }

    // Read from KV list
    const rawEvents = await kv.lrange('news:majorEvents', 0, limit - 1);

    // Parse JSON strings safely
    const events = [];
    for (const rawEvent of rawEvents) {
      try {
        // rawEvent may already be parsed by @vercel/kv
        const event = typeof rawEvent === 'string' ? JSON.parse(rawEvent) : rawEvent;
        events.push(event);
      } catch (parseError) {
        console.error('Failed to parse event:', parseError);
        // Skip malformed entries
      }
    }

    return res.status(200).json({ events });

  } catch (error) {
    console.error('Error in major-events:', error);
    return res.status(500).json({ error: 'Failed to retrieve major events' });
  }
}
