import OpenAI from "openai";
import { buildEchoContext } from "./echoContext.js";

/**
 * System prompt for GPT-5.1 trade signal generation - Phase 3.3
 * Updated to return structured JSON for confidence engine
 */
export const TRADE_SIGNAL_SYSTEM_PROMPT = `You are a fast macro trading analyst for a professional trading assistant.
Your job is to generate a structured trade signal based on a major news event and its analysis.

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations.

LANGUAGE RULES:
- Output language for ALL explanatory text fields: Turkish (tr-TR)
- Keep all JSON keys/schema in English
- Do NOT translate raw news titles or headlines from input data - keep them in their original language (usually English)
- Explanatory fields that MUST be in Turkish: thesis, invalidation.reason, targets[].reason, keyRisks[]

OUTPUT SCHEMA (all fields required):

{
  "thesis": "1-2 cümle trade tezi, Türkçe (Turkish)",
  "direction": "LONG" | "SHORT" | "NONE",
  "instrument": "STOCK" | "OPTIONS" | "NO_TRADE",
  "timeHorizon": "INTRADAY" | "SWING" | "MULTI_DAY",
  "entry": {
    "type": "market" | "limit" | "wait",
    "level": 0
  },
  "invalidation": {
    "level": 0,
    "reason": "kısa açıklama, Türkçe (Turkish)"
  },
  "targets": [
    { "level": 0, "reason": "kısa açıklama, Türkçe (Turkish)" }
  ],
  "ambiguity": 0.0,
  "hedged": false,
  "tickers": ["TICKER1", "TICKER2"],
  "keyRisks": ["risk açıklaması, Türkçe (Turkish)"]
}

GUIDELINES:

1. DIRECTION:
   - "LONG" = Buy exposure to assets that benefit
   - "SHORT" = Sell/short assets that will be hurt
   - "NONE" = Too uncertain, noisy, or already priced in

2. TICKERS:
   - Provide 3-8 tickers or ETFs
   - ONLY use large, liquid, well-known US or global names
   - Prefer major ETFs when sector-wide: SPY, QQQ, XLE, XLF, XLK, XLV, XLI, XLU, XLP, XLY, XLB, XLRE, GLD, SLV, TLT, HYG, EEM, EFA, VWO, USO, UNG, DBA
   - For individual stocks, only use mega-caps: AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, JPM, GS, XOM, CVX, BA, CAT, etc.
   - NEVER invent obscure or illiquid tickers

3. AMBIGUITY (0.0 to 1.0):
   - 0.0 = Very clear, unambiguous event with obvious implications
   - 0.5 = Moderate uncertainty, some conflicting factors
   - 1.0 = Highly ambiguous, unclear implications

4. HEDGED (boolean):
   - true if you find yourself using words like "might", "could", "possibly", "if"
   - true if thesis has significant caveats
   - false if you have conviction

5. ENTRY:
   - type "market" = enter immediately
   - type "limit" = enter at specific level
   - type "wait" = wait for pullback/setup
   - level = 0 if market entry, otherwise specific price

6. INVALIDATION:
   - level = price at which thesis is invalidated
   - reason = brief explanation why

7. TARGETS (0-2 targets):
   - level = target price
   - reason = brief explanation

8. TIME HORIZON:
   - "INTRADAY" = same day
   - "SWING" = 1-5 days
   - "MULTI_DAY" = 1-3 weeks

9. INSTRUMENT:
   - "STOCK" for equity exposure
   - "OPTIONS" if leveraged play makes sense
   - "NO_TRADE" if direction is NONE

10. KEY_RISKS:
    - 2-4 short bullet points of key risks
    - Each max 80 characters

If uncertain, set ambiguity HIGH and prefer entry.type="wait" or direction="NONE".
Do NOT compute confidence scores - that is handled by the system.`;

/**
 * Legacy system prompt kept for reference
 */
export const TRADE_SIGNAL_SYSTEM_PROMPT_LEGACY = `You are a fast macro trading analyst for a professional trading assistant.
Your job is to generate a concise trade signal based on a major news event and its analysis.

IMPORTANT GUIDELINES:

1. ACTION:
   - "long" = Buy exposure to assets that benefit from this event
   - "short" = Sell/short assets that will be hurt by this event
   - "avoid" = The event is too uncertain, noisy, or already priced in

2. TARGETS:
   - Provide 3-8 tickers or ETFs
   - ONLY use large, liquid, well-known US or global names
   - Prefer major ETFs when sector-wide: SPY, QQQ, XLE, XLF, XLK, XLV, XLI, XLU, XLP, XLY, XLB, XLRE, GLD, SLV, TLT, HYG, EEM, EFA, VWO, USO, UNG, DBA
   - For individual stocks, only use mega-caps: AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, JPM, GS, XOM, CVX, BA, CAT, etc.
   - NEVER invent obscure or illiquid tickers
   - Make targets SPECIFIC to the event - don't repeat the same generic list

3. HORIZON:
   - "very_short" = intraday to 1-2 days
   - "short" = 1-2 weeks
   - "medium" = 1-3 months

4. CONFIDENCE:
   - 0-100 integer
   - Be conservative; use 40-70 for most signals
   - Above 80 only for extremely clear macro shocks

5. ONE_LINER:
   - A single sentence trade idea (max 100 characters)
   - Be specific and actionable

6. RATIONALE:
   - 2-4 short bullet points explaining why
   - Each bullet max 80 characters

7. KEY_RISKS:
   - 2-4 short bullet points of key risks
   - Each bullet max 80 characters

Output must be valid JSON matching the exact schema provided.`;

/**
 * Schema for new Phase 3.3 output format
 */
export const OUTPUT_SCHEMA = {
  thesis: "string (1-2 sentences)",
  direction: "LONG | SHORT | NONE",
  instrument: "STOCK | OPTIONS | NO_TRADE",
  timeHorizon: "INTRADAY | SWING | MULTI_DAY",
  entry: { type: "market | limit | wait", level: "number" },
  invalidation: { level: "number", reason: "string" },
  targets: [{ level: "number", reason: "string" }],
  ambiguity: "number (0.0-1.0)",
  hedged: "boolean",
  tickers: ["string (3-8 tickers/ETFs)"],
  keyRisks: ["string (2-4 bullets, max 80 chars each)"]
};

/**
 * Validates the new Phase 3.3 trade signal response from GPT
 */
export function validateTradeSignal(data) {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  // Check direction
  if (!['LONG', 'SHORT', 'NONE'].includes(data.direction)) return false;

  // Check thesis
  if (typeof data.thesis !== 'string' || data.thesis.length === 0) return false;

  // Check instrument
  if (!['STOCK', 'OPTIONS', 'NO_TRADE'].includes(data.instrument)) return false;

  // Check timeHorizon
  if (!['INTRADAY', 'SWING', 'MULTI_DAY'].includes(data.timeHorizon)) return false;

  // Check tickers
  if (!Array.isArray(data.tickers)) return false;
  if (data.tickers.length < 1 || data.tickers.length > 8) return false;

  // Check ambiguity
  if (typeof data.ambiguity !== 'number') return false;
  if (data.ambiguity < 0 || data.ambiguity > 1) return false;

  // Check hedged
  if (typeof data.hedged !== 'boolean') return false;

  // Check entry (optional structure validation)
  if (data.entry && typeof data.entry === 'object') {
    if (!['market', 'limit', 'wait'].includes(data.entry.type)) return false;
  }

  // Check keyRisks (allow empty in edge cases)
  if (!Array.isArray(data.keyRisks)) return false;

  return true;
}

/**
 * Validates legacy format (for backward compatibility)
 */
export function validateLegacyTradeSignal(data) {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  // Check action
  if (!['long', 'short', 'avoid'].includes(data.action)) return false;

  // Check targets
  if (!Array.isArray(data.targets)) return false;
  if (data.targets.length < 3 || data.targets.length > 8) return false;

  // Check horizon
  if (!['very_short', 'short', 'medium'].includes(data.horizon)) return false;

  // Check confidence
  if (typeof data.confidence !== 'number') return false;
  if (data.confidence < 0 || data.confidence > 100) return false;

  // Check oneLiner
  if (typeof data.oneLiner !== 'string') return false;

  // Check rationale
  if (!Array.isArray(data.rationale)) return false;
  if (data.rationale.length < 2 || data.rationale.length > 4) return false;

  // Check keyRisks
  if (!Array.isArray(data.keyRisks)) return false;
  if (data.keyRisks.length < 2 || data.keyRisks.length > 4) return false;

  return true;
}

/**
 * Normalizes the new Phase 3.3 LLM response
 * Returns the raw LLM output in normalized form for confidence engine
 * @param {object} data - Raw signal data from GPT
 * @returns {object} - Normalized LLM output
 */
export function normalizeLLMOutput(data) {
  return {
    thesis: String(data.thesis || '').slice(0, 300),
    direction: data.direction || 'NONE',
    instrument: data.instrument || 'NO_TRADE',
    timeHorizon: data.timeHorizon || 'SWING',
    entry: {
      type: data.entry?.type || 'market',
      level: Number(data.entry?.level) || 0
    },
    invalidation: {
      level: Number(data.invalidation?.level) || 0,
      reason: String(data.invalidation?.reason || '').slice(0, 150)
    },
    targets: (data.targets || []).map(t => ({
      level: Number(t?.level) || 0,
      reason: String(t?.reason || '').slice(0, 100)
    })).slice(0, 2),
    ambiguity: Math.max(0, Math.min(1, Number(data.ambiguity) || 0.3)),
    hedged: Boolean(data.hedged),
    tickers: (data.tickers || []).map(t => String(t).toUpperCase()).slice(0, 8),
    keyRisks: (data.keyRisks || []).map(r => String(r).slice(0, 120)).slice(0, 4)
  };
}

/**
 * Legacy normalizer for backward compatibility
 * @param {object} data - Raw signal data from GPT
 * @param {string} eventId - Event ID
 * @param {object|null} echoContext - Optional echo context for calibration
 */
export function normalizeTradeSignal(data, eventId, echoContext = null) {
  // Use calibrated confidence if echo context is available
  const baseConfidence = Math.max(0, Math.min(100, Math.round(data.confidence)));
  const finalConfidence = echoContext ? echoContext.calibratedConfidence : baseConfidence;

  const result = {
    eventId: eventId,
    createdAt: new Date().toISOString(),
    action: data.action,
    targets: data.targets.map(t => String(t).toUpperCase()),
    horizon: data.horizon,
    confidence: finalConfidence,
    oneLiner: String(data.oneLiner).slice(0, 150),
    rationale: data.rationale.map(r => String(r).slice(0, 120)),
    keyRisks: data.keyRisks.map(r => String(r).slice(0, 120))
  };

  // Add echo context if available
  if (echoContext) {
    result.echoContext = echoContext;
  }

  return result;
}

/**
 * Generates a trade signal for a major event using GPT-5.1
 * Returns the raw LLM output for the confidence engine
 * @param {object} event - The major event object with headline, body, and analysis
 * @returns {Promise<object>} - The normalized LLM output
 */
export async function generateLLMSignal(event) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  // Build context from the event
  const userContent = {
    event: {
      headline: event.headline,
      body: event.body || null,
      publishedAt: event.publishedAt
    },
    analysis: {
      summary: event.analysis?.summary,
      importanceScore: event.analysis?.importanceScore,
      importanceCategory: event.analysis?.importanceCategory,
      impactHorizon: event.analysis?.impactHorizon,
      sectors: event.analysis?.sectors?.map(s => ({
        name: s.name,
        direction: s.direction,
        rationale: s.rationale,
        exampleTickers: s.exampleTickers,
        confidence: s.confidence
      })) || [],
      riskNotes: event.analysis?.riskNotes || []
    },
    instructions: "Generate a structured trade signal for this macro event. Be conservative. Return ONLY valid JSON.",
    outputSchema: OUTPUT_SCHEMA
  };

  // Initialize OpenAI client
  const client = new OpenAI({ apiKey });

  // Call GPT-5.1 with retry logic for JSON parsing
  let parsedResponse = null;
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-5.1",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: TRADE_SIGNAL_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userContent) }
        ]
      });

      const responseContent = completion.choices?.[0]?.message?.content;

      if (!responseContent) {
        throw new Error('Empty response from model');
      }

      // Parse JSON response
      parsedResponse = JSON.parse(responseContent);

      // Validate response structure
      if (!validateTradeSignal(parsedResponse)) {
        throw new Error('Invalid trade signal structure');
      }

      break; // Success
    } catch (err) {
      lastError = err;
      console.warn(`LLM signal attempt ${attempt + 1} failed:`, err.message);

      if (attempt === 0) {
        // Add fix instruction for retry
        userContent.instructions = "CRITICAL: Return ONLY valid JSON with all required fields. Previous attempt failed. " + userContent.instructions;
      }
    }
  }

  if (!parsedResponse) {
    throw lastError || new Error('Failed to generate LLM signal');
  }

  // Normalize and return
  return normalizeLLMOutput(parsedResponse);
}

/**
 * Legacy: Generates a trade signal for a major event using GPT-5.1
 * @param {object} event - The major event object with headline, body, and analysis
 * @param {string} eventId - The event ID
 * @returns {Promise<object>} - The generated trade signal
 */
export async function generateTradeSignal(event, eventId) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  // Build context from the event
  const userContent = {
    event: {
      headline: event.headline,
      body: event.body || null,
      publishedAt: event.publishedAt
    },
    analysis: {
      summary: event.analysis?.summary,
      importanceScore: event.analysis?.importanceScore,
      importanceCategory: event.analysis?.importanceCategory,
      impactHorizon: event.analysis?.impactHorizon,
      sectors: event.analysis?.sectors?.map(s => ({
        name: s.name,
        direction: s.direction,
        rationale: s.rationale,
        exampleTickers: s.exampleTickers,
        confidence: s.confidence
      })) || [],
      riskNotes: event.analysis?.riskNotes || []
    },
    instructions: "Generate a trade signal for this macro event. Be conservative and specific.",
    outputSchema: OUTPUT_SCHEMA
  };

  // Initialize OpenAI client
  const client = new OpenAI({ apiKey });

  // Call GPT-5.1
  const completion = await client.chat.completions.create({
    model: "gpt-5.1",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: TRADE_SIGNAL_SYSTEM_PROMPT_LEGACY },
      { role: "user", content: JSON.stringify(userContent) }
    ]
  });

  // Extract response content
  const responseContent = completion.choices?.[0]?.message?.content;

  if (!responseContent) {
    throw new Error('Empty response from model');
  }

  // Parse JSON response
  let parsedResponse;
  try {
    parsedResponse = JSON.parse(responseContent);
  } catch (jsonError) {
    console.error('Failed to parse trade signal JSON response:', jsonError);
    console.error('Raw content:', responseContent);
    throw new Error('Failed to parse model response');
  }

  // Validate response structure
  if (!validateLegacyTradeSignal(parsedResponse)) {
    console.error('Invalid trade signal structure from model');
    console.error('Parsed response:', JSON.stringify(parsedResponse, null, 2));
    throw new Error('Invalid trade signal structure from model');
  }

  // Build echo context if applicable (based on event tickers matching canonical pairs)
  const baseConfidence = Math.max(0, Math.min(100, Math.round(parsedResponse.confidence)));
  let echoContext = null;

  try {
    echoContext = buildEchoContext(event, baseConfidence);
    if (echoContext) {
      console.log(`Echo context built for pair: ${echoContext.pairId}, alignment: ${echoContext.alignment}, calibrated confidence: ${echoContext.calibratedConfidence}`);
    }
  } catch (err) {
    console.warn('Failed to build echo context:', err.message);
    // Continue without echo context
  }

  // Normalize and return response with optional echo context
  return normalizeTradeSignal(parsedResponse, eventId, echoContext);
}
