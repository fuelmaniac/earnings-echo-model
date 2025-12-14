import { kv } from "@vercel/kv";
import { getSignalIdsForDate, readSignalTelemetry } from "../_lib/telemetry.js";

/**
 * Signal Summary Metrics Endpoint
 *
 * Provides aggregated statistics for debugging and monitoring.
 *
 * GET /api/metrics/signal-summary?date=YYYY-MM-DD&days=7
 * - date: optional, defaults to yesterday UTC
 * - days: optional, number of days to aggregate (1-14, default 1)
 *
 * Returns aggregated metrics across the specified days.
 */

const MAX_DAYS = 14;

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
 * Get date N days before a given date
 * @param {string} dateStr - Base date YYYY-MM-DD
 * @param {number} daysBack - Days to go back
 * @returns {string} YYYY-MM-DD
 */
function getDateMinusDays(dateStr, daysBack) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - daysBack);
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

  // Parse parameters
  let endDate = req.query?.date;
  if (!endDate) {
    endDate = getYesterdayUTC();
  }

  if (!isValidDateStr(endDate)) {
    return res.status(400).json({ ok: false, error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  let days = parseInt(req.query?.days || '1', 10);
  if (isNaN(days) || days < 1) days = 1;
  if (days > MAX_DAYS) days = MAX_DAYS;

  console.log(`Signal summary: endDate=${endDate}, days=${days}`);

  try {
    // Collect signal IDs from each day
    const allSignalIds = [];
    const dateRange = [];

    for (let i = 0; i < days; i++) {
      const dateStr = getDateMinusDays(endDate, i);
      dateRange.push(dateStr);

      const signalIds = await getSignalIdsForDate({ kv, dateStr });
      for (const sid of signalIds) {
        allSignalIds.push({ signalId: sid, date: dateStr });
      }
    }

    if (allSignalIds.length === 0) {
      return res.status(200).json({
        ok: true,
        endDate,
        days,
        dateRange,
        totalSignals: 0,
        message: 'No signals found in date range'
      });
    }

    // Initialize counters
    const countBySignal = { BUY: 0, SELL: 0, WAIT: 0, AVOID: 0 };
    const countByGrade = { A: 0, B: 0, C: 0, D: 0 };
    let sumOverall = 0;
    let sumLatencyMs = 0;
    let echoUsedCount = 0;
    let marketStatsUsedCount = 0;
    let loadedCount = 0;

    // Outcome stats (if outcomes exist)
    let stoppedOut3d = 0;
    let stoppedOut5d = 0;
    let outcomeCount3d = 0;
    let outcomeCount5d = 0;

    // Load telemetry for each signal
    for (const { signalId } of allSignalIds) {
      const log = await readSignalTelemetry({ kv, signalId });

      if (!log) continue;
      loadedCount++;

      // Count by signal type
      const signal = log.signal || 'AVOID';
      if (countBySignal[signal] !== undefined) {
        countBySignal[signal]++;
      }

      // Count by grade
      const grade = log.grade || 'D';
      if (countByGrade[grade] !== undefined) {
        countByGrade[grade]++;
      }

      // Sum for averages
      sumOverall += log.overall || 0;
      sumLatencyMs += log.latencyMs || 0;

      // Usage counts
      if (log.echoUsed) echoUsedCount++;
      if (log.marketStatsUsed) marketStatsUsedCount++;

      // Try to load outcome for stoppedOut stats
      try {
        const outcomeKey = `outcome:v1:${signalId}`;
        const outcome = await kv.get(outcomeKey);

        if (outcome && outcome.ok) {
          if (outcome.stoppedOut && outcome.stoppedOut['3'] !== undefined) {
            outcomeCount3d++;
            if (outcome.stoppedOut['3']) stoppedOut3d++;
          }
          if (outcome.stoppedOut && outcome.stoppedOut['5'] !== undefined) {
            outcomeCount5d++;
            if (outcome.stoppedOut['5']) stoppedOut5d++;
          }
        }
      } catch {
        // Ignore outcome load errors
      }
    }

    // Compute averages and ratios
    const avgOverall = loadedCount > 0 ? Math.round((sumOverall / loadedCount) * 10) / 10 : 0;
    const avgLatencyMs = loadedCount > 0 ? Math.round(sumLatencyMs / loadedCount) : 0;
    const echoUsedRatio = loadedCount > 0 ? Math.round((echoUsedCount / loadedCount) * 100) / 100 : 0;
    const marketStatsUsedRatio = loadedCount > 0 ? Math.round((marketStatsUsedCount / loadedCount) * 100) / 100 : 0;

    // Stopped out rates
    const stoppedOutRate3d = outcomeCount3d > 0 ? Math.round((stoppedOut3d / outcomeCount3d) * 100) / 100 : null;
    const stoppedOutRate5d = outcomeCount5d > 0 ? Math.round((stoppedOut5d / outcomeCount5d) * 100) / 100 : null;

    const response = {
      ok: true,
      endDate,
      days,
      dateRange: dateRange.reverse(), // oldest to newest
      totalSignals: allSignalIds.length,
      loadedLogs: loadedCount,
      countBySignal,
      countByGrade,
      avgOverall,
      avgLatencyMs,
      echoUsedRatio,
      marketStatsUsedRatio
    };

    // Include outcome stats if available
    if (stoppedOutRate3d !== null) {
      response.stoppedOutRate_3d = stoppedOutRate3d;
      response.outcomesLoaded_3d = outcomeCount3d;
    }
    if (stoppedOutRate5d !== null) {
      response.stoppedOutRate_5d = stoppedOutRate5d;
      response.outcomesLoaded_5d = outcomeCount5d;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Signal summary error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
