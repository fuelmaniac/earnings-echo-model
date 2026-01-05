import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import translations from './translations'

const STORAGE_KEY = 'ee:lang'
const DEFAULT_LANG = 'tr'

const LanguageContext = createContext(null)

/**
 * Interpolate variables in translation string
 * e.g., t("summaryCorrect", { correct: 7, total: 8 }) -> "7 / 8 predictions correct"
 */
function interpolate(str, vars = {}) {
  if (!str || typeof str !== 'string') return str
  return str.replace(/\{(\w+)\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match
  })
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    // Try to get from localStorage, default to Turkish
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'en' || saved === 'tr') {
        return saved
      }
    }
    return DEFAULT_LANG
  })

  // Persist language choice to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang)
    }
  }, [lang])

  const setLang = useCallback((newLang) => {
    if (newLang === 'en' || newLang === 'tr') {
      setLangState(newLang)
    }
  }, [])

  /**
   * Translation function
   * @param {string} key - Translation key
   * @param {object} vars - Optional interpolation variables
   * @returns {string} Translated string
   */
  const t = useCallback((key, vars) => {
    const dict = translations[lang] || translations[DEFAULT_LANG]
    const str = dict[key]
    if (str === undefined) {
      // Fallback to English if key not found in current language
      const fallback = translations.en[key]
      if (fallback !== undefined) {
        return interpolate(fallback, vars)
      }
      // Return key itself as last resort
      return key
    }
    return interpolate(str, vars)
  }, [lang])

  const value = {
    lang,
    setLang,
    t
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

/**
 * Hook to access language context
 * @returns {{ lang: string, setLang: (lang: string) => void, t: (key: string, vars?: object) => string }}
 */
export function useI18n() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}

export default I18nProvider
