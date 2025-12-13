import { kv } from "@vercel/kv";
import { analyzeNews } from "./_lib/newsIntel.js";

/**
 * News Watchdog - Cron endpoint for periodic news monitoring
 *
 * Authentication:
 * - If NEWS_WATCHDOG_CRON_SECRET env var is NOT set: No auth required (open)
 * - If NEWS_WATCHDOG_CRON_SECRET env var IS set: Requires secret via:
 *   - Query param: ?secret=YOUR_SECRET (recommended for Vercel Cron)
 *   - OR Header: x-cron-secret: YOUR_SECRET
 *
 * Environment Variables Required:
 * - OPENAI_API_KEY: For GPT analysis
 * - KV_REST_API_URL: Vercel KV connection
 * - KV_REST_API_TOKEN: Vercel KV auth token
 * - NEWS_WATCHDOG_CRON_SECRET: (Optional) Secret for authenticating cron calls
 * - NEWS_API_KEY: (Optional) For fetching real news from NewsAPI.org
 */

const MAJOR_EVENTS_KEY = "major_events";
const MAX_STORED_EVENTS = 100;
const IMPORTANCE_THRESHOLD = 50; // Only store events with importance >= 50

/**
 * Validates the cron request authentication
 * @param {object} req - The request object
 * @returns {{ valid: boolean, error?: string }}
 */
function validateCronAuth(req) {
  const cronSecret = process.env.NEWS_WATCHDOG_CRON_SECRET;

  // If no secret is configured, allow all requests (open mode)
  if (!cronSecret) {
    return { valid: true };
  }

  // Check query param first (recommended for Vercel Cron)
  const querySecret = req.query?.secret;
  if (querySecret === cronSecret) {
    return { valid: true };
  }

  // Check header as fallback
  const headerSecret = req.headers?.['x-cron-secret'];
  if (headerSecret === cronSecret) {
    return { valid: true };
  }

  return {
    valid: false,
    error: 'Invalid or missing cron secret. Provide via ?secret= query param or x-cron-secret header.'
  };
}

/**
 * Fetches latest news headlines
 * For MVP, returns sample headlines. In production, integrate with NewsAPI or similar.
 */
async function fetchLatestNews() {
  const newsApiKey = process.env.NEWS_API_KEY;

  if (newsApiKey) {
    // Production: Fetch from NewsAPI
    try {
      const response = await fetch(
        `https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=10&apiKey=${newsApiKey}`
      );

      if (!response.ok) {
        console.error('NewsAPI error:', response.status);
        return [];
      }

      const data = await response.json();
      return (data.articles || []).map(article => ({
        headline: article.title,
        body: article.description || null,
        source: article.source?.name || 'Unknown',
        url: article.url,
        publishedAt: article.publishedAt
      }));
    } catch (error) {
      console.error('Failed to fetch from NewsAPI:', error);
      return [];
    }
  }

  // MVP fallback: Return empty (manual testing via POST)
  return [];
}

/**
 * Stores a major event in Vercel KV
 */
async function storeMajorEvent(event) {
  try {
    // Get existing events
    let events = await kv.get(MAJOR_EVENTS_KEY) || [];

    // Add new event at the beginning
    events.unshift({
      ...event,
      storedAt: new Date().toISOString()
    });

    // Trim to max size
    if (events.length > MAX_STORED_EVENTS) {
      events = events.slice(0, MAX_STORED_EVENTS);
    }

    // Store back
    await kv.set(MAJOR_EVENTS_KEY, events);

    return true;
  } catch (error) {
    console.error('Failed to store major event:', error);
    return false;
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-cron-secret');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET (cron) and POST (manual test)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate cron authentication
  const authResult = validateCronAuth(req);
  if (!authResult.valid) {
    return res.status(401).json({ error: authResult.error });
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
    let newsItems = [];

    // For POST requests, allow manual news injection for testing
    if (req.method === 'POST' && req.body) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body.headline) {
        newsItems = [{
          headline: body.headline,
          body: body.body || null,
          source: body.source || 'Manual Test',
          url: body.url || null,
          publishedAt: new Date().toISOString()
        }];
      }
    } else {
      // GET request: Fetch news automatically
      newsItems = await fetchLatestNews();
    }

    if (newsItems.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No news items to process',
        processed: 0,
        majorEvents: 0
      });
    }

    const results = {
      processed: 0,
      majorEvents: 0,
      errors: 0,
      events: []
    };

    // Process each news item
    for (const item of newsItems) {
      try {
        results.processed++;

        // Analyze with GPT
        const analysis = await analyzeNews(item.headline, item.body);

        // Check if it's a major event worth storing
        if (analysis.importanceScore >= IMPORTANCE_THRESHOLD) {
          const event = {
            headline: item.headline,
            body: item.body,
            source: item.source,
            url: item.url,
            publishedAt: item.publishedAt,
            analysis
          };

          const stored = await storeMajorEvent(event);
          if (stored) {
            results.majorEvents++;
            results.events.push({
              headline: item.headline,
              importanceScore: analysis.importanceScore,
              importanceCategory: analysis.importanceCategory
            });
          }
        }
      } catch (itemError) {
        console.error('Error processing news item:', item.headline, itemError);
        results.errors++;
      }
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results
    });

  } catch (error) {
    console.error('News watchdog error:', error);
    return res.status(500).json({
      error: 'Failed to process news watchdog request',
      message: error.message
    });
  }
}
