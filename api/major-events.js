import { kv } from "@vercel/kv";
import { analyzeNews } from "./_lib/newsIntel.js";

/**
 * Major Events API - Retrieve stored major market events
 *
 * GET /api/major-events
 *
 * Query Parameters:
 * - limit (optional): Number of events to return (default: 20, max: 100)
 * - category (optional): Filter by importanceCategory (macro_shock, sector_shock, noise)
 * - minScore (optional): Minimum importance score (0-100)
 * - force (optional): If "1", bypass cache and fetch fresh news from Finnhub
 *
 * Environment Variables Required:
 * - KV_REST_API_URL: Vercel KV connection
 * - KV_REST_API_TOKEN: Vercel KV auth token
 */

const MAJOR_EVENTS_KEY = "major_events";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_STORED_EVENTS = 100;
const IMPORTANCE_THRESHOLD = 50;
const PROCESSED_URLS_KEY = "news:processedUrls";
const LAST_MIN_ID_KEY = "news:lastMinId";

/**
 * Fetches latest news headlines from Finnhub general news
 */
async function fetchLatestNews() {
  const finnhubApiKey = process.env.FINNHUB_API_KEY;
  if (!finnhubApiKey) return [];

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${finnhubApiKey}`
    );
    if (!response.ok) return [];

    const data = await response.json();
    return (data || []).map(item => ({
      id: item.id,
      headline: item.headline,
      body: item.summary || null,
      source: item.source || 'Unknown',
      url: item.url,
      publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString()
    }));
  } catch (error) {
    console.error('Failed to fetch from Finnhub:', error);
    return [];
  }
}

/**
 * Stores a major event in Vercel KV
 */
async function storeMajorEvent(event) {
  try {
    let events = await kv.get(MAJOR_EVENTS_KEY) || [];
    events.unshift({ ...event, storedAt: new Date().toISOString() });
    if (events.length > MAX_STORED_EVENTS) {
      events = events.slice(0, MAX_STORED_EVENTS);
    }
    await kv.set(MAJOR_EVENTS_KEY, events);
    return true;
  } catch (error) {
    console.error('Failed to store major event:', error);
    return false;
  }
}

/**
 * Force refresh: fetch new news from Finnhub and process any new items
 */
async function forceRefreshNews() {
  const newsItems = await fetchLatestNews();
  if (newsItems.length === 0) return { processed: 0, newEvents: 0 };

  // Get processed URLs and lastMinId for deduplication
  const processedUrls = new Set(await kv.get(PROCESSED_URLS_KEY) || []);
  const lastMinId = await kv.get(LAST_MIN_ID_KEY) || 0;

  // Filter to only new items
  const newItems = newsItems.filter(item => {
    if (processedUrls.has(item.url)) return false;
    if (item.id && item.id <= lastMinId) return false;
    return true;
  });

  if (newItems.length === 0) return { processed: 0, newEvents: 0 };

  let processed = 0;
  let newEvents = 0;

  // Process up to 5 items to avoid timeout
  for (const item of newItems.slice(0, 5)) {
    try {
      processed++;
      const analysis = await analyzeNews(item.headline, item.body);

      // Mark URL as processed
      let urls = await kv.get(PROCESSED_URLS_KEY) || [];
      if (!urls.includes(item.url)) {
        urls.unshift(item.url);
        if (urls.length > 1000) urls = urls.slice(0, 1000);
        await kv.set(PROCESSED_URLS_KEY, urls);
      }

      if (analysis.importanceScore >= IMPORTANCE_THRESHOLD) {
        const event = {
          id: `force-${Date.now()}-${processed}`,
          headline: item.headline,
          body: item.body,
          source: item.source,
          url: item.url,
          publishedAt: item.publishedAt,
          analysis
        };
        if (await storeMajorEvent(event)) {
          newEvents++;
        }
      }
    } catch (error) {
      console.error('Error processing news item:', error);
    }
  }

  // Update lastMinId
  if (newItems.length > 0) {
    const maxId = Math.max(...newItems.map(item => item.id || 0));
    if (maxId > lastMinId) {
      await kv.set(LAST_MIN_ID_KEY, maxId);
    }
  }

  return { processed, newEvents };
}

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
    const forceRefresh = req.query.force === "1";

    // Validate category if provided
    const validCategories = ['macro_shock', 'sector_shock', 'noise'];
    if (category && !validCategories.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    // If force=1, fetch fresh news from upstream before returning
    let refreshResult = null;
    if (forceRefresh) {
      console.log('Force refresh requested - fetching fresh news from Finnhub');
      refreshResult = await forceRefreshNews();
      console.log(`Force refresh complete: ${refreshResult.processed} processed, ${refreshResult.newEvents} new events`);
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

    // Generate server timestamp
    const generatedAt = new Date().toISOString();

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
      })),
      meta: {
        generatedAt,
        ...(forceRefresh && refreshResult ? { forceRefresh: refreshResult } : {})
      }
    });

  } catch (error) {
    console.error('Major events fetch error:', error);
    return res.status(500).json({
      error: 'Failed to fetch major events',
      message: error.message
    });
  }
}
