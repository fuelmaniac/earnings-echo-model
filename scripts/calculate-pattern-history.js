#!/usr/bin/env node

/**
 * Stock Pattern History Calculator
 *
 * This script fetches historical earnings data and calculates pattern accuracy
 * for stock pairs (trigger → echo relationships).
 *
 * Uses a HYBRID APPROACH for Finnhub earnings data:
 * - /calendar/earnings: For actual announcement dates (reportDate)
 * - /stock/earnings: For EPS surprise data (surprisePercent)
 *
 * The hybrid approach is necessary because:
 * - /stock/earnings only provides fiscal period end dates (e.g., "2024-09-30")
 * - /calendar/earnings provides actual announcement dates (e.g., "2024-10-29")
 * - Without actual dates, gapDays between companies would always be 0
 *
 * APIs Used:
 * - Finnhub API: For earnings data (calendar + surprises endpoints)
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

// Fundamental echo thresholds
const BEAT_THRESHOLD = 2.0;  // surprisePercent > 2.0% = Beat
const MISS_THRESHOLD = -2.0; // surprisePercent < -2.0% = Miss
const MAX_GAP_DAYS_WARNING = 45; // Flag if earnings >45 days apart in same quarter
const MIN_SAMPLE_SIZE = 4; // Minimum samples for stats calculation

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
 * Fetch earnings surprises for a stock (uses Finnhub /stock/earnings)
 * Returns fiscal period end dates and EPS surprise data
 */
async function fetchEarningsSurprises(symbol, finnhubKey) {
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
    console.error(`Error fetching earnings surprises for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Fetch earnings calendar for a stock (uses Finnhub /calendar/earnings)
 * Returns actual announcement dates (reportDate)
 */
async function fetchEarningsCalendar(symbol, fromDate, toDate, finnhubKey) {
  const url = `${FINNHUB_BASE_URL}/calendar/earnings`;

  try {
    const response = await axios.get(url, {
      params: {
        symbol,
        from: fromDate,
        to: toDate,
        token: finnhubKey
      }
    });

    // Response format: { earningsCalendar: [ {date, epsActual, epsEstimate, hour, ...} ] }
    return response.data?.earningsCalendar || [];
  } catch (error) {
    console.error(`Error fetching earnings calendar for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Merge earnings calendar (announcement dates) with earnings surprises (EPS data)
 * Returns unified earnings data with actual announcement dates
 */
function mergeEarningsData(calendarData, surpriseData) {
  // Build a map of quarter → surprise data (from /stock/earnings)
  const surpriseByQuarter = new Map();
  for (const item of surpriseData) {
    const period = item.period;
    if (!period) continue;
    const key = getYearQuarterKey(period);
    // Store the best data for this quarter (in case of duplicates)
    if (!surpriseByQuarter.has(key) || item.surprisePercent !== null) {
      surpriseByQuarter.set(key, {
        period,
        actual: item.actual,
        estimate: item.estimate,
        surprisePercent: item.surprisePercent,
        surprise: item.surprise
      });
    }
  }

  // Build a map of quarter → calendar data (from /calendar/earnings)
  const calendarByQuarter = new Map();
  for (const item of calendarData) {
    const reportDate = item.date;
    if (!reportDate) continue;

    // Calendar dates are actual announcement dates
    // We need to determine the fiscal quarter being reported
    // Typically, companies report Q3 results in Oct/Nov (4-6 weeks after quarter end)
    // So we look at the previous quarter from the announcement date
    const reportMonth = new Date(reportDate).getMonth() + 1;
    const reportYear = new Date(reportDate).getFullYear();

    // Infer fiscal quarter from announcement date
    // Jan-Mar announcements → Q4 of prior year
    // Apr-May announcements → Q1
    // Jul-Aug announcements → Q2
    // Oct-Nov announcements → Q3
    let fiscalQuarter, fiscalYear;
    if (reportMonth >= 1 && reportMonth <= 3) {
      fiscalQuarter = 'Q4';
      fiscalYear = reportYear - 1;
    } else if (reportMonth >= 4 && reportMonth <= 6) {
      fiscalQuarter = 'Q1';
      fiscalYear = reportYear;
    } else if (reportMonth >= 7 && reportMonth <= 9) {
      fiscalQuarter = 'Q2';
      fiscalYear = reportYear;
    } else {
      fiscalQuarter = 'Q3';
      fiscalYear = reportYear;
    }

    const key = `${fiscalYear}-${fiscalQuarter}`;

    // Store calendar data with actual announcement date
    if (!calendarByQuarter.has(key)) {
      calendarByQuarter.set(key, {
        reportDate,
        hour: item.hour, // 'bmo' (before market open) or 'amc' (after market close)
        epsActual: item.epsActual,
        epsEstimate: item.epsEstimate
      });
    }
  }

  // Merge: Start with calendar data (for announcement dates) and add surprise data
  const merged = [];

  // First, match calendar entries with surprise data
  for (const [key, calendar] of calendarByQuarter) {
    const surprise = surpriseByQuarter.get(key);

    if (surprise) {
      // We have both calendar and surprise data - use announcement date from calendar
      merged.push({
        date: calendar.reportDate,           // Actual announcement date from calendar
        period: surprise.period,             // Fiscal period end date
        actual: surprise.actual ?? calendar.epsActual,
        estimate: surprise.estimate ?? calendar.epsEstimate,
        surprisePercent: surprise.surprisePercent,
        surprise: surprise.surprise,
        hour: calendar.hour,
        source: 'merged'
      });
    } else {
      // Calendar only - calculate surprise from calendar data if possible
      let surprisePercent = null;
      if (calendar.epsActual !== null && calendar.epsEstimate !== null && calendar.epsEstimate !== 0) {
        surprisePercent = ((calendar.epsActual - calendar.epsEstimate) / Math.abs(calendar.epsEstimate)) * 100;
      }

      merged.push({
        date: calendar.reportDate,
        period: null,
        actual: calendar.epsActual,
        estimate: calendar.epsEstimate,
        surprisePercent,
        surprise: null,
        hour: calendar.hour,
        source: 'calendar'
      });
    }
  }

  // Add any surprise-only entries (quarters not in calendar)
  for (const [key, surprise] of surpriseByQuarter) {
    if (!calendarByQuarter.has(key)) {
      // Fallback: use fiscal period end date as announcement date (old behavior)
      merged.push({
        date: surprise.period,               // Fiscal period (fallback)
        period: surprise.period,
        actual: surprise.actual,
        estimate: surprise.estimate,
        surprisePercent: surprise.surprisePercent,
        surprise: surprise.surprise,
        hour: null,
        source: 'surprise'
      });
    }
  }

  // Sort by date descending (most recent first)
  merged.sort((a, b) => new Date(b.date) - new Date(a.date));

  return merged;
}

/**
 * Fetch complete earnings data for a stock using hybrid approach
 * Combines calendar (announcement dates) with surprises (EPS data)
 */
async function fetchEarningsHistory(symbol, finnhubKey) {
  // Calculate date range: 2 years back to end of current year
  const now = new Date();
  const fromDate = `${now.getFullYear() - 2}-01-01`;
  const toDate = `${now.getFullYear()}-12-31`;

  console.log(`    Fetching ${symbol} calendar from ${fromDate} to ${toDate}...`);

  // Fetch both endpoints
  const [calendarData, surpriseData] = await Promise.all([
    fetchEarningsCalendar(symbol, fromDate, toDate, finnhubKey),
    fetchEarningsSurprises(symbol, finnhubKey)
  ]);

  console.log(`    ${symbol}: ${calendarData.length} calendar entries, ${surpriseData.length} surprise entries`);

  // Merge the data
  const merged = mergeEarningsData(calendarData, surpriseData);

  console.log(`    ${symbol}: ${merged.length} merged entries`);

  // Log sample data for debugging
  if (merged.length > 0) {
    const sample = merged[0];
    console.log(`    Sample: date=${sample.date}, period=${sample.period}, surprise=${sample.surprisePercent?.toFixed(1)}%, source=${sample.source}`);
  }

  return merged;
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
 *
 * Uses hybrid data structure with:
 * - date: actual announcement date (from /calendar/earnings)
 * - period: fiscal period end date (from /stock/earnings)
 */
function matchQuarterlyEarnings(symbolA, earningsA, symbolB, earningsB) {
  // Build maps of earnings by year-quarter key
  const mapA = new Map();
  const mapB = new Map();

  for (const earning of earningsA) {
    // Use period for quarter matching (fiscal quarter)
    // Use date for announcement date (actual reporting date)
    const fiscalPeriod = earning.period;
    const announcementDate = earning.date;

    // Derive quarter key from fiscal period if available, else from announcement date
    let key;
    if (fiscalPeriod) {
      key = getYearQuarterKey(fiscalPeriod);
    } else if (announcementDate) {
      // Fallback: infer fiscal quarter from announcement date
      const reportMonth = new Date(announcementDate).getMonth() + 1;
      const reportYear = new Date(announcementDate).getFullYear();
      let fq, fy;
      if (reportMonth >= 1 && reportMonth <= 3) { fq = 'Q4'; fy = reportYear - 1; }
      else if (reportMonth >= 4 && reportMonth <= 6) { fq = 'Q1'; fy = reportYear; }
      else if (reportMonth >= 7 && reportMonth <= 9) { fq = 'Q2'; fy = reportYear; }
      else { fq = 'Q3'; fy = reportYear; }
      key = `${fy}-${fq}`;
    } else {
      continue;
    }

    const surprisePercent = calculateSurprisePercent(earning);
    mapA.set(key, {
      date: announcementDate || fiscalPeriod,  // Prefer announcement date
      period: fiscalPeriod,
      surprisePercent,
      symbol: symbolA,
      source: earning.source
    });
  }

  for (const earning of earningsB) {
    const fiscalPeriod = earning.period;
    const announcementDate = earning.date;

    let key;
    if (fiscalPeriod) {
      key = getYearQuarterKey(fiscalPeriod);
    } else if (announcementDate) {
      const reportMonth = new Date(announcementDate).getMonth() + 1;
      const reportYear = new Date(announcementDate).getFullYear();
      let fq, fy;
      if (reportMonth >= 1 && reportMonth <= 3) { fq = 'Q4'; fy = reportYear - 1; }
      else if (reportMonth >= 4 && reportMonth <= 6) { fq = 'Q1'; fy = reportYear; }
      else if (reportMonth >= 7 && reportMonth <= 9) { fq = 'Q2'; fy = reportYear; }
      else { fq = 'Q3'; fy = reportYear; }
      key = `${fy}-${fq}`;
    } else {
      continue;
    }

    const surprisePercent = calculateSurprisePercent(earning);
    mapB.set(key, {
      date: announcementDate || fiscalPeriod,
      period: fiscalPeriod,
      surprisePercent,
      symbol: symbolB,
      source: earning.source
    });
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
    if (dataA.surprisePercent === null || dataB.surprisePercent === null) continue;

    // Determine which reports first (trigger) and second (echo)
    let trigger, echo;
    const dateA = new Date(dataA.date);
    const dateB = new Date(dataB.date);

    if (dateA < dateB) {
      trigger = dataA;
      echo = dataB;
    } else if (dateB < dateA) {
      trigger = dataB;
      echo = dataA;
    } else {
      // Same day: use alphabetical order
      if (symbolA < symbolB) {
        trigger = dataA;
        echo = dataB;
      } else {
        trigger = dataB;
        echo = dataA;
      }
    }

    const gapDays = getDaysBetween(trigger.date, echo.date);
    const triggerResult = getEarningsResult(trigger.surprisePercent);
    const echoResult = getEarningsResult(echo.surprisePercent);

    // Determine agreement (same result direction)
    const agreement = triggerResult === echoResult;

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
      triggerSurprisePercent: Math.round(trigger.surprisePercent * 10) / 10,
      echoSurprisePercent: Math.round(echo.surprisePercent * 10) / 10,
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
  if (matchedQuarters.length < MIN_SAMPLE_SIZE) {
    return null;
  }

  // Count beat/miss patterns
  let triggerBeats = 0;
  let echoBeatsWhenTriggerBeats = 0;
  let triggerMisses = 0;
  let echoMissesWhenTriggerMisses = 0;
  let agreements = 0;

  const triggerSurprises = [];
  const echoSurprises = [];
  let totalGapDays = 0;

  for (const q of matchedQuarters) {
    // Collect for correlation
    triggerSurprises.push(q.triggerSurprisePercent);
    echoSurprises.push(q.echoSurprisePercent);
    totalGapDays += q.gapDays;

    // Track agreement
    if (q.agreement) agreements++;

    // Beat follows beat
    if (q.triggerResult === 'Beat') {
      triggerBeats++;
      if (q.echoResult === 'Beat') {
        echoBeatsWhenTriggerBeats++;
      }
    }

    // Miss follows miss
    if (q.triggerResult === 'Miss') {
      triggerMisses++;
      if (q.echoResult === 'Miss') {
        echoMissesWhenTriggerMisses++;
      }
    }
  }

  // Calculate probabilities
  const beatFollowsBeat = triggerBeats > 0
    ? Math.round((echoBeatsWhenTriggerBeats / triggerBeats) * 100) / 100
    : null;

  const missFollowsMiss = triggerMisses > 0
    ? Math.round((echoMissesWhenTriggerMisses / triggerMisses) * 100) / 100
    : null;

  const directionAgreement = Math.round((agreements / matchedQuarters.length) * 100) / 100;

  // Calculate correlation between surprise percentages
  const fundamentalCorrelation = calculateCorrelation(triggerSurprises, echoSurprises);

  const avgGapDays = Math.round(totalGapDays / matchedQuarters.length);

  return {
    beatFollowsBeat,
    missFollowsMiss,
    directionAgreement,
    fundamentalCorrelation: fundamentalCorrelation !== null
      ? Math.round(fundamentalCorrelation * 100) / 100
      : null,
    avgGapDays,
    sampleSize: matchedQuarters.length
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
async function processStockPair(pair, finnhubKey, tiingoKey) {
  console.log(`\nProcessing ${pair.id} (${pair.trigger} → ${pair.echo})...`);

  // Fetch earnings history for BOTH stocks (uses Finnhub)
  console.log(`  Fetching earnings for ${pair.trigger} and ${pair.echo}...`);
  const triggerEarnings = await fetchEarningsHistory(pair.trigger, finnhubKey);
  const echoEarnings = await fetchEarningsHistory(pair.echo, finnhubKey);

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
      console.log(`    ${q.quarter}: ${q.triggerSymbol} ${q.triggerResult} (${q.triggerSurprisePercent}%) → ${q.echoSymbol} ${q.echoResult} (${q.echoSurprisePercent}%), Gap: ${q.gapDays}d, Agreement: ${q.agreement}${warning}`);
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

  // Extract all earnings dates and find date range
  const earningsDates = triggerEarnings
    .map(e => e.period || e.date)
    .filter(d => d)
    .sort();

  if (earningsDates.length === 0) {
    console.log(`  No valid earnings dates found`);
    return {
      priceEcho: emptyPriceEcho,
      fundamentalEcho
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

  const { finnhubKey, tiingoKey } = getApiKeys();
  console.log('API keys found. Starting analysis...');
  console.log('  - Finnhub /calendar/earnings: For actual announcement dates');
  console.log('  - Finnhub /stock/earnings: For EPS surprise data');
  console.log('  - Tiingo: For historical prices (echo stock)');

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
