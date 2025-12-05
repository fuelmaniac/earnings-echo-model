import { useState, useEffect } from 'react'

// Echo Signal Data - 5 primary correlations
const ECHO_SIGNALS = [
  {
    id: 1,
    leader: { symbol: 'AMD', name: 'Advanced Micro Devices' },
    follower: { symbol: 'NVDA', name: 'NVIDIA Corporation' },
    correlation: 0.87,
    avgDelay: '2-3 days',
    sector: 'Semiconductors'
  },
  {
    id: 2,
    leader: { symbol: 'JPM', name: 'JPMorgan Chase' },
    follower: { symbol: 'BAC', name: 'Bank of America' },
    correlation: 0.92,
    avgDelay: '1-2 days',
    sector: 'Banking'
  },
  {
    id: 3,
    leader: { symbol: 'HD', name: 'Home Depot' },
    follower: { symbol: 'LOW', name: "Lowe's Companies" },
    correlation: 0.89,
    avgDelay: '1-2 days',
    sector: 'Home Improvement'
  },
  {
    id: 4,
    leader: { symbol: 'FDX', name: 'FedEx Corporation' },
    follower: { symbol: 'UPS', name: 'United Parcel Service' },
    correlation: 0.85,
    avgDelay: '2-4 days',
    sector: 'Logistics'
  },
  {
    id: 5,
    leader: { symbol: 'META', name: 'Meta Platforms' },
    follower: { symbol: 'SNAP', name: 'Snap Inc.' },
    correlation: 0.78,
    avgDelay: '1-3 days',
    sector: 'Social Media'
  }
]

// Historical pattern data - 8 quarters
const PATTERN_HISTORY = [
  { quarter: 'Q1 2023', signalId: 1, leaderMove: '+12.4%', followerMove: '+9.8%', accuracy: true, delay: 2 },
  { quarter: 'Q1 2023', signalId: 2, leaderMove: '+5.2%', followerMove: '+4.1%', accuracy: true, delay: 1 },
  { quarter: 'Q2 2023', signalId: 1, leaderMove: '-8.3%', followerMove: '-7.1%', accuracy: true, delay: 3 },
  { quarter: 'Q2 2023', signalId: 3, leaderMove: '+3.7%', followerMove: '+2.9%', accuracy: true, delay: 2 },
  { quarter: 'Q3 2023', signalId: 4, leaderMove: '-4.5%', followerMove: '-5.2%', accuracy: true, delay: 2 },
  { quarter: 'Q3 2023', signalId: 5, leaderMove: '+18.2%', followerMove: '+14.6%', accuracy: true, delay: 1 },
  { quarter: 'Q4 2023', signalId: 1, leaderMove: '+22.1%', followerMove: '+19.4%', accuracy: true, delay: 2 },
  { quarter: 'Q4 2023', signalId: 2, leaderMove: '+8.7%', followerMove: '+7.3%', accuracy: true, delay: 1 },
  { quarter: 'Q1 2024', signalId: 3, leaderMove: '-2.1%', followerMove: '-1.8%', accuracy: true, delay: 2 },
  { quarter: 'Q1 2024', signalId: 4, leaderMove: '+6.4%', followerMove: '+5.1%', accuracy: true, delay: 3 },
  { quarter: 'Q2 2024', signalId: 5, leaderMove: '-12.3%', followerMove: '-15.7%', accuracy: true, delay: 2 },
  { quarter: 'Q2 2024', signalId: 1, leaderMove: '+15.8%', followerMove: '+13.2%', accuracy: true, delay: 2 },
  { quarter: 'Q3 2024', signalId: 2, leaderMove: '+4.3%', followerMove: '+3.8%', accuracy: true, delay: 1 },
  { quarter: 'Q3 2024', signalId: 3, leaderMove: '+7.9%', followerMove: '+6.4%', accuracy: true, delay: 2 },
  { quarter: 'Q4 2024', signalId: 4, leaderMove: '-3.2%', followerMove: '-2.8%', accuracy: true, delay: 4 },
  { quarter: 'Q4 2024', signalId: 5, leaderMove: '+9.1%', followerMove: '+7.8%', accuracy: true, delay: 1 }
]

// Simulated real-time price generator
const generatePrice = (basePrice) => {
  const change = (Math.random() - 0.5) * 2
  return (basePrice + change).toFixed(2)
}

function App() {
  // State management
  const [prices, setPrices] = useState({
    AMD: 178.45, NVDA: 875.32,
    JPM: 198.67, BAC: 37.82,
    HD: 378.91, LOW: 245.67,
    FDX: 267.45, UPS: 142.38,
    META: 505.23, SNAP: 11.47
  })

  const [selectedSignal, setSelectedSignal] = useState(null)
  const [alertModal, setAlertModal] = useState({ isOpen: false, signal: null })
  const [activeAlerts, setActiveAlerts] = useState([])
  const [feedbackGiven, setFeedbackGiven] = useState({})
  const [priceChanges, setPriceChanges] = useState({})
  const [filterSector, setFilterSector] = useState('All')

  // Real-time price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setPrices(prev => {
        const newPrices = {}
        const changes = {}

        Object.keys(prev).forEach(symbol => {
          const oldPrice = prev[symbol]
          const newPrice = parseFloat(generatePrice(oldPrice))
          newPrices[symbol] = newPrice
          changes[symbol] = newPrice > oldPrice ? 'up' : newPrice < oldPrice ? 'down' : 'neutral'
        })

        setPriceChanges(changes)
        return newPrices
      })
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  // Check for alert triggers
  useEffect(() => {
    activeAlerts.forEach(alert => {
      const currentPrice = prices[alert.symbol]
      if (alert.type === 'above' && currentPrice >= alert.target) {
        showNotification(`${alert.symbol} crossed above $${alert.target}!`)
      } else if (alert.type === 'below' && currentPrice <= alert.target) {
        showNotification(`${alert.symbol} dropped below $${alert.target}!`)
      }
    })
  }, [prices, activeAlerts])

  const showNotification = (message) => {
    if (Notification.permission === 'granted') {
      new Notification('Earnings Echo Alert', { body: message })
    }
  }

  const openAlertModal = (signal) => {
    setAlertModal({ isOpen: true, signal })
  }

  const closeAlertModal = () => {
    setAlertModal({ isOpen: false, signal: null })
  }

  const createAlert = (symbol, type, target) => {
    const newAlert = {
      id: Date.now(),
      symbol,
      type,
      target: parseFloat(target),
      createdAt: new Date().toLocaleString()
    }
    setActiveAlerts(prev => [...prev, newAlert])
    closeAlertModal()
  }

  const removeAlert = (alertId) => {
    setActiveAlerts(prev => prev.filter(a => a.id !== alertId))
  }

  const handleFeedback = (signalId, isPositive) => {
    setFeedbackGiven(prev => ({
      ...prev,
      [signalId]: isPositive ? 'positive' : 'negative'
    }))
  }

  const getSignalById = (id) => ECHO_SIGNALS.find(s => s.id === id)

  const filteredSignals = filterSector === 'All'
    ? ECHO_SIGNALS
    : ECHO_SIGNALS.filter(s => s.sector === filterSector)

  const sectors = ['All', ...new Set(ECHO_SIGNALS.map(s => s.sector))]

  const getCorrelationColor = (correlation) => {
    if (correlation >= 0.9) return '#22c55e'
    if (correlation >= 0.8) return '#84cc16'
    if (correlation >= 0.7) return '#eab308'
    return '#f97316'
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1>Earnings Echo Model</h1>
          <p className="subtitle">Financial Pattern Recognition Platform</p>
        </div>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-value">{ECHO_SIGNALS.length}</span>
            <span className="stat-label">Active Signals</span>
          </div>
          <div className="stat">
            <span className="stat-value">{activeAlerts.length}</span>
            <span className="stat-label">Alerts Set</span>
          </div>
          <div className="stat">
            <span className="stat-value">87%</span>
            <span className="stat-label">Avg Accuracy</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* Filter Section */}
        <section className="filter-section">
          <label htmlFor="sector-filter">Filter by Sector:</label>
          <select
            id="sector-filter"
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value)}
          >
            {sectors.map(sector => (
              <option key={sector} value={sector}>{sector}</option>
            ))}
          </select>
        </section>

        {/* Echo Signals Grid */}
        <section className="signals-section">
          <h2>Echo Signals</h2>
          <div className="signals-grid">
            {filteredSignals.map(signal => (
              <div
                key={signal.id}
                className={`signal-card ${selectedSignal?.id === signal.id ? 'selected' : ''}`}
                onClick={() => setSelectedSignal(signal)}
              >
                <div className="signal-header">
                  <span className="sector-badge">{signal.sector}</span>
                  <span
                    className="correlation-badge"
                    style={{ backgroundColor: getCorrelationColor(signal.correlation) }}
                  >
                    {(signal.correlation * 100).toFixed(0)}% corr
                  </span>
                </div>

                <div className="signal-pair">
                  <div className="stock leader">
                    <span className="stock-symbol">{signal.leader.symbol}</span>
                    <span className="stock-name">{signal.leader.name}</span>
                    <span className={`stock-price ${priceChanges[signal.leader.symbol]}`}>
                      ${prices[signal.leader.symbol]?.toFixed(2)}
                    </span>
                  </div>

                  <div className="arrow-container">
                    <span className="arrow">→</span>
                    <span className="delay">{signal.avgDelay}</span>
                  </div>

                  <div className="stock follower">
                    <span className="stock-symbol">{signal.follower.symbol}</span>
                    <span className="stock-name">{signal.follower.name}</span>
                    <span className={`stock-price ${priceChanges[signal.follower.symbol]}`}>
                      ${prices[signal.follower.symbol]?.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="signal-actions">
                  <button
                    className="btn btn-alert"
                    onClick={(e) => {
                      e.stopPropagation()
                      openAlertModal(signal)
                    }}
                  >
                    Set Alert
                  </button>
                  <div className="feedback-buttons">
                    <button
                      className={`btn-feedback ${feedbackGiven[signal.id] === 'positive' ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFeedback(signal.id, true)
                      }}
                      title="Useful signal"
                    >
                      +
                    </button>
                    <button
                      className={`btn-feedback negative ${feedbackGiven[signal.id] === 'negative' ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFeedback(signal.id, false)
                      }}
                      title="Not useful"
                    >
                      -
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pattern History Section */}
        <section className="history-section">
          <h2>Pattern History (8 Quarters)</h2>
          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Quarter</th>
                  <th>Signal Pair</th>
                  <th>Leader Move</th>
                  <th>Follower Move</th>
                  <th>Delay (days)</th>
                  <th>Accurate</th>
                </tr>
              </thead>
              <tbody>
                {PATTERN_HISTORY.map((record, index) => {
                  const signal = getSignalById(record.signalId)
                  return (
                    <tr key={index}>
                      <td>{record.quarter}</td>
                      <td className="pair-cell">
                        {signal?.leader.symbol} → {signal?.follower.symbol}
                      </td>
                      <td className={record.leaderMove.startsWith('+') ? 'positive' : 'negative'}>
                        {record.leaderMove}
                      </td>
                      <td className={record.followerMove.startsWith('+') ? 'positive' : 'negative'}>
                        {record.followerMove}
                      </td>
                      <td>{record.delay}</td>
                      <td>
                        <span className={`accuracy-badge ${record.accuracy ? 'accurate' : 'inaccurate'}`}>
                          {record.accuracy ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Active Alerts Section */}
        {activeAlerts.length > 0 && (
          <section className="alerts-section">
            <h2>Active Alerts</h2>
            <div className="alerts-list">
              {activeAlerts.map(alert => (
                <div key={alert.id} className="alert-item">
                  <div className="alert-info">
                    <span className="alert-symbol">{alert.symbol}</span>
                    <span className="alert-condition">
                      {alert.type === 'above' ? '≥' : '≤'} ${alert.target.toFixed(2)}
                    </span>
                    <span className="alert-current">
                      Current: ${prices[alert.symbol]?.toFixed(2)}
                    </span>
                  </div>
                  <button
                    className="btn btn-remove"
                    onClick={() => removeAlert(alert.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Alert Modal */}
      {alertModal.isOpen && alertModal.signal && (
        <div className="modal-overlay" onClick={closeAlertModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Set Price Alert</h3>
              <button className="modal-close" onClick={closeAlertModal}>×</button>
            </div>
            <div className="modal-body">
              <p>Create an alert for {alertModal.signal.leader.symbol} → {alertModal.signal.follower.symbol}</p>

              <AlertForm
                signal={alertModal.signal}
                prices={prices}
                onSubmit={createAlert}
                onCancel={closeAlertModal}
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <p>Earnings Echo Model - Real-time Financial Pattern Recognition</p>
        <p className="disclaimer">
          Disclaimer: This tool is for informational purposes only. Not financial advice.
        </p>
      </footer>
    </div>
  )
}

// Alert Form Component
function AlertForm({ signal, prices, onSubmit, onCancel }) {
  const [selectedSymbol, setSelectedSymbol] = useState(signal.leader.symbol)
  const [alertType, setAlertType] = useState('above')
  const [targetPrice, setTargetPrice] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (targetPrice) {
      onSubmit(selectedSymbol, alertType, targetPrice)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="alert-form">
      <div className="form-group">
        <label htmlFor="symbol">Stock Symbol</label>
        <select
          id="symbol"
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
        >
          <option value={signal.leader.symbol}>
            {signal.leader.symbol} (Leader) - ${prices[signal.leader.symbol]?.toFixed(2)}
          </option>
          <option value={signal.follower.symbol}>
            {signal.follower.symbol} (Follower) - ${prices[signal.follower.symbol]?.toFixed(2)}
          </option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="type">Alert Type</label>
        <select
          id="type"
          value={alertType}
          onChange={(e) => setAlertType(e.target.value)}
        >
          <option value="above">Price goes above</option>
          <option value="below">Price goes below</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="target">Target Price ($)</label>
        <input
          id="target"
          type="number"
          step="0.01"
          value={targetPrice}
          onChange={(e) => setTargetPrice(e.target.value)}
          placeholder={`Current: $${prices[selectedSymbol]?.toFixed(2)}`}
          required
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Create Alert
        </button>
      </div>
    </form>
  )
}

export default App
