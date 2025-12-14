/**
 * Major Events Utilities
 * Shared functions for Major Events feature (Phase 2.2)
 */

// ============================================================================
// Environment Configuration
// ============================================================================

// Minimum importance score to trigger banner (default 70 for High tier)
const DEFAULT_ALERT_THRESHOLD = 70
const ENV_THRESHOLD = parseInt(import.meta.env.VITE_MAJOR_ALERT_THRESHOLD, 10)
export const ALERT_THRESHOLD = Number.isNaN(ENV_THRESHOLD) ? DEFAULT_ALERT_THRESHOLD : ENV_THRESHOLD

// Cooldown window in minutes for same-theme alerts (default 60)
const DEFAULT_COOLDOWN_MINUTES = 60
const ENV_COOLDOWN = parseInt(import.meta.env.VITE_MAJOR_ALERT_COOLDOWN_MINUTES, 10)
export const COOLDOWN_MINUTES = Number.isNaN(ENV_COOLDOWN) ? DEFAULT_COOLDOWN_MINUTES : ENV_COOLDOWN
export const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000

// LocalStorage keys
export const LAST_SEEN_KEY = 'lastSeenMajorEventId'
export const THEME_COOLDOWN_KEY = 'majorAlertThemeCooldown'

// ============================================================================
// Priority Tiers
// ============================================================================

/**
 * Priority tier definitions based on importance score
 */
export const PRIORITY_TIERS = {
  CRITICAL: { min: 85, label: 'CRITICAL', color: 'red' },
  HIGH: { min: 70, label: 'HIGH', color: 'orange' },
  MEDIUM: { min: 60, label: 'MEDIUM', color: 'yellow' },
  LOW: { min: 0, label: 'LOW', color: 'gray' }
}

/**
 * Get priority tier from importance score
 * @param {number} score - Importance score (0-100)
 * @returns {{ tier: string, label: string, color: string }}
 */
export function getPriorityTier(score) {
  if (score >= PRIORITY_TIERS.CRITICAL.min) {
    return { tier: 'CRITICAL', ...PRIORITY_TIERS.CRITICAL }
  }
  if (score >= PRIORITY_TIERS.HIGH.min) {
    return { tier: 'HIGH', ...PRIORITY_TIERS.HIGH }
  }
  if (score >= PRIORITY_TIERS.MEDIUM.min) {
    return { tier: 'MEDIUM', ...PRIORITY_TIERS.MEDIUM }
  }
  return { tier: 'LOW', ...PRIORITY_TIERS.LOW }
}

/**
 * Get Tailwind classes for priority tier badge
 * @param {string} color - Tier color (red, orange, yellow, gray)
 * @returns {string} Tailwind class string
 */
export function getTierBadgeStyle(color) {
  switch (color) {
    case 'red':
      return 'bg-red-500/30 text-red-300 border-red-500/50'
    case 'orange':
      return 'bg-orange-500/30 text-orange-300 border-orange-500/50'
    case 'yellow':
      return 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50'
    default:
      return 'bg-gray-500/30 text-gray-400 border-gray-500/50'
  }
}

/**
 * Get Tailwind classes for tier badge in the feed (slightly different styling)
 * @param {string} color - Tier color
 * @returns {string} Tailwind class string
 */
export function getTierBadgeStyleFeed(color) {
  switch (color) {
    case 'red':
      return 'bg-red-500/20 text-red-400 border-red-500/40'
    case 'orange':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/40'
    case 'yellow':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/40'
  }
}

/**
 * Get banner gradient style based on priority tier
 * @param {string} color - Tier color
 * @returns {string} Tailwind gradient classes
 */
export function getBannerGradient(color) {
  switch (color) {
    case 'red':
      return 'from-red-600/95 via-red-700/95 to-red-600/95'
    case 'orange':
      return 'from-orange-600/95 via-orange-700/95 to-orange-600/95'
    case 'yellow':
      return 'from-yellow-600/95 via-yellow-700/95 to-yellow-600/95'
    default:
      return 'from-gray-600/95 via-gray-700/95 to-gray-600/95'
  }
}

// ============================================================================
// Theme Key (for cooldown & grouping)
// ============================================================================

/**
 * Synonym map for normalizing similar words to a common form
 * This ensures "closed", "closure", "shut" all map to the same theme
 */
const SYNONYM_MAP = {
  // Closures/shutdowns
  'closed': 'close',
  'closure': 'close',
  'closes': 'close',
  'closing': 'close',
  'shut': 'close',
  'shutdown': 'close',
  'shutdowns': 'close',
  'shutting': 'close',
  'blocked': 'close',
  'blockade': 'close',
  'blockades': 'close',
  // Oil/crude/petroleum
  'crude': 'oil',
  'petroleum': 'oil',
  'brent': 'oil',
  'wti': 'oil',
  // Shipping/shipments
  'shipments': 'ship',
  'shipping': 'ship',
  'ships': 'ship',
  'shipped': 'ship',
  'tanker': 'ship',
  'tankers': 'ship',
  // Prices/pricing -> just remove, it's noise
  'prices': 'price',
  'pricing': 'price',
  'priced': 'price',
  // Surges/spikes -> normalize to spike
  'surge': 'spike',
  'surges': 'spike',
  'surging': 'spike',
  'spikes': 'spike',
  'spiking': 'spike',
  'soar': 'spike',
  'soars': 'spike',
  'soaring': 'spike',
  'jump': 'spike',
  'jumps': 'spike',
  'jumping': 'spike',
  'rally': 'spike',
  'rallies': 'spike',
  'rallying': 'spike',
  // Drops/falls
  'drops': 'drop',
  'dropping': 'drop',
  'dropped': 'drop',
  'falls': 'drop',
  'falling': 'drop',
  'fell': 'drop',
  'plunge': 'drop',
  'plunges': 'drop',
  'plunging': 'drop',
  'crash': 'drop',
  'crashes': 'drop',
  'crashing': 'drop',
  'tumble': 'drop',
  'tumbles': 'drop',
  'tumbling': 'drop',
  'sink': 'drop',
  'sinks': 'drop',
  'sinking': 'drop',
  // Cuts
  'cuts': 'cut',
  'cutting': 'cut',
  // Raises/hikes
  'raises': 'raise',
  'raised': 'raise',
  'raising': 'raise',
  'hike': 'raise',
  'hikes': 'raise',
  'hiking': 'raise',
  'hiked': 'raise',
  'increase': 'raise',
  'increases': 'raise',
  'increasing': 'raise',
  'increased': 'raise',
  // Announcements
  'announces': 'announce',
  'announced': 'announce',
  'announcing': 'announce',
  'announcement': 'announce',
  'announcements': 'announce',
  // Disruptions
  'disrupts': 'disrupt',
  'disrupted': 'disrupt',
  'disrupting': 'disrupt',
  'disruption': 'disrupt',
  'disruptions': 'disrupt',
  // Federal Reserve variants
  'fed': 'federal',
  'reserve': 'federal',
  'fomc': 'federal',
  // Rate variants
  'rates': 'rate',
  'interest': 'rate',
  // Basis points
  'basis': 'bps',
  'points': 'bps',
  'bps': 'bps'
}

/**
 * Extended stopwords list for headline normalization
 * These words add noise and don't contribute to theme identification
 */
const STOPWORDS = new Set([
  // Articles & pronouns
  'a', 'an', 'the', 'and', 'or', 'but', 'it', 'its', 'he', 'she', 'they',
  'we', 'you', 'i', 'that', 'this', 'these', 'those', 'who', 'which', 'what',
  // Prepositions
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'if',
  'than', 'after', 'before', 'during', 'over', 'under', 'into', 'out', 'up',
  'down', 'about', 'between', 'through', 'against', 'amid', 'among',
  // Verbs (be/have/do)
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'must', 'shall', 'can',
  // News/reporting vocabulary (noise words in headlines)
  'says', 'said', 'say', 'saying', 'reports', 'reported', 'report',
  'reporting', 'reportedly', 'according', 'sources', 'source', 'officials',
  'official', 'confirmed', 'confirms', 'confirm', 'confirmation',
  'citing', 'cited', 'cites', 'claims', 'claimed', 'claim', 'alleges',
  'alleged', 'breaking', 'update', 'updates', 'updated', 'latest', 'new',
  'news', 'just', 'now', 'today', 'yesterday', 'week', 'month', 'year',
  // Generic/filler words
  'all', 'some', 'any', 'more', 'most', 'other', 'such', 'only', 'also',
  'very', 'just', 'even', 'still', 'yet', 'however', 'while', 'when',
  'where', 'why', 'how', 'not', 'no', 'yes', 'so', 'then', 'here', 'there',
  // Common headline words that don't identify theme
  'major', 'big', 'key', 'top', 'first', 'last', 'next', 'early', 'late',
  'global', 'world', 'international', 'national', 'local',
  // Market/price movement words (secondary effects, not core theme)
  'price', 'spike', 'drop', 'market', 'markets', 'trading', 'traders',
  'investors', 'stocks', 'stock', 'shares', 'share', 'gains', 'losses',
  'rally', 'selloff', 'volatility', 'volatile',
  // Impact/consequence words (secondary to core event)
  'ship', 'disrupt', 'impact', 'impacts', 'affected', 'affects', 'affect',
  'concern', 'concerns', 'worried', 'worries', 'fear', 'fears', 'amid',
  'following', 'response', 'reacts', 'reaction', 'reactions'
])

/**
 * Generate a theme key from an event headline
 * Used for BOTH cooldown logic AND grouping similar events
 *
 * Algorithm:
 * 1. Lowercase the headline
 * 2. Remove punctuation and numbers
 * 3. Split into words
 * 4. Apply synonym normalization (closed/closure/shut -> close)
 * 5. Filter out stopwords
 * 6. Keep first ~8 significant tokens (preserves headline structure)
 * 7. Sort alphabetically for deterministic key
 *
 * @param {object} event - Event object with headline
 * @returns {string} Theme key
 */
export function getThemeKey(event) {
  if (!event?.headline) return 'unknown'

  const headline = event.headline.toLowerCase()

  // Remove punctuation and numbers, normalize whitespace
  let cleaned = headline
    .replace(/[.,!?;:'"()\[\]{}<>@#$%^&*+=|\\~/`–—-]/g, ' ')  // Remove punctuation
    .replace(/\d+/g, '')                                        // Remove numbers
    .replace(/\s+/g, ' ')                                       // Collapse whitespace
    .trim()

  // Split into words, apply synonym mapping, filter stopwords
  const words = cleaned.split(' ')
    .map(w => SYNONYM_MAP[w] || w)           // Apply synonym normalization
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 8)                              // Keep first ~8 significant tokens

  // Create deterministic key by sorting alphabetically
  const themeKey = words.sort().join('-')

  // Fallback if empty
  return themeKey || cleaned.slice(0, 30).replace(/\s/g, '-') || 'unknown'
}

// ============================================================================
// Short Banner Text (Impact Shorthand)
// ============================================================================

/**
 * Get direction arrow for sector
 * @param {string} direction - bullish, bearish, neutral, unclear
 * @returns {string} Arrow character
 */
function getDirectionArrow(direction) {
  switch (direction) {
    case 'bullish': return '↑'
    case 'bearish': return '↓'
    default: return '→'
  }
}

/**
 * Shorten sector name by trimming after first delimiter
 * @param {string} name - Full sector name
 * @returns {string} Shortened name
 */
function shortenSectorName(name) {
  if (!name) return ''
  // Trim after first dash, slash, or parenthesis
  const delimiters = [' - ', ' – ', ' / ', ' (']
  for (const d of delimiters) {
    const idx = name.indexOf(d)
    if (idx > 0) {
      return name.substring(0, idx).trim()
    }
  }
  // If still long, truncate
  if (name.length > 20) {
    return name.substring(0, 18) + '…'
  }
  return name
}

/**
 * Generate short banner text (impact shorthand) from event
 * Format: "Energy ↑, Airlines ↓"
 *
 * @param {object} event - Event object with analysis.sectors
 * @returns {string} Short impact text
 */
export function getImpactShorthand(event) {
  const sectors = event?.analysis?.sectors
  if (!sectors || sectors.length === 0) {
    // Fallback: use category
    const category = event?.analysis?.importanceCategory
    if (category === 'macro_shock') return 'Macro Shock'
    if (category === 'sector_shock') return 'Sector Impact'
    return 'Market Alert'
  }

  // Sort by confidence descending and take top 2
  const topSectors = [...sectors]
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 2)

  // Format each sector
  const parts = topSectors.map(s => {
    const name = shortenSectorName(s.name)
    const arrow = getDirectionArrow(s.direction)
    return `${name} ${arrow}`
  })

  return parts.join(', ')
}

// ============================================================================
// Cooldown Management
// ============================================================================

/**
 * Get the cooldown map from localStorage
 * @returns {Object} Map of themeKey -> lastAlertEpochMs
 */
export function getCooldownMap() {
  try {
    const stored = localStorage.getItem(THEME_COOLDOWN_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (err) {
    console.warn('Failed to parse cooldown map:', err)
  }
  return {}
}

/**
 * Save the cooldown map to localStorage
 * @param {Object} map - Map of themeKey -> lastAlertEpochMs
 */
export function saveCooldownMap(map) {
  try {
    // Clean up old entries (older than 24 hours)
    const now = Date.now()
    const cleanedMap = {}
    for (const [key, timestamp] of Object.entries(map)) {
      if (now - timestamp < 24 * 60 * 60 * 1000) {
        cleanedMap[key] = timestamp
      }
    }
    localStorage.setItem(THEME_COOLDOWN_KEY, JSON.stringify(cleanedMap))
  } catch (err) {
    console.warn('Failed to save cooldown map:', err)
  }
}

/**
 * Check if an event's theme is in cooldown
 * @param {object} event - Event object
 * @returns {boolean} True if in cooldown (should NOT show banner)
 */
export function isThemeInCooldown(event) {
  const themeKey = getThemeKey(event)
  const cooldownMap = getCooldownMap()
  const lastAlertTime = cooldownMap[themeKey]

  if (!lastAlertTime) return false

  const now = Date.now()
  return (now - lastAlertTime) < COOLDOWN_MS
}

/**
 * Update the cooldown timestamp for an event's theme
 * @param {object} event - Event object
 */
export function updateThemeCooldown(event) {
  const themeKey = getThemeKey(event)
  const cooldownMap = getCooldownMap()
  cooldownMap[themeKey] = Date.now()
  saveCooldownMap(cooldownMap)
}

/**
 * Clear cooldown for testing (admin use)
 */
export function clearAllCooldowns() {
  try {
    localStorage.removeItem(THEME_COOLDOWN_KEY)
  } catch (err) {
    console.warn('Failed to clear cooldowns:', err)
  }
}

// ============================================================================
// Event Grouping (for feed display)
// ============================================================================

/**
 * Group events by theme key
 * Returns groups sorted by newest event datetime desc
 *
 * @param {Array} events - Array of event objects
 * @returns {Array} Array of { themeKey, events: [], representative: Event }
 */
export function groupEventsByTheme(events) {
  if (!events || events.length === 0) return []

  // Build map of themeKey -> events[]
  const groupMap = new Map()

  for (const event of events) {
    const themeKey = getThemeKey(event)
    if (!groupMap.has(themeKey)) {
      groupMap.set(themeKey, [])
    }
    groupMap.get(themeKey).push(event)
  }

  // Sort events within each group by datetime desc (newest first)
  const groups = []
  for (const [themeKey, groupEvents] of groupMap.entries()) {
    const sorted = [...groupEvents].sort((a, b) => {
      const aTime = new Date(a.storedAt || a.publishedAt || 0).getTime()
      const bTime = new Date(b.storedAt || b.publishedAt || 0).getTime()
      return bTime - aTime
    })

    groups.push({
      themeKey,
      events: sorted,
      representative: sorted[0],  // Newest event is the representative
      relatedCount: sorted.length - 1
    })
  }

  // Sort groups by newest representative datetime desc
  groups.sort((a, b) => {
    const aTime = new Date(a.representative.storedAt || a.representative.publishedAt || 0).getTime()
    const bTime = new Date(b.representative.storedAt || b.representative.publishedAt || 0).getTime()
    return bTime - aTime
  })

  return groups
}

/**
 * Get unique sources from a group of events
 * @param {Array} events - Array of events in a group
 * @returns {Array} Unique source names
 */
export function getGroupSources(events) {
  const sources = new Set()
  for (const e of events) {
    if (e.source) {
      sources.add(e.source)
    }
  }
  return Array.from(sources)
}
