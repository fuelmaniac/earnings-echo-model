import { kv } from "@vercel/kv";
import { getSignalIdsForDate, readSignalTelemetry } from "./_lib/telemetry.js";
import { getBarsForOutcome } from "./_lib/marketDataCache.js";
import { buildOutcomeRecord } from "./_lib/outcomeEngine.js";

/**
 * Outcome Cron Endpoint
 *
 * Computes 1D/3D/5D outcomes for signals from a specific date.
 * Called by Vercel cron daily.
 *
 * GET /api/outcome-cron?date=YYYY-MM-DD
 * - date: optional, defaults to yesterday UTC
 *
 * Returns:
 * { ok: true, date, processed, skipped, errors }
 */

// TTL constants
const OUTCOME_TTL_DAYS = 180;
const LOCK_TTL_SECONDS = 60 * 60; // 1 hour
const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * Get yesterday's date in YYYY-MM-DD format (UTC)
 * @returns {string}
 */
function getYesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * Validate date string format
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidDateStr(dateStr) {
  if (!dateStr) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Check KV configuration
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ ok: false, error: 'KV not configured' });
  }

  // Parse date parameter
  let dateStr = req.query?.date;
  if (!dateStr) {
    dateStr = getYesterdayUTC();
  }

  if (!isValidDateStr(dateStr)) {
    return res.status(400).json({ ok: false, error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  console.log(`Outcome cron starting for date: ${dateStr}`);

  const results = {
    ok: true,
    date: dateStr,
    processed: 0,
    skipped: 0,
    errors: 0,
    details: []
  };

  try {
    // Get all signal IDs for the date
    const signalIds = await getSignalIdsForDate({ kv, dateStr });

    if (signalIds.length === 0) {
      console.log(`No signals found for date: ${dateStr}`);
      return res.status(200).json({
        ...results,
        message: 'No signals found for date'
      });
    }

    console.log(`Found ${signalIds.length} signals for date: ${dateStr}`);

    // Process each signal
    for (const signalId of signalIds) {
      try {
        // Check if outcome already exists (idempotent)
        const outcomeKey = `outcome:v1:${signalId}`;
        const existingOutcome = await kv.exists(outcomeKey);

        if (existingOutcome) {
          console.log(`Skipping ${signalId} - outcome already exists`);
          results.skipped++;
          continue;
        }

        // Try to acquire lock (optional, prevents concurrent processing)
        const lockKey = `outcome:lock:v1:${signalId}`;
        const lockAcquired = await kv.setnx(lockKey, '1');

        if (!lockAcquired) {
          console.log(`Skipping ${signalId} - lock held`);
          results.skipped++;
          continue;
        }

        // Set lock TTL
        await kv.expire(lockKey, LOCK_TTL_SECONDS);

        // Load telemetry log
        const telemetryLog = await readSignalTelemetry({ kv, signalId });

        if (!telemetryLog) {
          console.warn(`No telemetry log for ${signalId}`);
          results.errors++;
          results.details.push({ signalId, error: 'No telemetry log' });
          continue;
        }

        const { symbol, ts, direction, stopDistancePct } = telemetryLog;

        if (!symbol) {
          console.warn(`No symbol in telemetry for ${signalId}`);
          results.errors++;
          results.details.push({ signalId, error: 'No symbol' });
          continue;
        }

        // Fetch daily bars with caching
        let bars;
        try {
          bars = await getBarsForOutcome({ kv, symbol, tsISO: ts });
        } catch (fetchError) {
          console.error(`Failed to fetch bars for ${symbol}:`, fetchError.message);
          results.errors++;
          results.details.push({ signalId, error: `Tiingo fetch failed: ${fetchError.message}` });
          continue;
        }

        if (!bars || bars.length < 6) {
          console.warn(`Insufficient bars for ${signalId}`);
          results.errors++;
          results.details.push({ signalId, error: 'Insufficient price data' });
          continue;
        }

        // Build outcome record
        const outcomeRecord = buildOutcomeRecord({
          signalId,
          symbol,
          ts,
          direction,
          stopDistancePct,
          bars
        });

        if (!outcomeRecord.ok) {
          console.warn(`Outcome computation failed for ${signalId}: ${outcomeRecord.reason}`);
          results.errors++;
          results.details.push({ signalId, error: outcomeRecord.reason });
          continue;
        }

        // Store outcome with TTL
        const ttlSeconds = OUTCOME_TTL_DAYS * SECONDS_PER_DAY;
        await kv.set(outcomeKey, outcomeRecord, { ex: ttlSeconds });

        console.log(`Stored outcome for ${signalId}`);
        results.processed++;
        results.details.push({ signalId, ok: true });

      } catch (signalError) {
        console.error(`Error processing ${signalId}:`, signalError.message);
        results.errors++;
        results.details.push({ signalId, error: signalError.message });
      }
    }

    console.log(`Outcome cron completed: processed=${results.processed}, skipped=${results.skipped}, errors=${results.errors}`);

    return res.status(200).json(results);

  } catch (error) {
    console.error('Outcome cron error:', error);
    return res.status(500).json({
      ok: false,
      date: dateStr,
      error: error.message
    });
  }
}
