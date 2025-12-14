import OpenAI from "openai";
import { buildEchoContext } from "./echoContext.js";

/**
 * System prompt for GPT-5.1 trade signal generation
 */
export const TRADE_SIGNAL_SYSTEM_PROMPT = `You are a fast macro trading analyst for a professional trading assistant.
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
 * Schema reminder for the user prompt
 */
export const OUTPUT_SCHEMA = {
  action: "long | short | avoid",
  targets: ["string (3-8 tickers/ETFs)"],
  horizon: "very_short | short | medium",
  confidence: "number (0-100 integer)",
  oneLiner: "string (max 100 chars)",
  rationale: ["string (2-4 bullets, max 80 chars each)"],
  keyRisks: ["string (2-4 bullets, max 80 chars each)"]
};

/**
 * Validates the trade signal response from GPT
 */
export function validateTradeSignal(data) {
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
 * Normalizes the trade signal response
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
      { role: "system", content: TRADE_SIGNAL_SYSTEM_PROMPT },
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
  if (!validateTradeSignal(parsedResponse)) {
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
