'use client'

import { useSyncExternalStore } from 'react'
import { dictionaries, type Locale } from './dictionaries'
import { w2vi, w2en } from './w2'

// Full lookup maps: base dictionary + per-screen wave modules layered on top.
// Namespaced keys make the merge collision-free.
const full: Record<Locale, Record<string, string>> = {
  vi: { ...dictionaries.vi, ...w2vi },
  en: { ...dictionaries.en, ...w2en },
}

const STORAGE_KEY = 'tappy_lang'

// A single app-wide reactive locale. The previous version kept locale in each
// component's own useState, so switching language in Settings never re-rendered
// Home/Chat/etc. — the toggle "did nothing". Now locale lives in one module
// store; every useTranslation() consumer subscribes and re-renders on change.
let current: Locale | null = null
const listeners = new Set<() => void>()

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

function getSnapshot(): Locale {
  if (current) return current
  current = getStoredLocale() ?? detectLocale()
  return current
}

// SSR always renders the default so markup is deterministic; the client
// reconciles to the stored/device locale right after hydration.
function getServerSnapshot(): Locale {
  return 'vi'
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

// Change language app-wide. Persists to localStorage and notifies every
// subscriber so the whole UI re-renders in the new language immediately.
export function setLocale(next: Locale) {
  if (current === next) return
  current = next
  setStoredLocale(next)
  listeners.forEach((l) => l())
}

export function translate(locale: Locale, key: string, vars?: Record<string, string>): string {
  let str = full[locale]?.[key] ?? full.vi[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v)
  return str
}

export function useTranslation() {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const t = (key: string, vars?: Record<string, string>) => translate(locale, key, vars)
  return { t, locale, setLocale }
}
