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

function MajorEventsPanel() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
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
  const fetchEvents = async () => {
    try {
      setError(null)
      const response = await fetch('/api/major-events?limit=10')
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`)
      }
      const data = await response.json()
      setEvents(data.events || [])
    } catch (err) {
      console.error('Failed to fetch major events:', err)
      setError(err.message)
    } finally {
      setLoading(false)
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

  // Toggle signal visibility for an event
  const toggleSignalExpanded = (eventId) => {
    setExpandedSignals(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
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

  // Render trade signal display
  const renderTradeSignal = (signal) => {
    const actionColors = {
      long: 'bg-green-500/20 text-green-400 border-green-500/50',
      short: 'bg-red-500/20 text-red-400 border-red-500/50',
      avoid: 'bg-gray-500/20 text-gray-400 border-gray-500/50'
    }
    const actionLabels = { long: 'LONG', short: 'SHORT', avoid: 'AVOID' }
    const horizonLabels = { very_short: '1-2 days', short: '1-2 weeks', medium: '1-3 months' }

    return (
      <div className="mt-3 pt-3 border-t border-gray-600/50">
        {/* Signal Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded border font-bold ${actionColors[signal.action]}`}>
              {actionLabels[signal.action]}
            </span>
            <span className="text-xs text-gray-400">
              Confidence: <span className={signal.confidence >= 70 ? 'text-green-400' : signal.confidence >= 50 ? 'text-yellow-400' : 'text-gray-400'}>{signal.confidence}%</span>
            </span>
            <span className="text-xs text-gray-500">
              {horizonLabels[signal.horizon]}
            </span>
          </div>
          {signal.cached && (
            <span className="text-xs text-gray-600">(cached)</span>
          )}
        </div>

        {/* One-liner */}
        <p className="text-xs text-white mb-2 font-medium">{signal.oneLiner}</p>

        {/* Targets */}
        <div className="flex flex-wrap gap-1 mb-2">
          {signal.targets.map((ticker, idx) => (
            <span key={idx} className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
              {ticker}
            </span>
          ))}
        </div>

        {/* Rationale and Risks in columns */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Rationale */}
          <div>
            <p className="text-gray-500 mb-1 font-medium">Rationale:</p>
            <ul className="space-y-0.5">
              {signal.rationale.map((item, idx) => (
                <li key={idx} className="text-gray-400 flex gap-1">
                  <span className="text-green-400">+</span>
                  <span className="line-clamp-2">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* Risks */}
          <div>
            <p className="text-gray-500 mb-1 font-medium">Key Risks:</p>
            <ul className="space-y-0.5">
              {signal.keyRisks.map((item, idx) => (
                <li key={idx} className="text-gray-400 flex gap-1">
                  <span className="text-red-400">!</span>
                  <span className="line-clamp-2">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
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
            {/* Signal button or toggle */}
            {!signal ? (
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
            ) : (
              <button
                onClick={() => toggleSignalExpanded(eventId)}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                {isSignalExpanded ? '▾ Hide' : '▸ Show'} Trade Signal
                {signal.cached && <span className="text-gray-600 ml-1">(cached)</span>}
              </button>
            )}

            {/* Signal display */}
            {signal && isSignalExpanded && renderTradeSignal(signal)}
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

          {/* Refresh Button */}
          {!loading && (
            <button
              onClick={fetchEvents}
              className="mt-4 w-full py-2 text-sm text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default MajorEventsPanel
