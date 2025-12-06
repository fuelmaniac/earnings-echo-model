import React, { useState, useEffect, useCallback } from 'react'
import { useStockQuote } from './hooks/useStockQuote'

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

// Demo stock prices
const DEMO_PRICES = {
  AMD: 142.35,
  NVDA: 487.21,
  JPM: 198.45,
  BAC: 35.82,
  TSLA: 248.92,
  F: 11.45,
  AAPL: 189.72,
  MSFT: 378.91,
  XOM: 104.56,
  CVX: 151.23
}

// Sectors for filtering
const SECTORS = ['All', 'Technology', 'Finance', 'Automotive', 'Energy']

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

// Signal Card Component
function SignalCard({ card, prices, onSetAlert }) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [feedback, setFeedback] = useState(null)

  // Fetch live stock quote for the echo (follower) stock
  const { data: quoteData, loading: quoteLoading, error: quoteError } = useStockQuote(card.echo)

  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'Very High': return 'text-green-400 bg-green-400/10 border-green-400/30'
      case 'High': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
      case 'Medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/30'
    }
  }

  const handleFeedback = (type) => {
    setFeedback(type)
    console.log(`Feedback for ${card.trigger}→${card.echo}: ${type}`)
  }

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-gray-600 transition-all duration-300">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl font-bold text-white">{card.trigger}</span>
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="text-2xl font-bold text-white">{card.echo}</span>
          </div>
          <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">{card.sector}</span>
        </div>
        <span className={`text-xs px-2 py-1 rounded border ${getConfidenceColor(card.confidence)}`}>
          {card.confidence}
        </span>
      </div>

      {/* Live Prices */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1 bg-gray-700/50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">{card.trigger}</div>
          <div className="text-lg font-semibold text-white">${prices[card.trigger]?.toFixed(2) || '---'}</div>
        </div>
        <div className="flex-1 bg-gray-700/50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">{card.echo}</div>
          {quoteLoading ? (
            <div className="animate-pulse">
              <div className="h-6 bg-gray-600 rounded w-20 mb-1"></div>
              <div className="h-4 bg-gray-600 rounded w-14"></div>
            </div>
          ) : quoteError ? (
            <div className="text-sm text-gray-500">Price unavailable</div>
          ) : quoteData ? (
            <div>
              <div className="text-lg font-semibold text-white">
                ${quoteData.price?.toFixed(2)}
              </div>
              <div className={`text-sm font-medium ${quoteData.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {quoteData.changePercent >= 0 ? '+' : ''}{quoteData.changePercent?.toFixed(2)}%
              </div>
            </div>
          ) : (
            <div className="text-lg font-semibold text-white">${prices[card.echo]?.toFixed(2) || '---'}</div>
          )}
        </div>
      </div>

      {/* Pattern Description */}
      <p className="text-sm text-gray-300 mb-4">{card.pattern}</p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-700/30 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-400">Correlation</div>
          <div className="text-lg font-semibold text-blue-400">{card.correlation}</div>
        </div>
        <div className="bg-gray-700/30 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-400">Accuracy</div>
          <div className="text-lg font-semibold text-green-400">{card.historicalAccuracy}%</div>
        </div>
      </div>

      {/* Collapsible History */}
      <div className="mb-4">
        <button
          onClick={() => setIsHistoryOpen(!isHistoryOpen)}
          className="w-full flex items-center justify-between p-2 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors"
        >
          <span className="text-sm text-gray-300">Pattern History (8 Quarters)</span>
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
          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
            {card.quarterlyHistory.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-gray-700/20 rounded text-xs"
              >
                <span className="text-gray-400">{item.quarter}</span>
                <span className={item.triggerResult === 'Beat' ? 'text-green-400' : 'text-red-400'}>
                  {item.triggerResult}
                </span>
                <span className={item.echoMove.startsWith('+') ? 'text-green-400' : 'text-red-400'}>
                  {item.echoMove}
                </span>
                <span className={item.accurate ? 'text-green-400' : 'text-red-400'}>
                  {item.accurate ? '✓' : '✗'}
                </span>
              </div>
            ))}
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
          Set Alert
        </button>

        {/* Feedback Buttons */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 mr-1">Helpful?</span>
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
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [prices, setPrices] = useState(DEMO_PRICES)
  const [selectedSector, setSelectedSector] = useState('All')
  const [alertModal, setAlertModal] = useState({ isOpen: false, card: null })
  const [lastUpdate, setLastUpdate] = useState(new Date())

  // Simulate price updates
  const updatePrices = useCallback(() => {
    if (isLiveMode) {
      setPrices(prevPrices => {
        const newPrices = { ...prevPrices }
        Object.keys(newPrices).forEach(symbol => {
          // Random price fluctuation between -0.5% and +0.5%
          const change = 1 + (Math.random() - 0.5) * 0.01
          newPrices[symbol] = Number((newPrices[symbol] * change).toFixed(2))
        })
        return newPrices
      })
      setLastUpdate(new Date())
    }
  }, [isLiveMode])

  // Set up 30-second refresh interval for live mode
  useEffect(() => {
    if (isLiveMode) {
      const interval = setInterval(updatePrices, 30000)
      return () => clearInterval(interval)
    }
  }, [isLiveMode, updatePrices])

  // Filter cards by sector
  const filteredCards = SIGNAL_CARDS.filter(
    card => selectedSector === 'All' || card.sector === selectedSector
  )

  const handleSetAlert = (card) => {
    setAlertModal({ isOpen: true, card })
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Earnings Echo
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Financial pattern recognition for earnings correlations
              </p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Data Mode Toggle */}
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setIsLiveMode(false)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    !isLiveMode
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Demo
                </button>
                <button
                  onClick={() => setIsLiveMode(true)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1 ${
                    isLiveMode
                      ? 'bg-green-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isLiveMode ? 'bg-green-300 animate-pulse' : 'bg-gray-500'}`}></span>
                  Live
                </button>
              </div>

              {/* Sector Filter */}
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {SECTORS.map(sector => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Last Update Indicator */}
          {isLiveMode && (
            <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Last updated: {lastUpdate.toLocaleTimeString()} (refreshes every 30s)
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-white">{SIGNAL_CARDS.length}</div>
            <div className="text-xs text-gray-400">Active Patterns</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-green-400">79%</div>
            <div className="text-xs text-gray-400">Avg Accuracy</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-blue-400">0.79</div>
            <div className="text-xs text-gray-400">Avg Correlation</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-purple-400">40</div>
            <div className="text-xs text-gray-400">Quarters Analyzed</div>
          </div>
        </div>

        {/* Signal Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCards.map(card => (
            <SignalCard
              key={card.id}
              card={card}
              prices={prices}
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
            <p className="text-gray-400">No patterns found for the selected sector</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>Earnings Echo - Pattern recognition for informed trading decisions</p>
          <p className="mt-1">Data is for informational purposes only. Not financial advice.</p>
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
