'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getStoredLocale, setLocale } from '@/lib/i18n/useTranslation'
import type { Locale } from '@/lib/i18n/dictionaries'
import { TappyMascot } from '@/components/TappyMascot'

// Surfaces that ask the language question THEMSELVES, in their own layout.
// Rendering this modal on top of one of them puts two language choosers on
// screen at once — and this one wins, because it is a full-screen z-[100]
// overlay. On the Controller's public home that made the design's own VI/EN
// toggle unclickable: it was visible, and `elementFromPoint` returned the
// modal. Exact paths, never prefixes: `/controller-guide` is a different page.
const OWNS_ITS_LANGUAGE_CONTROL = ['/controller']

// First-visit language chooser. Shows once — the moment a locale is stored
// (either here or later in Settings) getStoredLocale() stops returning null and
// this never renders again. Bilingual on purpose so it reads regardless of the
// visitor's language. Anonymous users just get localStorage; the PATCH is a
// best-effort sync for logged-in accounts and is ignored (401) otherwise.
export default function LanguagePicker() {
  const [show, setShow] = useState(false)
  const pathname = usePathname()
  const suppressed = OWNS_ITS_LANGUAGE_CONTROL.includes(pathname ?? '')

  useEffect(() => {
    if (suppressed) return
    if (getStoredLocale() === null) setShow(true)
  }, [suppressed])

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
          <p className="text-sm text-content-secondary">Choose your language</p>
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
