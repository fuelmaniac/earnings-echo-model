import { kv } from "@vercel/kv";
import { generateTradeSignal } from "./_lib/tradeSignal.js";

/**
 * Trade Signal API - Generate trade signals for major events
 *
 * POST /api/trade-signal
 * Body: { "eventId": "string" }
 *
 * Returns a trade signal with:
 * - action: "long" | "short" | "avoid"
 * - targets: 3-8 tickers/ETFs
 * - horizon: "very_short" | "short" | "medium"
 * - confidence: 0-100
 * - oneLiner: concise trade idea
 * - rationale: 2-4 bullets
 * - keyRisks: 2-4 bullets
 *
 * Caches signals in KV with 7-day TTL
 */

const MAJOR_EVENTS_KEY = "major_events";
const SIGNAL_KEY_PREFIX = "signal:";
const SIGNAL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

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
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  // Check KV configuration
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({
      error: 'Vercel KV is not configured'
    });
  }

  // Parse and validate request body
  let eventId;
  try {
    const requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    eventId = requestBody?.eventId;
  } catch (parseError) {
    console.error('Failed to parse request body:', parseError);
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Validate eventId is present
  if (!eventId || typeof eventId !== 'string' || eventId.trim().length === 0) {
    return res.status(400).json({ error: 'eventId is required' });
  }

  eventId = eventId.trim();

  try {
    // Check if signal already exists in KV cache
    const signalKey = `${SIGNAL_KEY_PREFIX}${eventId}`;
    const cachedSignal = await kv.get(signalKey);

    if (cachedSignal) {
      console.log(`Returning cached signal for event: ${eventId}`);
      return res.status(200).json({
        ...cachedSignal,
        cached: true
      });
    }

    // Find the event in the major events list
    const events = await kv.get(MAJOR_EVENTS_KEY) || [];
    const event = events.find(e => e.id === eventId);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Validate event has necessary data
    if (!event.headline) {
      return res.status(400).json({ error: 'Event is missing required headline' });
    }

    // Generate trade signal using GPT-5.1
    console.log(`Generating trade signal for event: ${eventId}`);
    const signal = await generateTradeSignal(event, eventId);

    // Store in KV with TTL
    await kv.set(signalKey, signal, { ex: SIGNAL_TTL_SECONDS });
    console.log(`Stored signal in KV with ${SIGNAL_TTL_SECONDS}s TTL`);

    return res.status(200).json({
      ...signal,
      cached: false
    });

  } catch (error) {
    console.error('Error generating trade signal:', error);

    // Handle specific OpenAI errors
    if (error?.status === 401 || error.message?.includes('Invalid API key')) {
      return res.status(500).json({ error: 'Invalid OpenAI API key' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ error: 'OpenAI rate limit exceeded. Please try again later.' });
    }
    if (error?.status === 503) {
      return res.status(503).json({ error: 'OpenAI service temporarily unavailable' });
    }

    return res.status(500).json({ error: 'Failed to generate trade signal' });
  }
}
