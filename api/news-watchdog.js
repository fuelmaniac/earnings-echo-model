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
 * - NEWSAPI_KEY: (Optional) NewsAPI.org fallback when Finnhub fails/low results
 */

const MAJOR_EVENTS_KEY = "major_events";
const MAX_STORED_EVENTS = 100;
const IMPORTANCE_THRESHOLD_HIGH = 50; // Normal threshold for events
const IMPORTANCE_THRESHOLD_LOW = 30; // Lower threshold when provider supply is sparse
const IMPORTANCE_THRESHOLD_MACRO = 20; // Even lower for Tier-0 macro matches
const DAILY_GPT_CAP = 50; // Maximum GPT calls per day to control costs
const PROCESSED_URLS_KEY = "news:processedUrls"; // Track processed article URLs
const LAST_MIN_ID_KEY = "news:lastMinId"; // Track last minimum Finnhub news id processed
const PREFILTER_THRESHOLD = 10; // Minimum prefilter score to send to GPT (0 = send all)
const MAX_RAW_LOG_PER_RUN = 200; // Cap raw items logged per run to avoid flooding
const MIN_FETCH_FOR_HEALTHY = 10; // Below this, trigger fallback
const LOOKBACK_HOURS = 2; // Filter news older than this
const SNAPSHOT_KEY = "news:lastRawSnapshot"; // Last run snapshot for admin debug
const HEALTH_KEY = "news:health:last"; // Health status for admin banner

// Tier-0 Macro keywords - if matched, bypass/lower threshold
const MACRO_KEYWORDS = [
  "coup", "assassination", "sanctions", "venezuela", "opec", "earthquake",
  "missile", "default", "imf", "central bank", "election", "protests",
  "invasion", "hostage", "pipeline", "strike", "bankruptcy", "war",
  "nuclear", "fed", "interest rate", "tariff", "embargo", "martial law",
  "arrested", "captured", "president", "raid", "extradition", "indictment",
  "terror", "attack", "explosion", "ceasefire"
];

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
 * Canonical URL normalization: strip tracking params (utm_*, gclid, fbclid) for stable dedup
 * @param {string} url
 * @returns {string} - Normalized URL
 */
function canonicalizeUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const paramsToRemove = [];
    for (const key of parsed.searchParams.keys()) {
      if (key.startsWith('utm_') || key === 'gclid' || key === 'fbclid' || key === 'ref' || key === 'source') {
        paramsToRemove.push(key);
      }
    }
    paramsToRemove.forEach(k => parsed.searchParams.delete(k));
    return parsed.toString();
  } catch {
    return url; // Return as-is if invalid URL
  }
}

/**
 * Check if headline/summary matches any Tier-0 macro keywords
 * @param {string} headline
 * @param {string|null} summary
 * @returns {{ macroMatch: boolean, matchedKeywords: string[] }}
 */
function checkMacroMatch(headline, summary) {
  const text = `${headline || ''} ${summary || ''}`.toLowerCase();
  const matchedKeywords = [];
  for (const keyword of MACRO_KEYWORDS) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
    }
  }
  return {
    macroMatch: matchedKeywords.length > 0,
    matchedKeywords
  };
}

/**
 * Fetches news from NewsAPI.org (fallback provider)
 * @returns {Promise<{items: Array, status: number, error?: string}>}
 */
async function fetchFromNewsAPI() {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    return { items: [], status: 0, error: 'NEWSAPI_KEY not configured' };
  }

  try {
    const response = await fetch(
      `https://newsapi.org/v2/top-headlines?category=general&language=en&pageSize=100`,
      {
        headers: { 'X-Api-Key': apiKey }
      }
    );

    const status = response.status;
    if (!response.ok) {
      console.error('NewsAPI error:', status);
      return { items: [], status, error: `NewsAPI returned ${status}` };
    }

    const data = await response.json();
    if (data.status !== 'ok') {
      return { items: [], status, error: data.message || 'NewsAPI error' };
    }

    // Normalize NewsAPI items to our format
    const items = (data.articles || []).map((article, idx) => ({
      id: `newsapi_${Date.now()}_${idx}`,
      headline: article.title,
      body: article.description || article.content || null,
      source: article.source?.name || 'NewsAPI',
      url: canonicalizeUrl(article.url),
      publishedAt: article.publishedAt || new Date().toISOString(),
      provider: 'newsapi'
    }));

    return { items, status };
  } catch (error) {
    console.error('Failed to fetch from NewsAPI:', error);
    return { items: [], status: 0, error: error.message };
  }
}

/**
 * Stores health status for admin banner
 * @param {'warn'|'error'} level
 * @param {string} provider
 * @param {number} status
 * @param {string} message
 * @param {string|null} error
 */
async function storeHealthStatus(level, provider, status, message, error = null) {
  const health = {
    ts: new Date().toISOString(),
    level,
    provider,
    status,
    message,
    error
  };
  // 3 days TTL
  await kv.set(HEALTH_KEY, health, { ex: 86400 * 3 });
}

/**
 * Stores last run snapshot for admin debug view
 * @param {object} snapshot
 */
async function storeSnapshot(snapshot) {
  // 24 hours TTL
  await kv.set(SNAPSHOT_KEY, snapshot, { ex: 86400 });
}

/**
 * Fetches latest news headlines from Finnhub general news
 * @returns {Promise<{items: Array, status: number, error?: string}>}
 */
async function fetchFromFinnhub() {
  const finnhubApiKey = process.env.FINNHUB_API_KEY;

  if (!finnhubApiKey) {
    return { items: [], status: 0, error: 'FINNHUB_API_KEY not configured' };
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${finnhubApiKey}`
    );

    const status = response.status;
    if (!response.ok) {
      console.error('Finnhub API error:', status);
      return { items: [], status, error: `Finnhub returned ${status}` };
    }

    const data = await response.json();

    // Finnhub returns array of news items with id, headline, summary, source, url, datetime
    const items = (data || []).map(item => ({
      id: item.id,
      headline: item.headline,
      body: item.summary || null,
      source: item.source || 'Unknown',
      url: canonicalizeUrl(item.url),
      publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString(),
      provider: 'finnhub'
    }));

    return { items, status };
  } catch (error) {
    console.error('Failed to fetch from Finnhub:', error);
    return { items: [], status: 0, error: error.message };
  }
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
    const newsapiConfigured = !!process.env.NEWSAPI_KEY;

    // Snapshot data for admin debug
    const snapshotData = {
      ts: new Date().toISOString(),
      ok: true,
      primary: { provider: 'finnhub', status: 0, fetchedCount: 0, error: null },
      fallback: { provider: 'newsapi', used: false, status: 0, fetchedCount: 0, error: null },
      keptCount: 0,
      droppedCount: 0,
      items: []
    };

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
    let fallbackUsed = false;
    let primaryFailed = false;

    // Mark run start time for metrics
    await setMetric("lastRunAt", new Date().toISOString());

    // Track last fetch for simple debug endpoint
    const saveLastFetch = async (items) => {
      const lastFetch = {
        timestamp: new Date().toISOString(),
        count: items.length,
        headlines: items.slice(0, 20).map(n => n.headline)
      };
      await kv.set('news:lastFetch', lastFetch, { ex: 86400 });
    };

    // For POST requests, allow manual news injection for testing
    if (req.method === 'POST' && req.body) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body.headline) {
        newsItems = [{
          id: body.id || Date.now(),
          headline: body.headline,
          body: body.body || null,
          source: body.source || 'Manual Test',
          url: canonicalizeUrl(body.url || `manual:${Date.now()}`),
          publishedAt: new Date().toISOString(),
          provider: 'manual'
        }];
        snapshotData.primary.provider = 'manual';
        snapshotData.primary.status = 200;
        snapshotData.primary.fetchedCount = 1;
      }
    } else {
      // GET request: Fetch news with fallback logic
      const finnhubResult = await fetchFromFinnhub();
      snapshotData.primary.status = finnhubResult.status;
      snapshotData.primary.fetchedCount = finnhubResult.items.length;
      snapshotData.primary.error = finnhubResult.error || null;

      const finnhubOk = finnhubResult.status === 200 || (finnhubResult.items.length > 0);
      const finnhubHealthy = finnhubResult.items.length >= MIN_FETCH_FOR_HEALTHY;

      // Check if we need fallback: Finnhub failed OR returned too few items
      if (!finnhubOk || !finnhubHealthy) {
        primaryFailed = !finnhubOk;
        console.log(`Finnhub ${primaryFailed ? 'failed' : 'returned low count'} (${finnhubResult.items.length} items), trying NewsAPI fallback`);

        if (newsapiConfigured) {
          const newsapiResult = await fetchFromNewsAPI();
          snapshotData.fallback.used = true;
          snapshotData.fallback.status = newsapiResult.status;
          snapshotData.fallback.fetchedCount = newsapiResult.items.length;
          snapshotData.fallback.error = newsapiResult.error || null;

          if (newsapiResult.items.length > 0) {
            // Merge both sources, NewsAPI supplements Finnhub
            const existingUrls = new Set(finnhubResult.items.map(i => i.url));
            const uniqueNewsApi = newsapiResult.items.filter(i => !existingUrls.has(i.url));
            newsItems = [...finnhubResult.items, ...uniqueNewsApi];
            fallbackUsed = true;
            console.log(`NewsAPI added ${uniqueNewsApi.length} unique items`);
          } else {
            newsItems = finnhubResult.items;
          }

          // Track health status
          if (primaryFailed && newsapiResult.items.length === 0) {
            // Both failed
            await storeHealthStatus('error', 'finnhub+newsapi', finnhubResult.status,
              'Both Finnhub and NewsAPI failed', finnhubResult.error || newsapiResult.error);
            snapshotData.ok = false;
          } else if (primaryFailed && newsapiResult.items.length > 0) {
            // Primary failed but fallback worked
            await storeHealthStatus('warn', 'finnhub', finnhubResult.status,
              'Finnhub failed, using NewsAPI fallback', finnhubResult.error);
          }
        } else {
          newsItems = finnhubResult.items;
          if (primaryFailed) {
            await storeHealthStatus('error', 'finnhub', finnhubResult.status,
              'Finnhub failed and NewsAPI not configured', finnhubResult.error);
            snapshotData.ok = false;
          }
        }
      } else {
        newsItems = finnhubResult.items;
      }
    }

    diagnostics.rawNewsCount = newsItems.length;
    diagnostics.fallbackUsed = fallbackUsed;

    // Save last fetch info for debug endpoint
    await saveLastFetch(newsItems);

    // Apply lookback window filter (last 2 hours)
    const lookbackCutoff = Date.now() - (LOOKBACK_HOURS * 60 * 60 * 1000);
    const recentItems = newsItems.filter(item => {
      if (!item.publishedAt) return true; // Keep items without timestamp
      const itemTime = new Date(item.publishedAt).getTime();
      return itemTime >= lookbackCutoff;
    });

    diagnostics.filteredByLookback = newsItems.length - recentItems.length;

    // Determine adaptive threshold based on fetch health
    const useAdaptiveThreshold = fallbackUsed || newsItems.length < MIN_FETCH_FOR_HEALTHY;
    const activeThreshold = useAdaptiveThreshold ? IMPORTANCE_THRESHOLD_LOW : IMPORTANCE_THRESHOLD_HIGH;
    diagnostics.activeThreshold = activeThreshold;
    diagnostics.adaptiveTriggered = useAdaptiveThreshold;

    // Log raw fetched items (capped to avoid flooding)
    await setMetric("rawFetchedLastRun", newsItems.length);
    const itemsToLog = recentItems.slice(0, MAX_RAW_LOG_PER_RUN);
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

    // Filter out already-processed items and enrich with macro detection
    const newItems = [];
    for (const item of recentItems) {
      const itemHash = hashHeadline(item.headline, item.url);
      const { score: prefilterScore, reasons: prefilterReasons } = computePrefilterScore(item.headline, item.body);
      const { macroMatch, matchedKeywords } = checkMacroMatch(item.headline, item.body);

      // Check if already processed by URL (canonical)
      if (processedUrls.has(item.url)) {
        snapshotData.droppedCount++;
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
          decisionReason: `URL already processed: ${item.url}`,
        });
        await incrementMetric("skippedProcessedCount", 1);
        await incrementMetric("decisionsLoggedCount", 1);
        continue;
      }

      // Check if already processed by ID (only for numeric Finnhub IDs)
      if (typeof item.id === 'number' && item.id <= lastMinId) {
        snapshotData.droppedCount++;
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
          decisionReason: `ID ${item.id} <= lastMinId ${lastMinId}`,
        });
        await incrementMetric("skippedProcessedCount", 1);
        await incrementMetric("decisionsLoggedCount", 1);
        continue;
      }

      // Item is new, add to processing queue with enrichment
      newItems.push({
        ...item,
        prefilterScore,
        prefilterReasons,
        hash: itemHash,
        macroMatch,
        matchedKeywords,
        tier: macroMatch ? 0 : null
      });
    }

    diagnostics.newItemsCount = newItems.length;
    diagnostics.skippedDuplicates = recentItems.length - newItems.length;

    if (newItems.length === 0) {
      // Store snapshot even when empty
      snapshotData.items = [];
      await storeSnapshot(snapshotData);

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
        snapshotData.droppedCount++;
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
        });
        await incrementMetric("skippedDailyCapCount", 1);
        await incrementMetric("decisionsLoggedCount", 1);
      }

      // Store snapshot
      await storeSnapshot(snapshotData);

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
          snapshotData.droppedCount++;
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
        // Tier-0 macro matches get lower threshold
        const itemThreshold = item.macroMatch ? IMPORTANCE_THRESHOLD_MACRO : activeThreshold;

        // Check if it's a major event worth storing
        let majorEventId = null;
        const shouldStore = analysis.importanceScore >= itemThreshold;

        if (shouldStore) {
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
            macroMatch: item.macroMatch,
            matchedKeywords: item.matchedKeywords,
            tier: item.tier,
            analysis
          };

          const stored = await storeMajorEvent(event);
          if (stored) {
            results.majorEvents++;
            results.events.push({
              id: majorEventId,
              headline: item.headline,
              importanceScore: analysis.importanceScore,
              importanceCategory: analysis.importanceCategory,
              macroMatch: item.macroMatch
            });
            snapshotData.keptCount++;
          } else {
            majorEventId = null; // Failed to store
            snapshotData.droppedCount++;
          }
        } else {
          snapshotData.droppedCount++;
        }

        // Add to snapshot items
        snapshotData.items.push({
          headline: item.headline,
          source: item.source,
          url: item.url,
          timestamp: item.publishedAt,
          provider: item.provider,
          macroMatch: item.macroMatch,
          tier: item.tier,
          importanceScore: analysis.importanceScore,
          kept: shouldStore
        });

        // Log the decision
        await logDecision({
          provider: item.provider || 'unknown',
          providerId: item.id,
          headline: item.headline,
          hash: item.hash,
          prefilterScore: item.prefilterScore,
          prefilterReasons: item.prefilterReasons,
          threshold: itemThreshold,
          dailyCap: DAILY_GPT_CAP,
          macroMatch: item.macroMatch,
          matchedKeywords: item.matchedKeywords,
          decision: DECISION_TYPES.ANALYZED,
          decisionReason: shouldStore
            ? `Stored as major event (score ${analysis.importanceScore} >= ${itemThreshold}${item.macroMatch ? ', Tier-0 macro' : ''})`
            : `Below threshold (score ${analysis.importanceScore} < ${itemThreshold})`,
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
        snapshotData.droppedCount++;

        // Add to snapshot with error
        snapshotData.items.push({
          headline: item.headline,
          source: item.source,
          url: item.url,
          timestamp: item.publishedAt,
          provider: item.provider,
          macroMatch: item.macroMatch,
          tier: item.tier,
          error: itemError.message,
          kept: false
        });

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

    // Update lastMinId to the maximum numeric id we processed (for Finnhub deduplication)
    const numericIds = newItems.filter(item => typeof item.id === 'number').map(item => item.id);
    if (numericIds.length > 0) {
      const maxId = Math.max(...numericIds);
      if (maxId > lastMinId) {
        await setLastMinId(maxId);
        diagnostics.newLastMinId = maxId;
      }
    }

    // Store snapshot (limit to 50 items for storage efficiency)
    snapshotData.items = snapshotData.items.slice(0, 50);
    await storeSnapshot(snapshotData);

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
