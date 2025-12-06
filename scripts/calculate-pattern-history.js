#!/usr/bin/env node

/**
 * Stock Pattern History Calculator
 *
 * This script fetches historical earnings data and calculates pattern accuracy
 * for stock pairs (trigger → echo relationships).
 *
 * Uses:
 * - Finnhub API: For earnings data (/stock/earnings)
 * - Tiingo API: For historical daily close prices
 *
 * Usage: FINNHUB_API_KEY=your_key TIINGO_API_KEY=your_key node scripts/calculate-pattern-history.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const TIINGO_BASE_URL = 'https://api.tiingo.com/tiingo/daily';
const EARNINGS_LIMIT = 8; // Last 8 earnings to fetch

// Stock pairs to analyze: [triggerSymbol, echoSymbol]
const STOCK_PAIRS = [
  { id: 'AMD_NVDA', trigger: 'AMD', echo: 'NVDA' },
  { id: 'JPM_BAC', trigger: 'JPM', echo: 'BAC' },
  { id: 'TSLA_F', trigger: 'TSLA', echo: 'F' },
  { id: 'AAPL_MSFT', trigger: 'AAPL', echo: 'MSFT' },
  { id: 'XOM_CVX', trigger: 'XOM', echo: 'CVX' }
];

// Accuracy thresholds
const TRIGGER_SURPRISE_THRESHOLD = 2.0; // 2%
const ECHO_MOVE_THRESHOLD = 1.5; // 1.5%

/**
 * Get API keys from environment
 */
function getApiKeys() {
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const tiingoKey = process.env.TIINGO_API_KEY;

  if (!finnhubKey) {
    console.error('Error: FINNHUB_API_KEY environment variable is not set.');
    console.error('Please set it before running this script:');
    console.error('  export FINNHUB_API_KEY=your_api_key_here');
    process.exit(1);
  }

  if (!tiingoKey) {
    console.error('Error: TIINGO_API_KEY environment variable is not set.');
    console.error('Please set it before running this script:');
    console.error('  export TIINGO_API_KEY=your_api_key_here');
    process.exit(1);
  }

  return { finnhubKey, tiingoKey };
}

/**
 * Fetch earnings history for a stock (uses Finnhub)
 */
async function fetchEarningsHistory(symbol, finnhubKey) {
  const url = `${FINNHUB_BASE_URL}/stock/earnings`;

  try {
    const response = await axios.get(url, {
      params: {
        symbol,
        limit: EARNINGS_LIMIT,
        token: finnhubKey
      }
    });

    return response.data || [];
  } catch (error) {
    console.error(`Error fetching earnings for ${symbol}:`, error.message);
    return [];
  }
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
 * Determine quarter string from date
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
 * Process a single stock pair
 */
async function processStockPair(pair, finnhubKey, tiingoKey) {
  console.log(`\nProcessing ${pair.id} (${pair.trigger} → ${pair.echo})...`);

  // Fetch earnings history for trigger stock (uses Finnhub)
  const earnings = await fetchEarningsHistory(pair.trigger, finnhubKey);

  if (!earnings || earnings.length === 0) {
    console.log(`  No earnings data found for ${pair.trigger}`);
    return {
      history: [],
      stats: {
        correlation: null,
        accuracy: 0,
        avgEchoMove: 0,
        sampleSize: 0
      }
    };
  }

  console.log(`  Found ${earnings.length} earnings records for ${pair.trigger}`);

  // Extract all earnings dates and find date range
  const earningsDates = earnings
    .map(e => e.period || e.date)
    .filter(d => d)
    .sort();

  if (earningsDates.length === 0) {
    console.log(`  No valid earnings dates found`);
    return {
      history: [],
      stats: { correlation: null, accuracy: 0, avgEchoMove: 0, sampleSize: 0 }
    };
  }

  const earliestDate = earningsDates[0];
  // Add 10 days buffer to endDate to capture D+1 for the latest earnings
  const latestDate = new Date(earningsDates[earningsDates.length - 1]);
  latestDate.setDate(latestDate.getDate() + 10);
  const endDate = latestDate.toISOString().split('T')[0];

  console.log(`  Fetching ${pair.echo} prices from ${earliestDate} to ${endDate}...`);

  // Fetch all historical prices for echo stock in one call (uses Tiingo)
  const priceData = await fetchHistoricalPrices(pair.echo, earliestDate, endDate, tiingoKey);

  if (!priceData || priceData.length === 0) {
    console.log(`  No price data found for ${pair.echo}`);
    return {
      history: [],
      stats: { correlation: null, accuracy: 0, avgEchoMove: 0, sampleSize: 0 }
    };
  }

  console.log(`  Fetched ${priceData.length} price records for ${pair.echo}`);

  // Build price map for quick lookups
  const priceMap = buildPriceMap(priceData);
  const sortedDates = getSortedDates(priceMap);

  const history = [];

  for (const earning of earnings) {
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

  console.log(`  Stats: Correlation=${stats.correlation}, Accuracy=${stats.accuracy}%, Avg Echo Move=${stats.avgEchoMove}%, Sample Size=${stats.sampleSize}`);

  return { history, stats };
}

/**
 * Main function
 */
async function main() {
  console.log('Stock Pattern History Calculator');
  console.log('=================================\n');

  const { finnhubKey, tiingoKey } = getApiKeys();
  console.log('API keys found. Starting analysis...');
  console.log('  - Finnhub: For earnings data');
  console.log('  - Tiingo: For historical prices');

  const results = {};

  for (const pair of STOCK_PAIRS) {
    results[pair.id] = await processStockPair(pair, finnhubKey, tiingoKey);
  }

  // Write results to JSON file
  const outputPath = path.join(__dirname, '..', 'src', 'data', 'pattern-history.json');

  try {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n=================================`);
    console.log(`Results saved to: ${outputPath}`);
    console.log(`Total pairs analyzed: ${Object.keys(results).length}`);
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
