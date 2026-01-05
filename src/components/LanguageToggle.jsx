import React from 'react'
import { useI18n } from '../i18n/I18nProvider'

function LanguageToggle() {
  const { lang, setLang } = useI18n()

  return (
    <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <button
        onClick={() => setLang('tr')}
        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
          lang === 'tr'
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-700'
        }`}
      >
        TR
      </button>
      <div className="w-px h-6 bg-gray-700" />
      <button
        onClick={() => setLang('en')}
        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
          lang === 'en'
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-700'
        }`}
      >
        EN
      </button>
    </div>
  )
}

export default LanguageToggle
