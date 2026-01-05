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
import {
  HELPER_STRINGS,
  EXPLANATION_BLOCK_ITEMS,
  getBeginnerModeState,
  setBeginnerModeState
} from '../utils/beginnerModeHelpers'

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

// Helper to format ISO timestamp for display
function formatTimestamp(isoString) {
  if (!isoString) return 'N/A'
  const date = new Date(isoString)
  return date.toLocaleTimeString('en-US', { hour12: false })
}

function MajorEventsPanel() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false) // Separate state for refresh loading
  const [forceRefreshing, setForceRefreshing] = useState(false) // Force refresh state
  const [lastUpdated, setLastUpdated] = useState(null) // Track last successful fetch
  const [error, setError] = useState(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const [injecting, setInjecting] = useState(false)
  const [testingBanner, setTestingBanner] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  // Admin Raw Feed state
  const [rawFeedData, setRawFeedData] = useState(null)
  const [rawFeedLoading, setRawFeedLoading] = useState(false)
  const [rawFeedExpanded, setRawFeedExpanded] = useState(false)
  const [rawFeedSearch, setRawFeedSearch] = useState('')
  const [healthData, setHealthData] = useState(null)
  // Freshness timestamps
  const [meta, setMeta] = useState({ generatedAt: null, fetchedAt: null })
  // Trade signal state
  const [signals, setSignals] = useState({}) // eventId -> signal
  const [loadingSignals, setLoadingSignals] = useState(new Set()) // eventIds currently loading
  const [expandedSignals, setExpandedSignals] = useState(new Set()) // eventIds with visible signals
  // Beginner mode state
  const [beginnerMode, setBeginnerMode] = useState(false)
  const [explanationExpanded, setExplanationExpanded] = useState(false) // For collapsible "Ne demek?" block

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
  const fetchEvents = async (isRefresh = false, force = false) => {
    try {
      setError(null)
      if (force) {
        setForceRefreshing(true)
      } else if (isRefresh) {
        setRefreshing(true)
      }
      const url = force ? '/api/major-events?limit=10&force=1' : '/api/major-events?limit=10'
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`)
      }
      const data = await response.json()

      // Inject fetchedAt timestamp (browser time)
      const fetchedAt = new Date().toISOString()
      setMeta({
        generatedAt: data.meta?.generatedAt || null,
        fetchedAt
      })

      setEvents(data.events || [])
      setLastUpdated(new Date()) // Track successful fetch time
    } catch (err) {
      console.error('Failed to fetch major events:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setForceRefreshing(false)
    }
  }

  // Fetch on mount
  useEffect(() => {
    fetchEvents()
  }, [])

  // Load beginner mode preference from localStorage on mount
  useEffect(() => {
    setBeginnerMode(getBeginnerModeState())
  }, [])

  // Toggle beginner mode handler
  const handleToggleBeginnerMode = () => {
    const newState = !beginnerMode
    setBeginnerMode(newState)
    setBeginnerModeState(newState)
    // Reset explanation expanded when turning off beginner mode
    if (!newState) {
      setExplanationExpanded(false)
    }
  }

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

      // Inject fetchedAt timestamp (browser time) into meta
      signal.meta = signal.meta || {}
      signal.meta.fetchedAt = new Date().toISOString()

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

  // Fetch raw feed data for admin debug panel
  const fetchRawFeed = async () => {
    const secret = prompt('Enter admin secret:')
    if (!secret) return

    setRawFeedLoading(true)
    try {
      const response = await fetch(`/api/admin/raw-news?admin=1&secret=${encodeURIComponent(secret)}&limit=50`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        alert(`Failed to fetch raw feed: ${errorData.error || response.status}`)
        return
      }
      const data = await response.json()
      setRawFeedData(data)
      setHealthData(data.health)
      setRawFeedExpanded(true)
    } catch (err) {
      console.error('Raw feed fetch error:', err)
      alert(`Network error: ${err.message}`)
    } finally {
      setRawFeedLoading(false)
    }
  }

  // Filter raw feed items by search term (client-side)
  const filteredRawItems = useMemo(() => {
    if (!rawFeedData?.items) return []
    if (!rawFeedSearch.trim()) return rawFeedData.items
    const searchLower = rawFeedSearch.toLowerCase()
    return rawFeedData.items.filter(item =>
      item.headline?.toLowerCase().includes(searchLower) ||
      item.source?.toLowerCase().includes(searchLower)
    )
  }, [rawFeedData?.items, rawFeedSearch])

  // Beginner mode helper text component (Pattern A)
  const BeginnerHelper = ({ helperKey, className = '' }) => {
    if (!beginnerMode) return null
    const helper = HELPER_STRINGS[helperKey]
    if (!helper) return null
    return (
      <p className={`text-xs text-gray-500 mt-0.5 leading-snug ${className}`}>
        {helper.helper}
      </p>
    )
  }

  // Info tooltip component (Pattern B) - shows when beginner mode is OFF
  const InfoTooltip = ({ helperKey, className = '' }) => {
    if (beginnerMode) return null // Hide when beginner mode is ON (inline helpers shown instead)
    const [showTooltip, setShowTooltip] = useState(false)
    const helper = HELPER_STRINGS[helperKey]
    if (!helper) return null
    return (
      <span
        className={`relative inline-flex items-center cursor-help ${className}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
      >
        <svg className="w-3 h-3 text-gray-500 hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {showTooltip && (
          <span className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-gray-200 bg-gray-800 border border-gray-600 rounded shadow-lg whitespace-nowrap max-w-xs">
            {helper.helper}
          </span>
        )}
      </span>
    )
  }

  // Collapsible explanation block (Pattern C) - shows when beginner mode is OFF
  const ExplanationBlock = () => {
    if (beginnerMode) return null // Hide when beginner mode is ON (inline helpers shown instead)
    return (
      <div className="mt-3 pt-2 border-t border-gray-700/30">
        <button
          onClick={() => setExplanationExpanded(!explanationExpanded)}
          className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1 transition-colors"
        >
          <span>{explanationExpanded ? '▾' : '▸'}</span>
          <span>Ne demek?</span>
        </button>
        {explanationExpanded && (
          <div className="mt-2 pl-3 space-y-1">
            {EXPLANATION_BLOCK_ITEMS.map((item, idx) => (
              <p key={idx} className="text-xs text-gray-500 leading-snug">
                • {item.text}
              </p>
            ))}
          </div>
        )}
      </div>
    )
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
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded border font-bold ${signalColors[signalType] || signalColors.AVOID}`}>
                {signalType}
              </span>
              <InfoTooltip helperKey={`signal${signalType.charAt(0) + signalType.slice(1).toLowerCase()}`} />
              <span className={`text-sm font-bold ${gradeColors[grade]}`}>
                {grade}
              </span>
              <InfoTooltip helperKey="confidenceGrade" />
              <span className="text-xs text-gray-400">
                {overall}%
              </span>
              <InfoTooltip helperKey="confidence" />
              <span className="text-xs text-gray-500">
                {horizonLabels[timeHorizon] || timeHorizon}
              </span>
              <InfoTooltip helperKey="timeHorizon" />
            </div>
            {signal.cached && (
              <span className="text-xs text-gray-600">(cached)</span>
            )}
          </div>
          {/* Beginner mode helpers for signal and confidence */}
          <BeginnerHelper helperKey={`signal${signalType.charAt(0) + signalType.slice(1).toLowerCase()}`} />
          <BeginnerHelper helperKey="confidence" />
        </div>

        {/* Echo Context Section */}
        {renderEchoContext(signal.echoContext)}

        {/* Thesis */}
        <div className="mb-2">
          <div className="flex items-start gap-1">
            <p className="text-xs text-white font-medium flex-1">{thesis}</p>
            <InfoTooltip helperKey="thesis" />
          </div>
          <BeginnerHelper helperKey="thesis" />
        </div>

        {/* Confidence Breakdown */}
        {Object.keys(components).length > 0 && (
          <div className="mb-3 p-2 bg-gray-800/50 rounded border border-gray-700/50">
            <div className="flex items-center gap-1 mb-1.5">
              <p className="text-xs text-gray-500 font-medium">Confidence Breakdown</p>
              <InfoTooltip helperKey="confidence" className="ml-0.5" />
            </div>
            <div className="space-y-1">
              {components.echoEdge !== undefined && (
                <div>
                  <div className="flex items-center gap-1">
                    {renderComponentBar('Echo Edge', components.echoEdge)}
                    <InfoTooltip helperKey="echoEdge" />
                  </div>
                  <BeginnerHelper helperKey="echoEdge" className="ml-20 pl-2" />
                </div>
              )}
              {components.eventClarity !== undefined && (
                <div>
                  <div className="flex items-center gap-1">
                    {renderComponentBar('Clarity', components.eventClarity)}
                    <InfoTooltip helperKey="eventClarity" />
                  </div>
                  <BeginnerHelper helperKey="eventClarity" className="ml-20 pl-2" />
                </div>
              )}
              {components.regimeVol !== undefined && (
                <div>
                  <div className="flex items-center gap-1">
                    {renderComponentBar('Vol Regime', components.regimeVol)}
                    <InfoTooltip helperKey="regimeVol" />
                  </div>
                  <BeginnerHelper helperKey="regimeVol" className="ml-20 pl-2" />
                </div>
              )}
              {components.gapRisk !== undefined && (
                <div>
                  <div className="flex items-center gap-1">
                    {renderComponentBar('Gap Risk', components.gapRisk)}
                    <InfoTooltip helperKey="gapRisk" />
                  </div>
                  <BeginnerHelper helperKey="gapRisk" className="ml-20 pl-2" />
                </div>
              )}
              {components.freshness !== undefined && (
                <div>
                  <div className="flex items-center gap-1">
                    {renderComponentBar('Freshness', components.freshness)}
                    <InfoTooltip helperKey="freshness" />
                  </div>
                  <BeginnerHelper helperKey="freshness" className="ml-20 pl-2" />
                </div>
              )}
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
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-blue-300 font-medium">Position Sizing</p>
              <InfoTooltip helperKey="sizing" />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
              <span className="text-gray-400 flex items-center gap-0.5">
                Risk: <span className="text-blue-300">{sizingHint.riskPerTradePct}%</span>
                <InfoTooltip helperKey="riskPerTrade" />
              </span>
              <span className="text-gray-400 flex items-center gap-0.5">
                Size: <span className="text-blue-300">{sizingHint.suggestedPositionPct}%</span>
                <InfoTooltip helperKey="suggestedPosition" />
              </span>
              <span className="text-gray-400 flex items-center gap-0.5">
                Stop: <span className="text-blue-300">{sizingHint.stopDistancePct}%</span>
                <InfoTooltip helperKey="stopDistance" />
              </span>
              {sizingHint.caps?.maxPositionPct && (
                <span className="text-gray-500">
                  (max {sizingHint.caps.maxPositionPct}%)
                </span>
              )}
            </div>
            <BeginnerHelper helperKey="sizing" />
          </div>
        )}

        {/* AVOID/WAIT Reasons */}
        {isAvoidOrWait && explain.length > 0 && (
          <div className="mb-2 p-2 bg-yellow-900/20 rounded border border-yellow-500/30">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-yellow-300 font-medium">
                {signalType === 'WAIT' ? 'Bekleme Koşulları' : 'Kaçınma Nedenleri'}
              </p>
              <InfoTooltip helperKey={signalType === 'WAIT' ? 'signalWait' : 'signalAvoid'} />
            </div>
            <ul className="space-y-0.5">
              {explain.map((reason, idx) => (
                <li key={idx} className="text-xs text-gray-400 flex gap-1">
                  <span className="text-yellow-400">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
            <BeginnerHelper helperKey={signalType === 'WAIT' ? 'signalWait' : 'signalAvoid'} />
          </div>
        )}

        {/* Entry/Invalidation for BUY/SELL */}
        {!isAvoidOrWait && signal.setup && (
          <div className="mb-2">
            <div className="text-xs flex flex-wrap gap-x-3 gap-y-1">
              {signal.setup.entry?.level > 0 && (
                <span className="text-gray-400 flex items-center gap-0.5">
                  Entry: <span className="text-white">{signal.setup.entry.type} @ ${signal.setup.entry.level.toFixed(2)}</span>
                  <InfoTooltip helperKey="entry" />
                </span>
              )}
              {signal.setup.invalidation?.level > 0 && (
                <span className="text-gray-400 flex items-center gap-0.5">
                  Stop: <span className="text-red-400">${signal.setup.invalidation.level.toFixed(2)}</span>
                  {signal.setup.invalidation.reason && (
                    <span className="text-gray-500 ml-1">({signal.setup.invalidation.reason})</span>
                  )}
                  <InfoTooltip helperKey="invalidation" />
                </span>
              )}
            </div>
            {signal.setup.invalidation?.level > 0 && <BeginnerHelper helperKey="invalidation" />}
          </div>
        )}

        {/* Targets */}
        {targets.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs text-gray-500 font-medium">Hedef Enstrümanlar:</span>
              <InfoTooltip helperKey="targets" />
            </div>
            <div className="flex flex-wrap gap-1">
              {targets.map((ticker, idx) => (
                <span key={idx} className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                  {ticker}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Key Risks */}
        {keyRisks.length > 0 && (
          <div className="text-xs">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-gray-500 font-medium">Temel Riskler:</p>
              <InfoTooltip helperKey="keyRisks" />
            </div>
            <ul className="space-y-0.5">
              {keyRisks.slice(0, 3).map((item, idx) => (
                <li key={idx} className="text-gray-400 flex gap-1">
                  <span className="text-red-400">!</span>
                  <span className="line-clamp-2">{item}</span>
                </li>
              ))}
            </ul>
            <BeginnerHelper helperKey="keyRisks" />
          </div>
        )}

        {/* Meta info */}
        {signal.meta && (
          <div className="mt-2 pt-1.5 border-t border-gray-700/30 text-xs text-gray-600">
            <div className="flex gap-3 mb-1">
              {signal.meta.echoUsed && <span>Echo ✓</span>}
              {signal.meta.marketStatsUsed && <span>Market ✓</span>}
              {signal.meta.modelVersion && <span>v{signal.meta.modelVersion}</span>}
            </div>
            {(signal.meta.generatedAt || signal.meta.fetchedAt) && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-gray-500">
                {signal.meta.generatedAt && (
                  <span>Server: {formatTimestamp(signal.meta.generatedAt)}</span>
                )}
                {signal.meta.fetchedAt && (
                  <span>Fetched: {formatTimestamp(signal.meta.fetchedAt)}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pattern C: Collapsible "Ne demek?" explanation block (when beginner mode is OFF) */}
        <ExplanationBlock />
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
      <div className="flex items-center justify-between p-4 rounded-t-xl">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 flex items-center gap-3 hover:bg-gray-700/30 transition-colors rounded-lg p-1 -m-1"
        >
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
        </button>
        <div className="flex items-center gap-3">
          {/* Beginner Mode Toggle */}
          <button
            onClick={handleToggleBeginnerMode}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
              beginnerMode
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                : 'bg-gray-700/50 text-gray-400 border border-gray-600/50 hover:bg-gray-700 hover:text-gray-300'
            }`}
            title={beginnerMode ? 'Beginner Mode: ON' : 'Beginner Mode: OFF'}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="hidden sm:inline">Beginner</span>
            <span className={`w-1.5 h-1.5 rounded-full ${beginnerMode ? 'bg-blue-400' : 'bg-gray-500'}`} />
          </button>
          {/* Expand/Collapse chevron */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-700/30 rounded transition-colors"
          >
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-4 pb-4">
          {/* Admin Controls */}
          {isAdmin && (
            <div className="mb-4 pb-4 border-b border-gray-700">
              {/* Health Banner */}
              {healthData && healthData.status !== 'ok' && (
                <div className={`mb-3 p-3 rounded-lg border ${
                  healthData.status === 'error'
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-yellow-500/10 border-yellow-500/30'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${
                      healthData.status === 'error' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      {healthData.status === 'error' ? '⚠️ Ingest Error' : '⚡ Ingest Warning'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {healthData.ts ? formatRelativeTime(healthData.ts) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{healthData.message}</p>
                  {healthData.finnhubStatus && (
                    <p className="text-xs text-gray-500 mt-1">
                      Finnhub: {healthData.finnhubStatus.count || 0} items, status {healthData.finnhubStatus.status || 'N/A'}
                      {healthData.finnhubStatus.error && ` (${healthData.finnhubStatus.error})`}
                    </p>
                  )}
                  {healthData.newsapiStatus && (
                    <p className="text-xs text-gray-500">
                      NewsAPI: {healthData.newsapiStatus.count || 0} items, status {healthData.newsapiStatus.status || 'N/A'}
                      {healthData.newsapiStatus.error && ` (${healthData.newsapiStatus.error})`}
                    </p>
                  )}
                </div>
              )}

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
                <button
                  onClick={fetchRawFeed}
                  disabled={rawFeedLoading}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    rawFeedLoading
                      ? 'bg-purple-600/50 text-purple-300 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-500 text-white'
                  }`}
                >
                  {rawFeedLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                      </svg>
                      Raw Feed Debug
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Admin mode: Inject similar events to test grouping & cooldown. "Test Alert Banner" clears all state and shows banner.
              </p>

              {/* Raw Feed Debug Panel */}
              {rawFeedExpanded && rawFeedData && (
                <div className="mt-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-purple-300">Raw Feed Debug</h4>
                      <span className="text-xs text-gray-500">
                        {rawFeedData.ts ? formatRelativeTime(rawFeedData.ts) : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => setRawFeedExpanded(false)}
                      className="text-gray-500 hover:text-gray-400"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Summary stats */}
                  <div className="flex flex-wrap gap-3 mb-3 text-xs">
                    <span className="text-gray-400">
                      Source: <span className="text-white">{rawFeedData.source || 'N/A'}</span>
                    </span>
                    <span className="text-gray-400">
                      Fetched: <span className="text-white">{rawFeedData.fetchedCount || 0}</span>
                    </span>
                    <span className="text-gray-400">
                      Showing: <span className="text-white">{filteredRawItems.length}</span>
                    </span>
                    {rawFeedData.fallbackUsed && (
                      <span className="text-yellow-400">Fallback used</span>
                    )}
                  </div>

                  {/* Search box */}
                  <div className="mb-3">
                    <input
                      type="text"
                      placeholder="Search headlines..."
                      value={rawFeedSearch}
                      onChange={(e) => setRawFeedSearch(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* Items list */}
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {filteredRawItems.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-4">No items found</p>
                    ) : (
                      filteredRawItems.map((item, idx) => (
                        <div key={idx} className="p-2 bg-gray-800/50 rounded border border-gray-700/50">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-white leading-snug flex-1">{item.headline}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              item.provider === 'finnhub'
                                ? 'bg-blue-500/20 text-blue-400'
                                : item.provider === 'newsapi'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}>
                              {item.provider || 'unknown'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">{item.source}</span>
                            <span className="text-xs text-gray-600">•</span>
                            <span className="text-xs text-gray-500">
                              {item.timestamp ? formatRelativeTime(item.timestamp) : 'N/A'}
                            </span>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-purple-400 hover:text-purple-300"
                              >
                                Link
                              </a>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
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

          {/* Freshness Timestamps */}
          {!loading && (meta.generatedAt || meta.fetchedAt) && (
            <div className="mt-4 pt-3 border-t border-gray-700/50">
              <div className="text-xs text-gray-500 space-y-0.5">
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                  <span>
                    Updated (server): <span className="text-gray-400">{formatTimestamp(meta.generatedAt)}</span>
                  </span>
                  <span>
                    Fetched (browser): <span className="text-gray-400">{formatTimestamp(meta.fetchedAt)}</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Refresh Buttons */}
          {!loading && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => fetchEvents(true, false)}
                  disabled={refreshing || forceRefreshing}
                  className={`flex-1 py-2 text-sm transition-colors flex items-center justify-center gap-2 rounded-lg border border-gray-600/50 ${
                    refreshing || forceRefreshing
                      ? 'text-gray-500 cursor-not-allowed bg-gray-700/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                  }`}
                >
                  <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  onClick={() => fetchEvents(false, true)}
                  disabled={refreshing || forceRefreshing}
                  className={`flex-1 py-2 text-sm transition-colors flex items-center justify-center gap-2 rounded-lg border ${
                    forceRefreshing
                      ? 'text-orange-300 cursor-not-allowed bg-orange-600/30 border-orange-500/50'
                      : refreshing
                      ? 'text-gray-500 cursor-not-allowed bg-gray-700/30 border-gray-600/50'
                      : 'text-orange-400 hover:text-orange-300 hover:bg-orange-600/20 border-orange-500/50'
                  }`}
                >
                  <svg className={`w-4 h-4 ${forceRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {forceRefreshing ? 'Force refreshing...' : 'Force Refresh'}
                </button>
              </div>
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
