import { kv } from "@vercel/kv";
import { generateLLMSignal } from "./_lib/tradeSignal.js";
import { buildEchoContext } from "./_lib/echoContext.js";
import { getMarketStatsForEvent } from "./_lib/marketStats.js";
import { buildConfidenceBreakdown, CONFIDENCE_MODEL_VERSION } from "./_lib/confidenceEngine.js";
import { buildSignalId, buildTelemetryLog, writeSignalTelemetry } from "./_lib/telemetry.js";

/**
 * Trade Signal API - Phase 3.3 Signal Quality
 *
 * POST /api/trade-signal
 * Body: { "eventId": "string", "symbol"?: "string" }
 *
 * Returns a trade signal with:
 * - signal: "BUY" | "SELL" | "AVOID" | "WAIT"
 * - confidence: { overall, grade, components, notes }
 * - setup: { thesis, direction, instrument, timeHorizon, entry, invalidation, targets }
 * - sizingHint: { riskPerTradePct, suggestedPositionPct, stopDistancePct, caps }
 * - explain: array of reasoning bullets
 * - meta: { modelVersion, echoUsed, marketStatsUsed }
 *
 * Caches signals in KV with 7-day TTL, versioned by model version
 */

const MAJOR_EVENTS_KEY = "major_events";
const SIGNAL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Build versioned cache key
 */
function buildCacheKey(eventId) {
  return `tradeSignal:v${CONFIDENCE_MODEL_VERSION}:${eventId}`;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY environment variable is not set');
    return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY is not configured' });
  }

  // Check KV configuration
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: 'Vercel KV is not configured'
    });
  }

  // Parse and validate request body
  let eventId;
  let symbol;
  try {
    const requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    eventId = requestBody?.eventId;
    symbol = requestBody?.symbol; // Optional symbol for market stats
  } catch (parseError) {
    console.error('Failed to parse request body:', parseError);
    return res.status(400).json({ ok: false, error: 'Invalid JSON in request body' });
  }

  // Validate eventId is present
  if (!eventId || typeof eventId !== 'string' || eventId.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'eventId is required' });
  }

  eventId = eventId.trim();

  // Track start time for latency measurement
  const startTimeMs = Date.now();

  try {
    // Check if signal already exists in KV cache (versioned)
    const signalKey = buildCacheKey(eventId);
    const cachedSignal = await kv.get(signalKey);

    if (cachedSignal) {
      console.log(`Returning cached signal for event: ${eventId} (v${CONFIDENCE_MODEL_VERSION})`);

      // Write telemetry for cached response (non-blocking, swallow errors)
      try {
        const latencyMs = Date.now() - startTimeMs;
        const cachedSymbol = cachedSignal.symbol || symbol;
        const signalId = buildSignalId({
          modelVersion: CONFIDENCE_MODEL_VERSION,
          eventId,
          symbol: cachedSymbol
        });
        const telemetryLog = buildTelemetryLog({
          signalId,
          ts: new Date().toISOString(),
          eventId,
          symbol: cachedSymbol,
          theme: cachedSignal.echoContext?.theme || null,
          source: cachedSignal.source || null,
          signal: cachedSignal.signal,
          direction: cachedSignal.setup?.direction,
          overall: cachedSignal.confidence?.overall,
          grade: cachedSignal.confidence?.grade,
          components: cachedSignal.confidence?.components,
          echoUsed: cachedSignal.meta?.echoUsed,
          marketStatsUsed: cachedSignal.meta?.marketStatsUsed,
          atrPct: null,
          gapPct: null,
          ambiguity: null,
          entryType: cachedSignal.setup?.entry?.type,
          entryLevel: cachedSignal.setup?.entry?.level,
          invalidationLevel: cachedSignal.setup?.invalidation?.level,
          stopDistancePct: cachedSignal.sizingHint?.stopDistancePct,
          riskPerTradePct: cachedSignal.sizingHint?.riskPerTradePct,
          suggestedPositionPct: cachedSignal.sizingHint?.suggestedPositionPct,
          cached: true,
          latencyMs,
          modelVersion: CONFIDENCE_MODEL_VERSION,
          avoidCode: cachedSignal.meta?.avoidCode
        });
        writeSignalTelemetry({ kv, log: telemetryLog }).catch(() => {});
      } catch (telemetryError) {
        console.warn('Telemetry write failed (cached):', telemetryError.message);
      }

      return res.status(200).json({
        ...cachedSignal,
        cached: true
      });
    }

    // Find the event in the major events list
    const events = await kv.get(MAJOR_EVENTS_KEY) || [];
    const event = events.find(e => e.id === eventId);

    if (!event) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }

    // Validate event has necessary data
    if (!event.headline) {
      return res.status(400).json({ ok: false, error: 'Event is missing required headline' });
    }

    console.log(`Generating trade signal for event: ${eventId}`);

    // Step 1: Generate LLM signal
    let llmOutput;
    try {
      llmOutput = await generateLLMSignal(event);
      console.log('LLM output generated:', llmOutput.direction, llmOutput.instrument);
    } catch (llmError) {
      console.error('LLM signal generation failed:', llmError.message);
      return res.status(200).json({
        ok: false,
        error: 'MODEL_PARSE_FAILED',
        message: 'Failed to generate trade signal from model'
      });
    }

    // Step 2: Build echo context (optional, never fails signal)
    let echoContext = null;
    try {
      echoContext = buildEchoContext(event, 50); // Base confidence doesn't matter here
      if (echoContext) {
        console.log(`Echo context built: ${echoContext.pairId}`);
      }
    } catch (echoError) {
      console.warn('Echo context build failed (non-fatal):', echoError.message);
    }

    // Step 3: Fetch market stats (optional, never fails signal)
    let marketStats = null;
    try {
      marketStats = await getMarketStatsForEvent(event);
      if (marketStats && !marketStats.fallback) {
        console.log(`Market stats fetched: ATR%=${marketStats.atrPct}, Gap%=${marketStats.gapPct}`);
      }
    } catch (marketError) {
      console.warn('Market stats fetch failed (non-fatal):', marketError.message);
    }

    // Step 4: Build confidence breakdown and determine signal
    const confidenceResult = buildConfidenceBreakdown({
      event,
      echoContext,
      llmOutput,
      marketStats
    });

    // Step 5: Build final response in new format
    const signal = {
      ok: true,
      symbol: symbol || marketStats?.symbol || llmOutput.tickers[0] || null,
      eventId,
      timestamp: new Date().toISOString(),
      signal: confidenceResult.signal,
      confidence: confidenceResult.confidence,
      setup: {
        thesis: llmOutput.thesis,
        direction: llmOutput.direction,
        instrument: confidenceResult.signal === 'AVOID' ? 'NO_TRADE' : llmOutput.instrument,
        timeHorizon: llmOutput.timeHorizon,
        entry: llmOutput.entry,
        invalidation: llmOutput.invalidation,
        targets: llmOutput.targets
      },
      sizingHint: confidenceResult.sizingHint,
      explain: [
        ...confidenceResult.explain,
        ...(llmOutput.keyRisks.length > 0 ? [`Key risks: ${llmOutput.keyRisks[0]}`] : [])
      ],
      meta: confidenceResult.meta,
      // Legacy fields for backward compatibility
      targets: llmOutput.tickers,
      keyRisks: llmOutput.keyRisks,
      // Include echo context if available
      echoContext: echoContext || undefined
    };

    // Store in KV with TTL
    await kv.set(signalKey, signal, { ex: SIGNAL_TTL_SECONDS });
    console.log(`Stored signal in KV (v${CONFIDENCE_MODEL_VERSION}) with ${SIGNAL_TTL_SECONDS}s TTL`);

    // Write telemetry for fresh response (non-blocking, swallow errors)
    try {
      const latencyMs = Date.now() - startTimeMs;
      const finalSymbol = signal.symbol;
      const telemetrySignalId = buildSignalId({
        modelVersion: CONFIDENCE_MODEL_VERSION,
        eventId,
        symbol: finalSymbol
      });
      const telemetryLog = buildTelemetryLog({
        signalId: telemetrySignalId,
        ts: signal.timestamp,
        eventId,
        symbol: finalSymbol,
        theme: event.analysis?.theme || event.theme || null,
        source: event.source || null,
        signal: signal.signal,
        direction: llmOutput.direction,
        overall: signal.confidence?.overall,
        grade: signal.confidence?.grade,
        components: signal.confidence?.components,
        echoUsed: signal.meta?.echoUsed,
        marketStatsUsed: signal.meta?.marketStatsUsed,
        atrPct: marketStats?.atrPct ?? null,
        gapPct: marketStats?.gapPct ?? null,
        ambiguity: llmOutput.ambiguity ?? null,
        entryType: llmOutput.entry?.type,
        entryLevel: llmOutput.entry?.level,
        invalidationLevel: llmOutput.invalidation?.level,
        stopDistancePct: signal.sizingHint?.stopDistancePct,
        riskPerTradePct: signal.sizingHint?.riskPerTradePct,
        suggestedPositionPct: signal.sizingHint?.suggestedPositionPct,
        cached: false,
        latencyMs,
        modelVersion: CONFIDENCE_MODEL_VERSION,
        avoidCode: signal.meta?.avoidCode
      });
      writeSignalTelemetry({ kv, log: telemetryLog }).catch(() => {});
    } catch (telemetryError) {
      console.warn('Telemetry write failed (fresh):', telemetryError.message);
    }

    return res.status(200).json({
      ...signal,
      cached: false
    });

  } catch (error) {
    console.error('Error generating trade signal:', error);

    // Handle specific OpenAI errors
    if (error?.status === 401 || error.message?.includes('Invalid API key')) {
      return res.status(500).json({ ok: false, error: 'Invalid OpenAI API key' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ ok: false, error: 'OpenAI rate limit exceeded. Please try again later.' });
    }
    if (error?.status === 503) {
      return res.status(503).json({ ok: false, error: 'OpenAI service temporarily unavailable' });
    }

    // Return 200 with ok:false to avoid UI error loops
    return res.status(200).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to generate trade signal'
    });
  }
}
