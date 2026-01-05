import { analyzeNews } from "../_lib/newsIntel.js";
import {
  logDecision,
  incrementMetric,
  hashHeadline,
  computePrefilterScore,
  DECISION_TYPES,
} from "../_lib/newsDebugLog.js";

/**
 * POST /api/news-debug/analyze
 *
 * Manually analyze a headline to see how the classifier would treat it.
 * Does NOT store to major events - only for debugging.
 * Admin-only: requires ?admin=1&secret=<NEWS_WATCHDOG_CRON_SECRET>
 *
 * Body:
 * - headline: string (required)
 * - summary: string (optional)
 * - url: string (optional)
 *
 * Returns prefilter score, reasons, and GPT analysis.
 */
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Admin gating: require ?admin=1 and ?secret=...
  const cronSecret = process.env.NEWS_WATCHDOG_CRON_SECRET;

  if (!cronSecret) {
    return res.status(500).json({
      ok: false,
      error: "NEWS_WATCHDOG_CRON_SECRET not set",
    });
  }

  const { admin, secret } = req.query;

  if (admin !== "1") {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized: admin=1 required",
    });
  }

  if (secret !== cronSecret) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized: invalid or missing secret",
    });
  }

  // Check OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY not configured",
    });
  }

  try {
    // Parse body
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { headline, summary, url } = body || {};

    if (!headline || typeof headline !== "string" || headline.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: "headline is required",
      });
    }

    const trimmedHeadline = headline.trim();
    const trimmedSummary = summary?.trim() || null;
    const trimmedUrl = url?.trim() || null;

    // Compute prefilter score
    const hash = hashHeadline(trimmedHeadline, trimmedUrl);
    const { score: prefilterScore, reasons: prefilterReasons } = computePrefilterScore(
      trimmedHeadline,
      trimmedSummary
    );

    // Analyze with GPT
    let analysis = null;
    let error = null;

    try {
      analysis = await analyzeNews(trimmedHeadline, trimmedSummary);
    } catch (err) {
      error = err.message;
    }

    // Log the decision as manual_report
    const decisionEntry = {
      provider: "manual_report",
      providerId: `manual_${Date.now()}`,
      headline: trimmedHeadline,
      hash,
      prefilterScore,
      prefilterReasons,
      threshold: 50,
      dailyCap: 50,
      decision: error ? DECISION_TYPES.ERROR : DECISION_TYPES.ANALYZED,
      decisionReason: error
        ? `Manual analysis error: ${error}`
        : `Manual analysis: score ${analysis?.importanceScore || 0}`,
      classifier: analysis
        ? {
            used: true,
            importanceScore: analysis.importanceScore,
            importanceCategory: analysis.importanceCategory,
            marketRelevance: analysis.sectors?.[0]?.confidence || null,
            summary: analysis.summary,
          }
        : { used: false },
      error,
    };

    await logDecision(decisionEntry);
    await incrementMetric("decisionsLoggedCount", 1);

    return res.status(200).json({
      ok: true,
      headline: trimmedHeadline,
      hash,
      prefilter: {
        score: prefilterScore,
        reasons: prefilterReasons,
      },
      analysis: analysis || null,
      error: error || null,
      wouldBeStored: analysis ? analysis.importanceScore >= 50 : false,
    });
  } catch (error) {
    console.error("[news-debug/analyze] Error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to analyze headline",
    });
  }
}
