// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'

// LegalDocument renders the shared Header, which reads the App Router. The document itself is
// what is under test, so the router is stubbed rather than exercised.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/copyright',
  useSearchParams: () => new URLSearchParams(),
}))

import LegalDocument from '@/components/legal/LegalDocument'
import { bullets, type LegalDoc } from '@/components/legal/legalDoc'
import { en as legalEn, vi as legalVi } from '@/lib/i18n/legal'
import { setLocale } from '@/lib/i18n/useTranslation'

/**
 * U04 — the copyright policy renders in the reader's language, not just Vietnamese.
 *
 * ============================================================================
 * WHY THIS RENDERS THE DOCUMENT INSTEAD OF GREPPING THE PAGE
 * ============================================================================
 * The defect was invisible to every static check the project already had: the page carried an
 * English title, an English "Back" control and `<html lang="en">`, and only the BODY was
 * Vietnamese. A guard that inspects metadata, or counts literals in the route file, sees a
 * perfectly localized page.
 *
 * So this renders the real `LegalDocument` with the real dictionary and reads the resulting text —
 * the only level at which "English chrome over a Vietnamese body" is distinguishable from a page
 * that is actually in English.
 */

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i

/** The document shape, mirroring src/app/copyright/page.tsx. */
const COPYRIGHT: LegalDoc = {
  titleKey: 'legal.copyright.title',
  effectiveKey: 'legal.copyright.effective',
  sections: [
    { id: 's1', headingKey: 'legal.copyright.s1.heading', blocks: [{ kind: 'p', key: 'legal.copyright.s1.p1' }] },
    { id: 's2', headingKey: 'legal.copyright.s2.heading', blocks: [{ kind: 'p', key: 'legal.copyright.s2.p1' }] },
    {
      id: 's3',
      headingKey: 'legal.copyright.s3.heading',
      blocks: [
        { kind: 'p', key: 'legal.copyright.s3.p1' },
        { kind: 'lead', key: 'legal.copyright.s3.lead' },
        { kind: 'bullets', keys: bullets('legal.copyright.s3.b', 3) },
        { kind: 'note', key: 'legal.copyright.s3.note' },
      ],
    },
    {
      id: 's4',
      headingKey: 'legal.copyright.s4.heading',
      blocks: [
        { kind: 'p', key: 'legal.copyright.s4.p1' },
        { kind: 'email', labelKey: 'legal.copyright.agent', address: 'copyright@tappyai.com' },
      ],
    },
    { id: 's5', headingKey: 'legal.copyright.s5.heading', blocks: [{ kind: 'p', key: 'legal.copyright.s5.p1' }] },
  ],
}

/**
 * Render the document in `locale`.
 *
 * 🚨 Goes through `setLocale`, not `localStorage` directly. The locale lives in a module-level
 * store that reads storage once and then serves a cached value, so writing the key after the
 * module has loaded changes nothing — the first version of this test silently rendered English
 * for both cases. `setLocale` is also exactly what the LanguagePicker calls, so this exercises the
 * real path rather than a plausible-looking shortcut.
 */
function renderIn(locale: 'en' | 'vi') {
  setLocale(locale)
  return render(<LegalDocument doc={COPYRIGHT} />)
}

beforeEach(() => {
  window.localStorage.clear()
  // jsdom has no matchMedia; Header reads it to decide the dark-mode class. Light is fine — the
  // colour scheme has nothing to do with which language the document renders in.
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

describe('U04 — the copyright policy follows the reader’s language', () => {
  it('🚨 in English there is NO Vietnamese prose in the body', () => {
    // The exact defect: 197 of 237 words were Vietnamese while the chrome said English.
    renderIn('en')
    const text = document.body.textContent ?? ''
    const offenders = text
      .split(/\s+/)
      .filter((w) => w.length > 2 && VIETNAMESE.test(w))
    expect(offenders.slice(0, 12), 'Vietnamese words rendered in the English edition').toEqual([])
  })

  it('in English it renders real English policy text, not empty keys', () => {
    // The other failure shape: a missing key renders as the key itself, which contains no
    // Vietnamese and would sail past the assertion above.
    renderIn('en')
    expect(screen.getByText(/Music Copyright Policy/i)).toBeTruthy()
    expect(document.body.textContent).toMatch(/Original Sound/)
    expect(document.body.textContent).toMatch(/notice and takedown/i)
    expect(document.body.textContent).not.toMatch(/legal\.copyright\./)
  })

  it('in Vietnamese it renders the Vietnamese policy', () => {
    renderIn('vi')
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/Chính sách bản quyền/)
    expect(text).toMatch(/Điều kiện khi đăng nhạc/)
    expect(text).not.toMatch(/legal\.copyright\./)
  })

  it('the two editions are structurally identical', () => {
    // Different section counts mean one language is missing a clause of a legal document.
    renderIn('en')
    const enHeadings = [...document.querySelectorAll('h2')].length
    cleanup()
    renderIn('vi')
    const viHeadings = [...document.querySelectorAll('h2')].length
    expect(enHeadings).toBe(5)
    expect(viHeadings).toBe(enHeadings)
  })

  it('the takedown address is a real mailto in both languages', () => {
    // A rights holder has to be able to act on the page. Retyping an address from a screen is
    // where complaints get lost.
    for (const locale of ['en', 'vi'] as const) {
      cleanup()
      renderIn(locale)
      const link = document.querySelector('a[href="mailto:copyright@tappyai.com"]')
      expect(link, `${locale}: no mailto for the copyright agent`).toBeTruthy()
    }
  })

  it('🚨 the agent address is NOT the general support address', () => {
    // A takedown notice sent to support is a notice in the wrong queue.
    renderIn('en')
    expect(document.querySelector('a[href="mailto:support@tappyai.com"]')).toBeNull()
  })
})

describe('U04 — every copyright key exists in both languages', () => {
  const keys = Object.keys(legalEn).filter((k) => k.startsWith('legal.copyright.'))

  it('the key scan is not vacuous', () => {
    expect(keys.length).toBeGreaterThanOrEqual(18)
  })

  it('each key is present, non-empty and genuinely different per language', () => {
    for (const k of keys) {
      expect(legalVi[k], `VI missing ${k}`).toBeTruthy()
      expect(legalEn[k], `EN missing ${k}`).toBeTruthy()
      expect(legalVi[k], `${k} is the same string in both languages`).not.toBe(legalEn[k])
    }
  })

  it('the Vietnamese edition really is Vietnamese', () => {
    // Guards the guard: if someone "fixed" this by copying English into the vi map, the assertion
    // above still passes for every key that differs by a character.
    const viText = keys.map((k) => legalVi[k]).join(' ')
    expect(VIETNAMESE.test(viText)).toBe(true)
  })
})

describe('U04 — the page is wired to the shared renderer', () => {
  const page = readFileSync('src/app/copyright/page.tsx', 'utf8')

  it('uses LegalDocument rather than hand-written markup', () => {
    expect(page).toMatch(/<LegalDocument doc=\{COPYRIGHT\} \/>/)
  })

  it('holds no policy prose of its own', () => {
    // Structure here, strings in the dictionary — the property that keeps the editions in step.
    const body = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const viLines = body.split(/\r?\n/).filter((l) => VIETNAMESE.test(l))
    expect(viLines, 'Vietnamese prose is back in the route file').toEqual([])
  })

  it('publishes the same agent address the iOS screen does', () => {
    // One address, two clients. If they drift, half the rights holders write to a dead mailbox.
    //
    // 🔑 The web address lives in `landing/config.ts`, not in the page: a Next.js page module may
    // export only its own reserved names, so exporting the constant from the route failed the
    // build. The page imports it — asserted separately below.
    const config = readFileSync('src/components/landing/config.ts', 'utf8')
    const ios = readFileSync('ios/TappyAI/Features/Music/UI/CopyrightPolicyView.swift', 'utf8')
    expect(config).toMatch(/COPYRIGHT_AGENT_EMAIL = 'copyright@tappyai\.com'/)
    expect(ios).toContain('copyright@tappyai.com')
  })

  it('the page uses the shared constant rather than its own copy', () => {
    // A second literal in the page would satisfy the cross-client check above while drifting from
    // the value every other surface reads.
    expect(page).toMatch(/COPYRIGHT_AGENT_EMAIL/)
    expect(page, 'the address is hardcoded in the page instead of imported')
      .not.toMatch(/address: '[^']*@[^']*'/)
  })
})
