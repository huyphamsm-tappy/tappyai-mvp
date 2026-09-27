// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/privacy',
  useSearchParams: () => new URLSearchParams(),
}))

import PrivacyPage from './page'
import { en as legalEn, vi as legalVi } from '@/lib/i18n/legal'
import { setLocale } from '@/lib/i18n/useTranslation'

// The privacy policy is the URL in App Store Connect and the Play Console, and both stores compare
// it with what the apps do. These assertions pin the disclosures the 2026-09-27 audit found
// missing (date of birth, precise location, Google Web Risk, Apple purchases, group answers
// visible by link) so a later edit cannot quietly drop one, and they render the real page so a
// bullet count that is too high (a raw key on screen) or too low (a clause silently not shown)
// fails here.

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i

function renderIn(locale: 'en' | 'vi') {
  setLocale(locale)
  return render(<PrivacyPage />)
}

beforeEach(() => {
  window.localStorage.clear()
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
})
afterEach(() => cleanup())

describe('privacy policy — both editions', () => {
  const keys = Object.keys(legalEn).filter((k) => k.startsWith('legal.privacy.'))

  it('the English and Vietnamese key sets are identical', () => {
    const viKeys = Object.keys(legalVi).filter((k) => k.startsWith('legal.privacy.'))
    expect(viKeys.sort()).toEqual([...keys].sort())
    for (const k of keys) expect(legalVi[k], `${k} untranslated`).not.toBe(legalEn[k])
  })

  it('every key renders — no raw key on screen, no English clause missing', () => {
    for (const locale of ['en', 'vi'] as const) {
      cleanup()
      renderIn(locale)
      const text = document.body.textContent ?? ''
      expect(text, locale).not.toMatch(/legal\.privacy\./)
      const dict = locale === 'en' ? legalEn : legalVi
      for (const k of keys) expect(text, `${locale}: ${k} not rendered`).toContain(dict[k])
    }
  })

  it('the English edition has no Vietnamese prose', () => {
    renderIn('en')
    const words = (document.body.textContent ?? '').split(/\s+/)
    expect(words.filter((w) => w.length > 2 && VIETNAMESE.test(w))).toEqual([])
  })

  it('the two editions have the same sections', () => {
    renderIn('en')
    const en = document.querySelectorAll('h2').length
    cleanup()
    renderIn('vi')
    expect(document.querySelectorAll('h2').length).toBe(en)
    expect(en).toBe(8)
  })
})

describe('privacy policy — what the audit found the apps actually collect', () => {
  const text = Object.entries(legalEn)
    .filter(([k]) => k.startsWith('legal.privacy.'))
    .map(([, v]) => v)
    .join('\n')

  it.each([
    ['date of birth for the 18+ check', /date of birth/i],
    ['that the AI provider never receives the date of birth', /never sent to our AI provider/i],
    ['precise location, and that it is not stored', /Precise location[\s\S]*not saved to your account/i],
    ['the phone number taken for bookings', /phone number/i],
    ['Anthropic as the AI provider', /Anthropic/],
    ['Google Web Risk for Scam Shield', /Google Web Risk/],
    ['Apple as the iOS payment processor', /In the iOS app, payment is handled by Apple/],
    ['group answers visible to link holders', /visible to everyone who has the group’s link/],
    ['messages sent to other users', /messages you send to other users/i],
    ['the 18+ audience', /People Under 18/],
  ])('discloses %s', (_label, pattern) => {
    expect(text).toMatch(pattern)
  })

  it('no longer says deletion is only possible by contacting support', () => {
    // The old s5.b3 ("Request deletion of your account … by contacting our support team") stopped
    // being the whole truth once self-service deletion exists; the page now points at
    // /delete-account, which describes both routes.
    expect(text).not.toMatch(/Request deletion of your account and associated data by contacting/)
    expect(text).toMatch(/delete-account/)
  })
})
