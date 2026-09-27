// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'

// LegalDocument renders the shared Header, which reads the App Router. The document is what is
// under test, so the router is stubbed rather than exercised.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/support',
  useSearchParams: () => new URLSearchParams(),
}))

import LegalDocument from '@/components/legal/LegalDocument'
import { blockKeys } from '@/components/legal/legalDoc'
import { SUPPORT_EMAIL } from '@/components/landing/config'
import { en as legalEn, vi as legalVi } from '@/lib/i18n/legal'
import { setLocale } from '@/lib/i18n/useTranslation'
import { SUPPORT_DOC } from './supportDoc'

// /support is the Support URL in App Store Connect. Apple checks that it leads to real contact
// information, so the properties held here are: the support address is a working mailto in both
// languages, the three policy pages are one tap away, and no key renders as its own name.

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i

function renderIn(locale: 'en' | 'vi') {
  setLocale(locale)
  return render(<LegalDocument doc={SUPPORT_DOC} />)
}

/** Every translation key the document uses, whatever the block kind. */
const DOC_KEYS = [
  SUPPORT_DOC.titleKey,
  SUPPORT_DOC.effectiveKey,
  ...SUPPORT_DOC.sections.flatMap((s) => [s.headingKey, ...s.blocks.flatMap(blockKeys)]),
]

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

describe('/support renders in both languages', () => {
  it('every key it uses exists in both dictionaries, and differs between them', () => {
    expect(DOC_KEYS.length).toBeGreaterThanOrEqual(18)
    for (const k of DOC_KEYS) {
      expect(legalEn[k], `EN missing ${k}`).toBeTruthy()
      expect(legalVi[k], `VI missing ${k}`).toBeTruthy()
    }
    for (const k of DOC_KEYS.filter((k) => k.startsWith('legal.support.'))) {
      expect(legalVi[k], `${k} is the same string in both languages`).not.toBe(legalEn[k])
    }
  })

  it('in English there is no Vietnamese prose and no raw key', () => {
    renderIn('en')
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/Frequently asked questions/)
    expect(text.split(/\s+/).filter((w) => w.length > 2 && VIETNAMESE.test(w))).toEqual([])
    expect(text).not.toMatch(/legal\.support\./)
  })

  it('in Vietnamese it renders the Vietnamese page', () => {
    renderIn('vi')
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/Câu hỏi thường gặp/)
    expect(text).not.toMatch(/legal\.support\./)
  })

  it('the support address is a real mailto in both languages', () => {
    for (const locale of ['en', 'vi'] as const) {
      cleanup()
      renderIn(locale)
      expect(document.querySelector(`a[href="mailto:${SUPPORT_EMAIL}"]`), locale).toBeTruthy()
    }
  })

  it('links to the privacy policy, the terms and the account-deletion page', () => {
    renderIn('en')
    for (const href of ['/privacy', '/terms', '/delete-account']) {
      expect(document.querySelector(`a[href="${href}"]`), href).toBeTruthy()
    }
  })

  it('each FAQ answer is tied to its question in a description list', () => {
    renderIn('en')
    const faq = SUPPORT_DOC.sections.flatMap((s) => s.blocks).find((b) => b.kind === 'faq')
    const count = faq && faq.kind === 'faq' ? faq.items.length : 0
    expect(count).toBeGreaterThanOrEqual(5)
    expect(document.querySelectorAll('dl dt').length).toBeGreaterThanOrEqual(count)
    expect(document.querySelectorAll('dl dd').length).toBeGreaterThanOrEqual(count)
  })
})

describe('/support is public and discoverable', () => {
  it('the route renders the shared document, with no prose of its own', () => {
    const page = readFileSync('src/app/support/page.tsx', 'utf8')
    expect(page).toMatch(/<LegalDocument doc=\{SUPPORT_DOC\} \/>/)
    expect(page.split(/\r?\n/).filter((l) => VIETNAMESE.test(l))).toEqual([])
  })

  it('is linked from the landing footer', () => {
    expect(readFileSync('src/components/landing/LandingFooter.tsx', 'utf8')).toContain("href: '/support'")
  })
})
