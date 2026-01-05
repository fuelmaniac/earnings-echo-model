import React, { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'

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

// Helper to get direction color
function getDirectionStyle(direction) {
  switch (direction) {
    case 'bullish':
      return 'text-green-400'
    case 'bearish':
      return 'text-red-400'
    case 'neutral':
      return 'text-gray-400'
    case 'unclear':
    default:
      return 'text-gray-500'
  }
}

function NewsIntelPanel() {
  const { t } = useI18n()
  const [headline, setHeadline] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [isExpanded, setIsExpanded] = useState(true)

  // Helper to format impact horizon with translations
  const formatHorizon = (horizon) => {
    const horizonKeys = {
      very_short: 'horizonVeryShort',
      short: 'horizonShort',
      medium: 'horizonMedium',
      long: 'horizonLong'
    }
    return t(horizonKeys[horizon] || horizon)
  }

  const handleAnalyze = async () => {
    // Validate headline
    if (!headline.trim()) {
      setError(t('headlineRequired'))
      return
    }

    // Clear previous state
    setError(null)
    setResult(null)
    setLoading(true)

    try {
      const response = await fetch('/api/news-intel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          headline: headline.trim(),
          body: body.trim() || undefined
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.error || `Request failed with status ${response.status}`)
        return
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError('Network error: Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 mb-6">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-700/30 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
          <div className="text-left">
            <h2 className="text-lg font-semibold text-white">{t('newsIntelligence')}</h2>
            <p className="text-xs text-gray-400">{t('analyzeWithGPT')}</p>
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
          <p className="text-sm text-gray-400 mb-4">
            {t('pasteHeadline')}
          </p>

          {/* Input Form */}
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                {t('headline')} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g., Fed announces emergency rate cut of 50 basis points"
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                {t('body')} <span className="text-gray-500">({t('optional')})</span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Additional context or article summary..."
                rows={3}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm resize-none"
                disabled={loading}
              />
            </div>
          </div>

          {/* Helper Text */}
          <p className="text-xs text-gray-500 mb-4">
            {t('helperText')}
          </p>

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className={`w-full py-3 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
              loading
                ? 'bg-purple-600/50 text-purple-300 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('analyzing')}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {t('analyzeNews')}
              </>
            )}
          </button>

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Results Display */}
          {result && (
            <div className="mt-6 space-y-4">
              {/* Summary Section */}
              <div className="p-4 bg-gray-700/40 rounded-lg border border-gray-600/50">
                <h3 className="text-sm font-semibold text-white mb-2">{t('summary')}</h3>
                <p className="text-sm text-gray-300">{result.summary}</p>

                {/* Meta badges */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {/* Importance Score & Category */}
                  <span className={`text-xs px-2 py-1 rounded border ${getImportanceBadgeStyle(result.importanceCategory)}`}>
                    {t('importance')}: {result.importanceScore}/10 ({result.importanceCategory?.replace('_', ' ')})
                  </span>

                  {/* Impact Horizon */}
                  <span className="text-xs px-2 py-1 rounded border bg-blue-500/20 text-blue-400 border-blue-500/40">
                    {t('horizon')}: {formatHorizon(result.impactHorizon)}
                  </span>
                </div>
              </div>

              {/* Sector Impacts */}
              {result.sectors && result.sectors.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3">{t('sectorImpacts')}</h3>
                  <div className="space-y-3">
                    {result.sectors.map((sector, index) => (
                      <div key={index} className="p-3 bg-gray-700/30 rounded-lg border border-gray-600/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-white text-sm">{sector.name}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${getDirectionStyle(sector.direction)}`}>
                              {sector.direction?.toUpperCase()}
                            </span>
                            <span className="text-xs text-gray-400">
                              {Math.round((sector.confidence || 0) * 100)}% {t('confidence')}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">{sector.rationale}</p>
                        <div className="text-xs">
                          <span className="text-gray-500">{t('exampleTickers')}: </span>
                          <span className="text-gray-300">
                            {sector.exampleTickers && sector.exampleTickers.length > 0
                              ? sector.exampleTickers.join(', ')
                              : t('noTickers')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Notes */}
              {result.riskNotes && result.riskNotes.length > 0 && (
                <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <h3 className="text-sm font-semibold text-yellow-400 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {t('riskNotes')}
                  </h3>
                  <ul className="space-y-1">
                    {result.riskNotes.map((note, index) => (
                      <li key={index} className="text-xs text-yellow-200/80 flex items-start gap-2">
                        <span className="text-yellow-400 mt-0.5">•</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NewsIntelPanel
