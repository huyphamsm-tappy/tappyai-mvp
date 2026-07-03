'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import { Globe } from 'lucide-react'

const LANGUAGES = [
  { code: 'vi' as const, label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en' as const, label: 'English', flag: '🇬🇧' },
]

export default function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation()

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
        <Globe size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Ngôn ngữ / Language</p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {LANGUAGES.map(lang => (
          <button
            key={lang.code}
            onClick={() => setLocale(lang.code)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              locale === lang.code
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {lang.flag} {lang.code.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}
