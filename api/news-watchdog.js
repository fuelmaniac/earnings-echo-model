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
const IMPORTANCE_THRESHOLD_HIGH = 50; // Normal threshold for importance
const IMPORTANCE_THRESHOLD_LOW = 30; // Lower threshold when supply is sparse
const DAILY_GPT_CAP = 50; // Maximum GPT calls per day to control costs
const PROCESSED_URLS_KEY = "news:processedUrls"; // Track processed article URLs
const LAST_MIN_ID_KEY = "news:lastMinId"; // Track last minimum Finnhub news id processed
const PREFILTER_THRESHOLD = 10; // Minimum prefilter score to send to GPT (0 = send all)
const MAX_RAW_LOG_PER_RUN = 200; // Cap raw items logged per run to avoid flooding
const RAW_SNAPSHOT_KEY = "news:lastRawSnapshot"; // Last run raw snapshot for admin
const HEALTH_KEY = "news:health:last"; // Ingest health status
const LOOKBACK_HOURS = 2; // Lookback window to catch missed items
const SPARSE_FETCH_THRESHOLD = 10; // If fetched < this, use low threshold

// Tier-0 Macro keywords - bypass normal threshold (case-insensitive)
const MACRO_KEYWORDS = [
  "coup", "assassination", "sanctions", "venezuela", "opec", "earthquake", "missile",
  "default", "imf", "central bank", "election", "protests", "invasion", "hostage",
  "pipeline", "strike", "bankruptcy", "war", "nuclear", "fed", "interest rate",
  "tariff", "embargo", "martial law", "arrested", "captured", "president", "raid",
  "extradition", "indictment", "terror", "attack", "explosion", "ceasefire"
];

/**
 * Checks if text contains any macro keywords (Tier-0)
 * @param {string} text - Text to check (headline + body)
 * @returns {{ isMacro: boolean, matchedKeyword: string|null }}
 */
function checkMacroKeywords(text) {
  const lowerText = (text || "").toLowerCase();
  for (const keyword of MACRO_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return { isMacro: true, matchedKeyword: keyword };
    }
  }
  return { isMacro: false, matchedKeyword: null };
}

/**
 * Normalizes a URL for deduplication (strips query params, trailing slashes, etc.)
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    // Remove tracking params, normalize hostname
    const cleanPath = parsed.pathname.replace(/\/+$/, ""); // remove trailing slashes
    return `${parsed.hostname}${cleanPath}`.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

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
 * Fetches news from Finnhub
 * @param {number} lookbackMs - Lookback window in milliseconds
 * @returns {Promise<{ items: Array, status: number, error: string|null }>}
 */
async function fetchFromFinnhub(lookbackMs = 0) {
  const finnhubApiKey = process.env.FINNHUB_API_KEY;
  if (!finnhubApiKey) {
    return { items: [], status: 0, error: "No FINNHUB_API_KEY configured" };
  }

  try {
    // Finnhub doesn't support time filtering well, but we filter on our side
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${finnhubApiKey}`
    );

    if (!response.ok) {
      console.error('Finnhub API error:', response.status);
      return { items: [], status: response.status, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const cutoffTime = lookbackMs > 0 ? Date.now() - lookbackMs : 0;

    // Filter by lookback window and normalize
    const items = (data || [])
      .filter(item => {
        if (!lookbackMs) return true;
        const pubTime = item.datetime ? item.datetime * 1000 : Date.now();
        return pubTime >= cutoffTime;
      })
      .map(item => ({
        id: item.id,
        headline: item.headline,
        body: item.summary || null,
        source: item.source || 'Unknown',
        url: item.url,
        normalizedUrl: normalizeUrl(item.url),
        publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString(),
        provider: 'finnhub'
      }));

    return { items, status: 200, error: null };
  } catch (error) {
    console.error('Failed to fetch from Finnhub:', error);
    return { items: [], status: 0, error: error.message };
  }
}

/**
 * Fetches news from NewsAPI.org (fallback provider)
 * @returns {Promise<{ items: Array, status: number, error: string|null }>}
 */
async function fetchFromNewsAPI() {
  const newsapiKey = process.env.NEWSAPI_KEY;
  if (!newsapiKey) {
    return { items: [], status: 0, error: "No NEWSAPI_KEY configured" };
  }

  try {
    const response = await fetch(
      `https://newsapi.org/v2/top-headlines?category=general&language=en&pageSize=50&apiKey=${newsapiKey}`
    );

    if (!response.ok) {
      console.error('NewsAPI error:', response.status);
      return { items: [], status: response.status, error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.status !== 'ok') {
      return { items: [], status: 0, error: data.message || 'NewsAPI error' };
    }

    // Normalize NewsAPI format to match our schema
    const items = (data.articles || []).map((article, idx) => ({
      id: `newsapi_${Date.now()}_${idx}`,
      headline: article.title || '',
      body: article.description || null,
      source: article.source?.name || 'NewsAPI',
      url: article.url,
      normalizedUrl: normalizeUrl(article.url),
      publishedAt: article.publishedAt || new Date().toISOString(),
      provider: 'newsapi'
    }));

    return { items, status: 200, error: null };
  } catch (error) {
    console.error('Failed to fetch from NewsAPI:', error);
    return { items: [], status: 0, error: error.message };
  }
}

/**
 * Fetches latest news with fallback from Finnhub to NewsAPI
 * @returns {Promise<{ items: Array, source: string, fallbackUsed: boolean, finnhubStatus: object, newsapiStatus: object }>}
 */
async function fetchLatestNews() {
  const lookbackMs = LOOKBACK_HOURS * 60 * 60 * 1000;

  // Try Finnhub first
  const finnhubResult = await fetchFromFinnhub(lookbackMs);
  let items = finnhubResult.items;
  let source = 'finnhub';
  let fallbackUsed = false;
  let newsapiResult = { items: [], status: 0, error: null };

  // Fallback to NewsAPI if Finnhub returns too few items or failed
  const shouldFallback = finnhubResult.items.length < SPARSE_FETCH_THRESHOLD ||
                         finnhubResult.status !== 200;

  if (shouldFallback && process.env.NEWSAPI_KEY) {
    newsapiResult = await fetchFromNewsAPI();

    if (newsapiResult.items.length > 0) {
      // Merge items, deduping by normalized URL
      const seenUrls = new Set(items.map(i => i.normalizedUrl));
      const newItems = newsapiResult.items.filter(i => !seenUrls.has(i.normalizedUrl));
      items = [...items, ...newItems];
      fallbackUsed = true;
      source = finnhubResult.items.length > 0 ? 'finnhub+newsapi' : 'newsapi';
    }
  }

  return {
    items,
    source,
    fallbackUsed,
    finnhubStatus: { count: finnhubResult.items.length, status: finnhubResult.status, error: finnhubResult.error },
    newsapiStatus: { count: newsapiResult.items.length, status: newsapiResult.status, error: newsapiResult.error }
  };
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
 * Marks a URL as processed (uses normalized URL for deduplication)
 */
async function markUrlProcessed(url) {
  if (!url) return;
  const normalized = normalizeUrl(url);
  let urls = await kv.get(PROCESSED_URLS_KEY) || [];
  if (!urls.includes(normalized)) {
    urls.unshift(normalized);
    // Keep only last 1000 URLs
    if (urls.length > 1000) {
      urls = urls.slice(0, 1000);
    }
    await kv.set(PROCESSED_URLS_KEY, urls);
  }
}

/**
 * Stores the raw snapshot for admin debugging
 * @param {object} snapshot - The snapshot data
 */
async function storeRawSnapshot(snapshot) {
  try {
    await kv.set(RAW_SNAPSHOT_KEY, snapshot, { ex: 86400 }); // 24hr TTL
  } catch (error) {
    console.error('Failed to store raw snapshot:', error);
  }
}

/**
 * Stores health status for admin monitoring
 * @param {object} health - Health data
 */
async function storeHealth(health) {
  try {
    await kv.set(HEALTH_KEY, {
      ts: new Date().toISOString(),
      ...health
    }, { ex: 259200 }); // 3 day TTL
  } catch (error) {
    console.error('Failed to store health:', error);
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
    const newsapiConfigured = !!process.env.NEWSAPI_KEY;

    // Diagnostic info to include in response
    const diagnostics = {
      dailyCountBefore,
      dailyCap: DAILY_GPT_CAP,
      thresholdHigh: IMPORTANCE_THRESHOLD_HIGH,
      thresholdLow: IMPORTANCE_THRESHOLD_LOW,
      finnhubConfigured,
      newsapiConfigured,
      processedUrlsCount: processedUrls.size,
      lastMinId
    };

    let newsItems = [];
    let newsSource = 'none';
    let fetchResult = null;

    // Mark run start time for metrics
    await setMetric("lastRunAt", new Date().toISOString());

    // For POST requests, allow manual news injection for testing
    if (req.method === 'POST' && req.body) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body.headline) {
        newsItems = [{
          id: body.id || Date.now(),
          headline: body.headline,
          body: body.body || null,
          source: body.source || 'Manual Test',
          url: body.url || `manual:${Date.now()}`,
          normalizedUrl: normalizeUrl(body.url || `manual:${Date.now()}`),
          publishedAt: new Date().toISOString(),
          provider: 'manual'
        }];
        newsSource = 'manual';
      }
    } else {
      // GET request: Fetch news with fallback
      fetchResult = await fetchLatestNews();
      newsItems = fetchResult.items;
      newsSource = fetchResult.source;
      diagnostics.finnhubStatus = fetchResult.finnhubStatus;
      diagnostics.newsapiStatus = fetchResult.newsapiStatus;
      diagnostics.fallbackUsed = fetchResult.fallbackUsed;
    }

    diagnostics.newsSource = newsSource;
    diagnostics.rawNewsCount = newsItems.length;

    // Determine adaptive threshold based on fetch count
    const useLowThreshold = newsItems.length < SPARSE_FETCH_THRESHOLD ||
                            (fetchResult && fetchResult.fallbackUsed);
    const activeThreshold = useLowThreshold ? IMPORTANCE_THRESHOLD_LOW : IMPORTANCE_THRESHOLD_HIGH;
    diagnostics.activeThreshold = activeThreshold;
    diagnostics.useLowThreshold = useLowThreshold;

    // Store raw snapshot for admin debugging
    const rawSnapshot = {
      ts: new Date().toISOString(),
      source: newsSource,
      fetchedCount: newsItems.length,
      fallbackUsed: fetchResult?.fallbackUsed || false,
      finnhubStatus: fetchResult?.finnhubStatus || null,
      newsapiStatus: fetchResult?.newsapiStatus || null,
      items: newsItems.slice(0, 50).map(item => ({
        headline: item.headline,
        source: item.source,
        url: item.url,
        timestamp: item.publishedAt,
        provider: item.provider
      }))
    };

    // Store health status
    const bothFailed = fetchResult &&
      (fetchResult.finnhubStatus?.status !== 200 || fetchResult.finnhubStatus?.count === 0) &&
      (fetchResult.newsapiStatus?.status !== 200 || fetchResult.newsapiStatus?.count === 0);

    const oneFailed = fetchResult && (
      (fetchResult.finnhubStatus?.status !== 200 || fetchResult.finnhubStatus?.count === 0) ||
      (fetchResult.newsapiStatus?.status !== 200 || fetchResult.newsapiStatus?.count === 0)
    );

    if (bothFailed && newsItems.length === 0) {
      await storeHealth({
        status: 'error',
        message: 'Both providers failed',
        finnhubStatus: fetchResult?.finnhubStatus,
        newsapiStatus: fetchResult?.newsapiStatus,
        fetchedCount: 0
      });
    } else if (oneFailed && fetchResult?.fallbackUsed) {
      await storeHealth({
        status: 'warning',
        message: 'Primary provider failed, using fallback',
        finnhubStatus: fetchResult?.finnhubStatus,
        newsapiStatus: fetchResult?.newsapiStatus,
        fetchedCount: newsItems.length
      });
    } else {
      await storeHealth({
        status: 'ok',
        message: 'Providers healthy',
        fetchedCount: newsItems.length,
        source: newsSource
      });
    }

    // Store raw snapshot for admin debugging (after health is stored)
    await storeRawSnapshot(rawSnapshot);

    // Log raw fetched items (capped to avoid flooding)
    await setMetric("rawFetchedLastRun", newsItems.length);
    const itemsToLog = newsItems.slice(0, MAX_RAW_LOG_PER_RUN);
    for (const item of itemsToLog) {
      await logRawItem({
        provider: item.provider || 'unknown',
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

    // Filter out already-processed items using normalized URL for cross-provider deduplication
    const newItems = [];
    for (const item of newsItems) {
      const itemHash = hashHeadline(item.headline, item.url);
      const { score: prefilterScore, reasons: prefilterReasons } = computePrefilterScore(item.headline, item.body);
      const normalizedUrl = item.normalizedUrl || normalizeUrl(item.url);

      // Check if already processed by normalized URL (works across providers)
      if (processedUrls.has(normalizedUrl)) {
        await logDecision({
          provider: item.provider || 'unknown',
          providerId: item.id,
          headline: item.headline,
          hash: itemHash,
          prefilterScore,
          prefilterReasons,
          threshold: activeThreshold,
          dailyCap: DAILY_GPT_CAP,
          dedupeHit: true,
          decision: DECISION_TYPES.SKIPPED_ALREADY_PROCESSED,
          decisionReason: `URL already processed: ${normalizedUrl}`,
        });
        await incrementMetric("skippedProcessedCount", 1);
        await incrementMetric("decisionsLoggedCount", 1);
        continue;
      }

      // Check if already processed by ID (Finnhub only, for backwards compat)
      if (item.provider === 'finnhub' && item.id && typeof item.id === 'number' && item.id <= lastMinId) {
        await logDecision({
          provider: item.provider,
          providerId: item.id,
          headline: item.headline,
          hash: itemHash,
          prefilterScore,
          prefilterReasons,
          threshold: activeThreshold,
          dailyCap: DAILY_GPT_CAP,
          dedupeHit: true,
          decision: DECISION_TYPES.SKIPPED_ALREADY_PROCESSED,
          decisionReason: `ID ${item.id} <= lastMinId ${lastMinId}`,
        });
        await incrementMetric("skippedProcessedCount", 1);
        await incrementMetric("decisionsLoggedCount", 1);
        continue;
      }

      // Check for Tier-0 macro keywords
      const macroCheck = checkMacroKeywords(`${item.headline} ${item.body || ''}`);

      // Item is new, add to processing queue with macro info
      newItems.push({
        ...item,
        normalizedUrl,
        prefilterScore,
        prefilterReasons,
        hash: itemHash,
        isMacro: macroCheck.isMacro,
        macroKeyword: macroCheck.matchedKeyword
      });
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
          provider: item.provider || 'unknown',
          providerId: item.id,
          headline: item.headline,
          hash: item.hash,
          prefilterScore: item.prefilterScore,
          prefilterReasons: item.prefilterReasons,
          threshold: activeThreshold,
          dailyCap: DAILY_GPT_CAP,
          decision: DECISION_TYPES.SKIPPED_DAILY_CAP,
          decisionReason: `Daily GPT cap reached (${dailyCountBefore}/${DAILY_GPT_CAP})`,
          isMacro: item.isMacro,
          macroKeyword: item.macroKeyword,
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

    // Tier-0 macro threshold (very low for macro news)
    const MACRO_THRESHOLD = 20;

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
            provider: remainingItem.provider || 'unknown',
            providerId: remainingItem.id,
            headline: remainingItem.headline,
            hash: remainingItem.hash,
            prefilterScore: remainingItem.prefilterScore,
            prefilterReasons: remainingItem.prefilterReasons,
            threshold: activeThreshold,
            dailyCap: DAILY_GPT_CAP,
            decision: DECISION_TYPES.SKIPPED_DAILY_CAP,
            decisionReason: `Daily GPT cap reached mid-run (${currentCount}/${DAILY_GPT_CAP})`,
            isMacro: remainingItem.isMacro,
            macroKeyword: remainingItem.macroKeyword,
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

        // Determine effective threshold for this item
        // Tier-0 macro items use a much lower threshold (20)
        const itemThreshold = item.isMacro ? MACRO_THRESHOLD : activeThreshold;

        // Check if it's a major event worth storing
        let majorEventId = null;
        const meetsThreshold = analysis.importanceScore >= itemThreshold;

        if (meetsThreshold) {
          // Generate a unique event ID
          majorEventId = `evt_${Date.now()}_${item.hash.slice(0, 8)}`;

          const event = {
            id: majorEventId,
            headline: item.headline,
            body: item.body,
            source: item.source,
            url: item.url,
            publishedAt: item.publishedAt,
            provider: item.provider,
            analysis,
            // Track if it was a macro keyword bypass
            tier0Macro: item.isMacro ? { keyword: item.macroKeyword } : null
          };

          const stored = await storeMajorEvent(event);
          if (stored) {
            results.majorEvents++;
            results.events.push({
              id: majorEventId,
              headline: item.headline,
              importanceScore: analysis.importanceScore,
              importanceCategory: analysis.importanceCategory,
              tier0Macro: item.isMacro,
              provider: item.provider
            });
          } else {
            majorEventId = null; // Failed to store
          }
        }

        // Log the decision
        const thresholdUsed = item.isMacro ? MACRO_THRESHOLD : activeThreshold;
        await logDecision({
          provider: item.provider || 'unknown',
          providerId: item.id,
          headline: item.headline,
          hash: item.hash,
          prefilterScore: item.prefilterScore,
          prefilterReasons: item.prefilterReasons,
          threshold: thresholdUsed,
          dailyCap: DAILY_GPT_CAP,
          decision: DECISION_TYPES.ANALYZED,
          decisionReason: meetsThreshold
            ? `Stored as major event (score ${analysis.importanceScore} >= ${thresholdUsed}${item.isMacro ? ', Tier-0 macro: ' + item.macroKeyword : ''})`
            : `Below threshold (score ${analysis.importanceScore} < ${thresholdUsed})`,
          classifier: {
            used: true,
            importanceScore: analysis.importanceScore,
            importanceCategory: analysis.importanceCategory,
            marketRelevance: analysis.sectors?.length > 0 ? analysis.sectors[0].confidence : null,
            summary: analysis.summary,
          },
          majorEventId,
          isMacro: item.isMacro,
          macroKeyword: item.macroKeyword,
        });
        await incrementMetric("analyzedCount", 1);
        await incrementMetric("decisionsLoggedCount", 1);

      } catch (itemError) {
        console.error('Error processing news item:', item.headline, itemError);
        results.errors++;

        // Log the error decision
        await logDecision({
          provider: item.provider || 'unknown',
          providerId: item.id,
          headline: item.headline,
          hash: item.hash,
          prefilterScore: item.prefilterScore,
          prefilterReasons: item.prefilterReasons,
          threshold: activeThreshold,
          dailyCap: DAILY_GPT_CAP,
          decision: DECISION_TYPES.ERROR,
          decisionReason: `Error during analysis: ${itemError.message}`,
          error: itemError.message,
          isMacro: item.isMacro,
          macroKeyword: item.macroKeyword,
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

    // Update lastMinId to the maximum Finnhub id we processed
    const finnhubItems = newItems.filter(item => item.provider === 'finnhub' && typeof item.id === 'number');
    if (finnhubItems.length > 0) {
      const maxId = Math.max(...finnhubItems.map(item => item.id));
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
