'use client'

import { useSyncExternalStore } from 'react'
import { dictionaries, type Locale } from './dictionaries'
import { w2vi, w2en } from './w2'
import { w3vi, w3en } from './w3'
import { vi as adminVi, en as adminEn } from './admin'
import { vi as landingVi, en as landingEn } from './landing'
import { vi as legalVi, en as legalEn } from './legal'
import { vi as shareVi, en as shareEn } from './share'

// Full lookup maps: base dictionary + per-screen wave modules layered on top.
// Namespaced keys make the merge collision-free.
const full: Record<Locale, Record<string, string>> = {
  vi: { ...dictionaries.vi, ...w2vi, ...w3vi, ...adminVi, ...landingVi, ...legalVi, ...shareVi },
  en: { ...dictionaries.en, ...w2en, ...w3en, ...adminEn, ...landingEn, ...legalEn, ...shareEn },
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
  // ALWAYS persist the explicit choice first — even when `next` already equals the
  // in-memory `current`. On first visit `current` is seeded to the auto-detected
  // locale (getSnapshot → detectLocale) BEFORE the user picks, so a user choosing the
  // language that matches their browser (the common case) hit the old early-return and
  // `tappy_lang` was never written → getStoredLocale() stayed null → the first-visit
  // LanguagePicker reappeared on every refresh / restart / logout. Writing here fixes it.
  setStoredLocale(next)
  if (current === next) return // already the active locale → no re-render needed
  current = next
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
