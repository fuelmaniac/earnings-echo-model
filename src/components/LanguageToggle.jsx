import React from 'react'
import { useI18n } from '../i18n/I18nProvider'

function LanguageToggle() {
  const { lang, setLang } = useI18n()

  return (
    <div className="flex items-center gap-1 bg-gray-800 rounded-lg border border-gray-700 p-1">
      <button
        onClick={() => setLang('tr')}
        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
          lang === 'tr'
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-700'
        }`}
        aria-pressed={lang === 'tr'}
        aria-label="Türkçe"
      >
        TR
      </button>
      <button
        onClick={() => setLang('en')}
        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
          lang === 'en'
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-700'
        }`}
        aria-pressed={lang === 'en'}
        aria-label="English"
      >
        EN
      </button>
    </div>
  )
}

export default LanguageToggle
