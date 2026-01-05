import React, { useState } from 'react'

/**
 * Tooltip component that wraps any element and shows a tooltip on hover
 * @param {object} props
 * @param {React.ReactNode} props.children - The element to wrap
 * @param {string} props.content - The tooltip text content
 * @param {string} props.position - Tooltip position: 'top' (default), 'bottom', 'left', 'right'
 * @param {string} props.className - Additional classes for the wrapper
 */
function Tooltip({ children, content, position = 'top', className = '' }) {
  const [isVisible, setIsVisible] = useState(false)

  if (!content) {
    return <>{children}</>
  }

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-px border-t-gray-800',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-px border-b-gray-800',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-px border-l-gray-800',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-px border-r-gray-800'
  }

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <span
          className={`
            absolute z-50 px-2 py-1.5 text-xs text-gray-200
            bg-gray-800 border border-gray-600 rounded-lg shadow-lg
            whitespace-nowrap max-w-xs
            ${positionClasses[position]}
          `}
        >
          {content}
          <span className={`absolute border-8 border-transparent ${arrowClasses[position]}`} />
        </span>
      )}
    </span>
  )
}

/**
 * Info icon with tooltip - useful for explaining technical terms
 */
export function InfoTooltip({ content, className = '' }) {
  const [isVisible, setIsVisible] = useState(false)

  if (!content) return null

  return (
    <span
      className={`relative inline-flex items-center cursor-help ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <svg
        className="w-3.5 h-3.5 text-gray-500 hover:text-gray-400 transition-colors"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {isVisible && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 text-xs text-gray-200 bg-gray-800 border border-gray-600 rounded-lg shadow-lg whitespace-normal max-w-xs">
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-8 border-transparent border-t-gray-800" />
        </span>
      )}
    </span>
  )
}

export default Tooltip
