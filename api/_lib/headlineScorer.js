/**
 * Lightweight rule-based headline importance scoring.
 * Used as a prefilter before calling GPT-5.1 to control API costs.
 */

// Very high importance keywords (+30 to +50 points)
const VERY_HIGH_KEYWORDS = [
  { pattern: /\bblockade\b/i, score: 45 },
  { pattern: /\bstrait\b/i, score: 40 },
  { pattern: /\bhormuz\b/i, score: 50 },
  { pattern: /\bsanctions?\b/i, score: 35 },
  { pattern: /\bwar\b/i, score: 50 },
  { pattern: /\bmissile\b/i, score: 45 },
  { pattern: /\battack\b/i, score: 35 },
  { pattern: /\bcoup\b/i, score: 50 },
  { pattern: /\bdefault\b/i, score: 40 },
  { pattern: /\bbank run\b/i, score: 50 },
  { pattern: /\btrading halt\b/i, score: 45 },
  { pattern: /\bearthquake\b/i, score: 35 },
  { pattern: /\bblackout\b/i, score: 40 },
  { pattern: /\bpower outage\b/i, score: 40 },
  { pattern: /\bgrid failure\b/i, score: 45 },
  { pattern: /\bcyberattack\b/i, score: 45 },
  { pattern: /\bpipeline\b/i, score: 30 },
  { pattern: /\bopec\b/i, score: 35 },
  { pattern: /\brate decision\b/i, score: 40 },
  { pattern: /\binterest rate\b/i, score: 30 },
  { pattern: /\bfed\s+(raises?|cuts?|hikes?)\b/i, score: 45 },
  { pattern: /\bcentral bank\b/i, score: 30 },
  { pattern: /\bnuclear\b/i, score: 45 },
  { pattern: /\binvasion\b/i, score: 50 },
  { pattern: /\bterror(ist|ism)?\b/i, score: 45 },
  { pattern: /\bpandemic\b/i, score: 45 },
  { pattern: /\bcrash(es|ed|ing)?\b/i, score: 35 },
  { pattern: /\bcollapse[sd]?\b/i, score: 40 },
  { pattern: /\bbankrupt(cy)?\b/i, score: 40 },
  { pattern: /\brecession\b/i, score: 35 },
  { pattern: /\binfla(tion|tionary)\b/i, score: 30 },
  { pattern: /\bsuez\b/i, score: 45 },
  { pattern: /\bpanama canal\b/i, score: 40 },
  { pattern: /\bsupply chain\b/i, score: 25 },
  { pattern: /\btariff\b/i, score: 30 },
  { pattern: /\btrade war\b/i, score: 40 },
];

// Medium importance keywords (+10 to +25 points)
const MEDIUM_KEYWORDS = [
  { pattern: /\bshutdown\b/i, score: 20 },
  { pattern: /\bstrike\b/i, score: 15 },
  { pattern: /\bevacuation\b/i, score: 20 },
  { pattern: /\bexplosion\b/i, score: 25 },
  { pattern: /\bmajor outage\b/i, score: 25 },
  { pattern: /\bborder\b/i, score: 10 },
  { pattern: /\bsurge[sd]?\b/i, score: 15 },
  { pattern: /\bplunge[sd]?\b/i, score: 20 },
  { pattern: /\bsoar(s|ed|ing)?\b/i, score: 15 },
  { pattern: /\btumble[sd]?\b/i, score: 15 },
  { pattern: /\bcrisis\b/i, score: 20 },
  { pattern: /\bemergency\b/i, score: 20 },
  { pattern: /\bshortage\b/i, score: 15 },
  { pattern: /\bflood(s|ed|ing)?\b/i, score: 15 },
  { pattern: /\bhurricane\b/i, score: 20 },
  { pattern: /\btsunami\b/i, score: 25 },
  { pattern: /\bwildfire\b/i, score: 15 },
  { pattern: /\bdrought\b/i, score: 15 },
  { pattern: /\bprotest(s|ers?)?\b/i, score: 10 },
  { pattern: /\briot(s|ing)?\b/i, score: 20 },
  { pattern: /\brecall(s|ed)?\b/i, score: 10 },
  { pattern: /\bIPO\b/i, score: 10 },
  { pattern: /\bmerger\b/i, score: 15 },
  { pattern: /\bacquisition\b/i, score: 15 },
  { pattern: /\bspinoff\b/i, score: 10 },
  { pattern: /\blayoff(s)?\b/i, score: 15 },
  { pattern: /\bjob cuts?\b/i, score: 15 },
  { pattern: /\bCEO (resign|step|leave|fired|out)\b/i, score: 20 },
  { pattern: /\bSEC\b/i, score: 15 },
  { pattern: /\bFDA\b/i, score: 15 },
  { pattern: /\bFTC\b/i, score: 15 },
  { pattern: /\bantitrust\b/i, score: 20 },
  { pattern: /\bregulat(ion|ory|or)\b/i, score: 10 },
];

/**
 * Scores a headline (and optional summary) for importance.
 * Returns a number from 0-100. Higher scores indicate more likely major events.
 *
 * @param {string} headline - The news headline
 * @param {string} [summary] - Optional news summary/body
 * @returns {number} Importance score (0-100)
 */
export function scoreHeadline(headline, summary) {
  let score = 0;
  const text = `${headline || ''} ${summary || ''}`.toLowerCase();

  // Check very high importance keywords
  for (const { pattern, score: keywordScore } of VERY_HIGH_KEYWORDS) {
    if (pattern.test(text)) {
      score += keywordScore;
    }
  }

  // Check medium importance keywords
  for (const { pattern, score: keywordScore } of MEDIUM_KEYWORDS) {
    if (pattern.test(text)) {
      score += keywordScore;
    }
  }

  // Cap at 100
  return Math.min(100, score);
}
