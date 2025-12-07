#!/usr/bin/env node

/**
 * Stock Pattern History Calculator
 *
 * This script uses static earnings dates and calculates pattern accuracy
 * for stock pairs (trigger → echo relationships).
 *
 * Uses:
 * - Static earnings dates: src/data/earnings-dates.json
 * - Tiingo API: For historical daily close prices
 *
 * Usage: TIINGO_API_KEY=your_key node scripts/calculate-pattern-history.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Static earnings dates (no API needed)
const earningsDates = require('../src/data/earnings-dates.json');

// Configuration
const TIINGO_BASE_URL = 'https://api.tiingo.com/tiingo/daily';

// Stock pairs to analyze: [triggerSymbol, echoSymbol]
// Only pairs with static earnings dates in src/data/earnings-dates.json
const STOCK_PAIRS = [
  { id: 'AMD_NVDA', trigger: 'AMD', echo: 'NVDA' },
  { id: 'JPM_BAC', trigger: 'JPM', echo: 'BAC' }
];

// Accuracy thresholds
const TRIGGER_SURPRISE_THRESHOLD = 2.0; // 2%
const ECHO_MOVE_THRESHOLD = 1.5; // 1.5%

// Fundamental echo thresholds
const BEAT_THRESHOLD = 2.0;  // surprisePercent > 2.0% = Beat
const MISS_THRESHOLD = -2.0; // surprisePercent < -2.0% = Miss
const MAX_GAP_DAYS_WARNING = 45; // Flag if earnings >45 days apart in same quarter
const MIN_SAMPLE_SIZE = 4; // Minimum samples for stats calculation

/**
 * Get API keys from environment
 */
function getApiKeys() {
  const tiingoKey = process.env.TIINGO_API_KEY;

  if (!tiingoKey) {
    console.warn('Warning: TIINGO_API_KEY not set. Price echo analysis will be skipped.');
    console.warn('Only fundamental echo (avgGapDays) will be calculated.\n');
  }

  return { tiingoKey };
}

/**
 * Get earnings dates from static data (replaces API call)
 */
function getEarningsDates(symbol) {
  const dates = earningsDates[symbol];
  if (!dates) {
    console.warn(`No earnings dates for ${symbol}`);
    return [];
  }
  return dates.map(item => ({
    period: item.date,
    date: item.date,
    fiscalQuarter: `${item.year}-Q${item.quarter}`,
    actual: item.epsActual ?? null,
    estimate: item.epsEstimate ?? null,
    surprisePercent: item.surprisePercent ?? null,
    result: item.result ?? null   // "beat" | "miss" | "inline"
  }));
}


/**
 * Fetch historical daily prices from Tiingo API
 * Returns array of {date, close} objects
 */
async function fetchHistoricalPrices(symbol, startDate, endDate, tiingoKey) {
  const url = `${TIINGO_BASE_URL}/${symbol}/prices`;

  try {
    const response = await axios.get(url, {
      params: {
        startDate,
        endDate,
        token: tiingoKey
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data || [];
  } catch (error) {
    console.error(`Error fetching Tiingo prices for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Build a date→price map from Tiingo response
 * Keys are YYYY-MM-DD format
 */
function buildPriceMap(priceData) {
  const priceMap = new Map();

  for (const item of priceData) {
    // Tiingo returns date as "2024-10-24T00:00:00.000Z"
    const dateStr = item.date.split('T')[0];
    priceMap.set(dateStr, item.close);
  }

  return priceMap;
}

/**
 * Get sorted list of trading dates from price map
 */
function getSortedDates(priceMap) {
  return Array.from(priceMap.keys()).sort();
}

/**
 * Find the next trading day after a given date
 */
function findNextTradingDay(dateStr, sortedDates) {
  const targetDate = new Date(dateStr);

  for (const tradingDate of sortedDates) {
    const d = new Date(tradingDate);
    if (d > targetDate) {
      return tradingDate;
    }
  }

  return null;
}

/**
 * Calculate T+1 price movement for echo stock using price map
 * Returns percentage change from earnings day close (D) to next day close (D+1)
 */
function calculateEchoMove(earningsDate, priceMap, sortedDates) {
  // Get the price on earnings date (D)
  const preClose = priceMap.get(earningsDate);

  if (preClose === undefined) {
    console.log(`    Warning: No price data for earnings date ${earningsDate}`);
    return null;
  }

  // Find D+1 (next trading day)
  const nextDay = findNextTradingDay(earningsDate, sortedDates);

  if (!nextDay) {
    console.log(`    Warning: No next trading day found after ${earningsDate}`);
    return null;
  }

  const t1Close = priceMap.get(nextDay);

  if (t1Close === undefined) {
    console.log(`    Warning: No price data for D+1 ${nextDay}`);
    return null;
  }

  // Calculate echo move percent
  return ((t1Close / preClose) - 1) * 100;
}

/**
 * Determine trigger result (Beat, Miss, Inline)
 */
function getTriggerResult(surprisePercent) {
  if (surprisePercent >= 2) return 'Beat';
  if (surprisePercent <= -2) return 'Miss';
  return 'Inline';
}

/**
 * Determine quarter string from date (display format: "Q3 2024")
 */
function getQuarterFromDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  let quarter;
  if (month <= 3) quarter = 'Q1';
  else if (month <= 6) quarter = 'Q2';
  else if (month <= 9) quarter = 'Q3';
  else quarter = 'Q4';

  return `${quarter} ${year}`;
}

/**
 * Get year-quarter key for matching (format: "2024-Q3")
 */
function getYearQuarterKey(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  let quarter;
  if (month <= 3) quarter = 'Q1';
  else if (month <= 6) quarter = 'Q2';
  else if (month <= 9) quarter = 'Q3';
  else quarter = 'Q4';

  return `${year}-${quarter}`;
}

/**
 * Determine earnings result based on surprise percentage
 * Beat: > 2%, Miss: < -2%, Inline: -2% to 2%
 */
function getEarningsResult(surprisePercent) {
  if (surprisePercent === null || surprisePercent === undefined) return null;
  if (surprisePercent > BEAT_THRESHOLD) return 'Beat';
  if (surprisePercent < MISS_THRESHOLD) return 'Miss';
  return 'Inline';
}

/**
 * Calculate days between two dates
 */
function getDaysBetween(date1Str, date2Str) {
  const d1 = new Date(date1Str);
  const d2 = new Date(date2Str);
  const diffMs = Math.abs(d2 - d1);
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculate surprise percent from earnings data
 */
function calculateSurprisePercent(earning) {
  if (earning.surprisePercent !== undefined && earning.surprisePercent !== null) {
    return earning.surprisePercent;
  }

  const actual = earning.actual;
  const estimate = earning.estimate;

  if (actual !== null && estimate !== null && estimate !== 0) {
    return ((actual - estimate) / Math.abs(estimate)) * 100;
  }

  return null;
}

/**
 * Match earnings from two companies by quarter
 * Returns array of matched quarters with trigger/echo determined by date order
 */
function matchQuarterlyEarnings(symbolA, earningsA, symbolB, earningsB) {
  // Build maps of earnings by year-quarter key
  const mapA = new Map();
  const mapB = new Map();

  for (const earning of earningsA) {
    const date = earning.period || earning.date;
    if (!date) continue;
    const key = getYearQuarterKey(date);
    const surprisePercent = calculateSurprisePercent(earning);
    mapA.set(key, { date, surprisePercent, symbol: symbolA, result: earning.result || null });
  }

  for (const earning of earningsB) {
    const date = earning.period || earning.date;
    if (!date) continue;
    const key = getYearQuarterKey(date);
    const surprisePercent = calculateSurprisePercent(earning);
    mapB.set(key, { date, surprisePercent, symbol: symbolB, result: earning.result || null });
  }

  // Find matching quarters
  const matchedQuarters = [];
  const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
  const sortedKeys = Array.from(allKeys).sort().reverse(); // Most recent first

  for (const key of sortedKeys) {
    const dataA = mapA.get(key);
    const dataB = mapB.get(key);

    // Skip if either company missing data for this quarter
    if (!dataA || !dataB) continue;
    // Note: We allow null surprisePercent for static data to still calculate avgGapDays

    // Always use symbolA as trigger and symbolB as echo (designated pair order)
    // This ensures consistent stats relative to the pair's designated trigger
    const trigger = dataA;
    const echo = dataB;

    const gapDays = getDaysBetween(trigger.date, echo.date);
    const triggerResult = trigger.result || null;
    const echoResult = echo.result || null;

    // Determine agreement (same result direction) - null if no result data
    const agreement = (triggerResult && echoResult) ? triggerResult === echoResult : null;

    // Parse quarter for display (e.g., "2024-Q3" → "Q3 2024")
    const [year, q] = key.split('-');
    const quarterDisplay = `${q} ${year}`;

    const matched = {
      quarter: quarterDisplay,
      triggerDate: trigger.date,
      triggerSymbol: trigger.symbol,
      echoDate: echo.date,
      echoSymbol: echo.symbol,
      gapDays,
      triggerResult,
      echoResult,
      triggerSurprisePercent: trigger.surprisePercent !== null ? Math.round(trigger.surprisePercent * 10) / 10 : 0,
      echoSurprisePercent: echo.surprisePercent !== null ? Math.round(echo.surprisePercent * 10) / 10 : 0,
      agreement
    };

    // Add warning if gap is too large
    if (gapDays > MAX_GAP_DAYS_WARNING) {
      matched.warning = `Gap of ${gapDays} days exceeds ${MAX_GAP_DAYS_WARNING} day threshold`;
    }

    matchedQuarters.push(matched);
  }

  return matchedQuarters;
}

/**
 * Calculate fundamental echo statistics from matched quarters
 */
function calculateFundamentalEchoStats(matchedQuarters) {
  if (!matchedQuarters || matchedQuarters.length === 0) {
    return {
      beatFollowsBeat: null,
      missFollowsMiss: null,
      directionAgreement: null,
      fundamentalCorrelation: null,
      avgGapDays: 0,
      sampleSize: 0
    };
  }

  let triggerBeatCount = 0;
  let echoBeatGivenTriggerBeat = 0;
  let triggerMissCount = 0;
  let echoMissGivenTriggerMiss = 0;
  let sameDirectionCount = 0;
  let totalGapDays = 0;

  matchedQuarters.forEach(q => {
    // Use lowercase comparison
    const triggerBeat = q.triggerResult === 'beat';
    const triggerMiss = q.triggerResult === 'miss';
    const echoBeat = q.echoResult === 'beat';
    const echoMiss = q.echoResult === 'miss';

    // Beat follows Beat
    if (triggerBeat) {
      triggerBeatCount++;
      if (echoBeat) echoBeatGivenTriggerBeat++;
    }

    // Miss follows Miss
    if (triggerMiss) {
      triggerMissCount++;
      if (echoMiss) echoMissGivenTriggerMiss++;
    }

    // Direction agreement (both beat or both miss, excluding inline)
    if ((triggerBeat && echoBeat) || (triggerMiss && echoMiss)) {
      sameDirectionCount++;
    }

    totalGapDays += q.gapDays || 0;
  });

  const sampleSize = matchedQuarters.length;

  return {
    beatFollowsBeat: triggerBeatCount > 0 ?
      Math.round((echoBeatGivenTriggerBeat / triggerBeatCount) * 100) : null,
    missFollowsMiss: triggerMissCount > 0 ?
      Math.round((echoMissGivenTriggerMiss / triggerMissCount) * 100) : null,
    directionAgreement: sampleSize > 0 ?
      Math.round((sameDirectionCount / sampleSize) * 100) : null,
    fundamentalCorrelation: null,
    avgGapDays: sampleSize > 0 ? Math.round(totalGapDays / sampleSize) : 0,
    sampleSize: sampleSize
  };
}

/**
 * Check if pattern was accurate
 * - Trigger surprise >= 2% AND echo move >= 1.5% AND same direction
 */
function isPatternAccurate(triggerSurprisePercent, echoMovePercent) {
  const absTrigerSurprise = Math.abs(triggerSurprisePercent);
  const absEchoMove = Math.abs(echoMovePercent);

  // Check thresholds
  if (absTrigerSurprise < TRIGGER_SURPRISE_THRESHOLD) return false;
  if (absEchoMove < ECHO_MOVE_THRESHOLD) return false;

  // Check same direction
  const sameDirection = (triggerSurprisePercent >= 0 && echoMovePercent >= 0) ||
                        (triggerSurprisePercent < 0 && echoMovePercent < 0);

  return sameDirection;
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(x, y) {
  if (x.length !== y.length || x.length < 4) {
    return null;
  }

  const n = x.length;

  // Calculate means
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  // Calculate correlation
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    numerator += diffX * diffY;
    denomX += diffX * diffX;
    denomY += diffY * diffY;
  }

  const denominator = Math.sqrt(denomX * denomY);

  if (denominator === 0) return 0;

  return numerator / denominator;
}

/**
 * Calculate statistics for a stock pair
 */
function calculateStats(history) {
  const validEntries = history.filter(h =>
    h.triggerSurprisePercent !== null &&
    h.echoMovePercent !== null
  );

  if (validEntries.length === 0) {
    return {
      correlation: null,
      accuracy: 0,
      avgEchoMove: 0,
      sampleSize: 0
    };
  }

  const triggerSurprises = validEntries.map(h => h.triggerSurprisePercent);
  const echoMoves = validEntries.map(h => h.echoMovePercent);

  // Calculate correlation (requires at least 4 data points)
  const correlation = validEntries.length >= 4
    ? calculateCorrelation(triggerSurprises, echoMoves)
    : null;

  // Calculate accuracy
  const accurateCount = validEntries.filter(h => h.accurate).length;
  const accuracy = (accurateCount / validEntries.length) * 100;

  // Calculate average echo move
  const avgEchoMove = echoMoves.reduce((a, b) => a + Math.abs(b), 0) / echoMoves.length;

  return {
    correlation: correlation !== null ? Math.round(correlation * 100) / 100 : null,
    accuracy: Math.round(accuracy * 10) / 10,
    avgEchoMove: Math.round(avgEchoMove * 10) / 10,
    sampleSize: validEntries.length
  };
}

/**
 * Process a single stock pair - calculates both price echo and fundamental echo
 */
async function processStockPair(pair, tiingoKey) {
  console.log(`\nProcessing ${pair.id} (${pair.trigger} → ${pair.echo})...`);

  // Get earnings dates from static data
  console.log(`  Loading earnings dates for ${pair.trigger} and ${pair.echo}...`);
  const triggerEarnings = getEarningsDates(pair.trigger);
  const echoEarnings = getEarningsDates(pair.echo);

  const emptyPriceEcho = {
    history: [],
    stats: {
      correlation: null,
      accuracy: 0,
      avgEchoMove: 0,
      sampleSize: 0
    }
  };

  const emptyFundamentalEcho = {
    matchedQuarters: [],
    stats: null
  };

  if (!triggerEarnings || triggerEarnings.length === 0) {
    console.log(`  No earnings data found for ${pair.trigger}`);
    return {
      priceEcho: emptyPriceEcho,
      fundamentalEcho: emptyFundamentalEcho
    };
  }

  console.log(`  Found ${triggerEarnings.length} earnings records for ${pair.trigger}`);
  console.log(`  Found ${echoEarnings?.length || 0} earnings records for ${pair.echo}`);

  // ========================================
  // FUNDAMENTAL ECHO CALCULATION
  // ========================================
  console.log(`\n  --- Fundamental Echo Analysis ---`);
  let fundamentalEcho = emptyFundamentalEcho;

  if (echoEarnings && echoEarnings.length > 0) {
    // Match quarters between both companies
    const matchedQuarters = matchQuarterlyEarnings(
      pair.trigger, triggerEarnings,
      pair.echo, echoEarnings
    );

    console.log(`  Matched ${matchedQuarters.length} quarters between ${pair.trigger} and ${pair.echo}`);

    for (const q of matchedQuarters) {
      const warning = q.warning ? ` [WARNING: ${q.warning}]` : '';
      const triggerInfo = q.triggerResult ? `${q.triggerResult} (${q.triggerSurprisePercent}%)` : 'N/A';
      const echoInfo = q.echoResult ? `${q.echoResult} (${q.echoSurprisePercent}%)` : 'N/A';
      console.log(`    ${q.quarter}: ${q.triggerSymbol} ${triggerInfo} → ${q.echoSymbol} ${echoInfo}, Gap: ${q.gapDays}d${warning}`);
    }

    const fundamentalStats = calculateFundamentalEchoStats(matchedQuarters);

    if (fundamentalStats) {
      console.log(`  Fundamental Stats: Beat→Beat=${fundamentalStats.beatFollowsBeat}, Miss→Miss=${fundamentalStats.missFollowsMiss}, Agreement=${fundamentalStats.directionAgreement}, Correlation=${fundamentalStats.fundamentalCorrelation}, Avg Gap=${fundamentalStats.avgGapDays}d`);
    } else {
      console.log(`  Fundamental Stats: Insufficient data (need >= ${MIN_SAMPLE_SIZE} samples)`);
    }

    fundamentalEcho = {
      matchedQuarters,
      stats: fundamentalStats
    };
  } else {
    console.log(`  Skipping fundamental echo - no earnings data for ${pair.echo}`);
  }

  // ========================================
  // PRICE ECHO CALCULATION (existing logic)
  // ========================================
  console.log(`\n  --- Price Echo Analysis ---`);

  // Skip price echo if no Tiingo API key
  if (!tiingoKey) {
    console.log(`  Skipped (TIINGO_API_KEY not set)`);
    return {
      priceEcho: emptyPriceEcho,
      fundamentalEcho
    };
  }

  // Extract all earnings dates and find date range
  const triggerDates = triggerEarnings
    .map(e => e.period || e.date)
    .filter(d => d)
    .sort();

  if (triggerDates.length === 0) {
    console.log(`  No valid earnings dates found`);
    return {
      priceEcho: emptyPriceEcho,
      fundamentalEcho
    };
  }

  const earliestDate = triggerDates[0];
  // Add 10 days buffer to endDate to capture D+1 for the latest earnings
  const latestDate = new Date(triggerDates[triggerDates.length - 1]);
  latestDate.setDate(latestDate.getDate() + 10);
  const endDate = latestDate.toISOString().split('T')[0];

  console.log(`  Fetching ${pair.echo} prices from ${earliestDate} to ${endDate}...`);

  // Fetch all historical prices for echo stock in one call (uses Tiingo)
  const priceData = await fetchHistoricalPrices(pair.echo, earliestDate, endDate, tiingoKey);

  if (!priceData || priceData.length === 0) {
    console.log(`  No price data found for ${pair.echo}`);
    return {
      priceEcho: emptyPriceEcho,
      fundamentalEcho
    };
  }

  console.log(`  Fetched ${priceData.length} price records for ${pair.echo}`);

  // Build price map for quick lookups
  const priceMap = buildPriceMap(priceData);
  const sortedDates = getSortedDates(priceMap);

  const history = [];

  for (const earning of triggerEarnings) {
    // Finnhub earnings data structure
    const earningsDate = earning.period || earning.date;
    const actual = earning.actual;
    const estimate = earning.estimate;

    if (!earningsDate) {
      continue;
    }

    // Calculate surprise percent
    let surprisePercent = null;
    if (actual !== null && estimate !== null && estimate !== 0) {
      surprisePercent = ((actual - estimate) / Math.abs(estimate)) * 100;
    } else if (earning.surprisePercent !== undefined) {
      surprisePercent = earning.surprisePercent;
    }

    // Get echo stock movement using price map
    const echoMove = calculateEchoMove(earningsDate, priceMap, sortedDates);

    // Determine accuracy
    const accurate = surprisePercent !== null && echoMove !== null
      ? isPatternAccurate(surprisePercent, echoMove)
      : false;

    const entry = {
      quarter: getQuarterFromDate(earningsDate),
      date: earningsDate,
      triggerResult: surprisePercent !== null ? getTriggerResult(surprisePercent) : 'Unknown',
      triggerSurprisePercent: surprisePercent !== null ? Math.round(surprisePercent * 10) / 10 : null,
      echoMovePercent: echoMove !== null ? Math.round(echoMove * 10) / 10 : null,
      accurate
    };

    history.push(entry);

    console.log(`  ${entry.quarter}: Trigger ${entry.triggerResult} (${entry.triggerSurprisePercent}%), Echo move: ${entry.echoMovePercent}%, Accurate: ${entry.accurate}`);
  }

  // Calculate statistics
  const stats = calculateStats(history);

  console.log(`  Price Echo Stats: Correlation=${stats.correlation}, Accuracy=${stats.accuracy}%, Avg Echo Move=${stats.avgEchoMove}%, Sample Size=${stats.sampleSize}`);

  const priceEcho = { history, stats };

  return { priceEcho, fundamentalEcho };
}

/**
 * Main function
 */
async function main() {
  console.log('Stock Pattern History Calculator');
  console.log('=================================\n');

  const { tiingoKey } = getApiKeys();
  console.log('Starting analysis...');
  console.log('  - Earnings dates: Static data from src/data/earnings-dates.json');
  console.log('  - Tiingo: For historical prices (echo stock)');

  const results = {};

  for (const pair of STOCK_PAIRS) {
    results[pair.id] = await processStockPair(pair, tiingoKey);
  }

  // Write results to JSON file
  const outputPath = path.join(__dirname, '..', 'src', 'data', 'pattern-history.json');

  try {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n=================================`);
    console.log(`Results saved to: ${outputPath}`);
    console.log(`Total pairs analyzed: ${Object.keys(results).length}`);

    // Print summary table
    console.log(`\n=== SUMMARY ===`);
    console.log(`\nPrice Echo (trigger earnings → echo stock price movement):`);
    for (const [pairId, data] of Object.entries(results)) {
      const stats = data.priceEcho?.stats || {};
      console.log(`  ${pairId}: Correlation=${stats.correlation}, Accuracy=${stats.accuracy}%, Samples=${stats.sampleSize}`);
    }

    console.log(`\nFundamental Echo (trigger earnings → echo earnings):`);
    for (const [pairId, data] of Object.entries(results)) {
      const stats = data.fundamentalEcho?.stats;
      if (stats) {
        console.log(`  ${pairId}: Beat→Beat=${stats.beatFollowsBeat}, Miss→Miss=${stats.missFollowsMiss}, Agreement=${stats.directionAgreement}, Correlation=${stats.fundamentalCorrelation}, AvgGap=${stats.avgGapDays}d, Samples=${stats.sampleSize}`);
      } else {
        const count = data.fundamentalEcho?.matchedQuarters?.length || 0;
        console.log(`  ${pairId}: Insufficient data (${count} matched quarters, need >= ${MIN_SAMPLE_SIZE})`);
      }
    }
  } catch (error) {
    console.error('Error writing output file:', error.message);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
