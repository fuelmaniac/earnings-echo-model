import React, { useState, useEffect, useMemo } from 'react'
import { TRIGGER_BANNER_CHECK_EVENT } from './MajorEventAlertBanner'

// Helper to get badge color based on importance category
function getImportanceBadgeStyle(category) {
  switch (category) {
    case 'macro_shock':
      return 'bg-red-500/20 text-red-400 border-red-500/40'
    case 'sector_shock':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
    case 'noise':
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/40'
  }
}

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

// Default test headline for injection
const DEFAULT_TEST_HEADLINE = "Strait of Hormuz reportedly closed; oil shipments disrupted"
const DEFAULT_TEST_BODY = "Multiple reports indicate a full closure of the Strait of Hormuz due to escalating regional tensions. Oil tankers are being rerouted, and energy markets are reacting to the supply disruption."

function MajorEventsPanel() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const [injecting, setInjecting] = useState(false)
  const [testingBanner, setTestingBanner] = useState(false)

  // Check if admin mode is enabled via URL query param
  const isAdmin = useMemo(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return params.get('admin') === '1'
  }, [])

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

  // Handle inject test event
  const handleInjectTestEvent = async () => {
    // Prompt for secret
    const secret = prompt('Enter admin secret:')
    if (!secret) {
      return // User cancelled
    }

    setInjecting(true)
    try {
      const response = await fetch(`/api/major-events-inject?secret=${encodeURIComponent(secret)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          headline: DEFAULT_TEST_HEADLINE,
          body: DEFAULT_TEST_BODY
        })
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
      } catch (err) {
        console.warn('Failed to clear lastSeenMajorEventId:', err)
      }

      const response = await fetch(`/api/major-events-inject?secret=${encodeURIComponent(secret)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          headline: DEFAULT_TEST_HEADLINE,
          body: DEFAULT_TEST_BODY
        })
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
              {loading ? 'Loading...' : `${events.length} recent events`}
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
          {/* Admin: Inject Test Event & Test Alert Banner Buttons */}
          {isAdmin && (
            <div className="mb-4 pb-4 border-b border-gray-700">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleInjectTestEvent}
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
                      Inject Test Event
                    </>
                  )}
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
                Admin mode: "Inject Test Event" adds an event. "Test Alert Banner" clears seen state, injects an event, and triggers the banner.
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

          {/* Events List */}
          {!loading && events.length > 0 && (
            <div className="space-y-3">
              {events.map((event, index) => (
                <div
                  key={event.id || `event-${index}`}
                  className="p-3 bg-gray-700/40 rounded-lg border border-gray-600/50 hover:border-gray-500/50 transition-colors"
                >
                  {/* Headline */}
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

                  {/* Meta badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Importance Score & Category */}
                    {event.analysis?.importanceCategory && (
                      <span className={`text-xs px-2 py-0.5 rounded border ${getImportanceBadgeStyle(event.analysis.importanceCategory)}`}>
                        {event.analysis.importanceScore}/100 • {event.analysis.importanceCategory?.replace('_', ' ')}
                      </span>
                    )}

                    {/* Source */}
                    {event.source && (
                      <span className="text-xs text-gray-500">
                        via {event.source}
                      </span>
                    )}

                    {/* Top impacted sectors */}
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
                </div>
              ))}
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
