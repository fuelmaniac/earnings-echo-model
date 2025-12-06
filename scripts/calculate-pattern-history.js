#!/usr/bin/env node

/**
 * Stock Pattern History Calculator
 *
 * This script fetches historical earnings data and calculates pattern accuracy
 * for stock pairs (trigger → echo relationships).
 *
 * Usage: FINNHUB_API_KEY=your_key node scripts/calculate-pattern-history.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const API_DELAY_MS = 300; // Rate limiting delay between API calls
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
 * Sleep utility for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get API key from environment
 */
function getApiKey() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.error('Error: FINNHUB_API_KEY environment variable is not set.');
    console.error('Please set it before running this script:');
    console.error('  export FINNHUB_API_KEY=your_api_key_here');
    console.error('  npm run calculate:history');
    process.exit(1);
  }
  return apiKey;
}

/**
 * Fetch earnings history for a stock
 */
async function fetchEarningsHistory(symbol, apiKey) {
  const url = `${FINNHUB_BASE_URL}/stock/earnings`;

  try {
    const response = await axios.get(url, {
      params: {
        symbol,
        limit: EARNINGS_LIMIT,
        token: apiKey
      }
    });

    return response.data || [];
  } catch (error) {
    console.error(`Error fetching earnings for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Fetch stock candle data for a date range
 */
async function fetchCandleData(symbol, fromTimestamp, toTimestamp, apiKey) {
  const url = `${FINNHUB_BASE_URL}/stock/candle`;

  try {
    const response = await axios.get(url, {
      params: {
        symbol,
        resolution: 'D',
        from: fromTimestamp,
        to: toTimestamp,
        token: apiKey
      }
    });

    return response.data;
  } catch (error) {
    console.error(`Error fetching candle data for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Calculate T+1 price movement for echo stock around earnings date
 * Returns percentage change from earnings day close to next day close
 */
async function calculateEchoMove(echoSymbol, earningsDate, apiKey) {
  // Parse the earnings date and get timestamps
  // We need D (earnings day) and D+1 (next trading day)
  const date = new Date(earningsDate);

  // Fetch 5 days of data to account for weekends/holidays
  const fromDate = new Date(date);
  fromDate.setDate(fromDate.getDate() - 1);
  const toDate = new Date(date);
  toDate.setDate(toDate.getDate() + 5);

  const fromTimestamp = Math.floor(fromDate.getTime() / 1000);
  const toTimestamp = Math.floor(toDate.getTime() / 1000);

  await sleep(API_DELAY_MS);
  const candleData = await fetchCandleData(echoSymbol, fromTimestamp, toTimestamp, apiKey);

  if (!candleData || candleData.s !== 'ok' || !candleData.c || candleData.c.length < 2) {
    return null;
  }

  // Find the index of the earnings date in the candle data
  const earningsTimestamp = Math.floor(date.getTime() / 1000);

  // Find closest trading day to earnings date
  let earningsDayIndex = -1;
  if (candleData.t) {
    for (let i = 0; i < candleData.t.length; i++) {
      // Check if this is the earnings day or the first trading day after
      if (candleData.t[i] >= earningsTimestamp - 86400 && candleData.t[i] <= earningsTimestamp + 86400) {
        earningsDayIndex = i;
        break;
      }
    }
  }

  // If we couldn't find the exact day, use first two available days
  if (earningsDayIndex === -1) {
    earningsDayIndex = 0;
  }

  // Calculate D+1 movement (close to close)
  if (earningsDayIndex + 1 < candleData.c.length) {
    const dayClose = candleData.c[earningsDayIndex];
    const nextDayClose = candleData.c[earningsDayIndex + 1];

    if (dayClose && nextDayClose) {
      return ((nextDayClose / dayClose) - 1) * 100;
    }
  }

  return null;
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
async function processStockPair(pair, apiKey) {
  console.log(`\nProcessing ${pair.id} (${pair.trigger} → ${pair.echo})...`);

  // Fetch earnings history for trigger stock
  await sleep(API_DELAY_MS);
  const earnings = await fetchEarningsHistory(pair.trigger, apiKey);

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

    // Get echo stock movement
    const echoMove = await calculateEchoMove(pair.echo, earningsDate, apiKey);

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

  const apiKey = getApiKey();
  console.log('API key found. Starting analysis...');

  const results = {};

  for (const pair of STOCK_PAIRS) {
    results[pair.id] = await processStockPair(pair, apiKey);
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
