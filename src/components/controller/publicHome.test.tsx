// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ControllerPublicHome } from './ControllerPublicHome'
import { setLocale } from '@/lib/i18n/useTranslation'
import { isControllerLoginEntry } from '@/lib/auth/controllerLoginEntry'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'

// Controller V2 — Public Home, the VIEW.
//
// The Owner approved a specific design. These tests pin the parts of it that
// carry MEANING — the brand, the headline, the one call to action, the four
// value cards, the footer — in BOTH languages, and pin the one behaviour the
// page has: the sign-in button goes to /login.
//
// They deliberately do not assert colours, spacing or class names. Those are
// the design's business and change without the page being wrong; asserting them
// would produce a suite that fails on every visual tweak and proves nothing
// about whether the page works.

const renderIn = (locale: 'vi' | 'en') => {
  setLocale(locale)
  return render(<ControllerPublicHome />)
}

describe('Controller Public Home — what the visitor sees', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it.each(['vi', 'en'] as const)('[%s] carries the Controller branding', (locale) => {
    renderIn(locale)
    // "TappyAI" and "Controller" are proper nouns and identical in both
    // locales — the brand must not be translated.
    expect(screen.getAllByText(/TappyAI/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Controller/).length).toBeGreaterThan(0)
  })

  it.each(['vi', 'en'] as const)('[%s] states what the product is', (locale) => {
    renderIn(locale)
    const strings = locale === 'vi' ? viStrings : enStrings
    expect(screen.getByText(strings['admin.publicHome.headline'])).toBeTruthy()
    expect(screen.getByText(strings['admin.publicHome.tagline'])).toBeTruthy()
    expect(screen.getByText(strings['admin.publicHome.subtagline'])).toBeTruthy()
  })

  it.each(['vi', 'en'] as const)('[%s] offers exactly one way in, and it goes to /login', (locale) => {
    renderIn(locale)
    const strings = locale === 'vi' ? viStrings : enStrings
    const signIn = screen.getAllByRole('link', { name: new RegExp(strings['admin.publicHome.signIn'], 'i') })

    // The design shows the button twice (header + hero). Both must be real
    // links to the same real destination — never a button that does nothing.
    //
    // ⚠️ THIS ASSERTION USED TO READ `toBe('/login')`, AND THAT PINNED A BUG.
    // A bare `/login` gets the CONSUMER card: `/login` serves two products and
    // chooses by `returnTo`. So the Controller's own front door offered Google
    // and Zalo to somebody who came to sign in to the Controller. The test was
    // green the whole time because the Public Home was written before the
    // Controller card existed. Found by production E2E; see
    // `publicHomeLoginDestination.test.tsx`, which checks the destination
    // against the login page's own rule rather than against a literal.
    expect(signIn.length).toBeGreaterThan(0)
    for (const link of signIn) {
      const href = link.getAttribute('href') ?? ''
      expect(href.startsWith('/login')).toBe(true)
      expect(isControllerLoginEntry(href.slice(href.indexOf('?')))).toBe(true)
    }
  })

  it.each(['vi', 'en'] as const)('[%s] shows the four value cards from the approved design', (locale) => {
    renderIn(locale)
    const strings = locale === 'vi' ? viStrings : enStrings
    const features = screen.getByTestId('controller-public-home-features')

    for (const key of ['monitor', 'secure', 'insight', 'decide']) {
      expect(within(features).getByText(strings[`admin.publicHome.feature.${key}.title`])).toBeTruthy()
      expect(within(features).getByText(strings[`admin.publicHome.feature.${key}.body`])).toBeTruthy()
    }
  })

  it.each(['vi', 'en'] as const)('[%s] shows the six team chips and the footer', (locale) => {
    renderIn(locale)
    const strings = locale === 'vi' ? viStrings : enStrings
    for (const key of ['marketing', 'data', 'sales', 'engineering', 'security', 'support']) {
      expect(screen.getByText(strings[`admin.publicHome.team.${key}`])).toBeTruthy()
    }
    expect(screen.getByText(strings['admin.publicHome.footer'])).toBeTruthy()
  })

  it.each(['vi', 'en'] as const)('[%s] renders no raw translation keys', (locale) => {
    renderIn(locale)
    // useTranslation falls back to the KEY on a miss, so a key missing from a
    // locale renders as `admin.publicHome.…` on the page instead of throwing.
    expect(document.body.textContent).not.toMatch(/admin\.publicHome\./)
  })

  it('the "learn more" affordance leads somewhere real — no fake interaction', () => {
    renderIn('vi')
    const learnMore = screen.getByRole('link', {
      name: new RegExp(viStrings['admin.publicHome.learnMore'], 'i'),
    })
    // It scrolls to the section that actually explains the product. A control
    // that looks clickable and does nothing is the thing being forbidden here.
    expect(learnMore.getAttribute('href')).toBe('#controller-public-home-features')
  })

  it('the language control actually switches the page, not just itself', async () => {
    const user = userEvent.setup()
    renderIn('vi')
    expect(screen.getByText(viStrings['admin.publicHome.headline'])).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /english|EN/i }))

    expect(screen.getByText(enStrings['admin.publicHome.headline'])).toBeTruthy()
    expect(screen.queryByText(viStrings['admin.publicHome.headline'])).toBeNull()
  })

  it('the mascot is present and carries a translated alternative text', () => {
    renderIn('vi')
    const mascot = screen.getByAltText(viStrings['admin.publicHome.mascotAlt'])
    expect(mascot).toBeTruthy()
  })
})

describe('Controller Public Home — the catalogue backs every string it needs', () => {
  const KEYS = [
    'admin.publicHome.badge',
    'admin.publicHome.headline',
    'admin.publicHome.headlineBrand',
    'admin.publicHome.tagline',
    'admin.publicHome.subtagline',
    'admin.publicHome.signIn',
    'admin.publicHome.learnMore',
    'admin.publicHome.featuresTitle',
    'admin.publicHome.trustedBy',
    'admin.publicHome.footer',
    'admin.publicHome.mascotAlt',
    ...['monitor', 'secure', 'insight', 'decide'].flatMap((k) => [
      `admin.publicHome.feature.${k}.title`,
      `admin.publicHome.feature.${k}.body`,
    ]),
    ...['marketing', 'data', 'sales', 'engineering', 'security', 'support'].map(
      (k) => `admin.publicHome.team.${k}`
    ),
  ]

  it.each(KEYS)('%s exists in Vietnamese and is not empty', (key) => {
    expect(viStrings[key]).toBeTruthy()
  })

  it.each(KEYS)('%s exists in English and is not empty', (key) => {
    expect(enStrings[key]).toBeTruthy()
  })

  it('Vietnamese and English are actually different where they should be', () => {
    // A copy-paste that leaves English text in the Vietnamese catalogue passes
    // every parity check ever written — both locales have the key.
    expect(viStrings['admin.publicHome.tagline']).not.toBe(enStrings['admin.publicHome.tagline'])
    expect(viStrings['admin.publicHome.headline']).not.toBe(enStrings['admin.publicHome.headline'])
  })
})
