/**
 * Outcome Engine - Pure Functions for Outcome Computation
 *
 * Computes 1D/3D/5D returns, adverse excursions, and stop-out detection
 * from daily OHLC bars.
 */

/**
 * Find the bar index for a given date
 * @param {Array} bars - Array of { date, open, high, low, close }
 * @param {string} dateStr - Target date YYYY-MM-DD
 * @returns {number} Index or -1 if not found
 */
function findBarIndex(bars, dateStr) {
  return bars.findIndex(b => b.date === dateStr);
}

/**
 * Extract date string from ISO timestamp
 * @param {string} tsISO - ISO timestamp
 * @returns {string} YYYY-MM-DD
 */
function extractDateFromISO(tsISO) {
  return new Date(tsISO).toISOString().split('T')[0];
}

/**
 * Resolve t0 bar and horizon bars from daily bars
 *
 * t0Rule = "same_day_close": Use the bar whose date matches the signal date.
 * If that bar is missing, fall back to the previous available bar.
 *
 * @param {Array} bars - Array of { date, open, high, low, close }
 * @param {string} tsISO - Signal timestamp
 * @param {number[]} horizons - Array of horizon days [1, 3, 5]
 * @returns {object} { t0Bar, t0Index, horizonBars, windowBars, t0Rule }
 */
export function resolveCloses(bars, tsISO, horizons = [1, 3, 5]) {
  const signalDate = extractDateFromISO(tsISO);

  // Find t0 bar (same day close)
  let t0Index = findBarIndex(bars, signalDate);
  let t0Rule = 'same_day_close';

  // If signal date bar not found, use previous available bar
  if (t0Index === -1) {
    // Find the last bar before or on signal date
    const signalDateObj = new Date(signalDate);
    for (let i = bars.length - 1; i >= 0; i--) {
      const barDateObj = new Date(bars[i].date);
      if (barDateObj <= signalDateObj) {
        t0Index = i;
        t0Rule = 'prev_available';
        break;
      }
    }
  }

  if (t0Index === -1) {
    return { t0Bar: null, t0Index: -1, horizonBars: {}, windowBars: {}, t0Rule: 'not_found' };
  }

  const t0Bar = bars[t0Index];

  // Resolve horizon bars (t0 + h trading days)
  const horizonBars = {};
  const windowBars = {};

  for (const h of horizons) {
    const targetIndex = t0Index + h;

    if (targetIndex < bars.length) {
      horizonBars[h] = bars[targetIndex];
      // Window includes all bars from t0 to t0+h (inclusive)
      windowBars[h] = bars.slice(t0Index, targetIndex + 1);
    } else {
      horizonBars[h] = null;
      windowBars[h] = null;
    }
  }

  return { t0Bar, t0Index, horizonBars, windowBars, t0Rule };
}

/**
 * Compute raw return percentage
 * @param {number} t0Close - Entry price (t0 close)
 * @param {number} horizonClose - Exit price (horizon close)
 * @returns {number} Return percentage
 */
function computeRawReturn(t0Close, horizonClose) {
  if (!t0Close || t0Close === 0) return 0;
  return ((horizonClose - t0Close) / t0Close) * 100;
}

/**
 * Compute signed return based on direction
 * @param {number} rawReturn - Raw return percentage
 * @param {string} direction - 'LONG' | 'SHORT' | 'NONE'
 * @returns {number} Signed return percentage
 */
function computeSignedReturn(rawReturn, direction) {
  if (direction === 'LONG') return rawReturn;
  if (direction === 'SHORT') return -rawReturn;
  return 0;
}

/**
 * Compute worst adverse excursion for a position
 *
 * LONG: worst adverse = min(low in window) vs t0Close
 * SHORT: worst adverse = max(high in window) vs t0Close
 *
 * @param {Array} windowBars - Bars from t0 to horizon (inclusive)
 * @param {number} t0Close - Entry price
 * @param {string} direction - 'LONG' | 'SHORT' | 'NONE'
 * @returns {number} Worst adverse percentage (negative if adverse)
 */
function computeWorstAdverse(windowBars, t0Close, direction) {
  if (!windowBars || windowBars.length === 0 || !t0Close || t0Close === 0) {
    return 0;
  }

  if (direction === 'LONG') {
    // Worst case is hitting the lowest low
    const minLow = Math.min(...windowBars.map(b => b.low));
    return ((minLow - t0Close) / t0Close) * 100;
  }

  if (direction === 'SHORT') {
    // Worst case is hitting the highest high
    const maxHigh = Math.max(...windowBars.map(b => b.high));
    // For short, adverse is when price goes up
    return ((t0Close - maxHigh) / t0Close) * 100;
  }

  return 0;
}

/**
 * Determine if position was stopped out
 *
 * LONG: stopped if worstAdverse <= -stopDistancePct
 * SHORT: stopped if worstAdverse <= -stopDistancePct
 *
 * @param {number} worstAdversePct - Worst adverse percentage
 * @param {number} stopDistancePct - Stop distance percentage (positive)
 * @returns {boolean} True if stopped out
 */
function computeStoppedOut(worstAdversePct, stopDistancePct) {
  if (!stopDistancePct || stopDistancePct <= 0) {
    return false;
  }
  // worstAdversePct is negative when adverse; stop triggers if <= -stopDistance
  return worstAdversePct <= -stopDistancePct;
}

/**
 * Compute full outcome for a signal
 *
 * @param {object} params
 * @param {number} params.t0Close - Entry price (t0 close)
 * @param {string} params.direction - 'LONG' | 'SHORT' | 'NONE'
 * @param {number} params.stopDistancePct - Stop distance percentage
 * @param {object} params.horizonBars - { 1: bar, 3: bar, 5: bar }
 * @param {object} params.windowBars - { 1: bars[], 3: bars[], 5: bars[] }
 * @returns {object} { rawReturnPct, signedReturnPct, worstAdversePct, stoppedOut }
 */
export function computeOutcome({ t0Close, direction, stopDistancePct, horizonBars, windowBars }) {
  const horizons = [1, 3, 5];

  const rawReturnPct = {};
  const signedReturnPct = {};
  const worstAdversePct = {};
  const stoppedOut = {};

  for (const h of horizons) {
    const hBar = horizonBars[h];
    const wBars = windowBars[h];

    if (hBar) {
      const raw = computeRawReturn(t0Close, hBar.close);
      rawReturnPct[h] = Math.round(raw * 100) / 100;
      signedReturnPct[h] = Math.round(computeSignedReturn(raw, direction) * 100) / 100;

      if (wBars && wBars.length > 0) {
        const adverse = computeWorstAdverse(wBars, t0Close, direction);
        worstAdversePct[h] = Math.round(adverse * 100) / 100;
        stoppedOut[h] = computeStoppedOut(adverse, stopDistancePct);
      } else {
        worstAdversePct[h] = null;
        stoppedOut[h] = false;
      }
    } else {
      // Horizon data not available
      rawReturnPct[h] = null;
      signedReturnPct[h] = null;
      worstAdversePct[h] = null;
      stoppedOut[h] = false;
    }
  }

  return { rawReturnPct, signedReturnPct, worstAdversePct, stoppedOut };
}

/**
 * Build complete outcome record
 *
 * @param {object} params
 * @param {string} params.signalId - Signal identifier
 * @param {string} params.symbol - Ticker symbol
 * @param {string} params.ts - Signal timestamp
 * @param {string} params.direction - Trade direction
 * @param {number} params.stopDistancePct - Stop distance
 * @param {Array} params.bars - Daily OHLC bars
 * @returns {object} Complete outcome record or { ok: false, reason }
 */
export function buildOutcomeRecord({ signalId, symbol, ts, direction, stopDistancePct, bars }) {
  // Resolve closes
  const { t0Bar, horizonBars, windowBars, t0Rule } = resolveCloses(bars, ts, [1, 3, 5]);

  if (!t0Bar) {
    return {
      ok: false,
      signalId,
      reason: 'No t0 bar found for signal date'
    };
  }

  const t0Close = t0Bar.close;

  // Check if we have at least some horizon data
  const hasAnyHorizon = Object.values(horizonBars).some(b => b !== null);
  if (!hasAnyHorizon) {
    return {
      ok: false,
      signalId,
      reason: 'Insufficient future bars for outcome computation'
    };
  }

  // Compute outcomes
  const outcome = computeOutcome({
    t0Close,
    direction,
    stopDistancePct,
    horizonBars,
    windowBars
  });

  return {
    ok: true,
    signalId,
    symbol,
    ts,
    t0Close,
    rawReturnPct: outcome.rawReturnPct,
    signedReturnPct: outcome.signedReturnPct,
    worstAdversePct: outcome.worstAdversePct,
    stoppedOut: outcome.stoppedOut,
    stopDistancePctUsed: stopDistancePct ?? null,
    t0Rule,
    computedAt: new Date().toISOString()
  };
}
