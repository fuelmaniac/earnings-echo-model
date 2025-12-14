import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ALERT_THRESHOLD,
  LAST_SEEN_KEY,
  getPriorityTier,
  getTierBadgeStyle,
  getBannerGradient,
  getThemeKey,
  getImpactShorthand,
  isThemeInCooldown,
  updateThemeCooldown,
  clearAllCooldowns
} from '../utils/majorEventsUtils'

// Polling interval in milliseconds (60 seconds)
const POLL_INTERVAL = 60000

// Custom event name for triggering banner check from other components
export const TRIGGER_BANNER_CHECK_EVENT = 'triggerMajorEventBannerCheck'

function MajorEventAlertBanner({ onViewEvent }) {
  const [alertEvent, setAlertEvent] = useState(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  // Check if admin mode is enabled via URL query param
  const isAdmin = useMemo(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return params.get('admin') === '1'
  }, [])

  // Admin override: lower threshold and allow manual events
  const effectiveThreshold = isAdmin ? 0 : ALERT_THRESHOLD
  const allowManualEvents = isAdmin
  const bypassCooldown = isAdmin  // Admin mode bypasses cooldown

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

      // Check importance threshold (admin mode uses 0, otherwise use configured threshold)
      const importance = newestEvent.analysis?.importanceScore || 0
      const meetsThreshold = importance >= effectiveThreshold

      // Check if it's not a manual/injected event (admin mode allows manual events)
      const isNotManual = allowManualEvents || newestEvent.source !== 'manual'

      // Check cooldown (admin mode bypasses cooldown)
      const inCooldown = !bypassCooldown && isThemeInCooldown(newestEvent)

      // Show alert if all conditions are met
      if (isNewEvent && meetsThreshold && isNotManual && !inCooldown) {
        setAlertEvent(newestEvent)
        setIsVisible(true)
      }
    } catch (err) {
      console.error('Failed to check for new major events:', err)
    }
  }, [getLastSeenId, effectiveThreshold, allowManualEvents, bypassCooldown])

  // Set up polling
  useEffect(() => {
    // Initial check
    checkForNewEvents()

    // Set up interval polling
    const intervalId = setInterval(checkForNewEvents, POLL_INTERVAL)

    return () => clearInterval(intervalId)
  }, [checkForNewEvents])

  // Listen for custom event to trigger banner check (used by "Test Alert Banner" button)
  useEffect(() => {
    const handleTriggerCheck = () => {
      // Clear cooldowns in admin mode for testing
      if (isAdmin) {
        clearAllCooldowns()
      }
      checkForNewEvents()
    }
    window.addEventListener(TRIGGER_BANNER_CHECK_EVENT, handleTriggerCheck)
    return () => window.removeEventListener(TRIGGER_BANNER_CHECK_EVENT, handleTriggerCheck)
  }, [checkForNewEvents, isAdmin])

  // Handle dismiss - hide banner and mark as seen
  const handleDismiss = useCallback(() => {
    if (alertEvent) {
      const eventId = String(alertEvent.id || alertEvent.storedAt)
      setLastSeenId(eventId)
      // Update cooldown for this theme
      updateThemeCooldown(alertEvent)
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
      // Update cooldown for this theme
      updateThemeCooldown(alertEvent)
    }
    setIsExiting(true)
    setTimeout(() => {
      setIsVisible(false)
      setIsExiting(false)
      // Trigger scroll to Major Events panel
      if (onViewEvent) {
        onViewEvent(alertEvent)
      } else {
        // Fallback: scroll to the specific event card by themeKey, or the panel
        const themeKey = getThemeKey(alertEvent)
        const eventCard = document.querySelector(`[data-theme-key="${themeKey}"]`)
        if (eventCard) {
          eventCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
          // Brief highlight effect
          eventCard.classList.add('ring-2', 'ring-orange-500')
          setTimeout(() => {
            eventCard.classList.remove('ring-2', 'ring-orange-500')
          }, 2000)
        } else {
          const panel = document.querySelector('[data-major-events-panel]')
          if (panel) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }
      }
      setAlertEvent(null)
    }, 300)
  }, [alertEvent, setLastSeenId, onViewEvent])

  // Don't render if not visible
  if (!isVisible || !alertEvent) return null

  const score = alertEvent.analysis?.importanceScore || 0
  const { label: tierLabel, color: tierColor } = getPriorityTier(score)
  const impactShorthand = getImpactShorthand(alertEvent)
  const bannerGradient = getBannerGradient(tierColor)

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 transform transition-all duration-300 ${
        isExiting ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'
      }`}
    >
      <div className={`bg-gradient-to-r ${bannerGradient} backdrop-blur border-b border-white/20 shadow-lg`}>
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
                  {/* Main alert line with impact shorthand */}
                  <span className="text-sm font-semibold text-white uppercase tracking-wide">
                    New Macro Event
                  </span>
                  <span className="text-white/60">—</span>
                  <span className="text-sm font-medium text-white">
                    {impactShorthand}
                  </span>
                  {/* Tier badge */}
                  <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${getTierBadgeStyle(tierColor)}`}>
                    {tierLabel}
                  </span>
                </div>
                {/* Full headline in smaller text */}
                <p className="text-xs text-white/70 truncate" title={alertEvent.headline}>
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
