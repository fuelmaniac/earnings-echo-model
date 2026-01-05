import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import translations from './translations'

const STORAGE_KEY = 'ee:lang'
const DEFAULT_LANG = 'tr'

const LanguageContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_LANG
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'en' || stored === 'tr') return stored
    } catch (e) {
      // localStorage not available
    }
    return DEFAULT_LANG
  })

  // Persist language to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch (e) {
      // localStorage not available
    }
  }, [lang])

  const setLang = useCallback((newLang) => {
    if (newLang === 'en' || newLang === 'tr') {
      setLangState(newLang)
    }
  }, [])

  // Translation function with interpolation support
  const t = useCallback((key, vars = {}) => {
    const dict = translations[lang] || translations[DEFAULT_LANG]
    let text = dict[key]

    if (text === undefined) {
      // Fallback to English, then to key itself
      text = translations.en[key] || key
    }

    // Handle interpolation: {varName} -> value
    if (vars && typeof vars === 'object') {
      Object.entries(vars).forEach(([varKey, varValue]) => {
        text = text.replace(new RegExp(`\\{${varKey}\\}`, 'g'), String(varValue))
      })
    }

    return text
  }, [lang])

  const value = { lang, setLang, t }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}

export default I18nProvider
