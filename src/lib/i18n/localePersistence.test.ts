// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { setLocale, getStoredLocale, setStoredLocale } from './useTranslation'

// Regression for the "language popup reappears every time" bug: setLocale used to
// early-return (skipping the localStorage write) whenever the chosen locale already
// equalled the in-memory `current` — which on first visit is the auto-detected
// locale. So a user picking the language matching their browser never got it
// persisted, and the first-visit picker (shown while getStoredLocale() === null)
// came back on every refresh/restart/logout.

describe('setLocale persistence', () => {
  beforeEach(() => { localStorage.clear() })

  it('writes the chosen locale to localStorage', () => {
    setLocale('vi')
    expect(getStoredLocale()).toBe('vi')
  })

  it('STILL persists when the chosen locale equals the already-active one (the bug)', () => {
    setLocale('en')                       // current becomes 'en', localStorage set
    localStorage.removeItem('tappy_lang') // simulate: chosen == detected, nothing persisted yet
    setLocale('en')                       // next === current → old code early-returned WITHOUT writing
    expect(getStoredLocale()).toBe('en')  // fix: localStorage is written regardless
  })

  it('getStoredLocale returns null only when nothing is stored (the popup condition)', () => {
    expect(getStoredLocale()).toBeNull()
    setStoredLocale('vi')
    expect(getStoredLocale()).toBe('vi')
  })
})
