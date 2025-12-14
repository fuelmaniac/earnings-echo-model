import { kv } from "@vercel/kv";

/**
 * Major Events API - Retrieve stored major market events
 *
 * GET /api/major-events
 *
 * Query Parameters:
 * - limit (optional): Number of events to return (default: 20, max: 100)
 * - category (optional): Filter by importanceCategory (macro_shock, sector_shock, noise)
 * - minScore (optional): Minimum importance score (0-100)
 *
 * Environment Variables Required:
 * - KV_REST_API_URL: Vercel KV connection
 * - KV_REST_API_TOKEN: Vercel KV auth token
 */

const MAJOR_EVENTS_KEY = "major_events";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

  // Check KV configuration
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({
      error: 'Vercel KV is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN environment variables.'
    });
  }

  try {
    // Parse query parameters
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit) || DEFAULT_LIMIT),
      MAX_LIMIT
    );
    const category = req.query.category;
    const minScore = parseInt(req.query.minScore) || 0;

    // Validate category if provided
    const validCategories = ['macro_shock', 'sector_shock', 'noise'];
    if (category && !validCategories.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    // Fetch events from KV
    let events = await kv.get(MAJOR_EVENTS_KEY) || [];

    // Apply filters
    if (category) {
      events = events.filter(e => e.analysis?.importanceCategory === category);
    }
    if (minScore > 0) {
      events = events.filter(e => (e.analysis?.importanceScore || 0) >= minScore);
    }

    // Apply limit
    events = events.slice(0, limit);

    return res.status(200).json({
      success: true,
      count: events.length,
      events: events.map(event => ({
        id: event.id,
        headline: event.headline,
        body: event.body,
        source: event.source,
        url: event.url,
        publishedAt: event.publishedAt,
        storedAt: event.storedAt,
        analysis: {
          summary: event.analysis?.summary,
          importanceScore: event.analysis?.importanceScore,
          importanceCategory: event.analysis?.importanceCategory,
          impactHorizon: event.analysis?.impactHorizon,
          sectors: event.analysis?.sectors || [],
          riskNotes: event.analysis?.riskNotes || []
        }
      }))
    });

  } catch (error) {
    console.error('Major events fetch error:', error);
    return res.status(500).json({
      error: 'Failed to fetch major events',
      message: error.message
    });
  }
}
