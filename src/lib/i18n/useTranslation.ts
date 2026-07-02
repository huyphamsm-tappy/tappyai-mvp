'use client'

import { useEffect, useState } from 'react'
import { dictionaries, type Locale } from './dictionaries'

const STORAGE_KEY = 'tappy_lang'

// Default Language (Localization_Architecture.md §2.2): device locale, no
// first-launch picker. Falls back to English only when the device locale
// can't be determined at all — not "anything non-Vietnamese", per the
// explicit instruction ("lấy ngôn ngữ hệ thống... nếu không xác định được:
// fallback English"). A signed-in user's stored `profiles.language` (synced
// via /api/profile/language) takes priority once loaded; until then this
// falls back to the same localStorage-cached pattern Header.tsx already uses
// for the dark-mode preference, so the choice survives reloads with zero
// network round-trip.
function detectLocale(): Locale {
  if (typeof navigator === 'undefined' || !navigator.language) return 'en'
  return navigator.language.toLowerCase().startsWith('vi') ? 'vi' : 'en'
}

export function getStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'vi' || stored === 'en' ? stored : null
}

export function setStoredLocale(locale: Locale) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, locale)
}

export function useTranslation() {
  const [locale, setLocale] = useState<Locale>('vi')

  useEffect(() => {
    setLocale(getStoredLocale() ?? detectLocale())
  }, [])

  const t = (key: string, vars?: Record<string, string>) => {
    let str = dictionaries[locale][key] ?? dictionaries.vi[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v)
    }
    return str
  }

  const changeLocale = (next: Locale) => {
    setStoredLocale(next)
    setLocale(next)
  }

  return { t, locale, setLocale: changeLocale }
}
