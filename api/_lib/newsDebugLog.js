import { kv } from "@vercel/kv";
import { createHash } from "crypto";

/**
 * News Debug Log Module
 *
 * KV-backed logging for news pipeline observability.
 * Stores raw ingest items, decision entries, and metrics.
 */

// KV Keys
const RAW_ITEMS_KEY = "news:debug:raw";
const DECISIONS_KEY = "news:debug:decisions";
const METRICS_KEY = "news:debug:metrics";

// Limits
const RAW_LIMIT = 300;
const DECISION_LIMIT = 300;
const TTL_SECONDS = 72 * 60 * 60; // 72 hours

/**
 * Creates a deterministic hash for headline deduplication
 * @param {string} headline - The news headline
 * @param {string|null} url - Optional URL
 * @returns {string} Short hash (16 chars)
 */
export function hashHeadline(headline, url = null) {
  // Normalize: lowercase, remove punctuation, collapse whitespace
  let normalized = (headline || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Include URL host if present
  if (url) {
    try {
      const urlObj = new URL(url);
      normalized += `|${urlObj.hostname}`;
    } catch {
      // Invalid URL, skip host
    }
  }

  // Create SHA256 hash and take first 16 chars
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return hash;
}

/**
 * Logs a raw news item from the provider
 * @param {object} rawItem - Raw item with provider, headline, etc.
 */
export async function logRawItem(rawItem) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      provider: rawItem.provider || "finnhub",
      providerId: rawItem.providerId || rawItem.id || null,
      datetime: rawItem.datetime || null,
      source: rawItem.source || null,
      headline: rawItem.headline || "",
      summary: rawItem.summary || rawItem.body || null,
      url: rawItem.url || null,
      category: rawItem.category || "general",
      hash: hashHeadline(rawItem.headline, rawItem.url),
    };

    // Get current list
    let items = (await kv.get(RAW_ITEMS_KEY)) || [];

    // Prepend new item (newest first)
    items.unshift(entry);

    // Trim to limit
    if (items.length > RAW_LIMIT) {
      items = items.slice(0, RAW_LIMIT);
    }

    // Store with TTL
    await kv.set(RAW_ITEMS_KEY, items, { ex: TTL_SECONDS });
  } catch (error) {
    console.error("[newsDebugLog] Failed to log raw item:", error.message);
  }
}

/**
 * Logs a decision entry for a news item
 * @param {object} decisionEntry - Decision with score, reasons, etc.
 */
export async function logDecision(decisionEntry) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      provider: decisionEntry.provider || "finnhub",
      providerId: decisionEntry.providerId || null,
      headline: decisionEntry.headline || "",
      hash: decisionEntry.hash || hashHeadline(decisionEntry.headline, decisionEntry.url),
      prefilterScore: decisionEntry.prefilterScore ?? 0,
      prefilterReasons: decisionEntry.prefilterReasons || [],
      threshold: decisionEntry.threshold ?? 50,
      dailyCap: decisionEntry.dailyCap ?? 50,
      cooldownApplied: decisionEntry.cooldownApplied ?? false,
      dedupeHit: decisionEntry.dedupeHit ?? false,
      decision: decisionEntry.decision || "UNKNOWN",
      decisionReason: decisionEntry.decisionReason || "",
      classifier: {
        used: decisionEntry.classifier?.used ?? false,
        importanceScore: decisionEntry.classifier?.importanceScore ?? null,
        importanceCategory: decisionEntry.classifier?.importanceCategory ?? null,
        marketRelevance: decisionEntry.classifier?.marketRelevance ?? null,
        summary: decisionEntry.classifier?.summary ?? null,
      },
      majorEventId: decisionEntry.majorEventId || null,
      error: decisionEntry.error || null,
    };

    // Get current list
    let decisions = (await kv.get(DECISIONS_KEY)) || [];

    // Prepend new decision (newest first)
    decisions.unshift(entry);

    // Trim to limit
    if (decisions.length > DECISION_LIMIT) {
      decisions = decisions.slice(0, DECISION_LIMIT);
    }

    // Store with TTL
    await kv.set(DECISIONS_KEY, decisions, { ex: TTL_SECONDS });
  } catch (error) {
    console.error("[newsDebugLog] Failed to log decision:", error.message);
  }
}

/**
 * Increments a metric counter
 * @param {string} name - Metric name
 * @param {number} delta - Amount to increment (default 1)
 */
export async function incrementMetric(name, delta = 1) {
  try {
    let metrics = (await kv.get(METRICS_KEY)) || {};
    metrics[name] = (metrics[name] || 0) + delta;
    metrics.lastUpdatedAt = new Date().toISOString();
    await kv.set(METRICS_KEY, metrics, { ex: TTL_SECONDS });
  } catch (error) {
    console.error("[newsDebugLog] Failed to increment metric:", error.message);
  }
}

/**
 * Sets a metric value directly
 * @param {string} name - Metric name
 * @param {any} value - Value to set
 */
export async function setMetric(name, value) {
  try {
    let metrics = (await kv.get(METRICS_KEY)) || {};
    metrics[name] = value;
    metrics.lastUpdatedAt = new Date().toISOString();
    await kv.set(METRICS_KEY, metrics, { ex: TTL_SECONDS });
  } catch (error) {
    console.error("[newsDebugLog] Failed to set metric:", error.message);
  }
}

/**
 * Gets raw ingest items
 * @param {number} limit - Max items to return (default 200, max 300)
 * @returns {Promise<Array>}
 */
export async function getRawItems(limit = 200) {
  try {
    const items = (await kv.get(RAW_ITEMS_KEY)) || [];
    const effectiveLimit = Math.min(Math.max(1, limit), RAW_LIMIT);
    return items.slice(0, effectiveLimit);
  } catch (error) {
    console.error("[newsDebugLog] Failed to get raw items:", error.message);
    return [];
  }
}

/**
 * Gets decision entries
 * @param {number} limit - Max items to return (default 200, max 300)
 * @returns {Promise<Array>}
 */
export async function getDecisions(limit = 200) {
  try {
    const decisions = (await kv.get(DECISIONS_KEY)) || [];
    const effectiveLimit = Math.min(Math.max(1, limit), DECISION_LIMIT);
    return decisions.slice(0, effectiveLimit);
  } catch (error) {
    console.error("[newsDebugLog] Failed to get decisions:", error.message);
    return [];
  }
}

/**
 * Gets all metrics
 * @returns {Promise<object>}
 */
export async function getMetrics() {
  try {
    return (await kv.get(METRICS_KEY)) || {
      rawFetchedLastRun: 0,
      rawLoggedCount: 0,
      decisionsLoggedCount: 0,
      analyzedCount: 0,
      skippedLowPrefilterCount: 0,
      skippedDailyCapCount: 0,
      skippedProcessedCount: 0,
      errorsCount: 0,
      lastRunAt: null,
    };
  } catch (error) {
    console.error("[newsDebugLog] Failed to get metrics:", error.message);
    return {};
  }
}

/**
 * Resets all metrics to zero
 */
export async function resetMetrics() {
  try {
    const freshMetrics = {
      rawFetchedLastRun: 0,
      rawLoggedCount: 0,
      decisionsLoggedCount: 0,
      analyzedCount: 0,
      skippedLowPrefilterCount: 0,
      skippedDailyCapCount: 0,
      skippedProcessedCount: 0,
      errorsCount: 0,
      lastRunAt: null,
      lastUpdatedAt: new Date().toISOString(),
    };
    await kv.set(METRICS_KEY, freshMetrics, { ex: TTL_SECONDS });
  } catch (error) {
    console.error("[newsDebugLog] Failed to reset metrics:", error.message);
  }
}

// ============================================================================
// PREFILTER SCORING
// ============================================================================

/**
 * Keyword families for prefilter scoring
 * Each family has a weight and list of keywords
 */
const KEYWORD_FAMILIES = {
  // Geopolitical keywords (high importance)
  geopolitical: {
    weight: 20,
    keywords: [
      "war", "invasion", "military", "troops", "army", "navy", "airforce",
      "sanctions", "embargo", "blockade", "coup", "overthrow", "regime",
      "president", "prime minister", "leader", "dictator", "assassination",
      "arrested", "captured", "detained", "extradited", "extradition",
      "raid", "operation", "strike", "airstrike", "bombing", "missile",
      "nuclear", "nato", "un security", "summit", "treaty", "alliance",
      "tariff", "trade war", "retaliation", "diplomatic", "ambassador",
      "election", "referendum", "protest", "uprising", "revolution",
    ],
  },
  // Economic/macro keywords
  macro: {
    weight: 18,
    keywords: [
      "fed", "federal reserve", "interest rate", "rate hike", "rate cut",
      "inflation", "cpi", "ppi", "gdp", "recession", "depression",
      "unemployment", "jobs report", "nonfarm", "payroll",
      "treasury", "bond", "yield", "debt ceiling", "default",
      "central bank", "ecb", "boj", "pboc", "quantitative",
      "stimulus", "bailout", "rescue", "emergency", "liquidity",
      "currency", "forex", "dollar", "euro", "yuan", "yen",
    ],
  },
  // Energy/commodity keywords
  energy: {
    weight: 15,
    keywords: [
      "oil", "crude", "brent", "wti", "opec", "pipeline", "refinery",
      "natural gas", "lng", "petroleum", "gasoline", "diesel",
      "energy crisis", "blackout", "grid", "power outage",
      "solar", "wind", "renewable", "nuclear plant",
      "coal", "mining", "commodity", "metal", "gold", "silver", "copper",
    ],
  },
  // Financial crisis keywords
  crisis: {
    weight: 25,
    keywords: [
      "crash", "collapse", "bankrupt", "bankruptcy", "insolvency",
      "bank run", "panic", "meltdown", "contagion", "systemic",
      "fraud", "scandal", "investigation", "sec", "doj",
      "margin call", "liquidation", "default", "failure",
      "circuit breaker", "halt", "suspended", "delisted",
    ],
  },
  // Technology/cyber keywords
  tech: {
    weight: 12,
    keywords: [
      "cyber", "hack", "breach", "ransomware", "malware",
      "ai", "artificial intelligence", "chatgpt", "openai",
      "chip", "semiconductor", "nvidia", "tsmc", "intel",
      "antitrust", "monopoly", "regulation", "ban",
      "data", "privacy", "security", "outage", "down",
    ],
  },
  // Disaster/emergency keywords
  disaster: {
    weight: 14,
    keywords: [
      "earthquake", "tsunami", "hurricane", "typhoon", "cyclone",
      "flood", "wildfire", "volcano", "eruption", "disaster",
      "pandemic", "epidemic", "outbreak", "virus", "covid",
      "emergency", "evacuation", "casualties", "fatalities",
      "explosion", "fire", "accident", "derailment",
    ],
  },
  // Market-specific keywords
  market: {
    weight: 10,
    keywords: [
      "earnings", "revenue", "profit", "loss", "guidance",
      "merger", "acquisition", "buyout", "takeover", "ipo",
      "dividend", "buyback", "split", "offering",
      "downgrade", "upgrade", "rating", "outlook",
      "beat", "miss", "surprise", "forecast",
    ],
  },
};

/**
 * Computes a prefilter score and reasons for a headline
 * @param {string} headline - The news headline
 * @param {string|null} body - Optional body text
 * @returns {{ score: number, reasons: string[] }}
 */
export function computePrefilterScore(headline, body = null) {
  const text = `${headline || ""} ${body || ""}`.toLowerCase();
  let score = 0;
  const reasons = [];

  for (const [family, config] of Object.entries(KEYWORD_FAMILIES)) {
    for (const keyword of config.keywords) {
      if (text.includes(keyword)) {
        score += config.weight;
        reasons.push(`keyword:${family}:${keyword}`);
        // Only count first match per family to avoid over-scoring
        break;
      }
    }
  }

  // Bonus for multiple families triggered
  const familiesTriggered = new Set(reasons.map((r) => r.split(":")[1])).size;
  if (familiesTriggered >= 3) {
    score += 15;
    reasons.push("bonus:multi_family");
  }

  return { score, reasons };
}

/**
 * Decision types
 */
export const DECISION_TYPES = {
  ANALYZED: "ANALYZED",
  SKIPPED_LOW_PREFILTER: "SKIPPED_LOW_PREFILTER",
  SKIPPED_ALREADY_PROCESSED: "SKIPPED_ALREADY_PROCESSED",
  SKIPPED_DAILY_CAP: "SKIPPED_DAILY_CAP",
  SKIPPED_PROVIDER_MISSING: "SKIPPED_PROVIDER_MISSING",
  ERROR: "ERROR",
};
