/**
 * Telemetry Module - Signal Logging and Daily Indexing
 *
 * Provides immutable logging of trade signals to KV with daily ZSET indexing
 * for efficient cron-based outcome computation.
 */

// TTL constants
const TSLOG_TTL_DAYS = 90;
const TSIDX_TTL_DAYS = 90;
const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * Build a unique signal ID
 * @param {object} params - { modelVersion, eventId, symbol }
 * @returns {string} signalId in format "modelVersion:eventId:symbol"
 */
export function buildSignalId({ modelVersion, eventId, symbol }) {
  const mv = modelVersion ?? 1;
  const sym = (symbol || 'UNKNOWN').toUpperCase();
  return `${mv}:${eventId}:${sym}`;
}

/**
 * Extract UTC date string (YYYY-MM-DD) from ISO timestamp
 * @param {string} tsISO - ISO timestamp
 * @returns {string} Date in YYYY-MM-DD format
 */
function extractUTCDate(tsISO) {
  const d = new Date(tsISO);
  return d.toISOString().split('T')[0];
}

/**
 * Build the telemetry log object from signal response data
 * @param {object} params - Signal response and metadata
 * @returns {object} Telemetry log object
 */
export function buildTelemetryLog(params) {
  const {
    signalId,
    ts,
    eventId,
    symbol,
    theme,
    source,
    signal,
    direction,
    overall,
    grade,
    components,
    echoUsed,
    marketStatsUsed,
    atrPct,
    gapPct,
    ambiguity,
    entryType,
    entryLevel,
    invalidationLevel,
    stopDistancePct,
    riskPerTradePct,
    suggestedPositionPct,
    cached,
    latencyMs,
    modelVersion,
    avoidCode
  } = params;

  return {
    signalId,
    ts,
    eventId,
    symbol: symbol || null,
    theme: theme || null,
    source: source || null,
    signal,
    direction: direction || 'NONE',
    overall: overall ?? 0,
    grade: grade || 'D',
    components: components || {
      echoEdge: 0,
      eventClarity: 0,
      regimeVol: 0,
      gapRisk: 0,
      freshness: 0
    },
    echoUsed: Boolean(echoUsed),
    marketStatsUsed: Boolean(marketStatsUsed),
    atrPct: atrPct ?? null,
    gapPct: gapPct ?? null,
    ambiguity: ambiguity ?? null,
    entryType: entryType || null,
    entryLevel: entryLevel ?? 0,
    invalidationLevel: invalidationLevel ?? 0,
    stopDistancePct: stopDistancePct ?? null,
    riskPerTradePct: riskPerTradePct ?? null,
    suggestedPositionPct: suggestedPositionPct ?? null,
    cached: Boolean(cached),
    latencyMs: latencyMs ?? 0,
    modelVersion: modelVersion ?? 1,
    avoidCode: avoidCode || null
  };
}

/**
 * Write signal telemetry to KV
 * - Stores immutable log at tslog:v1:{signalId}
 * - Adds to daily ZSET index at tsidx:v1:signals:{YYYY-MM-DD}
 *
 * @param {object} params - { kv, log }
 * @param {object} params.kv - Vercel KV client
 * @param {object} params.log - Telemetry log object (from buildTelemetryLog)
 * @returns {Promise<{ ok: boolean, signalId: string, error?: string }>}
 */
export async function writeSignalTelemetry({ kv, log }) {
  if (!kv) {
    return { ok: false, signalId: null, error: 'KV client not provided' };
  }

  if (!log || !log.signalId) {
    return { ok: false, signalId: null, error: 'Invalid log object' };
  }

  const { signalId, ts } = log;
  const tslogKey = `tslog:v1:${signalId}`;
  const dateStr = extractUTCDate(ts);
  const tsidxKey = `tsidx:v1:signals:${dateStr}`;
  const epochMs = new Date(ts).getTime();

  const ttlSeconds = TSLOG_TTL_DAYS * SECONDS_PER_DAY;

  try {
    // Write immutable log with TTL
    await kv.set(tslogKey, log, { ex: ttlSeconds });

    // Add to daily index ZSET with TTL
    // ZADD is idempotent - re-adding same member updates score
    await kv.zadd(tsidxKey, { score: epochMs, member: signalId });

    // Set TTL on the ZSET (idempotent - resets TTL each time)
    await kv.expire(tsidxKey, TSIDX_TTL_DAYS * SECONDS_PER_DAY);

    return { ok: true, signalId };
  } catch (error) {
    console.error('Telemetry write error:', error.message);
    return { ok: false, signalId, error: error.message };
  }
}

/**
 * Read signal telemetry log from KV
 * @param {object} params - { kv, signalId }
 * @returns {Promise<object|null>} Telemetry log or null
 */
export async function readSignalTelemetry({ kv, signalId }) {
  if (!kv || !signalId) {
    return null;
  }

  const tslogKey = `tslog:v1:${signalId}`;

  try {
    return await kv.get(tslogKey);
  } catch (error) {
    console.error('Telemetry read error:', error.message);
    return null;
  }
}

/**
 * Get all signal IDs for a specific date from the daily index
 * @param {object} params - { kv, dateStr }
 * @param {string} params.dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<string[]>} Array of signalIds
 */
export async function getSignalIdsForDate({ kv, dateStr }) {
  if (!kv || !dateStr) {
    return [];
  }

  const tsidxKey = `tsidx:v1:signals:${dateStr}`;

  try {
    // ZRANGE 0 -1 returns all members
    const members = await kv.zrange(tsidxKey, 0, -1);
    return members || [];
  } catch (error) {
    console.error('Index read error:', error.message);
    return [];
  }
}
