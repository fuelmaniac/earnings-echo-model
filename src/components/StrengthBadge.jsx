import React, { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'

/**
 * Calculate strength from correlation and accuracy
 * @param {number} correlation - 0 to 1
 * @param {number} accuracy - 0 to 100 (percentage)
 * @returns {number} strength - 0 to 1
 */
function calculateStrength(correlation, accuracy) {
  // Normalize accuracy to 0-1 range and average with correlation
  return (correlation + accuracy / 100) / 2
}

/**
 * Get strength level based on calculated strength
 */
function getStrengthLevel(strength) {
  if (strength >= 0.8) {
    return { bars: 4, color: 'green', labelKey: 'veryStrong' }
  }
  if (strength >= 0.65) {
    return { bars: 3, color: 'blue', labelKey: 'strong' }
  }
  if (strength >= 0.5) {
    return { bars: 2, color: 'yellow', labelKey: 'moderate' }
  }
  return { bars: 1, color: 'red', labelKey: 'weak' }
}

/**
 * Visual strength badge with signal bars
 */
function StrengthBadge({ correlation, accuracy }) {
  const { t } = useI18n()
  const [showTooltip, setShowTooltip] = useState(false)

  const strength = calculateStrength(correlation, accuracy)
  const { bars, color, labelKey } = getStrengthLevel(strength)

  const colorClasses = {
    green: {
      filled: 'bg-green-400',
      empty: 'bg-green-400/20',
      text: 'text-green-400',
      border: 'border-green-400/30',
      bg: 'bg-green-400/10'
    },
    blue: {
      filled: 'bg-blue-400',
      empty: 'bg-blue-400/20',
      text: 'text-blue-400',
      border: 'border-blue-400/30',
      bg: 'bg-blue-400/10'
    },
    yellow: {
      filled: 'bg-yellow-400',
      empty: 'bg-yellow-400/20',
      text: 'text-yellow-400',
      border: 'border-yellow-400/30',
      bg: 'bg-yellow-400/10'
    },
    red: {
      filled: 'bg-red-400',
      empty: 'bg-red-400/20',
      text: 'text-red-400',
      border: 'border-red-400/30',
      bg: 'bg-red-400/10'
    }
  }

  const colors = colorClasses[color]

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${colors.border} ${colors.bg}`}>
        {/* Signal bars */}
        <div className="flex items-end gap-0.5 h-3">
          {[1, 2, 3, 4].map((barIndex) => (
            <div
              key={barIndex}
              className={`w-1 rounded-sm transition-all ${
                barIndex <= bars ? colors.filled : colors.empty
              }`}
              style={{ height: `${barIndex * 3}px` }}
            />
          ))}
        </div>

        {/* Label */}
        <span className={`text-xs font-medium ${colors.text}`}>
          {t(labelKey)}
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-gray-200 bg-gray-800 border border-gray-600 rounded-lg shadow-lg whitespace-nowrap">
          <div className="font-medium mb-1">{t(labelKey)}</div>
          <div className="text-gray-400">{t('strengthExplain')}</div>
          <div className="text-gray-500 mt-1">
            {t('correlation')}: {correlation.toFixed(2)} | {t('accuracy')}: {accuracy}%
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-8 border-transparent border-t-gray-800" />
          </div>
        </div>
      )}
    </div>
  )
}

export default StrengthBadge
