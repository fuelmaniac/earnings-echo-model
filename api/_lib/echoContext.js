import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load JSON using require which is well-supported
const patternHistoryData = require('../_data/pattern-history.json');

/**
 * Canonical pairs with their constituent tickers
 * Each pair has a trigger and echo ticker
 */
export const CANONICAL_PAIRS = {
  AMD_NVDA: { tickers: ['AMD', 'NVDA'], trigger: 'AMD', echo: 'NVDA' },
  JPM_BAC: { tickers: ['JPM', 'BAC'], trigger: 'JPM', echo: 'BAC' },
  TSLA_F: { tickers: ['TSLA', 'F'], trigger: 'TSLA', echo: 'F' },
  AAPL_MSFT: { tickers: ['AAPL', 'MSFT'], trigger: 'AAPL', echo: 'MSFT' },
  XOM_CVX: { tickers: ['XOM', 'CVX'], trigger: 'XOM', echo: 'CVX' }
};

/**
 * Load pattern history data
 * Uses static require which is bundled by Vercel at build time
 */
export function loadPatternHistory() {
  return patternHistoryData || {};
}

/**
 * Extract all tickers mentioned in an event's analysis
 * @param {object} event - The major event object
 * @returns {Set<string>} - Set of uppercase ticker symbols
 */
export function extractEventTickers(event) {
  const tickers = new Set();

  if (!event?.analysis?.sectors) {
    return tickers;
  }

  for (const sector of event.analysis.sectors) {
    if (Array.isArray(sector.exampleTickers)) {
      for (const ticker of sector.exampleTickers) {
        // Normalize to uppercase and add
        const normalized = String(ticker).toUpperCase().trim();
        if (normalized) {
          tickers.add(normalized);
        }
      }
    }
  }

  return tickers;
}

/**
 * Find matching canonical pair from event tickers
 * @param {Set<string>} eventTickers - Set of tickers from the event
 * @param {object} patternHistory - Pattern history data
 * @returns {object|null} - { pairId, trigger, echo, stats } or null if no match
 */
export function findMatchingPair(eventTickers, patternHistory) {
  const matches = [];

  for (const [pairId, pairConfig] of Object.entries(CANONICAL_PAIRS)) {
    // Check if any event ticker matches this pair
    const hasMatch = pairConfig.tickers.some(t => eventTickers.has(t));

    if (hasMatch && patternHistory[pairId]) {
      const pairData = patternHistory[pairId];
      const priceStats = pairData.priceEcho?.stats || {};
      const fundamentalStats = pairData.fundamentalEcho?.stats || {};

      matches.push({
        pairId,
        trigger: pairConfig.trigger,
        echo: pairConfig.echo,
        priceStats,
        fundamentalStats,
        // For sorting: use accuracy first, then sampleSize
        accuracy: priceStats.accuracy ?? 0,
        sampleSize: priceStats.sampleSize ?? 0
      });
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // Sort by accuracy (desc), then sampleSize (desc)
  matches.sort((a, b) => {
    if (b.accuracy !== a.accuracy) {
      return b.accuracy - a.accuracy;
    }
    return b.sampleSize - a.sampleSize;
  });

  return matches[0];
}

/**
 * Determine alignment based on event sector direction for the matched pair
 * @param {object} event - The major event object
 * @param {string} trigger - Trigger ticker
 * @param {string} echo - Echo ticker
 * @returns {"tailwind" | "headwind" | "neutral"}
 */
export function determineAlignment(event, trigger, echo) {
  if (!event?.analysis?.sectors) {
    return 'neutral';
  }

  // Find a sector that mentions either ticker
  for (const sector of event.analysis.sectors) {
    if (!Array.isArray(sector.exampleTickers)) continue;

    const tickersUpper = sector.exampleTickers.map(t => String(t).toUpperCase());
    const hasTrigger = tickersUpper.includes(trigger);
    const hasEcho = tickersUpper.includes(echo);

    if (hasTrigger || hasEcho) {
      const direction = sector.direction?.toLowerCase();
      if (direction === 'bullish') {
        return 'tailwind';
      } else if (direction === 'bearish') {
        return 'headwind';
      }
      // Continue searching for a more definitive direction
    }
  }

  return 'neutral';
}

/**
 * Calculate calibrated confidence using echo stats
 * @param {number} baseConfidence - Original confidence from GPT (0-100)
 * @param {object} priceStats - Price echo stats
 * @param {object} fundamentalStats - Fundamental echo stats
 * @returns {number} - Calibrated confidence (0-100)
 */
export function calculateCalibratedConfidence(baseConfidence, priceStats, fundamentalStats) {
  let adjustment = 0;

  const accuracy = priceStats.accuracy ?? 0;
  const sampleSize = priceStats.sampleSize ?? 0;
  const avgEchoMove = priceStats.avgEchoMove;
  const correlation = priceStats.correlation;
  const directionAgreement = fundamentalStats.directionAgreement ?? 0;

  // Apply boosts
  if (accuracy >= 80) {
    adjustment += 10;
  } else if (accuracy >= 70) {
    adjustment += 5;
  }

  if (avgEchoMove !== null && avgEchoMove !== undefined && Math.abs(avgEchoMove) >= 1.0) {
    adjustment += 5;
  }

  if (directionAgreement >= 70) {
    adjustment += 5;
  }

  if (correlation !== null && correlation !== undefined && Math.abs(correlation) >= 0.3) {
    adjustment += 5;
  }

  // Apply penalties
  if (sampleSize < 6) {
    adjustment -= 10;
  }

  // Calculate final calibrated confidence
  const calibrated = Math.max(0, Math.min(100, Math.round(baseConfidence + adjustment)));

  return calibrated;
}

/**
 * Generate a contextual note for the echo context
 * @param {string} trigger - Trigger ticker
 * @param {string} echo - Echo ticker
 * @param {string} alignment - "tailwind" | "headwind" | "neutral"
 * @param {object} priceStats - Price echo stats
 * @param {object} fundamentalStats - Fundamental echo stats
 * @returns {string}
 */
export function generateContextNote(trigger, echo, alignment, priceStats, fundamentalStats) {
  const accuracy = priceStats.accuracy ?? 0;
  const sampleSize = priceStats.sampleSize ?? 0;
  const avgGapDays = fundamentalStats.avgGapDays ?? null;

  let note = '';

  if (accuracy >= 70) {
    note = `${trigger} earnings historically signal ${echo} direction with ${accuracy}% accuracy`;
  } else if (accuracy >= 50) {
    note = `${trigger}/${echo} pair shows moderate correlation in earnings outcomes`;
  } else {
    note = `${trigger}/${echo} pair has weak historical correlation - use caution`;
  }

  if (avgGapDays !== null && avgGapDays > 0) {
    note += ` (~${avgGapDays}d lag)`;
  }

  if (sampleSize < 6) {
    note += `. Limited sample (n=${sampleSize})`;
  }

  return note;
}

/**
 * Build echo context for a trade signal if applicable
 * @param {object} event - The major event object
 * @param {number} baseConfidence - Base confidence from GPT
 * @returns {object|null} - echoContext object or null if no match
 */
export function buildEchoContext(event, baseConfidence) {
  // Load pattern history data
  const patternHistory = loadPatternHistory();

  if (Object.keys(patternHistory).length === 0) {
    console.log('Pattern history is empty, skipping echo context');
    return null;
  }

  // Extract tickers from event
  const eventTickers = extractEventTickers(event);

  if (eventTickers.size === 0) {
    console.log('No tickers found in event, skipping echo context');
    return null;
  }

  console.log('Event tickers:', Array.from(eventTickers));

  // Find matching pair
  const match = findMatchingPair(eventTickers, patternHistory);

  if (!match) {
    console.log('No matching canonical pair found');
    return null;
  }

  console.log(`Found matching pair: ${match.pairId}`);

  // Determine alignment
  const alignment = determineAlignment(event, match.trigger, match.echo);

  // Calculate calibrated confidence
  const calibratedConfidence = calculateCalibratedConfidence(
    baseConfidence,
    match.priceStats,
    match.fundamentalStats
  );

  // Generate note
  const note = generateContextNote(
    match.trigger,
    match.echo,
    alignment,
    match.priceStats,
    match.fundamentalStats
  );

  // Build echoContext object
  return {
    pairId: match.pairId,
    trigger: match.trigger,
    echo: match.echo,
    alignment,
    stats: {
      accuracy: match.priceStats.accuracy ?? undefined,
      correlation: match.priceStats.correlation ?? null,
      avgEchoMove: match.priceStats.avgEchoMove ?? null,
      sampleSize: match.priceStats.sampleSize ?? undefined,
      directionAgreement: match.fundamentalStats.directionAgreement ?? undefined,
      avgGapDays: match.fundamentalStats.avgGapDays ?? null
    },
    note,
    calibratedConfidence
  };
}
