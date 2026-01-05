import React, { useState, useMemo } from 'react'
import { useStockQuote } from './hooks/useStockQuote'
import { useEarningsInfo } from './hooks/useEarningsInfo'
import { useI18n } from './i18n/I18nProvider'
import NewsIntelPanel from './components/NewsIntelPanel'
import MajorEventsPanel from './components/MajorEventsPanel'
import MajorEventAlertBanner from './components/MajorEventAlertBanner'
import NewsDebugConsole from './components/NewsDebugConsole'
import RawFeedPanel from './components/RawFeedPanel'
import TabNavigation, { useTabState } from './components/TabNavigation'
import LanguageToggle from './components/LanguageToggle'
import StrengthBadge from './components/StrengthBadge'
import { InfoTooltip } from './components/Tooltip'
import PATTERN_HISTORY from './data/pattern-history.json'

// Signal card data with sector information
const SIGNAL_CARDS = [
  {
    id: 1,
    trigger: 'AMD',
    echo: 'NVDA',
    sector: 'Technology',
    pattern: 'When AMD beats earnings, NVDA typically rises 3-5% within 48 hours',
    correlation: 0.87,
    confidence: 'High',
    historicalAccuracy: 82,
    quarterlyHistory: [
      { quarter: 'Q3 2024', triggerResult: 'Beat', echoMove: '+4.2%', accurate: true },
      { quarter: 'Q2 2024', triggerResult: 'Beat', echoMove: '+3.8%', accurate: true },
      { quarter: 'Q1 2024', triggerResult: 'Miss', echoMove: '-2.1%', accurate: true },
      { quarter: 'Q4 2023', triggerResult: 'Beat', echoMove: '+5.1%', accurate: true },
      { quarter: 'Q3 2023', triggerResult: 'Beat', echoMove: '+2.9%', accurate: true },
      { quarter: 'Q2 2023', triggerResult: 'Beat', echoMove: '+1.2%', accurate: false },
      { quarter: 'Q1 2023', triggerResult: 'Miss', echoMove: '-3.4%', accurate: true },
      { quarter: 'Q4 2022', triggerResult: 'Beat', echoMove: '+4.7%', accurate: true },
    ]
  },
  {
    id: 2,
    trigger: 'JPM',
    echo: 'BAC',
    sector: 'Finance',
    pattern: 'JPMorgan earnings typically predict Bank of America movement within 24 hours',
    correlation: 0.79,
    confidence: 'High',
    historicalAccuracy: 78,
    quarterlyHistory: [
      { quarter: 'Q3 2024', triggerResult: 'Beat', echoMove: '+2.8%', accurate: true },
      { quarter: 'Q2 2024', triggerResult: 'Beat', echoMove: '+1.9%', accurate: true },
      { quarter: 'Q1 2024', triggerResult: 'Beat', echoMove: '+3.2%', accurate: true },
      { quarter: 'Q4 2023', triggerResult: 'Miss', echoMove: '-1.5%', accurate: true },
      { quarter: 'Q3 2023', triggerResult: 'Beat', echoMove: '+0.8%', accurate: false },
      { quarter: 'Q2 2023', triggerResult: 'Beat', echoMove: '+2.4%', accurate: true },
      { quarter: 'Q1 2023', triggerResult: 'Beat', echoMove: '+1.7%', accurate: true },
      { quarter: 'Q4 2022', triggerResult: 'Miss', echoMove: '-2.9%', accurate: true },
    ]
  },
  {
    id: 3,
    trigger: 'TSLA',
    echo: 'F',
    sector: 'Automotive',
    pattern: 'Tesla earnings create ripple effects across traditional automakers',
    correlation: 0.65,
    confidence: 'Medium',
    historicalAccuracy: 71,
    quarterlyHistory: [
      { quarter: 'Q3 2024', triggerResult: 'Beat', echoMove: '+1.9%', accurate: true },
      { quarter: 'Q2 2024', triggerResult: 'Miss', echoMove: '-2.3%', accurate: true },
      { quarter: 'Q1 2024', triggerResult: 'Miss', echoMove: '+0.5%', accurate: false },
      { quarter: 'Q4 2023', triggerResult: 'Beat', echoMove: '+1.2%', accurate: true },
      { quarter: 'Q3 2023', triggerResult: 'Beat', echoMove: '+2.1%', accurate: true },
      { quarter: 'Q2 2023', triggerResult: 'Beat', echoMove: '-0.3%', accurate: false },
      { quarter: 'Q1 2023', triggerResult: 'Miss', echoMove: '-1.8%', accurate: true },
      { quarter: 'Q4 2022', triggerResult: 'Miss', echoMove: '-2.5%', accurate: true },
    ]
  },
  {
    id: 4,
    trigger: 'AAPL',
    echo: 'MSFT',
    sector: 'Technology',
    pattern: 'Apple earnings influence Microsoft through tech sector sentiment',
    correlation: 0.72,
    confidence: 'Medium',
    historicalAccuracy: 75,
    quarterlyHistory: [
      { quarter: 'Q3 2024', triggerResult: 'Beat', echoMove: '+2.1%', accurate: true },
      { quarter: 'Q2 2024', triggerResult: 'Beat', echoMove: '+1.5%', accurate: true },
      { quarter: 'Q1 2024', triggerResult: 'Beat', echoMove: '+2.8%', accurate: true },
      { quarter: 'Q4 2023', triggerResult: 'Beat', echoMove: '+0.9%', accurate: false },
      { quarter: 'Q3 2023', triggerResult: 'Beat', echoMove: '+1.8%', accurate: true },
      { quarter: 'Q2 2023', triggerResult: 'Miss', echoMove: '-1.2%', accurate: true },
      { quarter: 'Q1 2023', triggerResult: 'Beat', echoMove: '+2.3%', accurate: true },
      { quarter: 'Q4 2022', triggerResult: 'Miss', echoMove: '-1.9%', accurate: true },
    ]
  },
  {
    id: 5,
    trigger: 'XOM',
    echo: 'CVX',
    sector: 'Energy',
    pattern: 'ExxonMobil earnings highly predictive of Chevron price action',
    correlation: 0.91,
    confidence: 'Very High',
    historicalAccuracy: 88,
    quarterlyHistory: [
      { quarter: 'Q3 2024', triggerResult: 'Beat', echoMove: '+3.5%', accurate: true },
      { quarter: 'Q2 2024', triggerResult: 'Beat', echoMove: '+2.9%', accurate: true },
      { quarter: 'Q1 2024', triggerResult: 'Beat', echoMove: '+4.1%', accurate: true },
      { quarter: 'Q4 2023', triggerResult: 'Miss', echoMove: '-2.7%', accurate: true },
      { quarter: 'Q3 2023', triggerResult: 'Beat', echoMove: '+3.2%', accurate: true },
      { quarter: 'Q2 2023', triggerResult: 'Beat', echoMove: '+2.1%', accurate: true },
      { quarter: 'Q1 2023', triggerResult: 'Miss', echoMove: '+0.4%', accurate: false },
      { quarter: 'Q4 2022', triggerResult: 'Beat', echoMove: '+3.8%', accurate: true },
    ]
  }
]

// Sectors for filtering
const SECTORS = ['All', 'Technology', 'Finance', 'Automotive', 'Energy']

// Company information map for displaying full names
const COMPANY_INFO = {
  AMD:  { name: 'Advanced Micro Devices' },
  NVDA: { name: 'NVIDIA Corporation' },
  JPM:  { name: 'JPMorgan Chase & Co.' },
  BAC:  { name: 'Bank of America' },
  TSLA: { name: 'Tesla, Inc.' },
  F:    { name: 'Ford Motor Company' },
  AAPL: { name: 'Apple Inc.' },
  MSFT: { name: 'Microsoft Corporation' },
  XOM:  { name: 'Exxon Mobil Corporation' },
  CVX:  { name: 'Chevron Corporation' }
}

// Helper function to format avgGapDays into readable text
function formatGapDays(avgGapDays) {
  if (avgGapDays === null || avgGapDays === undefined) {
    return null
  }
  if (avgGapDays <= 1) {
    return 'within 24 hours'
  }
  if (avgGapDays <= 7) {
    return `within ${Math.round(avgGapDays)} days`
  }
  return `within ~${Math.round(avgGapDays)} days`
}

// Helper function to generate dynamic pattern description
function generatePatternDescription(trigger, echo, avgGapDays) {
  const gapText = formatGapDays(avgGapDays)
  if (gapText) {
    return `${echo} typically moves ${gapText} after ${trigger} earnings`
  }
  return null
}

// Create enriched cards with real pattern history data
const enrichedCards = SIGNAL_CARDS.map(card => {
  const pairId = `${card.trigger}_${card.echo}`
  const patternData = PATTERN_HISTORY[pairId]

  // Check for fundamentalEcho data with avgGapDays
  if (patternData && patternData.fundamentalEcho && patternData.fundamentalEcho.stats) {
    const avgGapDays = patternData.fundamentalEcho.stats.avgGapDays
    const dynamicPattern = generatePatternDescription(card.trigger, card.echo, avgGapDays)

    return {
      ...card,
      pattern: dynamicPattern || card.pattern,
      quarterlyHistory: patternData.priceEcho?.history || card.quarterlyHistory,
      correlation: patternData.priceEcho?.stats?.correlation || card.correlation,
      historicalAccuracy: patternData.priceEcho?.stats?.accuracy || card.historicalAccuracy
    }
  }

  // Check for legacy priceEcho format
  if (patternData && patternData.history && patternData.stats) {
    return {
      ...card,
      quarterlyHistory: patternData.history,
      correlation: patternData.stats.correlation || card.correlation,
      historicalAccuracy: patternData.stats.accuracy || card.historicalAccuracy
    }
  }

  // Fallback to mock data if pattern data not available
  return card
})

// Helper function to get Trade Playbook data for a specific pair
function getPlaybookForPair(pairId) {
  // Only show playbook for AMD_NVDA for now
  if (pairId !== 'AMD_NVDA') return null

  const patternData = PATTERN_HISTORY[pairId]
  if (!patternData?.fundamentalEcho?.stats) return null

  const stats = patternData.fundamentalEcho.stats
  return {
    trigger: 'AMD',
    echo: 'NVDA',
    beatFollowsBeat: stats.beatFollowsBeat,
    avgGapDays: stats.avgGapDays,
    sampleSize: stats.sampleSize,
    directionAgreement: stats.directionAgreement
  }
}

// Alert Modal Component
function AlertModal({ isOpen, onClose, card }) {
  const [alertSettings, setAlertSettings] = useState({
    email: false,
    push: false,
    priceTarget: false,
    emailAddress: '',
    priceThreshold: ''
  })

  if (!isOpen) return null

  const handleSave = () => {
    console.log('Alert settings saved:', alertSettings)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white">
            Set Alert: {card.trigger} → {card.echo}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Email Alert */}
          <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-white">Email Alert</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={alertSettings.email}
                onChange={(e) => setAlertSettings({...alertSettings, email: e.target.checked})}
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>

          {alertSettings.email && (
            <input
              type="email"
              placeholder="Enter email address"
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              value={alertSettings.emailAddress}
              onChange={(e) => setAlertSettings({...alertSettings, emailAddress: e.target.value})}
            />
          )}

          {/* Push Notification */}
          <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="text-white">Push Notification</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={alertSettings.push}
                onChange={(e) => setAlertSettings({...alertSettings, push: e.target.checked})}
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>

          {/* Price Target Alert */}
          <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-white">Price Target</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={alertSettings.priceTarget}
                onChange={(e) => setAlertSettings({...alertSettings, priceTarget: e.target.checked})}
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
            </label>
          </div>

          {alertSettings.priceTarget && (
            <input
              type="number"
              placeholder={`Price threshold for ${card.echo}`}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
              value={alertSettings.priceThreshold}
              onChange={(e) => setAlertSettings({...alertSettings, priceThreshold: e.target.value})}
            />
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Save Alert
          </button>
        </div>
      </div>
    </div>
  )
}

// Helper function to format earnings date
function formatEarningsDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}


// Helper function to format session (AMC/BMO)
function formatSession(hour) {
  if (hour === 'bmo') return 'BMO';
  if (hour === 'amc') return 'AMC';
  return null;
}

// Signal Card Component
function SignalCard({ card, onSetAlert }) {
  const { t } = useI18n()
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [feedback, setFeedback] = useState(null)

  // Fetch live stock quotes for both leader and follower stocks
  const { data: leaderQuote, loading: leaderLoading, error: leaderError } = useStockQuote(card.trigger)
  const { data: followerQuote, loading: followerLoading, error: followerError } = useStockQuote(card.echo)

  // Fetch earnings info for both leader and follower stocks
  const { data: leaderEarnings, loading: leaderEarningsLoading, error: leaderEarningsError } = useEarningsInfo(card.trigger)
  const { data: followerEarnings, loading: followerEarningsLoading, error: followerEarningsError } = useEarningsInfo(card.echo)

  // Calculate pattern history summary
  const historySummary = useMemo(() => {
    const total = card.quarterlyHistory?.length || 0
    const correct = card.quarterlyHistory?.filter(q => q.accurate).length || 0
    return { correct, total }
  }, [card.quarterlyHistory])

  const handleFeedback = (type) => {
    setFeedback(type)
    console.log(`Feedback for ${card.trigger}→${card.echo}: ${type}`)
  }

  // Translate sector names
  const getSectorLabel = (sector) => {
    const sectorKeys = {
      'Technology': 'technology',
      'Finance': 'finance',
      'Automotive': 'automotive',
      'Energy': 'energy'
    }
    return t(sectorKeys[sector] || sector.toLowerCase())
  }

  // Translate result labels
  const getResultLabel = (result) => {
    const resultLower = (result || '').toLowerCase()
    if (resultLower === 'beat') return t('beat')
    if (resultLower === 'miss') return t('miss')
    return t('inline')
  }

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-gray-600 transition-all duration-300">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-white">{card.trigger}</span>
              <span className="text-[11px] text-slate-400 leading-tight">
                {COMPANY_INFO[card.trigger]?.name || ''}
              </span>
            </div>
            <svg className="w-5 h-5 text-blue-400 self-start mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-white">{card.echo}</span>
              <span className="text-[11px] text-slate-400 leading-tight">
                {COMPANY_INFO[card.echo]?.name || ''}
              </span>
            </div>
          </div>
          <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded mt-1 inline-block">{getSectorLabel(card.sector)}</span>
        </div>
        <StrengthBadge correlation={card.correlation} accuracy={card.historicalAccuracy} />
      </div>

      {/* Live Prices */}
      <div className="flex gap-4 mb-4">
        {/* Leader/Trigger Stock */}
        <div className="flex-1 bg-gray-700/50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">{card.trigger}</div>
          {leaderLoading ? (
            <div className="animate-pulse">
              <div className="h-6 bg-gray-600 rounded w-20 mb-1"></div>
              <div className="h-4 bg-gray-600 rounded w-14"></div>
            </div>
          ) : leaderError ? (
            <div className="text-sm text-gray-500">Price unavailable</div>
          ) : leaderQuote ? (
            <div>
              <div className="text-lg font-semibold text-white">
                ${leaderQuote.price?.toFixed(2)}
              </div>
              <div className={`text-sm font-medium ${leaderQuote.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {leaderQuote.changePercent >= 0 ? '+' : ''}{leaderQuote.changePercent?.toFixed(2)}%
              </div>
            </div>
          ) : (
            <div className="text-lg font-semibold text-white">---</div>
          )}
        </div>
        {/* Follower/Echo Stock */}
        <div className="flex-1 bg-gray-700/50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">{card.echo}</div>
          {followerLoading ? (
            <div className="animate-pulse">
              <div className="h-6 bg-gray-600 rounded w-20 mb-1"></div>
              <div className="h-4 bg-gray-600 rounded w-14"></div>
            </div>
          ) : followerError ? (
            <div className="text-sm text-gray-500">Price unavailable</div>
          ) : followerQuote ? (
            <div>
              <div className="text-lg font-semibold text-white">
                ${followerQuote.price?.toFixed(2)}
              </div>
              <div className={`text-sm font-medium ${followerQuote.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {followerQuote.changePercent >= 0 ? '+' : ''}{followerQuote.changePercent?.toFixed(2)}%
              </div>
            </div>
          ) : (
            <div className="text-lg font-semibold text-white">---</div>
          )}
        </div>
      </div>

      {/* Earnings Badges */}
      <div className="flex flex-col gap-1 mb-4">
        {/* Leader Stock Earnings Badge */}
        {leaderEarningsLoading ? (
          <span className="bg-slate-800 text-[10px] px-2 py-1 rounded-full inline-flex items-center gap-1 text-gray-400 self-end">
            Loading earnings...
          </span>
        ) : !leaderEarningsError && leaderEarnings && (
          <span className="bg-slate-800 text-[10px] px-2 py-1 rounded-full inline-flex items-center gap-1 text-gray-300 self-end">
            📅 {card.trigger}: Last: {formatEarningsDate(leaderEarnings.last?.date)}
            {leaderEarnings.last?.surprisePercent != null && (
              <span className={leaderEarnings.last.surprisePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                {' '}({leaderEarnings.last.surprisePercent >= 0 ? 'Beat' : 'Miss'} {leaderEarnings.last.surprisePercent >= 0 ? '+' : ''}{leaderEarnings.last.surprisePercent.toFixed(1)}%)
              </span>
            )}
            {' '}| Next: {leaderEarnings.next?.confirmed ? (
              <>
                {formatEarningsDate(leaderEarnings.next.date)}
                {formatSession(leaderEarnings.next.hour) && ` (${formatSession(leaderEarnings.next.hour)})`}
              </>
            ) : (
              <>~{leaderEarnings.next?.estimatedDate || 'TBD'}</>
            )}
          </span>
        )}

        {/* Follower Stock Earnings Badge */}
        {followerEarningsLoading ? (
          <span className="bg-slate-800 text-[10px] px-2 py-1 rounded-full inline-flex items-center gap-1 text-gray-400 self-end">
            Loading earnings...
          </span>
        ) : !followerEarningsError && followerEarnings && (
          <span className="bg-slate-800 text-[10px] px-2 py-1 rounded-full inline-flex items-center gap-1 text-gray-300 self-end">
            📅 {card.echo}: Last: {formatEarningsDate(followerEarnings.last?.date)}
            {followerEarnings.last?.surprisePercent != null && (
              <span className={followerEarnings.last.surprisePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                {' '}({followerEarnings.last.surprisePercent >= 0 ? 'Beat' : 'Miss'} {followerEarnings.last.surprisePercent >= 0 ? '+' : ''}{followerEarnings.last.surprisePercent.toFixed(1)}%)
              </span>
            )}
            {' '}| Next: {followerEarnings.next?.confirmed ? (
              <>
                {formatEarningsDate(followerEarnings.next.date)}
                {formatSession(followerEarnings.next.hour) && ` (${formatSession(followerEarnings.next.hour)})`}
              </>
            ) : (
              <>~{followerEarnings.next?.estimatedDate || 'TBD'}</>
            )}
          </span>
        )}
      </div>

      {/* Pattern Description */}
      <p className="text-sm text-gray-300 mb-4">{card.pattern}</p>

      {/* Trade Playbook - Only for AMD_NVDA */}
      {(() => {
        const pairId = `${card.trigger}_${card.echo}`
        const playbook = getPlaybookForPair(pairId)
        if (!playbook) return null
        return (
          <div className="bg-gray-700/40 border border-gray-600/50 rounded-lg p-3 mb-4">
            <div className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Trade Playbook
            </div>
            <ul className="text-xs text-gray-300 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>
                  <strong>Trigger:</strong> When {playbook.trigger} earnings beat
                  <span className="text-gray-400 ml-1">(EPS above expectations / beklenti üstü kâr)</span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">•</span>
                <span>
                  <strong>Behavior:</strong> {playbook.echo} also beat in{' '}
                  <span className="text-green-400 font-semibold">{playbook.beatFollowsBeat}%</span> of those quarters
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5">•</span>
                <span>
                  <strong>Timing:</strong> {playbook.echo} earnings are typically ~{playbook.avgGapDays} days after {playbook.trigger}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">•</span>
                <span>
                  <strong>Sample size:</strong> Based on {playbook.sampleSize} quarters of data
                </span>
              </li>
            </ul>
          </div>
        )
      })()}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-700/30 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-400 flex items-center justify-center gap-1">
            {t('correlation')}
            <InfoTooltip content={t('correlationExplain')} />
          </div>
          <div className="text-lg font-semibold text-blue-400">{card.correlation}</div>
        </div>
        <div className="bg-gray-700/30 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-400 flex items-center justify-center gap-1">
            {t('accuracy')}
            <InfoTooltip content={t('accuracyExplain')} />
          </div>
          <div className="text-lg font-semibold text-green-400">{card.historicalAccuracy}%</div>
        </div>
      </div>

      {/* Collapsible History */}
      <div className="mb-4">
        <button
          onClick={() => setIsHistoryOpen(!isHistoryOpen)}
          className="w-full flex items-center justify-between p-2 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-sm text-gray-300">
              {t('patternHistoryQuarters', { count: historySummary.total })}
            </span>
            <span className="text-xs text-green-400">
              {t('summaryCorrect', { correct: historySummary.correct, total: historySummary.total })}
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isHistoryOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isHistoryOpen && (
          <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
            {card.quarterlyHistory.map((item, index) => {
              // Determine trigger result label and color
              const triggerResultLower = (item.triggerResult || '').toLowerCase()
              const triggerLabel = triggerResultLower === 'beat'
                ? 'Beat'
                : triggerResultLower === 'miss'
                  ? 'Miss'
                  : 'Inline'
              const triggerResultColor = triggerResultLower === 'beat'
                ? 'text-green-400'
                : triggerResultLower === 'miss'
                  ? 'text-red-400'
                  : 'text-yellow-400'

              // Format percentage helper
              const formatPercent = (value) => {
                if (value == null || isNaN(value)) return 'N/A'
                const sign = value >= 0 ? '+' : ''
                return `${sign}${value.toFixed(1)}%`
              }
              const triggerEpsDisplay = formatPercent(item.triggerSurprisePercent)
              const triggerDay0Display = formatPercent(item.triggerDay0MovePercent)

              // Determine echo result label and color
              const echoResultLower = (item.echoResult || '').toLowerCase()
              // For old format data without echoResult, derive from echoMovePercent
              let echoLabel
              let echoResultColor
              if (item.echoResult) {
                echoLabel = echoResultLower === 'beat'
                  ? 'Beat'
                  : echoResultLower === 'miss'
                    ? 'Miss'
                    : 'Inline'
                echoResultColor = echoResultLower === 'beat'
                  ? 'text-green-400'
                  : echoResultLower === 'miss'
                    ? 'text-red-400'
                    : 'text-yellow-400'
              } else {
                // Fallback for old format: derive from echoMove or echoMovePercent
                const echoValue = item.echoMove
                  ? parseFloat(item.echoMove)
                  : item.echoMovePercent
                if (echoValue != null) {
                  echoLabel = echoValue >= 0 ? 'Beat' : 'Miss'
                  echoResultColor = echoValue >= 0 ? 'text-green-400' : 'text-red-400'
                } else {
                  echoLabel = 'N/A'
                  echoResultColor = 'text-gray-400'
                }
              }

              // Format echo EPS surprise percentage and Day0 price move
              const echoEpsDisplay = formatPercent(item.echoSurprisePercent)
              const echoDay0Display = formatPercent(item.echoDay0MovePercent)

              return (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-gray-700/20 rounded text-xs gap-2"
                >
                  <span className="text-gray-400 shrink-0 w-16">{item.quarter}</span>
                  <span className={`${triggerResultColor} shrink-0`}>
                    <span className="text-gray-500">{card.trigger}:</span>{' '}
                    {triggerLabel}
                    <span className="text-[10px] text-slate-400 ml-1">
                      (EPS {triggerEpsDisplay}, Fiyat gün 0 {triggerDay0Display})
                    </span>
                  </span>
                  <span className={`${echoResultColor} shrink-0`}>
                    <span className="text-gray-500">{card.echo}:</span>{' '}
                    {echoLabel}
                    <span className="text-[10px] text-slate-400 ml-1">
                      (EPS {echoEpsDisplay}, Fiyat gün 0 {echoDay0Display})
                    </span>
                  </span>
                  <span className={`${item.accurate ? 'text-green-400' : 'text-red-400'} shrink-0`}>
                    {item.accurate ? '✓' : '✗'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-700">
        {/* Set Alert Button */}
        <button
          onClick={() => onSetAlert(card)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {t('setAlert')}
        </button>

        {/* Feedback Buttons */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 mr-1">{t('helpful')}</span>
          <button
            onClick={() => handleFeedback('helpful')}
            className={`p-2 rounded-lg transition-colors ${
              feedback === 'helpful'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
            </svg>
          </button>
          <button
            onClick={() => handleFeedback('unclear')}
            className={`p-2 rounded-lg transition-colors ${
              feedback === 'unclear'
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// Main App Component
function App() {
  const { t } = useI18n()
  const [selectedSector, setSelectedSector] = useState('All')
  const [alertModal, setAlertModal] = useState({ isOpen: false, card: null })

  // Check for admin mode (?admin=1 in URL)
  const isAdmin = useMemo(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return params.get('admin') === '1'
  }, [])

  // Tab navigation state (persisted in localStorage)
  const [activeTab, setActiveTab] = useTabState(isAdmin)

  // Sector options with translation keys
  const sectorOptions = useMemo(() => [
    { value: 'All', labelKey: 'all' },
    { value: 'Technology', labelKey: 'technology' },
    { value: 'Finance', labelKey: 'finance' },
    { value: 'Automotive', labelKey: 'automotive' },
    { value: 'Energy', labelKey: 'energy' }
  ], [])

  // Filter cards by sector
  const filteredCards = enrichedCards.filter(
    card => selectedSector === 'All' || card.sector === selectedSector
  )

  const handleSetAlert = (card) => {
    setAlertModal({ isOpen: true, card })
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Major Event Alert Banner - Fixed at top */}
      <MajorEventAlertBanner />

      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                {t('appTitle')}
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {t('appSubtitle')}
              </p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Language Toggle */}
              <LanguageToggle />

              {/* Live Data Indicator */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg border border-gray-700">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                <span className="text-sm text-gray-300">{t('liveData')}</span>
              </div>

              {/* Sector Filter - only shown on earnings tab */}
              {activeTab === 'earnings' && (
                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {sectorOptions.map(sector => (
                    <option key={sector.value} value={sector.value}>{t(sector.labelKey)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Tab Navigation */}
        <TabNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAdmin={isAdmin}
        />

        {/* Radar Tab - Major Events Feed */}
        {activeTab === 'radar' && (
          <MajorEventsPanel />
        )}

        {/* Earnings Echo Tab - Signal Cards */}
        {activeTab === 'earnings' && (
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-white">{SIGNAL_CARDS.length}</div>
                <div className="text-xs text-gray-400">{t('activePatterns')}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-green-400">79%</div>
                <div className="text-xs text-gray-400">{t('avgAccuracy')}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-blue-400">0.79</div>
                <div className="text-xs text-gray-400">{t('avgCorrelation')}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-purple-400">40</div>
                <div className="text-xs text-gray-400">{t('quartersAnalyzed')}</div>
              </div>
            </div>

            {/* Signal Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCards.map(card => (
                <SignalCard
                  key={card.id}
                  card={card}
                  onSetAlert={handleSetAlert}
                />
              ))}
            </div>

            {/* Empty State */}
            {filteredCards.length === 0 && (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-400">{t('noPatterns')}</p>
              </div>
            )}
          </>
        )}

        {/* News Analysis Tab */}
        {activeTab === 'news' && (
          <NewsIntelPanel />
        )}

        {/* Admin Tab - Debug Tools */}
        {activeTab === 'admin' && isAdmin && (
          <>
            <NewsDebugConsole />
            <RawFeedPanel />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>{t('patternRecognition')}</p>
          <p className="mt-1">{t('disclaimer')}</p>
        </div>
      </footer>

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ isOpen: false, card: null })}
        card={alertModal.card || {}}
      />
    </div>
  )
}

export default App
