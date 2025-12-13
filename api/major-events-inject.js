import { kv } from "@vercel/kv";
import { analyzeNews } from "./_lib/newsIntel.js";

/**
 * Major Events Inject API - Inject test events for development/testing
 *
 * POST /api/major-events-inject?secret=...
 *
 * Body: { "headline": string, "body"?: string }
 *
 * Authentication:
 * - Requires query param: ?secret=YOUR_SECRET
 * - Compares against process.env.NEWS_WATCHDOG_CRON_SECRET
 *
 * Environment Variables Required:
 * - OPENAI_API_KEY: For GPT analysis
 * - KV_REST_API_URL: Vercel KV connection
 * - KV_REST_API_TOKEN: Vercel KV auth token
 * - NEWS_WATCHDOG_CRON_SECRET: Secret for authenticating inject requests
 */

const MAJOR_EVENTS_KEY = "major_events";
const MAX_STORED_EVENTS = 50;

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

  // Check if secret env var is configured
  const cronSecret = process.env.NEWS_WATCHDOG_CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'NEWS_WATCHDOG_CRON_SECRET not set' });
  }

  // Validate secret from query param
  const querySecret = req.query?.secret;
  if (querySecret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check for required environment variables
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  // Check KV configuration
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({
      error: 'Vercel KV is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN environment variables.'
    });
  }

  try {
    // Parse request body
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Validate headline
    if (!body || !body.headline || typeof body.headline !== 'string') {
      return res.status(400).json({ error: 'headline is required and must be a string' });
    }

    const headline = body.headline.trim();
    const bodyText = body.body && typeof body.body === 'string' ? body.body.trim() : null;

    if (!headline) {
      return res.status(400).json({ error: 'headline cannot be empty' });
    }

    // Analyze with GPT (same logic as news-intel and news-watchdog)
    const analysis = await analyzeNews(headline, bodyText);

    // Create the event object matching the major events feed structure
    const timestamp = Date.now();
    const event = {
      id: `manual-${timestamp}`,
      source: "manual",
      datetime: new Date().toISOString(),
      headline: headline,
      body: bodyText,
      url: null,
      publishedAt: new Date().toISOString(),
      prefilterScore: 100,
      analysis: analysis,
      storedAt: new Date().toISOString()
    };

    // Store in KV using the same pattern as news-watchdog
    let events = await kv.get(MAJOR_EVENTS_KEY) || [];

    // Add new event at the beginning (LPUSH equivalent)
    events.unshift(event);

    // Trim to max size (LTRIM equivalent)
    if (events.length > MAX_STORED_EVENTS) {
      events = events.slice(0, MAX_STORED_EVENTS);
    }

    // Store back
    await kv.set(MAJOR_EVENTS_KEY, events);

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Major events inject error:', error);
    return res.status(500).json({
      error: 'Failed to inject test event',
      message: error.message
    });
  }
}
