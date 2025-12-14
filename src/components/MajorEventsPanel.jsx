import React, { useState, useEffect, useMemo } from 'react'
import { TRIGGER_BANNER_CHECK_EVENT } from './MajorEventAlertBanner'
import {
  getPriorityTier,
  getTierBadgeStyleFeed,
  getThemeKey,
  groupEventsByTheme,
  getGroupSources,
  clearAllCooldowns
} from '../utils/majorEventsUtils'

// Helper to format relative time
function formatRelativeTime(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// Default test headlines for injection (with variations for testing)
const TEST_HEADLINES = [
  {
    headline: "Strait of Hormuz reportedly closed; oil shipments disrupted",
    body: "Multiple reports indicate a full closure of the Strait of Hormuz due to escalating regional tensions. Oil tankers are being rerouted, and energy markets are reacting to the supply disruption."
  },
  {
    headline: "Strait of Hormuz closure confirmed by officials; crude prices surge",
    body: "Government officials confirm the Strait of Hormuz closure. Brent crude jumps 8% in early trading as supply concerns mount."
  },
  {
    headline: "Federal Reserve announces emergency rate cut of 50 basis points",
    body: "In a surprise move, the Federal Reserve has announced an emergency interest rate cut of 50 basis points, citing global economic uncertainty."
  }
]

// Helper to format time as HH:MM:SS
function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour12: false })
}

function MajorEventsPanel() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false) // Separate state for refresh loading
  const [lastUpdated, setLastUpdated] = useState(null) // Track last successful fetch
  const [error, setError] = useState(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const [injecting, setInjecting] = useState(false)
  const [testingBanner, setTestingBanner] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  // Trade signal state
  const [signals, setSignals] = useState({}) // eventId -> signal
  const [loadingSignals, setLoadingSignals] = useState(new Set()) // eventIds currently loading
  const [expandedSignals, setExpandedSignals] = useState(new Set()) // eventIds with visible signals

  // Check if admin mode is enabled via URL query param
  const isAdmin = useMemo(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return params.get('admin') === '1'
  }, [])

  // Group events by theme
  const eventGroups = useMemo(() => {
    return groupEventsByTheme(events)
  }, [events])

  // Fetch major events
  const fetchEvents = async (isRefresh = false) => {
    try {
      setError(null)
      if (isRefresh) {
        setRefreshing(true)
      }
      const response = await fetch('/api/major-events?limit=10')
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`)
      }
      const data = await response.json()
      setEvents(data.events || [])
      setLastUpdated(new Date()) // Track successful fetch time
    } catch (err) {
      console.error('Failed to fetch major events:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Fetch on mount
  useEffect(() => {
    fetchEvents()
  }, [])

  // Toggle expanded state for a group
  const toggleGroupExpanded = (themeKey) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(themeKey)) {
        next.delete(themeKey)
      } else {
        next.add(themeKey)
      }
      return next
    })
  }

  // Show signal for an event (never hides - only makes visible)
  const showSignal = (eventId) => {
    setExpandedSignals(prev => new Set(prev).add(eventId))
  }

  // Hide signal for an event (only action that can hide)
  const hideSignal = (eventId) => {
    setExpandedSignals(prev => {
      const next = new Set(prev)
      next.delete(eventId)
      return next
    })
  }

  // Generate trade signal for an event
  const handleGenerateSignal = async (eventId) => {
    if (!eventId) {
      alert('Event ID is missing')
      return
    }

    // Add to loading set
    setLoadingSignals(prev => new Set(prev).add(eventId))

    try {
      const response = await fetch('/api/trade-signal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ eventId })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed: ${response.status}`)
      }

      const signal = await response.json()

      // Store signal and expand it
      setSignals(prev => ({ ...prev, [eventId]: signal }))
      setExpandedSignals(prev => new Set(prev).add(eventId))
    } catch (err) {
      console.error('Trade signal error:', err)
      alert(`Failed to generate signal: ${err.message}`)
    } finally {
      // Remove from loading set
      setLoadingSignals(prev => {
        const next = new Set(prev)
        next.delete(eventId)
        return next
      })
    }
  }

  // Handle inject test event (now with variation option)
  const handleInjectTestEvent = async (variationIndex = 0) => {
    // Prompt for secret
    const secret = prompt('Enter admin secret:')
    if (!secret) {
      return // User cancelled
    }

    setInjecting(true)
    try {
      const testData = TEST_HEADLINES[variationIndex % TEST_HEADLINES.length]
      const response = await fetch(`/api/major-events-inject?secret=${encodeURIComponent(secret)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        alert(`Failed to inject: ${errorData.error || response.status}`)
        return
      }

      // Refresh the events list
      await fetchEvents()
    } catch (err) {
      console.error('Inject error:', err)
      alert(`Network error: ${err.message}`)
    } finally {
      setInjecting(false)
    }
  }

  // Handle test alert banner - inject event and trigger banner check
  const handleTestAlertBanner = async () => {
    // Prompt for secret
    const secret = prompt('Enter admin secret:')
    if (!secret) {
      return // User cancelled
    }

    setTestingBanner(true)
    try {
      // Clear localStorage so the banner will show for the new event
      try {
        localStorage.removeItem('lastSeenMajorEventId')
        clearAllCooldowns()  // Also clear cooldowns for testing
      } catch (err) {
        console.warn('Failed to clear localStorage:', err)
      }

      const testData = TEST_HEADLINES[0]
      const response = await fetch(`/api/major-events-inject?secret=${encodeURIComponent(secret)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        alert(`Failed to inject: ${errorData.error || response.status}`)
        return
      }

      // Refresh the events list
      await fetchEvents()

      // Small delay to ensure data is available, then trigger banner check
      setTimeout(() => {
        window.dispatchEvent(new Event(TRIGGER_BANNER_CHECK_EVENT))
      }, 500)
    } catch (err) {
      console.error('Test banner error:', err)
      alert(`Network error: ${err.message}`)
    } finally {
      setTestingBanner(false)
    }
  }

  // Render echo context section
  const renderEchoContext = (echoContext) => {
    if (!echoContext) return null

    const alignmentColors = {
      tailwind: 'bg-green-500/20 text-green-400 border-green-500/50',
      headwind: 'bg-red-500/20 text-red-400 border-red-500/50',
      neutral: 'bg-gray-500/20 text-gray-400 border-gray-500/50'
    }
    const alignmentLabels = {
      tailwind: 'Tailwind',
      headwind: 'Headwind',
      neutral: 'Neutral'
    }

    const { stats } = echoContext

    return (
      <div className="mb-3 p-2 bg-purple-900/20 border border-purple-500/30 rounded-lg">
        {/* Echo Context Header */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-purple-300">Earnings Echo Context</span>
          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${alignmentColors[echoContext.alignment]}`}>
            {alignmentLabels[echoContext.alignment]}
          </span>
        </div>

        {/* Pair info */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs text-gray-400">Pair:</span>
          <span className="text-xs font-medium text-white">
            {echoContext.trigger} <span className="text-purple-400">→</span> {echoContext.echo}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs mb-1.5">
          {stats.accuracy !== undefined && (
            <span className="text-gray-400">
              Accuracy: <span className={stats.accuracy >= 70 ? 'text-green-400' : stats.accuracy >= 50 ? 'text-yellow-400' : 'text-gray-400'}>{stats.accuracy}%</span>
            </span>
          )}
          {stats.correlation !== null && stats.correlation !== undefined && (
            <span className="text-gray-400">
              Corr: <span className={Math.abs(stats.correlation) >= 0.3 ? 'text-blue-400' : 'text-gray-400'}>{stats.correlation.toFixed(2)}</span>
            </span>
          )}
          {stats.avgEchoMove !== null && stats.avgEchoMove !== undefined && (
            <span className="text-gray-400">
              Avg Move: <span className={stats.avgEchoMove >= 0 ? 'text-green-400' : 'text-red-400'}>{stats.avgEchoMove > 0 ? '+' : ''}{stats.avgEchoMove.toFixed(1)}%</span>
            </span>
          )}
          {stats.sampleSize !== undefined && (
            <span className="text-gray-400">
              n={stats.sampleSize}
            </span>
          )}
          {stats.directionAgreement !== undefined && (
            <span className="text-gray-400">
              Dir. Agr: <span className={stats.directionAgreement >= 70 ? 'text-green-400' : 'text-gray-400'}>{stats.directionAgreement}%</span>
            </span>
          )}
          {stats.avgGapDays !== null && stats.avgGapDays !== undefined && (
            <span className="text-gray-400">
              Gap: {stats.avgGapDays}d
            </span>
          )}
        </div>

        {/* Note */}
        <p className="text-xs text-gray-500 italic">{echoContext.note}</p>
      </div>
    )
  }

  // Helper to render confidence component bar
  const renderComponentBar = (label, score) => {
    const getColor = (s) => {
      if (s >= 70) return 'bg-green-500'
      if (s >= 50) return 'bg-yellow-500'
      return 'bg-red-500'
    }
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400 w-20 truncate">{label}</span>
        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${getColor(score)} transition-all`}
            style={{ width: `${Math.min(100, score)}%` }}
          />
        </div>
        <span className={`w-8 text-right ${score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
          {score}
        </span>
      </div>
    )
  }

  // Render trade signal display - Phase 3.3 format
  const renderTradeSignal = (signal) => {
    // Handle error responses
    if (signal.ok === false) {
      return (
        <div className="mt-3 pt-3 border-t border-gray-600/50">
          <div className="p-2 bg-red-500/10 border border-red-500/30 rounded">
            <p className="text-xs text-red-400">{signal.message || signal.error || 'Failed to generate signal'}</p>
          </div>
        </div>
      )
    }

    // New signal type colors
    const signalColors = {
      BUY: 'bg-green-500/20 text-green-400 border-green-500/50',
      SELL: 'bg-red-500/20 text-red-400 border-red-500/50',
      AVOID: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
      WAIT: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
    }

    // Grade colors
    const gradeColors = {
      A: 'text-green-400',
      B: 'text-blue-400',
      C: 'text-yellow-400',
      D: 'text-red-400'
    }

    const horizonLabels = {
      INTRADAY: 'Intraday',
      SWING: '1-5 days',
      MULTI_DAY: '1-3 weeks',
      // Legacy
      very_short: '1-2 days',
      short: '1-2 weeks',
      medium: '1-3 months'
    }

    // Support both new and legacy formats
    const signalType = signal.signal || (signal.action?.toUpperCase() === 'LONG' ? 'BUY' : signal.action?.toUpperCase() === 'SHORT' ? 'SELL' : 'AVOID')
    const confidence = signal.confidence || {}
    const overall = confidence.overall ?? signal.confidence ?? 0
    const grade = confidence.grade || (overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : 'D')
    const components = confidence.components || {}
    const thesis = signal.setup?.thesis || signal.oneLiner || ''
    const timeHorizon = signal.setup?.timeHorizon || signal.horizon || 'SWING'
    const sizingHint = signal.sizingHint || {}
    const explain = signal.explain || []
    const targets = signal.targets || []
    const keyRisks = signal.keyRisks || []

    const isAvoidOrWait = signalType === 'AVOID' || signalType === 'WAIT'

    return (
      <div className="mt-3 pt-3 border-t border-gray-600/50">
        {/* Signal Header with Grade */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded border font-bold ${signalColors[signalType] || signalColors.AVOID}`}>
              {signalType}
            </span>
            <span className={`text-sm font-bold ${gradeColors[grade]}`}>
              {grade}
            </span>
            <span className="text-xs text-gray-400">
              {overall}%
            </span>
            <span className="text-xs text-gray-500">
              {horizonLabels[timeHorizon] || timeHorizon}
            </span>
          </div>
          {signal.cached && (
            <span className="text-xs text-gray-600">(cached)</span>
          )}
        </div>

        {/* Echo Context Section */}
        {renderEchoContext(signal.echoContext)}

        {/* Thesis */}
        <p className="text-xs text-white mb-2 font-medium">{thesis}</p>

        {/* Confidence Breakdown */}
        {Object.keys(components).length > 0 && (
          <div className="mb-3 p-2 bg-gray-800/50 rounded border border-gray-700/50">
            <p className="text-xs text-gray-500 mb-1.5 font-medium">Confidence Breakdown</p>
            <div className="space-y-1">
              {components.echoEdge !== undefined && renderComponentBar('Echo Edge', components.echoEdge)}
              {components.eventClarity !== undefined && renderComponentBar('Clarity', components.eventClarity)}
              {components.regimeVol !== undefined && renderComponentBar('Vol Regime', components.regimeVol)}
              {components.gapRisk !== undefined && renderComponentBar('Gap Risk', components.gapRisk)}
              {components.freshness !== undefined && renderComponentBar('Freshness', components.freshness)}
            </div>
            {/* Notes */}
            {confidence.notes && confidence.notes.length > 0 && (
              <div className="mt-2 pt-1.5 border-t border-gray-700/50">
                {confidence.notes.slice(0, 3).map((note, idx) => (
                  <p key={idx} className="text-xs text-gray-500 italic">• {note}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sizing Hint - only show for BUY/SELL */}
        {!isAvoidOrWait && sizingHint.suggestedPositionPct !== undefined && (
          <div className="mb-2 p-2 bg-blue-900/20 rounded border border-blue-500/30">
            <p className="text-xs text-blue-300 mb-1 font-medium">Position Sizing</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
              <span className="text-gray-400">
                Risk: <span className="text-blue-300">{sizingHint.riskPerTradePct}%</span>
              </span>
              <span className="text-gray-400">
                Size: <span className="text-blue-300">{sizingHint.suggestedPositionPct}%</span>
              </span>
              <span className="text-gray-400">
                Stop: <span className="text-blue-300">{sizingHint.stopDistancePct}%</span>
              </span>
              {sizingHint.caps?.maxPositionPct && (
                <span className="text-gray-500">
                  (max {sizingHint.caps.maxPositionPct}%)
                </span>
              )}
            </div>
          </div>
        )}

        {/* AVOID/WAIT Reasons */}
        {isAvoidOrWait && explain.length > 0 && (
          <div className="mb-2 p-2 bg-yellow-900/20 rounded border border-yellow-500/30">
            <p className="text-xs text-yellow-300 mb-1 font-medium">
              {signalType === 'WAIT' ? 'Wait Conditions' : 'Avoid Reasons'}
            </p>
            <ul className="space-y-0.5">
              {explain.map((reason, idx) => (
                <li key={idx} className="text-xs text-gray-400 flex gap-1">
                  <span className="text-yellow-400">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Entry/Invalidation for BUY/SELL */}
        {!isAvoidOrWait && signal.setup && (
          <div className="mb-2 text-xs">
            {signal.setup.entry?.level > 0 && (
              <span className="text-gray-400 mr-3">
                Entry: <span className="text-white">{signal.setup.entry.type} @ ${signal.setup.entry.level.toFixed(2)}</span>
              </span>
            )}
            {signal.setup.invalidation?.level > 0 && (
              <span className="text-gray-400">
                Stop: <span className="text-red-400">${signal.setup.invalidation.level.toFixed(2)}</span>
                {signal.setup.invalidation.reason && (
                  <span className="text-gray-500 ml-1">({signal.setup.invalidation.reason})</span>
                )}
              </span>
            )}
          </div>
        )}

        {/* Targets */}
        {targets.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {targets.map((ticker, idx) => (
              <span key={idx} className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                {ticker}
              </span>
            ))}
          </div>
        )}

        {/* Key Risks */}
        {keyRisks.length > 0 && (
          <div className="text-xs">
            <p className="text-gray-500 mb-1 font-medium">Key Risks:</p>
            <ul className="space-y-0.5">
              {keyRisks.slice(0, 3).map((item, idx) => (
                <li key={idx} className="text-gray-400 flex gap-1">
                  <span className="text-red-400">!</span>
                  <span className="line-clamp-2">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Meta info */}
        {signal.meta && (
          <div className="mt-2 pt-1.5 border-t border-gray-700/30 text-xs text-gray-600 flex gap-3">
            {signal.meta.echoUsed && <span>Echo ✓</span>}
            {signal.meta.marketStatsUsed && <span>Market ✓</span>}
            {signal.meta.modelVersion && <span>v{signal.meta.modelVersion}</span>}
          </div>
        )}
      </div>
    )
  }

  // Render a single event card
  const renderEventCard = (event, isRepresentative = true, showRelated = null) => {
    const score = event.analysis?.importanceScore || 0
    const { label: tierLabel, color: tierColor } = getPriorityTier(score)
    const themeKey = getThemeKey(event)
    const eventId = event.id
    const signal = signals[eventId]
    const isSignalLoading = loadingSignals.has(eventId)
    const isSignalExpanded = expandedSignals.has(eventId)

    return (
      <div
        key={event.id || `event-${event.storedAt}`}
        data-theme-key={isRepresentative ? themeKey : undefined}
        className={`p-3 bg-gray-700/40 rounded-lg border border-gray-600/50 hover:border-gray-500/50 transition-all ${
          isRepresentative ? '' : 'ml-4 opacity-80'
        }`}
      >
        {/* Header row with headline and time */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-sm font-medium text-white leading-tight flex-1">
            {event.headline}
          </h3>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {formatRelativeTime(event.storedAt || event.publishedAt)}
          </span>
        </div>

        {/* Summary */}
        {event.analysis?.summary && (
          <p className="text-xs text-gray-400 mb-2 line-clamp-2">
            {event.analysis.summary}
          </p>
        )}

        {/* Meta badges row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Priority Tier Badge */}
          <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${getTierBadgeStyleFeed(tierColor)}`}>
            {tierLabel}
          </span>

          {/* Score */}
          <span className="text-xs text-gray-500">
            {score}/100
          </span>

          {/* Source */}
          {event.source && (
            <span className="text-xs text-gray-500">
              via {event.source}
            </span>
          )}

          {/* Top impacted sectors with arrows */}
          {event.analysis?.sectors?.slice(0, 2).map((sector, sIdx) => (
            <span
              key={sIdx}
              className={`text-xs ${
                sector.direction === 'bullish' ? 'text-green-400' :
                sector.direction === 'bearish' ? 'text-red-400' :
                'text-gray-400'
              }`}
            >
              {sector.name} {sector.direction === 'bullish' ? '↑' : sector.direction === 'bearish' ? '↓' : '→'}
            </span>
          ))}
        </div>

        {/* Trade Signal Section */}
        {isRepresentative && eventId && (
          <div className="mt-2 pt-2 border-t border-gray-600/30">
            {/* Generate button - shown when no signal exists */}
            {!signal && (
              <button
                onClick={() => handleGenerateSignal(eventId)}
                disabled={isSignalLoading}
                className={`text-xs px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1.5 ${
                  isSignalLoading
                    ? 'bg-purple-600/50 text-purple-300 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {isSignalLoading ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    Generate Trade Signal
                  </>
                )}
              </button>
            )}

            {/* Show button - shown when signal exists but is hidden */}
            {signal && !isSignalExpanded && (
              <button
                onClick={() => showSignal(eventId)}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                ▸ Show Trade Signal
                {signal.cached && <span className="text-gray-600 ml-1">(cached)</span>}
              </button>
            )}

            {/* Signal display with hide button */}
            {signal && isSignalExpanded && (
              <>
                <button
                  onClick={() => hideSignal(eventId)}
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  ▾ Hide Trade Signal
                  {signal.cached && <span className="text-gray-600 ml-1">(cached)</span>}
                </button>
                {renderTradeSignal(signal)}
              </>
            )}
          </div>
        )}

        {/* Related updates indicator (for representative cards only) */}
        {showRelated && showRelated.count > 0 && (
          <button
            onClick={() => toggleGroupExpanded(showRelated.themeKey)}
            className="mt-2 pt-2 border-t border-gray-600/50 w-full text-left"
          >
            <div className="flex items-center justify-between text-xs text-gray-500 hover:text-gray-400 transition-colors">
              <span>
                {expandedGroups.has(showRelated.themeKey) ? '▾' : '▸'} {showRelated.count} more related update{showRelated.count > 1 ? 's' : ''}
                {showRelated.sources.length > 1 && (
                  <span className="ml-1 text-gray-600">
                    ({showRelated.sources.join(', ')})
                  </span>
                )}
              </span>
            </div>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 mb-6" data-major-events-panel>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-700/30 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="text-left">
            <h2 className="text-lg font-semibold text-white">Major Events Feed</h2>
            <p className="text-xs text-gray-400">
              {loading ? 'Loading...' : `${eventGroups.length} event group${eventGroups.length !== 1 ? 's' : ''} (${events.length} total)`}
            </p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-4 pb-4">
          {/* Admin Controls */}
          {isAdmin && (
            <div className="mb-4 pb-4 border-b border-gray-700">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleInjectTestEvent(0)}
                  disabled={injecting || testingBanner}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    injecting
                      ? 'bg-orange-600/50 text-orange-300 cursor-not-allowed'
                      : 'bg-orange-600 hover:bg-orange-500 text-white'
                  }`}
                >
                  {injecting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Injecting...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Inject Event #1
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleInjectTestEvent(1)}
                  disabled={injecting || testingBanner}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-700 hover:bg-orange-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Inject Similar #2
                </button>
                <button
                  onClick={() => handleInjectTestEvent(2)}
                  disabled={injecting || testingBanner}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Inject Different Theme
                </button>
                <button
                  onClick={handleTestAlertBanner}
                  disabled={injecting || testingBanner}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    testingBanner
                      ? 'bg-yellow-600/50 text-yellow-300 cursor-not-allowed'
                      : 'bg-yellow-600 hover:bg-yellow-500 text-white'
                  }`}
                >
                  {testingBanner ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Testing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      Test Alert Banner
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Admin mode: Inject similar events to test grouping & cooldown. "Test Alert Banner" clears all state and shows banner.
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <svg className="w-8 h-8 text-gray-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && events.length === 0 && (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              <p className="text-gray-400 text-sm">No major events yet</p>
              <p className="text-gray-500 text-xs mt-1">Events will appear here as they're detected</p>
            </div>
          )}

          {/* Grouped Events List */}
          {!loading && eventGroups.length > 0 && (
            <div className="space-y-3">
              {eventGroups.map((group) => {
                const sources = getGroupSources(group.events)
                const isGroupExpanded = expandedGroups.has(group.themeKey)

                return (
                  <div key={group.themeKey}>
                    {/* Representative event card */}
                    {renderEventCard(
                      group.representative,
                      true,
                      group.relatedCount > 0 ? {
                        count: group.relatedCount,
                        themeKey: group.themeKey,
                        sources: sources.filter(s => s !== group.representative.source)
                      } : null
                    )}

                    {/* Expanded related events */}
                    {isGroupExpanded && group.relatedCount > 0 && (
                      <div className="mt-2 space-y-2">
                        {group.events.slice(1).map((event) => (
                          renderEventCard(event, false)
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Refresh Button and Last Updated */}
          {!loading && (
            <div className="mt-4 flex flex-col items-center gap-1">
              <button
                onClick={() => fetchEvents(true)}
                disabled={refreshing}
                className={`w-full py-2 text-sm transition-colors flex items-center justify-center gap-2 ${
                  refreshing
                    ? 'text-gray-500 cursor-not-allowed'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              {lastUpdated && (
                <span className="text-xs text-gray-500">
                  Last updated: {formatTime(lastUpdated)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MajorEventsPanel
