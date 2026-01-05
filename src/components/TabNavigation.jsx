import React, { useState, useEffect } from 'react'
import { useI18n } from '../i18n/I18nProvider'

const STORAGE_KEY = 'ee:tab'
const DEFAULT_TAB = 'radar'

const TABS = [
  { id: 'radar', labelKey: 'tabRadar', descKey: 'tabRadarDesc' },
  { id: 'earnings', labelKey: 'tabEarnings', descKey: 'tabEarningsDesc' },
  { id: 'news', labelKey: 'tabNews', descKey: 'tabNewsDesc' }
]

function TabNavigation({ activeTab, onTabChange, isAdmin }) {
  const { t } = useI18n()

  const allTabs = isAdmin
    ? [...TABS, { id: 'admin', labelKey: 'tabAdmin', descKey: null }]
    : TABS

  return (
    <div className="mb-6">
      {/* Tab buttons */}
      <div className="flex flex-wrap gap-2 mb-2">
        {allTabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
              }`}
              aria-selected={isActive}
              role="tab"
            >
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      {/* Active tab description */}
      {allTabs.map((tab) => {
        if (activeTab !== tab.id || !tab.descKey) return null
        return (
          <p key={tab.id} className="text-sm text-gray-500">
            {t(tab.descKey)}
          </p>
        )
      })}
    </div>
  )
}

// Custom hook to manage tab state with localStorage persistence
export function useTabState(isAdmin) {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_TAB
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      // Validate stored value
      const validTabs = ['radar', 'earnings', 'news', 'admin']
      if (stored && validTabs.includes(stored)) {
        // Only allow admin tab if isAdmin is true - but we don't know that yet
        // so we'll validate it in useEffect
        return stored
      }
    } catch (e) {
      // localStorage not available
    }
    return DEFAULT_TAB
  })

  // Validate admin tab access
  useEffect(() => {
    if (activeTab === 'admin' && !isAdmin) {
      setActiveTab(DEFAULT_TAB)
    }
  }, [activeTab, isAdmin])

  // Persist tab to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, activeTab)
    } catch (e) {
      // localStorage not available
    }
  }, [activeTab])

  return [activeTab, setActiveTab]
}

export default TabNavigation
