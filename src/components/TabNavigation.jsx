import React, { useState, useEffect, useMemo } from 'react'
import { useI18n } from '../i18n/I18nProvider'

const STORAGE_KEY = 'ee:tab'
const DEFAULT_TAB = 'radar'

const TABS = [
  { id: 'radar', icon: 'lightning', labelKey: 'tabRadar', descKey: 'tabRadarDesc' },
  { id: 'earnings', icon: 'chart', labelKey: 'tabEarnings', descKey: 'tabEarningsDesc' },
  { id: 'news', icon: 'newspaper', labelKey: 'tabNews', descKey: 'tabNewsDesc' }
]

// SVG icons for tabs
const TabIcon = ({ type, className }) => {
  switch (type) {
    case 'lightning':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    case 'chart':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    case 'newspaper':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      )
    case 'cog':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    default:
      return null
  }
}

function TabNavigation({ activeTab, onTabChange, isAdmin }) {
  const { t } = useI18n()

  // Build tabs array with optional admin tab
  const allTabs = useMemo(() => {
    const tabs = [...TABS]
    if (isAdmin) {
      tabs.push({ id: 'admin', icon: 'cog', labelKey: 'tabAdmin', descKey: null })
    }
    return tabs
  }, [isAdmin])

  return (
    <div className="mb-6">
      {/* Tab buttons - responsive: horizontal scroll on mobile, wrap on larger screens */}
      <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 md:flex-wrap scrollbar-hide">
        {allTabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm
                transition-all duration-200
                ${isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
                }
              `}
            >
              <TabIcon type={tab.icon} className="w-4 h-4" />
              <span>{t(tab.labelKey)}</span>
            </button>
          )
        })}
      </div>

      {/* Description for active tab */}
      {allTabs.find(tab => tab.id === activeTab)?.descKey && (
        <p className="mt-2 text-sm text-gray-500">
          {t(allTabs.find(tab => tab.id === activeTab).descKey)}
        </p>
      )}
    </div>
  )
}

// Custom hook to manage tab state with localStorage persistence
export function useTabState(isAdmin) {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      // Validate saved tab
      if (saved === 'radar' || saved === 'earnings' || saved === 'news') {
        return saved
      }
      if (saved === 'admin' && isAdmin) {
        return saved
      }
    }
    return DEFAULT_TAB
  })

  // Persist tab choice to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, activeTab)
    }
  }, [activeTab])

  // If admin tab was selected but admin mode is now off, fallback to radar
  useEffect(() => {
    if (activeTab === 'admin' && !isAdmin) {
      setActiveTab(DEFAULT_TAB)
    }
  }, [activeTab, isAdmin])

  return [activeTab, setActiveTab]
}

export default TabNavigation
