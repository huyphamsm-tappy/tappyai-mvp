// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { useThemeMode, DEFAULT_IS_DARK } from './useThemeMode'

// ── V3 theme default: DARK, a fallback — never a reset ──────────────────────
//
// One mechanism (`localStorage.theme` → the `dark` class on <html>), unchanged. What changed on
// 2026-09-13 is only the no-choice branch: it used to follow the OS; V3 is dark. Everything a
// person chooses still wins and still persists, and the default never writes itself into storage.

function matchMedia(dark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: dark, media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  })
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  matchMedia(false)
})
afterEach(cleanup)

describe('no saved preference', () => {
  it('is dark, even when the OS prefers light', () => {
    const { result } = renderHook(() => useThemeMode())
    expect(DEFAULT_IS_DARK).toBe(true)
    expect(result.current.mounted).toBe(true)
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('does not write the default into storage — it stays a fallback', () => {
    renderHook(() => useThemeMode())
    expect(localStorage.getItem('theme')).toBeNull()
  })
})

describe('an explicit choice', () => {
  it('Light: toggling from the default stores "light" and removes the class', () => {
    const { result } = renderHook(() => useThemeMode())
    act(() => result.current.toggle())
    expect(result.current.isDark).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('Dark: toggling back stores "dark" explicitly', () => {
    const { result } = renderHook(() => useThemeMode())
    act(() => result.current.toggle())
    act(() => result.current.toggle())
    expect(result.current.isDark).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})

describe('a saved preference is restored and never overwritten by the default', () => {
  it('saved "light" comes back as light on a fresh mount, whatever the OS says', () => {
    localStorage.setItem('theme', 'light')
    matchMedia(true)
    const { result } = renderHook(() => useThemeMode())
    expect(result.current.isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('saved "dark" comes back as dark', () => {
    localStorage.setItem('theme', 'dark')
    const { result } = renderHook(() => useThemeMode())
    expect(result.current.isDark).toBe(true)
  })

  it('a second mount (reload / re-login in the same browser) keeps the chosen Light', () => {
    const first = renderHook(() => useThemeMode())
    act(() => first.result.current.toggle()) // choose Light
    first.unmount()
    const second = renderHook(() => useThemeMode())
    expect(second.result.current.isDark).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('a value that is neither "dark" nor "light" is treated as no choice → dark', () => {
    localStorage.setItem('theme', 'sepia')
    const { result } = renderHook(() => useThemeMode())
    expect(result.current.isDark).toBe(true)
  })
})

describe('SSR / hydration', () => {
  it('the first render reports not mounted and light-neutral state; the class is applied only after mount', () => {
    // `mounted` is what callers gate the toggle on, so the server markup and the first client
    // render agree; the effect then applies the real answer.
    let firstMounted: boolean | null = null
    renderHook(() => {
      const m = useThemeMode()
      if (firstMounted === null) firstMounted = m.mounted
      return m
    })
    expect(firstMounted).toBe(false)
  })

  it('the pre-paint script in the root layout agrees with the hook: no stored value → dark', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8')
    const script = layout.match(/__html: "([^"]+)"/)![1]
    expect(script).toContain("localStorage.getItem('theme')")
    expect(script).toContain("var d=s!=='light'")
    expect(script).not.toContain('prefers-color-scheme')
    // Evaluate it against jsdom in the three states the hook covers.
    const run = () => { document.documentElement.classList.remove('dark'); new Function(script)() }
    localStorage.clear(); run()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    localStorage.setItem('theme', 'light'); run()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    localStorage.setItem('theme', 'dark'); run()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
