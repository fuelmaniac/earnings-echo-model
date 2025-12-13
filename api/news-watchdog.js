import { kv } from "@vercel/kv";
import { analyzeNewsWithGPT } from "./_lib/newsIntel.js";
import { scoreHeadline } from "./_lib/headlineScorer.js";

// Configuration with defaults
const NEWS_INTEL_MAX_PER_DAY = parseInt(process.env.NEWS_INTEL_MAX_PER_DAY || "10", 10);
const NEWS_MAJOR_THRESHOLD = parseInt(process.env.NEWS_MAJOR_THRESHOLD || "70", 10);
const PROCESSED_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAJOR_EVENTS_MAX = 50;

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Fetch general news from Finnhub
 */
async function fetchFinnhubNews() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    throw new Error('FINNHUB_API_KEY is not configured');
  }

  const url = `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-cron-secret');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check cron secret if configured
  // Vercel cron cannot send custom headers, so we also check query param
  const cronSecret = process.env.NEWS_WATCHDOG_CRON_SECRET;
  if (cronSecret) {
    const headerSecret = req.headers['x-cron-secret'];
    const querySecret = req.query?.secret;

    if (headerSecret !== cronSecret && querySecret !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Read last min ID from KV
    let lastMinId = await kv.get('news:lastMinId');
    if (lastMinId === null || lastMinId === undefined) {
      lastMinId = 0;
    }

    // Fetch news from Finnhub
    const allNews = await fetchFinnhubNews();

    if (!Array.isArray(allNews)) {
      return res.status(500).json({ error: 'Invalid response from Finnhub' });
    }

    // Filter for new items (id > lastMinId) and sort ascending by id
    const newItems = allNews
      .filter(item => item.id > lastMinId)
      .sort((a, b) => a.id - b.id);

    // Track stats
    let analyzedCount = 0;
    let maxIdSeen = lastMinId;
    const todayKey = getTodayKey();

    // Process each item
    for (const item of newItems) {
      try {
        // Update max ID seen
        if (item.id > maxIdSeen) {
          maxIdSeen = item.id;
        }

        // Check if already processed (dedupe)
        const processedKey = `news:processed:${item.id}`;
        const alreadyProcessed = await kv.get(processedKey);
        if (alreadyProcessed) {
          continue;
        }

        // Score the headline for importance
        const prefilterScore = scoreHeadline(item.headline, item.summary);

        // If below threshold, just mark as processed and continue
        if (prefilterScore < NEWS_MAJOR_THRESHOLD) {
          await kv.set(processedKey, "1", { ex: PROCESSED_TTL_SECONDS });
          continue;
        }

        // Check daily cap
        const dailyCountKey = `news:dailyCount:${todayKey}`;
        let dailyCount = await kv.get(dailyCountKey);
        dailyCount = dailyCount ? parseInt(dailyCount, 10) : 0;

        if (dailyCount >= NEWS_INTEL_MAX_PER_DAY) {
          // Mark as processed but skip GPT analysis
          await kv.set(processedKey, "1", { ex: PROCESSED_TTL_SECONDS });
          continue;
        }

        // Call GPT analysis
        const analysis = await analyzeNewsWithGPT({
          headline: item.headline,
          body: item.summary || ""
        });

        // Create event object
        const event = {
          id: item.id,
          source: "finnhub",
          datetime: item.datetime || Math.floor(Date.now() / 1000),
          headline: item.headline,
          url: item.url || null,
          prefilterScore,
          analysis,
          analyzedAt: new Date().toISOString()
        };

        // Store in major events list (LPUSH newest first)
        await kv.lpush('news:majorEvents', JSON.stringify(event));

        // Trim list to keep only latest 50
        await kv.ltrim('news:majorEvents', 0, MAJOR_EVENTS_MAX - 1);

        // Increment daily count
        await kv.incr(dailyCountKey);
        // Set TTL on daily count key (expires end of day + buffer)
        await kv.expire(dailyCountKey, 25 * 60 * 60);

        // Mark as processed
        await kv.set(processedKey, "1", { ex: PROCESSED_TTL_SECONDS });

        analyzedCount++;
      } catch (itemError) {
        // Log error but continue processing other items
        console.error(`Error processing news item ${item.id}:`, itemError);
        // Still mark as processed to avoid retrying endlessly
        try {
          await kv.set(`news:processed:${item.id}`, "1", { ex: PROCESSED_TTL_SECONDS });
        } catch (markError) {
          console.error(`Failed to mark item ${item.id} as processed:`, markError);
        }
      }
    }

    // Update lastMinId
    if (maxIdSeen > lastMinId) {
      await kv.set('news:lastMinId', maxIdSeen);
    }

    return res.status(200).json({
      fetched: allNews.length,
      newItems: newItems.length,
      analyzed: analyzedCount,
      lastMinId: maxIdSeen
    });

  } catch (error) {
    console.error('Error in news-watchdog:', error);
    return res.status(500).json({ error: 'Failed to process news watchdog' });
  }
}
