import { analyzeNewsWithGPT } from "./_lib/newsIntel.js";

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

  try {
    const result = await analyzeNewsWithGPT({ headline, body });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in news-intel:', error);

    // Handle specific error codes
    if (error.code === 'API_KEY_MISSING') {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
    }
    if (error.code === 'INVALID_INPUT') {
      return res.status(400).json({ error: error.message });
    }

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
