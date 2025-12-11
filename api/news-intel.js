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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  // Parse and validate request body
  let headline, body;
  try {
    const requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    headline = requestBody?.headline;
    body = requestBody?.body;
  } catch (parseError) {
    console.error('Failed to parse request body:', parseError);
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Validate headline is present
  if (!headline || typeof headline !== 'string' || headline.trim().length === 0) {
    return res.status(400).json({ error: 'headline is required' });
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

  try {
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
      console.error('Empty response from OpenAI');
      return res.status(500).json({ error: 'Empty response from model' });
    }

    // Parse JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch (jsonError) {
      console.error('Failed to parse model JSON response:', jsonError);
      console.error('Raw content:', responseContent);
      return res.status(500).json({ error: 'Failed to parse model response' });
    }

    // Validate response structure
    if (!validateResponse(parsedResponse)) {
      console.error('Invalid response structure from model');
      console.error('Parsed response:', JSON.stringify(parsedResponse, null, 2));
      return res.status(500).json({ error: 'Invalid response structure from model' });
    }

    // Normalize and return response
    const normalizedResponse = normalizeResponse(parsedResponse);
    return res.status(200).json(normalizedResponse);

  } catch (error) {
    console.error('Error calling OpenAI API:', error);

    // Handle specific OpenAI errors
    if (error?.status === 401) {
      return res.status(500).json({ error: 'Invalid OpenAI API key' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ error: 'OpenAI rate limit exceeded. Please try again later.' });
    }
    if (error?.status === 503) {
      return res.status(503).json({ error: 'OpenAI service temporarily unavailable' });
    }

    return res.status(500).json({ error: 'Failed to process news intelligence request' });
  }
}
