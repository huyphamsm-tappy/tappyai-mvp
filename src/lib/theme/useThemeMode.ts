'use client'

import { useCallback, useEffect, useState } from 'react'

// ── The app's ONE theme mechanism ───────────────────────────────────────────
//
// This is not a new theme architecture. It is the mechanism `Header.tsx` has
// always used, lifted out of that component so a second surface can share it
// instead of copying it:
//
//   • the choice lives in `localStorage.theme` as 'dark' | 'light'
//   • with nothing stored, V3 is DARK (2026-09-13) — the OS preference no longer
//     decides; a stored choice always wins, in either direction, and is never
//     overwritten by the default on a later load
//   • the result is the `dark` class on <html>, which is what Tailwind is
//     configured for (`darkMode: 'class'`) and what `.dark .v3-theme` keys off
//
// 🚨 It was copied once already. Header owned this logic inline, and the V3
// shell needed the same control; a second copy would have meant two components
// writing the same storage key with their own idea of the default, and they
// would have drifted the first time either changed. One hook, one contract.
//
// 🚨 `mounted` is not decoration. The stored choice cannot be read during SSR,
// so the first client render must match the server's — a toggle that renders
// its "sun" state on the server and its "moon" state on hydration is a React
// hydration mismatch AND a visible flicker. Callers render the control only
// once `mounted` is true.

const STORAGE_KEY = 'theme'

export interface ThemeMode {
  /** True when the dark palette is active. Meaningless until `mounted`. */
  isDark: boolean
  /** False during SSR and the first client render — see the note above. */
  mounted: boolean
  toggle: () => void
}

/**
 * Reads the stored choice; with none, the V3 default. Client only.
 *
 * 🚨 THE DEFAULT IS A FALLBACK, NOT A RESET. Only `resolveInitial` consults it, and only
 * when nothing is stored — a person who chose Light keeps Light on every later load and
 * login. Storage is never written here; `toggle` is the one writer.
 */
export const DEFAULT_IS_DARK = true

function resolveInitial(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark') return true
    if (saved === 'light') return false
  } catch {
    // Private mode / blocked storage: fall through to the default. A theme is a
    // convenience; it must never throw the surface that uses it.
  }
  return DEFAULT_IS_DARK
}

function apply(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
}

export function useThemeMode(): ThemeMode {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const initial = resolveInitial()
    setIsDark(initial)
    apply(initial)
    setMounted(true)
  }, [])

  const toggle = useCallback(() => {
    setIsDark(prev => {
      const next = !prev
      apply(next)
      try {
        localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
      } catch {
        // Storage can be unavailable; the class is already applied, so the
        // change still takes effect for this session. It simply will not persist.
      }
      return next
    })
  }, [])

  return { isDark, mounted, toggle }
}
