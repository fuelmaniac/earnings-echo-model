import React from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { InfoTooltip } from './Tooltip'

function StrengthBadge({ correlation, accuracy }) {
  const { t } = useI18n()

  // Safely compute strength - handle missing/invalid values
  const safeCorrelation = typeof correlation === 'number' && !isNaN(correlation) ? correlation : 0
  const safeAccuracy = typeof accuracy === 'number' && !isNaN(accuracy) ? accuracy : 0

  // strength = (correlation + accuracy/100) / 2
  const strength = (safeCorrelation + safeAccuracy / 100) / 2

  // Determine tier based on strength
  let tier, label, barCount, colorClass
  if (strength >= 0.80) {
    tier = 'veryStrong'
    label = t('veryStrong')
    barCount = 4
    colorClass = 'bg-green-400'
  } else if (strength >= 0.65) {
    tier = 'strong'
    label = t('strong')
    barCount = 3
    colorClass = 'bg-emerald-400'
  } else if (strength >= 0.50) {
    tier = 'moderate'
    label = t('moderate')
    barCount = 2
    colorClass = 'bg-yellow-400'
  } else {
    tier = 'weak'
    label = t('weak')
    barCount = 1
    colorClass = 'bg-gray-400'
  }

  // Border and text colors for the badge
  const tierStyles = {
    veryStrong: 'border-green-400/30 text-green-400',
    strong: 'border-emerald-400/30 text-emerald-400',
    moderate: 'border-yellow-400/30 text-yellow-400',
    weak: 'border-gray-400/30 text-gray-400'
  }

  return (
    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded border ${tierStyles[tier]} bg-gray-800/50`}>
      {/* Signal bars */}
      <div className="flex items-end gap-0.5 h-4">
        {[1, 2, 3, 4].map((barIndex) => {
          const isActive = barIndex <= barCount
          const barHeight = `${barIndex * 25}%`
          return (
            <div
              key={barIndex}
              className={`w-1 rounded-sm transition-all ${
                isActive ? colorClass : 'bg-gray-600'
              }`}
              style={{ height: barHeight }}
            />
          )
        })}
      </div>

      {/* Label */}
      <span className="text-xs font-medium">{label}</span>

      {/* Tooltip */}
      <InfoTooltip content={t('strengthExplain')} />
    </div>
  )
}

export default StrengthBadge
