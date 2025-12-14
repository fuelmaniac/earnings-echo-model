import React, { useState, useEffect, useCallback } from 'react'

// LocalStorage key for tracking the last seen major event
const LAST_SEEN_KEY = 'lastSeenMajorEventId'

// Polling interval in milliseconds (60 seconds)
const POLL_INTERVAL = 60000

// Minimum importance score to trigger an alert
const MIN_IMPORTANCE_SCORE = 70

// Helper to get badge color based on importance category
function getImportanceBadgeStyle(category) {
  switch (category) {
    case 'macro_shock':
      return 'bg-red-500/30 text-red-300 border-red-500/50'
    case 'sector_shock':
      return 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50'
    default:
      return 'bg-orange-500/30 text-orange-300 border-orange-500/50'
  }
}

function MajorEventAlertBanner({ onViewEvent }) {
  const [alertEvent, setAlertEvent] = useState(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  // Get the last seen event ID from localStorage
  const getLastSeenId = useCallback(() => {
    try {
      return localStorage.getItem(LAST_SEEN_KEY) || null
    } catch {
      return null
    }
  }, [])

  // Save the last seen event ID to localStorage
  const setLastSeenId = useCallback((id) => {
    try {
      if (id) {
        localStorage.setItem(LAST_SEEN_KEY, id)
      }
    } catch (err) {
      console.warn('Failed to save lastSeenMajorEventId:', err)
    }
  }, [])

  // Fetch events and check for new alerts
  const checkForNewEvents = useCallback(async () => {
    try {
      const response = await fetch('/api/major-events?limit=10')
      if (!response.ok) return

      const data = await response.json()
      const events = data.events || []

      if (events.length === 0) return

      // Find the newest event by ID (assuming higher ID = newer)
      // Fallback to storedAt if no ID
      const sortedEvents = [...events].sort((a, b) => {
        if (a.id && b.id) return b.id - a.id
        const aTime = new Date(a.storedAt || 0).getTime()
        const bTime = new Date(b.storedAt || 0).getTime()
        return bTime - aTime
      })

      const newestEvent = sortedEvents[0]
      if (!newestEvent) return

      const lastSeenId = getLastSeenId()
      const newestId = String(newestEvent.id || newestEvent.storedAt)

      // Check if this is a new event we haven't seen
      const isNewEvent = !lastSeenId || newestId !== lastSeenId

      // Check importance threshold
      const importance = newestEvent.analysis?.importanceScore || 0
      const meetsThreshold = importance >= MIN_IMPORTANCE_SCORE

      // Check if it's not a manual/injected event (optional noise control)
      const isNotManual = newestEvent.source !== 'manual'

      // Show alert if all conditions are met
      if (isNewEvent && meetsThreshold && isNotManual) {
        setAlertEvent(newestEvent)
        setIsVisible(true)
      }
    } catch (err) {
      console.error('Failed to check for new major events:', err)
    }
  }, [getLastSeenId])

  // Set up polling
  useEffect(() => {
    // Initial check
    checkForNewEvents()

    // Set up interval polling
    const intervalId = setInterval(checkForNewEvents, POLL_INTERVAL)

    return () => clearInterval(intervalId)
  }, [checkForNewEvents])

  // Handle dismiss - hide banner and mark as seen
  const handleDismiss = useCallback(() => {
    if (alertEvent) {
      const eventId = String(alertEvent.id || alertEvent.storedAt)
      setLastSeenId(eventId)
    }
    setIsExiting(true)
    setTimeout(() => {
      setIsVisible(false)
      setIsExiting(false)
      setAlertEvent(null)
    }, 300)
  }, [alertEvent, setLastSeenId])

  // Handle view - scroll to event and mark as seen
  const handleView = useCallback(() => {
    if (alertEvent) {
      const eventId = String(alertEvent.id || alertEvent.storedAt)
      setLastSeenId(eventId)
    }
    setIsExiting(true)
    setTimeout(() => {
      setIsVisible(false)
      setIsExiting(false)
      // Trigger scroll to Major Events panel
      if (onViewEvent) {
        onViewEvent(alertEvent)
      } else {
        // Fallback: scroll to Major Events panel by finding it in DOM
        const panel = document.querySelector('[data-major-events-panel]')
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
      setAlertEvent(null)
    }, 300)
  }, [alertEvent, setLastSeenId, onViewEvent])

  // Don't render if not visible
  if (!isVisible || !alertEvent) return null

  const category = alertEvent.analysis?.importanceCategory || 'sector_shock'
  const score = alertEvent.analysis?.importanceScore || 0

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 transform transition-all duration-300 ${
        isExiting ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'
      }`}
    >
      <div className="bg-gradient-to-r from-orange-600/95 via-red-600/95 to-orange-600/95 backdrop-blur border-b border-orange-500/50 shadow-lg shadow-orange-500/20">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Icon + Content */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Alert Icon */}
              <div className="shrink-0 p-2 bg-white/10 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-white/80 uppercase tracking-wide">
                    New Macro Event Detected
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${getImportanceBadgeStyle(category)}`}>
                    {score}/100 – {category.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm font-medium text-white truncate">
                  {alertEvent.headline}
                </p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleView}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View
              </button>
              <button
                onClick={handleDismiss}
                className="p-1.5 hover:bg-white/20 text-white/80 hover:text-white rounded-lg transition-colors"
                aria-label="Dismiss"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MajorEventAlertBanner
