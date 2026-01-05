import { kv } from "@vercel/kv";
import { analyzeNews } from "./_lib/newsIntel.js";
import {
  logRawItem,
  logDecision,
  incrementMetric,
  setMetric,
  hashHeadline,
  computePrefilterScore,
  DECISION_TYPES,
} from "./_lib/newsDebugLog.js";

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
 * - FINNHUB_API_KEY: (Required for news) Finnhub API key for fetching general news
 */

const MAJOR_EVENTS_KEY = "major_events";
const MAX_STORED_EVENTS = 100;
const IMPORTANCE_THRESHOLD = 50; // Only store events with importance >= 50
const DAILY_GPT_CAP = 50; // Maximum GPT calls per day to control costs
const PROCESSED_URLS_KEY = "news:processedUrls"; // Track processed article URLs
const LAST_MIN_ID_KEY = "news:lastMinId"; // Track last minimum Finnhub news id processed
const PREFILTER_THRESHOLD = 10; // Minimum prefilter score to send to GPT (0 = send all)
const MAX_RAW_LOG_PER_RUN = 200; // Cap raw items logged per run to avoid flooding

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
 * Fetches latest news headlines from Finnhub general news
 * @returns {Promise<Array<{id: number, headline: string, body: string|null, source: string, url: string, publishedAt: string}>>}
 */
async function fetchLatestNews() {
  const finnhubApiKey = process.env.FINNHUB_API_KEY;

  if (finnhubApiKey) {
    // Production: Fetch from Finnhub general news
    try {
      const response = await fetch(
        `https://finnhub.io/api/v1/news?category=general&token=${finnhubApiKey}`
      );

      if (!response.ok) {
        console.error('Finnhub API error:', response.status);
        return [];
      }

      const data = await response.json();

      // Finnhub returns array of news items with id, headline, summary, source, url, datetime
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

  // No API key: Return empty (manual testing via POST)
  return [];
}

/**
 * Gets today's date string in YYYY-MM-DD format
 */
function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Gets the daily GPT call count for today
 */
async function getDailyGptCount() {
  const key = `news:dailyCount:${getTodayDateString()}`;
  const count = await kv.get(key);
  return count || 0;
}

/**
 * Increments the daily GPT call count
 */
async function incrementDailyGptCount() {
  const key = `news:dailyCount:${getTodayDateString()}`;
  const count = await kv.get(key) || 0;
  await kv.set(key, count + 1, { ex: 86400 * 2 }); // Expire after 2 days
  return count + 1;
}

/**
 * Gets processed URLs set (last 1000 URLs)
 */
async function getProcessedUrls() {
  const urls = await kv.get(PROCESSED_URLS_KEY);
  return new Set(urls || []);
}

/**
 * Gets the last minimum Finnhub news id that was processed
 * @returns {Promise<number>}
 */
async function getLastMinId() {
  const lastMinId = await kv.get(LAST_MIN_ID_KEY);
  return lastMinId || 0;
}

/**
 * Updates the last minimum Finnhub news id
 * @param {number} minId - The new minimum id to store
 */
async function setLastMinId(minId) {
  await kv.set(LAST_MIN_ID_KEY, minId);
}

/**
 * Marks a URL as processed
 */
async function markUrlProcessed(url) {
  if (!url) return;
  let urls = await kv.get(PROCESSED_URLS_KEY) || [];
  if (!urls.includes(url)) {
    urls.unshift(url);
    // Keep only last 1000 URLs
    if (urls.length > 1000) {
      urls = urls.slice(0, 1000);
    }
    await kv.set(PROCESSED_URLS_KEY, urls);
  }
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
    // Gather diagnostic info
    const dailyCountBefore = await getDailyGptCount();
    const processedUrls = await getProcessedUrls();
    const lastMinId = await getLastMinId();
    const finnhubConfigured = !!process.env.FINNHUB_API_KEY;

    // Diagnostic info to include in response
    const diagnostics = {
      dailyCountBefore,
      dailyCap: DAILY_GPT_CAP,
      threshold: IMPORTANCE_THRESHOLD,
      finnhubConfigured,
      processedUrlsCount: processedUrls.size,
      lastMinId
    };

    let newsItems = [];
    let newsSource = 'none';

    // Mark run start time for metrics
    await setMetric("lastRunAt", new Date().toISOString());

    // For POST requests, allow manual news injection for testing
    if (req.method === 'POST' && req.body) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body.headline) {
        newsItems = [{
          id: body.id || Date.now(), // Use provided id or generate one
          headline: body.headline,
          body: body.body || null,
          source: body.source || 'Manual Test',
          url: body.url || `manual:${Date.now()}`, // Generate unique URL for manual tests
          publishedAt: new Date().toISOString()
        }];
        newsSource = 'manual';
      }
    } else {
      // GET request: Fetch news automatically from Finnhub
      newsItems = await fetchLatestNews();
      newsSource = finnhubConfigured ? 'finnhub' : 'none';
    }

    diagnostics.newsSource = newsSource;
    diagnostics.rawNewsCount = newsItems.length;

    // Log raw fetched items (capped to avoid flooding)
    await setMetric("rawFetchedLastRun", newsItems.length);
    const itemsToLog = newsItems.slice(0, MAX_RAW_LOG_PER_RUN);
    for (const item of itemsToLog) {
      await logRawItem({
        provider: newsSource === 'manual' ? 'manual' : 'finnhub',
        providerId: item.id,
        datetime: item.publishedAt ? Math.floor(new Date(item.publishedAt).getTime() / 1000) : null,
        source: item.source,
        headline: item.headline,
        summary: item.body,
        url: item.url,
        category: 'general',
      });
      await incrementMetric("rawLoggedCount", 1);
    }

    // Filter out already-processed items and log decisions:
    // - For Finnhub: filter by id > lastMinId
    // - Also filter by URL for backwards compatibility
    const newItems = [];
    for (const item of newsItems) {
      const itemHash = hashHeadline(item.headline, item.url);
      const { score: prefilterScore, reasons: prefilterReasons } = computePrefilterScore(item.headline, item.body);

      // Check if already processed by URL
      if (processedUrls.has(item.url)) {
        await logDecision({
          provider: newsSource === 'manual' ? 'manual' : 'finnhub',
          providerId: item.id,
          headline: item.headline,
          hash: itemHash,
          prefilterScore,
          prefilterReasons,
          threshold: IMPORTANCE_THRESHOLD,
          dailyCap: DAILY_GPT_CAP,
          dedupeHit: true,
          decision: DECISION_TYPES.SKIPPED_ALREADY_PROCESSED,
          decisionReason: `URL already processed: ${item.url}`,
        });
        await incrementMetric("skippedProcessedCount", 1);
        await incrementMetric("decisionsLoggedCount", 1);
        continue;
      }

      // Check if already processed by ID
      if (item.id && item.id <= lastMinId) {
        await logDecision({
          provider: newsSource === 'manual' ? 'manual' : 'finnhub',
          providerId: item.id,
          headline: item.headline,
          hash: itemHash,
          prefilterScore,
          prefilterReasons,
          threshold: IMPORTANCE_THRESHOLD,
          dailyCap: DAILY_GPT_CAP,
          dedupeHit: true,
          decision: DECISION_TYPES.SKIPPED_ALREADY_PROCESSED,
          decisionReason: `ID ${item.id} <= lastMinId ${lastMinId}`,
        });
        await incrementMetric("skippedProcessedCount", 1);
        await incrementMetric("decisionsLoggedCount", 1);
        continue;
      }

      // Item is new, add to processing queue
      newItems.push({ ...item, prefilterScore, prefilterReasons, hash: itemHash });
    }

    diagnostics.newItemsCount = newItems.length;
    diagnostics.skippedDuplicates = newsItems.length - newItems.length;

    if (newItems.length === 0) {
      return res.status(200).json({
        success: true,
        message: newsItems.length === 0
          ? 'No news items to process'
          : 'All news items already processed',
        processed: 0,
        majorEvents: 0,
        diagnostics
      });
    }

    // Check daily cap
    if (dailyCountBefore >= DAILY_GPT_CAP) {
      // Log decisions for all items that would be skipped due to daily cap
      for (const item of newItems) {
        await logDecision({
          provider: newsSource === 'manual' ? 'manual' : 'finnhub',
          providerId: item.id,
          headline: item.headline,
          hash: item.hash,
          prefilterScore: item.prefilterScore,
          prefilterReasons: item.prefilterReasons,
          threshold: IMPORTANCE_THRESHOLD,
          dailyCap: DAILY_GPT_CAP,
          decision: DECISION_TYPES.SKIPPED_DAILY_CAP,
          decisionReason: `Daily GPT cap reached (${dailyCountBefore}/${DAILY_GPT_CAP})`,
        });
        await incrementMetric("skippedDailyCapCount", 1);
        await incrementMetric("decisionsLoggedCount", 1);
      }
      return res.status(200).json({
        success: true,
        message: `Daily GPT cap reached (${dailyCountBefore}/${DAILY_GPT_CAP})`,
        processed: 0,
        majorEvents: 0,
        diagnostics
      });
    }

    const results = {
      processed: 0,
      majorEvents: 0,
      errors: 0,
      events: []
    };

    // Process each news item (respecting daily cap)
    for (const item of newItems) {
      // Check if we've hit the daily cap
      const currentCount = await getDailyGptCount();
      if (currentCount >= DAILY_GPT_CAP) {
        console.log(`Daily GPT cap reached (${currentCount}/${DAILY_GPT_CAP}), stopping processing`);
        // Log remaining items as skipped due to daily cap
        const remainingItems = newItems.slice(newItems.indexOf(item));
        for (const remainingItem of remainingItems) {
          await logDecision({
            provider: newsSource === 'manual' ? 'manual' : 'finnhub',
            providerId: remainingItem.id,
            headline: remainingItem.headline,
            hash: remainingItem.hash,
            prefilterScore: remainingItem.prefilterScore,
            prefilterReasons: remainingItem.prefilterReasons,
            threshold: IMPORTANCE_THRESHOLD,
            dailyCap: DAILY_GPT_CAP,
            decision: DECISION_TYPES.SKIPPED_DAILY_CAP,
            decisionReason: `Daily GPT cap reached mid-run (${currentCount}/${DAILY_GPT_CAP})`,
          });
          await incrementMetric("skippedDailyCapCount", 1);
          await incrementMetric("decisionsLoggedCount", 1);
        }
        break;
      }

      try {
        results.processed++;

        // Increment daily count before GPT call
        await incrementDailyGptCount();

        // Analyze with GPT
        const analysis = await analyzeNews(item.headline, item.body);

        // Mark URL as processed
        await markUrlProcessed(item.url);

        // Check if it's a major event worth storing
        let majorEventId = null;
        if (analysis.importanceScore >= IMPORTANCE_THRESHOLD) {
          // Generate a unique event ID
          majorEventId = `evt_${Date.now()}_${item.hash.slice(0, 8)}`;

          const event = {
            id: majorEventId,
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
              id: majorEventId,
              headline: item.headline,
              importanceScore: analysis.importanceScore,
              importanceCategory: analysis.importanceCategory
            });
          } else {
            majorEventId = null; // Failed to store
          }
        }

        // Log the decision
        await logDecision({
          provider: newsSource === 'manual' ? 'manual' : 'finnhub',
          providerId: item.id,
          headline: item.headline,
          hash: item.hash,
          prefilterScore: item.prefilterScore,
          prefilterReasons: item.prefilterReasons,
          threshold: IMPORTANCE_THRESHOLD,
          dailyCap: DAILY_GPT_CAP,
          decision: DECISION_TYPES.ANALYZED,
          decisionReason: analysis.importanceScore >= IMPORTANCE_THRESHOLD
            ? `Stored as major event (score ${analysis.importanceScore} >= ${IMPORTANCE_THRESHOLD})`
            : `Below threshold (score ${analysis.importanceScore} < ${IMPORTANCE_THRESHOLD})`,
          classifier: {
            used: true,
            importanceScore: analysis.importanceScore,
            importanceCategory: analysis.importanceCategory,
            marketRelevance: analysis.sectors?.length > 0 ? analysis.sectors[0].confidence : null,
            summary: analysis.summary,
          },
          majorEventId,
        });
        await incrementMetric("analyzedCount", 1);
        await incrementMetric("decisionsLoggedCount", 1);

      } catch (itemError) {
        console.error('Error processing news item:', item.headline, itemError);
        results.errors++;

        // Log the error decision
        await logDecision({
          provider: newsSource === 'manual' ? 'manual' : 'finnhub',
          providerId: item.id,
          headline: item.headline,
          hash: item.hash,
          prefilterScore: item.prefilterScore,
          prefilterReasons: item.prefilterReasons,
          threshold: IMPORTANCE_THRESHOLD,
          dailyCap: DAILY_GPT_CAP,
          decision: DECISION_TYPES.ERROR,
          decisionReason: `Error during analysis: ${itemError.message}`,
          error: itemError.message,
        });
        await incrementMetric("errorsCount", 1);
        await incrementMetric("decisionsLoggedCount", 1);

        // Still mark as processed to avoid retrying failed items
        await markUrlProcessed(item.url);
      }
    }

    // Get updated daily count
    const dailyCountAfter = await getDailyGptCount();
    diagnostics.dailyCountAfter = dailyCountAfter;

    // Update lastMinId to the maximum id we processed (for Finnhub deduplication)
    if (newItems.length > 0) {
      const maxId = Math.max(...newItems.map(item => item.id || 0));
      if (maxId > lastMinId) {
        await setLastMinId(maxId);
        diagnostics.newLastMinId = maxId;
      }
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
      diagnostics
    });

  } catch (error) {
    console.error('News watchdog error:', error);
    return res.status(500).json({
      error: 'Failed to process news watchdog request',
      message: error.message
    });
  }
}
