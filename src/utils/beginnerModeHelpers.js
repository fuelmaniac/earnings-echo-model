/**
 * Beginner Mode Helper Strings (Turkish - tr-TR)
 * Progressive disclosure helpers for Trade Signal components
 */

// LocalStorage key for beginner mode preference
export const BEGINNER_MODE_KEY = 'beginnerMode';

// Default state (OFF for clean pro look)
export const BEGINNER_MODE_DEFAULT = false;

/**
 * Turkish helper strings for beginner mode
 * Each string: max ~90 characters, professional tone
 */
export const HELPER_STRINGS = {
  // Signal Types
  signal: {
    label: 'Sinyal',
    helper: "Sistemin önerisi: al/sat/bekle/kaçın."
  },
  signalBuy: {
    label: 'BUY',
    helper: "Alış sinyali: fırsata uzun pozisyon öneriliyor."
  },
  signalSell: {
    label: 'SELL',
    helper: "Satış sinyali: kısa pozisyon veya çıkış öneriliyor."
  },
  signalWait: {
    label: 'WAIT',
    helper: "Bekle sinyali: koşullar henüz uygun değil, giriş için sabırlı ol."
  },
  signalAvoid: {
    label: 'AVOID',
    helper: "Kaçın sinyali: risk/belirsizlik yüksek, pozisyon alma."
  },

  // Confidence
  confidence: {
    label: 'Güven',
    helper: "Fikrin veri ve koşullara göre sağlamlık puanı."
  },
  confidenceGrade: {
    label: 'Derece',
    helper: "A=en güçlü, B=iyi, C=orta, D=zayıf sinyal kalitesi."
  },

  // Confidence Components
  echoEdge: {
    label: 'Echo Edge',
    helper: "Benzer geçmiş örneklerde tarafın başarı eğilimi."
  },
  eventClarity: {
    label: 'Event Clarity',
    helper: "Haberin yoruma açıklığı; belirsizlik artarsa puan düşer."
  },
  regimeVol: {
    label: 'Regime/Vol',
    helper: "Piyasa oynaklığı; yüksek vol riskleri büyütür."
  },
  gapRisk: {
    label: 'Gap Risk',
    helper: "Hareketin bir kısmı fiyatlandıysa geç giriş riski artar."
  },
  freshness: {
    label: 'Freshness',
    helper: "Haber tazeliği ve çoklu kaynak desteği."
  },

  // Sizing
  sizing: {
    label: 'Pozisyon',
    helper: "Öneri büyüklük; stop mesafesine göre ölçeklenir."
  },
  riskPerTrade: {
    label: 'Risk',
    helper: "Tek işlemde portföy riskinin yüzdesi."
  },
  suggestedPosition: {
    label: 'Büyüklük',
    helper: "Stop mesafesine göre hesaplanan önerilen pozisyon."
  },
  stopDistance: {
    label: 'Stop',
    helper: "Stop-loss mesafesi yüzde olarak."
  },

  // Entry/Invalidation/Targets
  entry: {
    label: 'Giriş',
    helper: "Pozisyona giriş tipi ve fiyat seviyesi."
  },
  invalidation: {
    label: 'Invalidation',
    helper: "Bu seviyede tez bozulur; risk burada kesilir."
  },
  targets: {
    label: 'Hedefler',
    helper: "Kar alma seviyeleri ve gerekçeleri."
  },

  // Thesis
  thesis: {
    label: 'Tez',
    helper: "Trade fikrini özetleyen 1-2 cümlelik açıklama."
  },

  // Key Risks
  keyRisks: {
    label: 'Riskler',
    helper: "İşlemi olumsuz etkileyebilecek ana risk faktörleri."
  },

  // Time Horizon
  timeHorizon: {
    label: 'Zaman',
    helper: "Beklenen tutma süresi: gün içi, swing veya çok günlü."
  }
};

/**
 * Collapsible explanation block content
 * Used for "Ne demek?" expandable section
 */
export const EXPLANATION_BLOCK_ITEMS = [
  { key: 'signal', text: HELPER_STRINGS.signal.helper },
  { key: 'confidence', text: HELPER_STRINGS.confidence.helper },
  { key: 'echoEdge', text: `Echo Edge: ${HELPER_STRINGS.echoEdge.helper}` },
  { key: 'eventClarity', text: `Event Clarity: ${HELPER_STRINGS.eventClarity.helper}` },
  { key: 'regimeVol', text: `Regime/Vol: ${HELPER_STRINGS.regimeVol.helper}` },
  { key: 'gapRisk', text: `Gap Risk: ${HELPER_STRINGS.gapRisk.helper}` },
  { key: 'invalidation', text: `Invalidation: ${HELPER_STRINGS.invalidation.helper}` },
  { key: 'sizing', text: `Sizing: ${HELPER_STRINGS.sizing.helper}` }
];

/**
 * Get helper text for a specific field
 * @param {string} key - Field key from HELPER_STRINGS
 * @returns {string|null} Helper text or null if not found
 */
export function getHelperText(key) {
  return HELPER_STRINGS[key]?.helper || null;
}

/**
 * Get beginner mode state from localStorage
 * @returns {boolean} Whether beginner mode is enabled
 */
export function getBeginnerModeState() {
  try {
    const stored = localStorage.getItem(BEGINNER_MODE_KEY);
    if (stored === null) {
      return BEGINNER_MODE_DEFAULT;
    }
    return stored === 'true';
  } catch (err) {
    console.warn('Failed to read beginner mode state:', err);
    return BEGINNER_MODE_DEFAULT;
  }
}

/**
 * Set beginner mode state in localStorage
 * @param {boolean} enabled - Whether to enable beginner mode
 */
export function setBeginnerModeState(enabled) {
  try {
    localStorage.setItem(BEGINNER_MODE_KEY, String(enabled));
  } catch (err) {
    console.warn('Failed to save beginner mode state:', err);
  }
}
