import React, { useState, useRef, useEffect } from 'react'

function Tooltip({ children, content, className = '' }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const tooltipRef = useRef(null)
  const triggerRef = useRef(null)

  // Detect mobile/touch device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0)
    }
    checkMobile()
  }, [])

  // Close tooltip when clicking outside (for mobile)
  useEffect(() => {
    if (!isVisible || !isMobile) return

    const handleClickOutside = (e) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setIsVisible(false)
      }
    }

    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('click', handleClickOutside)

    return () => {
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isVisible, isMobile])

  const handleMouseEnter = () => {
    if (!isMobile) setIsVisible(true)
  }

  const handleMouseLeave = () => {
    if (!isMobile) setIsVisible(false)
  }

  const handleFocus = () => {
    setIsVisible(true)
  }

  const handleBlur = () => {
    if (!isMobile) setIsVisible(false)
  }

  const handleClick = (e) => {
    if (isMobile) {
      e.preventDefault()
      e.stopPropagation()
      setIsVisible(!isVisible)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsVisible(false)
    }
  }

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-describedby={isVisible ? 'tooltip' : undefined}
    >
      {children}
      {/* Info icon for indication */}
      <svg
        className="w-3 h-3 ml-1 text-gray-500 hover:text-gray-400 transition-colors cursor-help"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>

      {/* Tooltip content */}
      {isVisible && content && (
        <span
          ref={tooltipRef}
          id="tooltip"
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-gray-200 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-xs whitespace-normal text-center"
        >
          {content}
          {/* Arrow */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  )
}

// Standalone info icon tooltip (for use next to labels)
export function InfoTooltip({ content, className = '' }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const tooltipRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  useEffect(() => {
    if (!isVisible || !isMobile) return

    const handleClickOutside = (e) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setIsVisible(false)
      }
    }

    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('click', handleClickOutside)

    return () => {
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isVisible, isMobile])

  const handleInteraction = (e) => {
    if (isMobile) {
      e.preventDefault()
      e.stopPropagation()
    }
    setIsVisible(!isVisible)
  }

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex items-center cursor-help ${className}`}
      onMouseEnter={() => !isMobile && setIsVisible(true)}
      onMouseLeave={() => !isMobile && setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => !isMobile && setIsVisible(false)}
      onClick={handleInteraction}
      onKeyDown={(e) => e.key === 'Escape' && setIsVisible(false)}
      tabIndex={0}
      role="button"
      aria-describedby={isVisible ? 'info-tooltip' : undefined}
    >
      <svg
        className="w-3.5 h-3.5 text-gray-500 hover:text-gray-400 transition-colors"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>

      {isVisible && content && (
        <span
          ref={tooltipRef}
          id="info-tooltip"
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-gray-200 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-xs whitespace-normal text-center"
        >
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  )
}

export default Tooltip
