import OpenAI from "openai";

/**
 * System prompt for GPT-5.1 macro/cross-asset analyst
 */
const SYSTEM_PROMPT = `You are an ultra-fast macro and cross-asset analyst for a trading assistant.
Your job is to read a major news event and output a structured JSON describing:

- How important the event is (0–100),
- Whether it is a macro shock, sector shock, or just noise,
- Which sectors are likely bullish or bearish,
- Example large, liquid, publicly traded US or global tickers that could be impacted,
- How long the impact might matter (very_short, short, medium, long),
- Key risks and caveats.

Constraints:

- Never invent obscure or illiquid tickers. Prefer large, well-known names (e.g., GNRC, XOM, CVX, MSFT, AAPL, NVDA, JPM, GS, etc.).
- If unsure about specific tickers, you may return an empty array for exampleTickers.
- ImportanceScore should be higher for events that:
  - Affect multiple countries or regions,
  - Affect critical infrastructure (energy, payments, shipping lanes, etc.),
  - Have potential regulatory, geopolitical, or systemic implications.
- If the event is minor or very localized with limited economic impact, mark it as "noise" with low importanceScore (< 40).
- All output MUST be valid JSON and must follow the exact structure requested.`;

/**
 * Validates the response from GPT to ensure it has required fields
 */
function validateResponse(data) {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  // Check required top-level fields
  if (typeof data.summary !== 'string') return false;
  if (typeof data.importanceScore !== 'number') return false;
  if (!['macro_shock', 'sector_shock', 'noise'].includes(data.importanceCategory)) return false;
  if (!['very_short', 'short', 'medium', 'long'].includes(data.impactHorizon)) return false;
  if (!Array.isArray(data.sectors)) return false;
  if (!Array.isArray(data.riskNotes)) return false;

  // Validate each sector entry
  for (const sector of data.sectors) {
    if (typeof sector !== 'object' || sector === null) return false;
    if (typeof sector.name !== 'string') return false;
    if (!['bullish', 'bearish', 'neutral', 'unclear'].includes(sector.direction)) return false;
    if (typeof sector.rationale !== 'string') return false;
    if (!Array.isArray(sector.exampleTickers)) return false;
    if (typeof sector.confidence !== 'number') return false;
  }

  return true;
}

/**
 * Normalizes the response to ensure consistent structure
 */
function normalizeResponse(data) {
  return {
    summary: data.summary,
    importanceScore: Math.max(0, Math.min(100, data.importanceScore)),
    importanceCategory: data.importanceCategory,
    impactHorizon: data.impactHorizon,
    sectors: data.sectors.map(sector => ({
      name: sector.name,
      direction: sector.direction,
      rationale: sector.rationale,
      exampleTickers: sector.exampleTickers.map(t => String(t).toUpperCase()),
      confidence: Math.max(0, Math.min(1, sector.confidence))
    })),
    riskNotes: data.riskNotes.map(note => String(note)),
    rawModelExplanation: data.rawModelExplanation || undefined
  };
}

/**
 * Analyzes news with GPT-5.1 and returns structured analysis.
 *
 * @param {Object} params
 * @param {string} params.headline - Required news headline
 * @param {string} [params.body] - Optional news body/summary
 * @returns {Promise<Object>} NewsIntelResponse with analysis
 * @throws {Error} On API key missing, validation failure, or API errors
 */
export async function analyzeNewsWithGPT({ headline, body }) {
  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.code = 'API_KEY_MISSING';
    throw error;
  }

  // Validate headline
  if (!headline || typeof headline !== 'string' || headline.trim().length === 0) {
    const error = new Error('headline is required');
    error.code = 'INVALID_INPUT';
    throw error;
  }

  // Build user content for the model
  const userContent = {
    headline: headline.trim(),
    body: body && typeof body === 'string' ? body.trim() : null,
    instructions: "Analyze the economic and market impact of this news.",
    outputSchema: {
      summary: "string",
      importanceScore: "number (0-100)",
      importanceCategory: "macro_shock | sector_shock | noise",
      impactHorizon: "very_short | short | medium | long",
      sectors: [
        {
          name: "string",
          direction: "bullish | bearish | neutral | unclear",
          rationale: "string",
          exampleTickers: ["string"],
          confidence: "number (0-1)"
        }
      ],
      riskNotes: ["string"],
      rawModelExplanation: "string (optional, internal explanation)"
    }
  };

  // Initialize OpenAI client
  const client = new OpenAI({ apiKey });

  // Call GPT-5.1
  const completion = await client.chat.completions.create({
    model: "gpt-5.1",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userContent) }
    ]
  });

  // Extract response content
  const responseContent = completion.choices?.[0]?.message?.content;

  if (!responseContent) {
    const error = new Error('Empty response from model');
    error.code = 'EMPTY_RESPONSE';
    throw error;
  }

  // Parse JSON response
  let parsedResponse;
  try {
    parsedResponse = JSON.parse(responseContent);
  } catch (jsonError) {
    console.error('Failed to parse model JSON response:', jsonError);
    console.error('Raw content:', responseContent);
    const error = new Error('Failed to parse model response');
    error.code = 'PARSE_ERROR';
    throw error;
  }

  // Validate response structure
  if (!validateResponse(parsedResponse)) {
    console.error('Invalid response structure from model');
    console.error('Parsed response:', JSON.stringify(parsedResponse, null, 2));
    const error = new Error('Invalid response structure from model');
    error.code = 'INVALID_RESPONSE';
    throw error;
  }

  // Normalize and return response
  return normalizeResponse(parsedResponse);
}
