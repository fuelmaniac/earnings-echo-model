/**
 * Confidence Engine - Phase 3.3
 *
 * Computes component scores (0-100), overall confidence, grades, and notes
 * for trade signals. All scoring is deterministic and explainable.
 */

// Model version for cache key versioning
export const CONFIDENCE_MODEL_VERSION = parseInt(process.env.CONFIDENCE_MODEL_VERSION || '1', 10);

/**
 * Clamp a value between 0 and 1
 */
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Clamp a value between min and max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute Echo Edge score (E) from echoContext stats
 * @param {object|null} echoContext - Echo context with stats
 * @returns {{ score: number, notes: string[], echoUsed: boolean }}
 */
export function computeEchoEdge(echoContext) {
  const notes = [];

  if (!echoContext || !echoContext.stats) {
    notes.push('Echo edge verisi mevcut değil');
    return { score: 50, notes, echoUsed: false };
  }

  const { accuracy, correlation, avgEchoMove, sampleSize } = echoContext.stats;

  // Accuracy score: 0.5 -> 0, 0.8 -> 100
  // accuracy is stored as percentage (0-100), convert to decimal
  const accDecimal = (accuracy ?? 50) / 100;
  const accScore = clamp01((accDecimal - 0.5) / 0.3) * 100;

  // Correlation score: abs(corr) / 0.6 * 100
  const corrValue = correlation ?? 0;
  const corrScore = clamp01(Math.abs(corrValue) / 0.6) * 100;

  // Sample score: (sampleSize - 10) / 40 * 100
  const sampleValue = sampleSize ?? 0;
  const sampleScore = clamp01((sampleValue - 10) / 40) * 100;

  // Move score: (abs(avgEchoMove) - 0.5) / 3.0 * 100
  const moveValue = avgEchoMove ?? 0;
  const moveScore = clamp01((Math.abs(moveValue) - 0.5) / 3.0) * 100;

  // Weighted average: 0.45*acc + 0.25*corr + 0.2*sample + 0.1*move
  let score = 0.45 * accScore + 0.25 * corrScore + 0.2 * sampleScore + 0.1 * moveScore;

  // Apply penalties for small sample size
  if (sampleValue < 20 && sampleValue >= 10) {
    const penalty = 8;
    score = Math.max(0, score - penalty);
    notes.push(`Echo örneklemi=${sampleValue} → -${penalty} ceza`);
  } else if (sampleValue < 10) {
    const penalty = 15;
    score = Math.max(0, score - penalty);
    notes.push(`Echo örneklemi=${sampleValue} (çok küçük) → -${penalty} ceza`);
  }

  return { score: Math.round(score), notes, echoUsed: true };
}

/**
 * Compute Event Clarity score (C) from LLM output
 * @param {object} llmOutput - LLM response with ambiguity and hedged fields
 * @returns {{ score: number, notes: string[] }}
 */
export function computeEventClarity(llmOutput) {
  const notes = [];
  const ambiguity = llmOutput?.ambiguity ?? 0.3; // Default to moderate ambiguity
  const hedged = llmOutput?.hedged ?? false;

  let score = (1 - ambiguity) * 100;

  if (hedged) {
    const penalty = 10;
    score = Math.max(0, score - penalty);
    notes.push('LLM belirsiz dil kullandı → -10 ceza');
  }

  if (ambiguity >= 0.6) {
    notes.push('Olay analizinde yüksek belirsizlik tespit edildi');
  }

  return { score: Math.round(score), notes };
}

/**
 * Compute Regime/Volatility score (R) from market stats
 * @param {object|null} marketStats - Market stats with atrPct
 * @returns {{ score: number, notes: string[], marketStatsUsed: boolean }}
 */
export function computeRegimeVol(marketStats) {
  const notes = [];

  if (!marketStats || marketStats.atrPct === undefined) {
    notes.push('Piyasa istatistikleri mevcut değil');
    return { score: 60, notes, marketStatsUsed: false };
  }

  const atrPct = marketStats.atrPct;
  // R = 100 - clamp01((atrPct - 2) / 6) * 100
  // 2% ATR => score 100, 8% ATR => score 0
  const score = 100 - clamp01((atrPct - 2) / 6) * 100;

  if (atrPct >= 5) {
    notes.push(`ATR% yüksek (${atrPct.toFixed(1)}%) → pozisyon küçültüldü`);
  }

  return { score: Math.round(score), notes, marketStatsUsed: true };
}

/**
 * Compute Gap Risk score (G) from market stats
 * @param {object|null} marketStats - Market stats with gapPct
 * @returns {{ score: number, notes: string[] }}
 */
export function computeGapRisk(marketStats) {
  const notes = [];

  if (!marketStats || marketStats.gapPct === undefined) {
    notes.push('Gap verisi mevcut değil');
    return { score: 65, notes };
  }

  const gapPct = marketStats.gapPct;
  // G = 100 - clamp01((gapPct - 1) / 6) * 100
  // 1% gap => score 100, 7% gap => score 0
  const score = 100 - clamp01((gapPct - 1) / 6) * 100;

  if (gapPct >= 3) {
    notes.push(`Büyük gap tespit edildi (${gapPct.toFixed(1)}%) → risk arttı`);
  }

  return { score: Math.round(score), notes };
}

/**
 * Compute Freshness score (F) from event metadata
 * @param {object} event - Event object with publishedAt and analysis
 * @returns {{ score: number, notes: string[] }}
 */
export function computeFreshness(event) {
  const notes = [];
  let score = 60; // Base score

  // Check independent updates count from analysis or dedupe
  const independentUpdates = event?.independentUpdatesCount ?? 1;

  if (independentUpdates >= 4) {
    score += 20;
  } else if (independentUpdates >= 2) {
    score += 10;
  }

  // Cap at 90
  score = Math.min(90, score);

  // Check news recency
  const publishedAt = event?.publishedAt;
  if (publishedAt) {
    const hoursSincePublished = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);

    if (hoursSincePublished > 24) {
      const penalty = Math.min(20, Math.floor((hoursSincePublished - 24) / 12) * 5);
      score = Math.max(30, score - penalty);
      notes.push(`Haber ${Math.round(hoursSincePublished)} saat eski → -${penalty} tazelik cezası`);
    }
  }

  return { score: Math.round(score), notes };
}

/**
 * Compute overall confidence score and grade
 * @param {object} components - { echoEdge, eventClarity, regimeVol, gapRisk, freshness }
 * @param {boolean} echoUsed - Whether echo context was available
 * @returns {{ overall: number, grade: string }}
 */
export function computeOverallConfidence(components, echoUsed) {
  const { echoEdge, eventClarity, regimeVol, gapRisk, freshness } = components;

  // Weights depend on whether echoContext exists
  let weights;
  if (echoUsed) {
    weights = { E: 0.40, C: 0.20, R: 0.15, G: 0.15, F: 0.10 };
  } else {
    weights = { E: 0.15, C: 0.30, R: 0.20, G: 0.20, F: 0.15 };
  }

  const overall = Math.round(
    weights.E * echoEdge +
    weights.C * eventClarity +
    weights.R * regimeVol +
    weights.G * gapRisk +
    weights.F * freshness
  );

  // Determine grade
  let grade;
  if (overall >= 85) {
    grade = 'A';
  } else if (overall >= 70) {
    grade = 'B';
  } else if (overall >= 55) {
    grade = 'C';
  } else {
    grade = 'D';
  }

  return { overall, grade };
}

/**
 * Evaluate AVOID/WAIT rules based on components and context
 * @param {object} params - { components, overall, echoContext, llmOutput, marketStats }
 * @returns {{ signal: string, avoidCode: string|null, explain: string[] }}
 */
export function evaluateSignalRules(params) {
  const { components, overall, echoContext, llmOutput, marketStats } = params;
  const explain = [];
  let avoidCode = null;

  // Rule 1: Overall score too low
  if (overall < 55) {
    explain.push(`Genel güven (${overall}%) eşik altında`);
    explain.push('Birden fazla zayıf bileşen puanı');
    avoidCode = 'AVOID_LOW_CONFIDENCE';
    return { signal: 'AVOID', avoidCode, explain };
  }

  // Rule 2: Echo edge exists but weak
  if (echoContext?.stats) {
    const { sampleSize, accuracy } = echoContext.stats;
    const accDecimal = (accuracy ?? 0) / 100;

    if (sampleSize && sampleSize < 10) {
      explain.push(`Echo örneklem sayısı çok düşük (n=${sampleSize})`);
      explain.push('Güvenilir sinyal için yetersiz tarihsel veri');
      avoidCode = 'AVOID_NO_EDGE';
      return { signal: 'AVOID', avoidCode, explain };
    }

    if (accDecimal < 0.55) {
      explain.push(`Echo doğruluğu çok düşük (${accuracy}%)`);
      explain.push('Tarihsel örüntü güvenilir değil');
      avoidCode = 'AVOID_NO_EDGE';
      return { signal: 'AVOID', avoidCode, explain };
    }
  }

  // Rule 3: Strong conflict between echo and LLM directions
  if (echoContext && llmOutput) {
    const echoDirection = echoContext.alignment === 'tailwind' ? 'LONG' :
                          echoContext.alignment === 'headwind' ? 'SHORT' : null;
    const llmDirection = llmOutput.direction;

    if (echoDirection && llmDirection && echoDirection !== llmDirection && llmDirection !== 'NONE') {
      const echoEdge = components.echoEdge;
      const eventClarity = components.eventClarity;

      if (echoEdge > 75 && eventClarity > 75) {
        explain.push('Echo örüntüsü olay analiziyle çelişiyor');
        explain.push(`Echo ${echoDirection}, analiz ${llmDirection} öneriyor`);
        explain.push('Her iki tarafta güçlü kanaat - pozisyon kaçınılmalı');
        avoidCode = 'AVOID_CONFLICT';
        return { signal: 'AVOID', avoidCode, explain };
      }
    }
  }

  // Rule 4: High volatility
  if (components.regimeVol < 35) {
    explain.push(`Volatilite çok yüksek (rejim puanı: ${components.regimeVol})`);
    explain.push('Piyasa koşulları pozisyon için uygun değil');
    avoidCode = 'AVOID_TOO_VOLATILE';
    return { signal: 'AVOID', avoidCode, explain };
  }

  // Rule 5: High gap risk
  if (components.gapRisk < 35) {
    explain.push(`Gap riski çok yüksek (puan: ${components.gapRisk})`);
    explain.push('Son fiyat gapleri aşırı gece riski gösteriyor');
    avoidCode = 'AVOID_GAP_RISK';
    return { signal: 'AVOID', avoidCode, explain };
  }

  // WAIT rules
  // Rule 6: Marginal confidence with wait level available
  if (overall >= 55 && overall < 70) {
    const entryType = llmOutput?.entry?.type;
    const entryLevel = llmOutput?.entry?.level;

    if (entryType === 'wait' || (entryLevel && entryLevel > 0)) {
      explain.push(`Marjinal güven (${overall}%) - daha iyi giriş bekle`);
      explain.push(`Hedef giriş seviyesi: ${entryLevel || 'geri çekilme'}`);
      avoidCode = 'WAIT_FOR_LEVEL';
      return { signal: 'WAIT', avoidCode, explain };
    }
  }

  // Rule 7: Poor gap risk but strong thesis
  if (components.gapRisk < 50 && components.eventClarity > 70) {
    explain.push('Güçlü tez ama yüksek gap riski');
    explain.push('Giriş için fiyatın dengelenmesini bekle');
    avoidCode = 'WAIT_FOR_LEVEL';
    return { signal: 'WAIT', avoidCode, explain };
  }

  // No AVOID/WAIT rules triggered - use LLM direction
  return { signal: null, avoidCode: null, explain: [] };
}

/**
 * Compute position sizing hint
 * @param {object} params - { overall, grade, llmOutput, marketStats }
 * @returns {object} sizingHint
 */
export function computeSizingHint(params) {
  const { overall, grade, llmOutput, marketStats, signal } = params;
  const notes = [];

  // Risk per trade based on grade
  const riskByGrade = { A: 1.0, B: 0.5, C: 0.25, D: 0 };
  let riskPerTradePct = riskByGrade[grade] ?? 0.25;

  // Max position (retail safe)
  const maxPositionPct = 15;

  // Compute stop distance
  let stopDistancePct = null;

  // Try to compute from LLM invalidation level
  const entryLevel = llmOutput?.entry?.level;
  const invalidationLevel = llmOutput?.invalidation?.level;

  if (entryLevel && entryLevel > 0 && invalidationLevel && invalidationLevel > 0) {
    stopDistancePct = Math.abs((invalidationLevel - entryLevel) / entryLevel) * 100;
  }

  // Fallback to ATR%
  if (!stopDistancePct && marketStats?.atrPct) {
    stopDistancePct = marketStats.atrPct * 1.0; // 1x ATR as stop
    notes.push('Stop mesafesi ATR bazlı');
  }

  // Default fallback
  if (!stopDistancePct) {
    stopDistancePct = 3.0; // Conservative default
    notes.push('Stop mesafesi varsayılan (fiyat seviyesi yok)');
  }

  // Compute suggested position size
  // suggestedPositionPct = clamp( (riskPerTradePct / stopDistancePct) * 10 , 1, maxPositionPct )
  let suggestedPositionPct;

  if (signal === 'AVOID' || signal === 'WAIT') {
    suggestedPositionPct = 0;
  } else if (stopDistancePct > 0) {
    suggestedPositionPct = clamp((riskPerTradePct / stopDistancePct) * 10, 1, maxPositionPct);
  } else {
    suggestedPositionPct = 3; // Default conservative size
    notes.push('Pozisyon büyüklüğü varsayılan');
  }

  return {
    riskPerTradePct: Math.round(riskPerTradePct * 100) / 100,
    suggestedPositionPct: Math.round(suggestedPositionPct * 10) / 10,
    stopDistancePct: Math.round(stopDistancePct * 10) / 10,
    caps: { maxPositionPct },
    notes
  };
}

/**
 * Main function to build full confidence breakdown
 * @param {object} params - { event, echoContext, llmOutput, marketStats }
 * @returns {object} Full confidence object with components, overall, grade, notes, sizing, signal
 */
export function buildConfidenceBreakdown(params) {
  const { event, echoContext, llmOutput, marketStats } = params;

  // Compute all component scores
  const echoResult = computeEchoEdge(echoContext);
  const clarityResult = computeEventClarity(llmOutput);
  const regimeResult = computeRegimeVol(marketStats);
  const gapResult = computeGapRisk(marketStats);
  const freshnessResult = computeFreshness(event);

  const components = {
    echoEdge: echoResult.score,
    eventClarity: clarityResult.score,
    regimeVol: regimeResult.score,
    gapRisk: gapResult.score,
    freshness: freshnessResult.score
  };

  // Collect all notes
  const notes = [
    ...echoResult.notes,
    ...clarityResult.notes,
    ...regimeResult.notes,
    ...gapResult.notes,
    ...freshnessResult.notes
  ];

  // Compute overall and grade
  const { overall, grade } = computeOverallConfidence(components, echoResult.echoUsed);

  // Evaluate signal rules (AVOID/WAIT)
  const signalRules = evaluateSignalRules({
    components,
    overall,
    echoContext,
    llmOutput,
    marketStats
  });

  // Determine final signal
  let finalSignal = signalRules.signal;
  if (!finalSignal) {
    // Use LLM direction
    const direction = llmOutput?.direction;
    if (direction === 'LONG') {
      finalSignal = 'BUY';
    } else if (direction === 'SHORT') {
      finalSignal = 'SELL';
    } else {
      finalSignal = 'AVOID';
      signalRules.explain.push('LLM NONE yönü döndürdü');
      signalRules.avoidCode = 'AVOID_NO_DIRECTION';
    }
  }

  // Compute sizing hint
  const sizingHint = computeSizingHint({
    overall,
    grade,
    llmOutput,
    marketStats,
    signal: finalSignal
  });

  // Add sizing notes to main notes
  if (sizingHint.notes.length > 0) {
    notes.push(...sizingHint.notes);
  }

  return {
    signal: finalSignal,
    confidence: {
      overall,
      grade,
      components,
      notes
    },
    sizingHint: {
      riskPerTradePct: sizingHint.riskPerTradePct,
      suggestedPositionPct: sizingHint.suggestedPositionPct,
      stopDistancePct: sizingHint.stopDistancePct,
      caps: sizingHint.caps
    },
    explain: signalRules.explain,
    meta: {
      modelVersion: CONFIDENCE_MODEL_VERSION,
      echoUsed: echoResult.echoUsed,
      marketStatsUsed: regimeResult.marketStatsUsed,
      avoidCode: signalRules.avoidCode
    }
  };
}
