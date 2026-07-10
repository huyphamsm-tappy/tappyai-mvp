'use client'

import { useEffect, useState } from 'react'
import { getStoredLocale, setLocale } from '@/lib/i18n/useTranslation'
import type { Locale } from '@/lib/i18n/dictionaries'
import { TappyMascot } from '@/components/TappyMascot'

// First-visit language chooser. Shows once — the moment a locale is stored
// (either here or later in Settings) getStoredLocale() stops returning null and
// this never renders again. Bilingual on purpose so it reads regardless of the
// visitor's language. Anonymous users just get localStorage; the PATCH is a
// best-effort sync for logged-in accounts and is ignored (401) otherwise.
export default function LanguagePicker() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (getStoredLocale() === null) setShow(true)
  }, [])

  const choose = (lang: Locale) => {
    setLocale(lang)
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    }).catch(() => {})
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
        <div className="text-center mb-5">
          <div className="flex justify-center mb-2">
            <TappyMascot pose="welcome" size={72} eager animated />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Chọn ngôn ngữ</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Choose your language</p>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => choose('vi')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 border-gray-100 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950/30 active:scale-[0.98] transition-all"
          >
            <span className="text-2xl">🇻🇳</span>
            <span className="font-semibold text-gray-900 dark:text-white">Tiếng Việt</span>
          </button>
          <button
            onClick={() => choose('en')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 border-gray-100 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950/30 active:scale-[0.98] transition-all"
          >
            <span className="text-2xl">🇬🇧</span>
            <span className="font-semibold text-gray-900 dark:text-white">English</span>
          </button>
        </div>
      </div>
    </div>
  )
}
