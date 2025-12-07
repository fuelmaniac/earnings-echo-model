#!/usr/bin/env node

/**
 * Pattern History Calculator - Phase 1 (EPS / Fundamental Pipeline)
 *
 * Calculates fundamental echo patterns for stock pairs based on EPS data.
 * Phase 1 focuses on EPS-only analysis; price fields are scaffolded with null.
 *
 * Usage: node scripts/calculate-pattern-history.js
 *
 * Input:  src/data/earnings-dates.json
 * Output: src/data/pattern-history.json
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Fixed stock pairs to analyze.
 * Each pair has a trigger (leader) and echo (follower) stock.
 */
const STOCK_PAIRS = [
  { id: 'AMD_NVDA',  trigger: 'AMD',  echo: 'NVDA' },
  { id: 'JPM_BAC',   trigger: 'JPM',  echo: 'BAC'  },
  { id: 'TSLA_F',    trigger: 'TSLA', echo: 'F'    },
  { id: 'AAPL_MSFT', trigger: 'AAPL', echo: 'MSFT' },
  { id: 'XOM_CVX',   trigger: 'XOM',  echo: 'CVX'  }
];

/**
 * Returns configuration paths for input/output files.
 * @returns {{ inputPath: string, outputPath: string }}
 */
function getConfig() {
  const rootDir = path.join(__dirname, '..');
  return {
    inputPath: path.join(rootDir, 'src', 'data', 'earnings-dates.json'),
    outputPath: path.join(rootDir, 'src', 'data', 'pattern-history.json')
  };
}

// =============================================================================
// FILE I/O
// =============================================================================

/**
 * Reads and parses a JSON file.
 * @param {string} filePath - Absolute path to JSON file
 * @returns {any} Parsed JSON data
 */
function readJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Writes data to a JSON file with pretty formatting.
 * @param {string} filePath - Absolute path to JSON file
 * @param {any} data - Data to serialize
 */
function writeJson(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, content, 'utf-8');
}

// =============================================================================
// DATA PARSING & INDEXING
// =============================================================================

/**
 * @typedef {Object} EarningsRecord
 * @property {string} symbol - Stock symbol
 * @property {string} date - Earnings date (YYYY-MM-DD)
 * @property {number} year - Fiscal year
 * @property {string} quarter - Quarter string ("Q1", "Q2", "Q3", "Q4")
 * @property {string} result - Earnings result ("beat", "miss", "inline")
 * @property {number|null} surprisePercent - EPS surprise percentage
 */

/**
 * Parses and normalizes raw earnings data.
 * Validates required fields and normalizes quarter to string format.
 *
 * @param {Object} raw - Raw data from earnings-dates.json (symbol -> array)
 * @returns {EarningsRecord[]} Flattened, validated earnings records
 */
function parseEarningsData(raw) {
  const records = [];

  for (const [symbol, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries)) {
      console.warn(`Warning: Invalid data for symbol ${symbol}, expected array`);
      continue;
    }

    for (const entry of entries) {
      // Validate required fields
      if (!entry.date || entry.year == null || entry.quarter == null) {
        console.warn(`Warning: Skipping incomplete record for ${symbol}:`, entry);
        continue;
      }

      // Normalize quarter to string format (handles both "Q3" and 3)
      let quarterStr;
      if (typeof entry.quarter === 'string') {
        quarterStr = entry.quarter.toUpperCase();
        if (!quarterStr.startsWith('Q')) {
          quarterStr = `Q${quarterStr}`;
        }
      } else if (typeof entry.quarter === 'number') {
        quarterStr = `Q${entry.quarter}`;
      } else {
        console.warn(`Warning: Invalid quarter for ${symbol}:`, entry.quarter);
        continue;
      }

      // Normalize result to lowercase
      const result = (entry.result || 'inline').toLowerCase();
      if (!['beat', 'miss', 'inline'].includes(result)) {
        console.warn(`Warning: Unknown result "${result}" for ${symbol}, treating as inline`);
      }

      records.push({
        symbol,
        date: entry.date,
        year: entry.year,
        quarter: quarterStr,
        result: ['beat', 'miss', 'inline'].includes(result) ? result : 'inline',
        surprisePercent: entry.surprisePercent ?? null
      });
    }
  }

  return records;
}

/**
 * Indexes earnings records by symbol and sorts each list by date.
 *
 * @param {EarningsRecord[]} records - Flat list of earnings records
 * @returns {Map<string, EarningsRecord[]>} Map from symbol to sorted records
 */
function indexBySymbol(records) {
  const bySymbol = new Map();

  for (const record of records) {
    if (!bySymbol.has(record.symbol)) {
      bySymbol.set(record.symbol, []);
    }
    bySymbol.get(record.symbol).push(record);
  }

  // Sort each symbol's records by date (oldest first)
  for (const [symbol, list] of bySymbol) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  return bySymbol;
}

// =============================================================================
// QUARTER MATCHING
// =============================================================================

/**
 * Generates a quarter key for matching (e.g., "2024-Q4").
 * @param {EarningsRecord} record
 * @returns {string}
 */
function quarterKey(record) {
  return `${record.year}-${record.quarter}`;
}

/**
 * Generates a human-readable quarter label (e.g., "Q4 2024").
 * @param {EarningsRecord} record
 * @returns {string}
 */
function toQuarterLabel(record) {
  return `${record.quarter} ${record.year}`;
}

/**
 * Calculates the number of days between two dates.
 * @param {string} date1 - YYYY-MM-DD
 * @param {string} date2 - YYYY-MM-DD
 * @returns {number} Absolute difference in days
 */
function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = Math.abs(d2 - d1);
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * @typedef {Object} MatchedQuarter
 * @property {string} quarter - Human-readable quarter label
 * @property {string} triggerDate - Trigger earnings date
 * @property {string} triggerSymbol - Trigger stock symbol
 * @property {string} echoDate - Echo earnings date
 * @property {string} echoSymbol - Echo stock symbol
 * @property {number} gapDays - Days between trigger and echo earnings
 * @property {string} triggerResult - Trigger earnings result
 * @property {string} echoResult - Echo earnings result
 * @property {number|null} triggerSurprisePercent
 * @property {number|null} echoSurprisePercent
 * @property {boolean} agreement - True if both beat or both miss
 */

/**
 * Matches quarters between trigger and echo stocks.
 * Only includes quarters where both stocks have earnings data.
 *
 * @param {EarningsRecord[]} triggerList - Trigger stock earnings (sorted by date)
 * @param {EarningsRecord[]} echoList - Echo stock earnings (sorted by date)
 * @returns {MatchedQuarter[]} Matched quarters (most recent first)
 */
function matchQuartersForPair(triggerList, echoList) {
  // Build maps keyed by quarter
  const triggerByQuarter = new Map();
  for (const record of triggerList) {
    triggerByQuarter.set(quarterKey(record), record);
  }

  const echoByQuarter = new Map();
  for (const record of echoList) {
    echoByQuarter.set(quarterKey(record), record);
  }

  // Find all quarters present in both
  const commonQuarters = [];
  for (const qKey of triggerByQuarter.keys()) {
    if (echoByQuarter.has(qKey)) {
      commonQuarters.push(qKey);
    }
  }

  // Sort by quarter key descending (most recent first)
  commonQuarters.sort((a, b) => b.localeCompare(a));

  // Build matched quarter objects
  const matched = [];
  for (const qKey of commonQuarters) {
    const trigger = triggerByQuarter.get(qKey);
    const echo = echoByQuarter.get(qKey);

    // Calculate agreement:
    // true if (beat, beat) or (miss, miss)
    // false if one is inline or results differ
    const triggerIsBeat = trigger.result === 'beat';
    const triggerIsMiss = trigger.result === 'miss';
    const echoIsBeat = echo.result === 'beat';
    const echoIsMiss = echo.result === 'miss';

    // Agreement: both beat or both miss
    // If either is inline, agreement is false unless both are inline
    let agreement;
    if (trigger.result === 'inline' || echo.result === 'inline') {
      agreement = trigger.result === echo.result; // only true if both inline
    } else {
      agreement = (triggerIsBeat && echoIsBeat) || (triggerIsMiss && echoIsMiss);
    }

    matched.push({
      quarter: toQuarterLabel(trigger),
      triggerDate: trigger.date,
      triggerSymbol: trigger.symbol,
      echoDate: echo.date,
      echoSymbol: echo.symbol,
      gapDays: daysBetween(trigger.date, echo.date),
      triggerResult: trigger.result,
      echoResult: echo.result,
      triggerSurprisePercent: trigger.surprisePercent != null
        ? Math.round(trigger.surprisePercent * 10) / 10
        : null,
      echoSurprisePercent: echo.surprisePercent != null
        ? Math.round(echo.surprisePercent * 10) / 10
        : null,
      agreement
    });
  }

  return matched;
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Calculates Pearson correlation coefficient between two arrays.
 *
 * @param {number[]} xs - First array of values
 * @param {number[]} ys - Second array of values
 * @returns {number|null} Correlation coefficient, or null if sample < 2
 */
function pearsonCorrelation(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) {
    return null;
  }

  const n = xs.length;
  const meanX = xs.reduce((sum, v) => sum + v, 0) / n;
  const meanY = ys.reduce((sum, v) => sum + v, 0) / n;

  let numerator = 0;
  let sumSqX = 0;
  let sumSqY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    sumSqX += dx * dx;
    sumSqY += dy * dy;
  }

  const denominator = Math.sqrt(sumSqX * sumSqY);
  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

/**
 * @typedef {Object} FundamentalStats
 * @property {number|null} beatFollowsBeat - % P(echo beat | trigger beat)
 * @property {number|null} missFollowsMiss - % P(echo miss | trigger miss)
 * @property {number|null} directionAgreement - % with agreement === true
 * @property {number|null} fundamentalCorrelation - Pearson correlation
 * @property {number|null} avgGapDays - Average gap days
 * @property {number} sampleSize - Number of matched quarters
 */

/**
 * Computes fundamental echo statistics from matched quarters.
 *
 * @param {MatchedQuarter[]} matched
 * @returns {FundamentalStats}
 */
function computeFundamentalStats(matched) {
  const sampleSize = matched.length;

  if (sampleSize === 0) {
    return {
      beatFollowsBeat: null,
      missFollowsMiss: null,
      directionAgreement: null,
      fundamentalCorrelation: null,
      avgGapDays: null,
      sampleSize: 0
    };
  }

  // Count conditions
  let triggerBeatCount = 0;
  let echoBeatGivenTriggerBeat = 0;
  let triggerMissCount = 0;
  let echoMissGivenTriggerMiss = 0;
  let agreementCount = 0;
  let totalGapDays = 0;

  // For correlation
  const triggerSurprises = [];
  const echoSurprises = [];

  for (const q of matched) {
    // Beat follows Beat
    if (q.triggerResult === 'beat') {
      triggerBeatCount++;
      if (q.echoResult === 'beat') {
        echoBeatGivenTriggerBeat++;
      }
    }

    // Miss follows Miss
    if (q.triggerResult === 'miss') {
      triggerMissCount++;
      if (q.echoResult === 'miss') {
        echoMissGivenTriggerMiss++;
      }
    }

    // Direction agreement
    if (q.agreement) {
      agreementCount++;
    }

    // Gap days
    totalGapDays += q.gapDays;

    // Collect for correlation (only if both have values)
    if (q.triggerSurprisePercent != null && q.echoSurprisePercent != null) {
      triggerSurprises.push(q.triggerSurprisePercent);
      echoSurprises.push(q.echoSurprisePercent);
    }
  }

  // Calculate percentages
  const beatFollowsBeat = triggerBeatCount > 0
    ? Math.round((echoBeatGivenTriggerBeat / triggerBeatCount) * 100)
    : null;

  const missFollowsMiss = triggerMissCount > 0
    ? Math.round((echoMissGivenTriggerMiss / triggerMissCount) * 100)
    : null;

  const directionAgreement = Math.round((agreementCount / sampleSize) * 100);

  const avgGapDays = Math.round(totalGapDays / sampleSize);

  // Calculate correlation
  const rawCorr = pearsonCorrelation(triggerSurprises, echoSurprises);
  const fundamentalCorrelation = rawCorr != null
    ? Math.round(rawCorr * 100) / 100
    : null;

  return {
    beatFollowsBeat,
    missFollowsMiss,
    directionAgreement,
    fundamentalCorrelation,
    avgGapDays,
    sampleSize
  };
}

// =============================================================================
// PRICE ECHO SCAFFOLDING (Phase 1)
// =============================================================================

/**
 * @typedef {Object} PriceHistoryItem
 * @property {string} quarter
 * @property {string} date - Trigger earnings date
 * @property {string} triggerResult
 * @property {number|null} triggerSurprisePercent
 * @property {number|null} triggerDay0MovePercent
 * @property {number|null} triggerDay1MovePercent
 * @property {string} echoResult
 * @property {number|null} echoSurprisePercent
 * @property {number|null} echoDay0MovePercent
 * @property {number|null} echoDay1MovePercent
 * @property {boolean} accurate
 */

/**
 * Builds priceEcho.history from matched quarters.
 * In Phase 1, all price-related fields are null.
 *
 * @param {MatchedQuarter[]} matched
 * @returns {PriceHistoryItem[]}
 */
function buildPriceEchoHistoryFromMatched(matched) {
  return matched.map(q => ({
    quarter: q.quarter,
    date: q.triggerDate,
    triggerResult: q.triggerResult,
    triggerSurprisePercent: q.triggerSurprisePercent,
    triggerDay0MovePercent: null,  // Phase 2
    triggerDay1MovePercent: null,  // Phase 2
    echoResult: q.echoResult,
    echoSurprisePercent: q.echoSurprisePercent,
    echoDay0MovePercent: null,     // Phase 2
    echoDay1MovePercent: null,     // Phase 2
    accurate: q.agreement
  }));
}

/**
 * @typedef {Object} PriceStats
 * @property {number|null} correlation
 * @property {number|null} accuracy - % of accurate items
 * @property {number|null} avgEchoMove
 * @property {number} sampleSize
 */

/**
 * Computes priceEcho.stats for Phase 1.
 * Uses EPS direction agreement as accuracy since price data isn't available yet.
 *
 * @param {PriceHistoryItem[]} history
 * @param {number|null} directionAgreement - From fundamental stats
 * @returns {PriceStats}
 */
function computePriceStatsFromHistory(history, directionAgreement) {
  const sampleSize = history.length;

  if (sampleSize === 0) {
    return {
      correlation: null,
      accuracy: null,
      avgEchoMove: null,
      sampleSize: 0
    };
  }

  // For Phase 1: calculate EPS surprise correlation between trigger and echo
  const validPairs = history.filter(
    h => h.triggerSurprisePercent != null && h.echoSurprisePercent != null
  );

  let correlation = null;
  if (validPairs.length >= 2) {
    const triggerVals = validPairs.map(h => h.triggerSurprisePercent);
    const echoVals = validPairs.map(h => h.echoSurprisePercent);
    const rawCorr = pearsonCorrelation(triggerVals, echoVals);
    correlation = rawCorr != null ? Math.round(rawCorr * 100) / 100 : null;
  }

  return {
    correlation,
    accuracy: directionAgreement,  // Same as EPS agreement for Phase 1
    avgEchoMove: null,             // Phase 2
    sampleSize
  };
}

// =============================================================================
// PER-PAIR ORCHESTRATION
// =============================================================================

/**
 * @typedef {Object} PairPattern
 * @property {Object} priceEcho
 * @property {PriceHistoryItem[]} priceEcho.history
 * @property {PriceStats} priceEcho.stats
 * @property {Object} fundamentalEcho
 * @property {MatchedQuarter[]} fundamentalEcho.matchedQuarters
 * @property {FundamentalStats} fundamentalEcho.stats
 */

/**
 * Builds the complete pattern object for a stock pair.
 *
 * @param {{ id: string, trigger: string, echo: string }} pair
 * @param {Map<string, EarningsRecord[]>} earningsBySymbol
 * @returns {PairPattern}
 */
function buildPairPattern(pair, earningsBySymbol) {
  const triggerList = earningsBySymbol.get(pair.trigger) || [];
  const echoList = earningsBySymbol.get(pair.echo) || [];

  // Match quarters
  const matchedQuarters = matchQuartersForPair(triggerList, echoList);

  // Compute fundamental stats
  const fundamentalStats = computeFundamentalStats(matchedQuarters);

  // Build price echo history and stats (scaffolded for Phase 1)
  const priceHistory = buildPriceEchoHistoryFromMatched(matchedQuarters);
  const priceStats = computePriceStatsFromHistory(
    priceHistory,
    fundamentalStats.directionAgreement
  );

  return {
    priceEcho: {
      history: priceHistory,
      stats: priceStats
    },
    fundamentalEcho: {
      matchedQuarters,
      stats: fundamentalStats
    }
  };
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Main entry point.
 * Reads earnings data, processes all pairs, writes output, logs summary.
 */
function main() {
  console.log('Pattern History Calculator (Phase 1: EPS Pipeline)');
  console.log('='.repeat(50));

  const config = getConfig();

  // Read and parse earnings data
  console.log(`\nReading earnings data from: ${config.inputPath}`);
  const rawData = readJson(config.inputPath);
  const records = parseEarningsData(rawData);
  console.log(`Parsed ${records.length} earnings records`);

  // Index by symbol
  const earningsBySymbol = indexBySymbol(records);
  console.log(`Indexed ${earningsBySymbol.size} symbols`);

  // Process each pair
  const results = {};

  console.log('\nProcessing pairs...\n');

  for (const pair of STOCK_PAIRS) {
    const pattern = buildPairPattern(pair, earningsBySymbol);
    results[pair.id] = pattern;

    // Log summary for this pair
    const stats = pattern.fundamentalEcho.stats;
    const corrStr = stats.fundamentalCorrelation != null
      ? stats.fundamentalCorrelation.toFixed(2)
      : 'N/A';
    const accuracyStr = stats.directionAgreement != null
      ? `${stats.directionAgreement}%`
      : 'N/A';

    console.log(
      `${pair.id}: samples=${stats.sampleSize}, ` +
      `EPS corr=${corrStr}, accuracy=${accuracyStr}`
    );
  }

  // Write results
  writeJson(config.outputPath, results);
  console.log(`\nResults written to: ${config.outputPath}`);

  // Print detailed summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));

  console.log('\nFundamental Echo Statistics:');
  for (const [pairId, data] of Object.entries(results)) {
    const s = data.fundamentalEcho.stats;
    console.log(`  ${pairId}:`);
    console.log(`    Beat→Beat: ${s.beatFollowsBeat ?? 'N/A'}%`);
    console.log(`    Miss→Miss: ${s.missFollowsMiss ?? 'N/A'}%`);
    console.log(`    Agreement: ${s.directionAgreement ?? 'N/A'}%`);
    console.log(`    Correlation: ${s.fundamentalCorrelation ?? 'N/A'}`);
    console.log(`    Avg Gap Days: ${s.avgGapDays ?? 'N/A'}`);
    console.log(`    Sample Size: ${s.sampleSize}`);
  }

  console.log('\nDone!');
}

// Run the script
main();
