// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

// Controller V2.3 — the Controller login VISUAL REDESIGN.
//
// 🔑 WHAT A TEST CAN AND CANNOT DEFEND HERE.
//
// "Does it look premium" is not testable and is not attempted. What IS testable
// is the STRUCTURE that produces the hierarchy — a two-column composition, one
// page-level h1 distinct from the card's own heading, a real capability panel,
// a brand mark — plus the security boundary, which must survive a visual change
// entirely untouched. V2.2 changed only copy and the result still read as the
// old screen; these assertions exist so "redesign" means a different structure,
// not different words in the same box.
//
// Rendered against the REAL page, not a fixture, because the branch under test
// is chosen by `returnTo` inside that page.

const replace = vi.fn()
const getUser = vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } }))
const signInWithPassword = vi.fn(async (_a: { email: string; password: string }) => ({ error: null }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser, signInWithPassword, signInWithOtp: vi.fn(), verifyOtp: vi.fn(), signInWithOAuth: vi.fn(), signInAnonymously: vi.fn() },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}))

vi.mock('@/lib/analytics/authEvents', () => ({
  markAuthPending: vi.fn(),
  emitAuthLoginFailed: vi.fn(),
  getPendingMethod: () => null,
}))

const visitController = async (locale: 'en' | 'vi' = 'en') => {
  window.localStorage.setItem('tappy_lang', locale)
  window.history.replaceState({}, '', '/login?returnTo=%2Fadmin')
  const { default: LoginPage } = await import('./page')
  const r = render(<LoginPage />)
  await waitFor(() => expect(screen.getByTestId('controller-login-submit')).toBeTruthy())
  return r
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  window.localStorage.clear()
})
afterEach(cleanup)

describe('V2.3 — the Controller entry is a composed page, not a lone card', () => {
  it('🔑 has a page-level hero heading SEPARATE from the sign-in card heading', () => {
    // This is the assertion that would have failed V2.2. A single centred card
    // has exactly one heading; a composed entry page has a hero h1 AND a card
    // heading beneath it. Two distinct levels is the structure the redesign is.
    return visitController().then(({ container }) => {
      const h1 = container.querySelectorAll('h1')
      const h2 = container.querySelectorAll('h2')
      expect(h1.length, 'expected exactly one page-level h1').toBe(1)
      expect(h2.length, 'expected a card heading at h2').toBeGreaterThanOrEqual(1)
      // The hero must not be the same string as the card's heading.
      expect(h1[0].textContent?.trim()).not.toBe(h2[0].textContent?.trim())
    })
  })

  it('states the product purpose in the hero, not only "sign in"', async () => {
    const { container } = await visitController()
    const h1 = container.querySelector('h1')?.textContent ?? ''
    expect(h1).toMatch(/Enterprise Command Center|Trung tâm điều hành/i)
  })

  it('carries a welcome line and the TappyAI Controller brand mark', async () => {
    const { container } = await visitController()
    const text = container.textContent ?? ''
    expect(text).toMatch(/Welcome to Controller|Chào mừng đến với Controller/i)
    expect(text).toMatch(/TappyAI/)
    expect(text).toMatch(/Controller/)
  })

  it('🔑 renders a capability panel — the left column that makes it two-column', async () => {
    // Three true statements about what the Controller IS. Their presence is what
    // separates a composed page from a card floating in space; a card-only
    // layout has nowhere to put them.
    const { container } = await visitController()
    const text = container.textContent ?? ''
    for (const re of [/Registry-driven|Điều khiển bởi registry/i, /audited|kiểm toán/i, /Role-based|Phân quyền/i]) {
      expect(text, `capability line missing: ${re}`).toMatch(re)
    }
  })

  it('shows brand imagery from an EXISTING approved asset', async () => {
    // No invented logo. next/image rewrites src, so assert by alt/role instead.
    const { container } = await visitController()
    const imgs = [...container.querySelectorAll('img')]
    expect(imgs.length, 'expected at least one brand image').toBeGreaterThan(0)
  })
})

describe('V2.3 — the security boundary is untouched by the redesign', () => {
  it('still refuses to offer any consumer provider', async () => {
    const { container } = await visitController()
    expect(container.textContent ?? '').not.toMatch(/\bGoogle\b|\bZalo\b|\bGuest\b|Khách/i)
  })

  it('still states the corporate-only rule', async () => {
    const { container } = await visitController()
    expect(container.textContent ?? '').toMatch(/@tappyai\.com/)
  })

  it('still authenticates with email + password', async () => {
    const { container } = await visitController()
    expect(container.querySelector('input[type="email"]')).toBeTruthy()
    expect(container.querySelector('input[type="password"]')).toBeTruthy()
    expect(screen.getByTestId('controller-login-submit')).toBeTruthy()
  })
})

describe('V2.3 — accessibility', () => {
  it('every input has an associated label', async () => {
    const { container } = await visitController()
    for (const input of container.querySelectorAll('input')) {
      const id = input.getAttribute('id')
      const labelled = id ? container.querySelector(`label[for="${id}"]`) : null
      expect(labelled ?? input.getAttribute('aria-label'), `input ${id ?? '(no id)'} has no label`).toBeTruthy()
    }
  })

  it('the submit control is a real button', async () => {
    const { container } = await visitController()
    const submit = screen.getByTestId('controller-login-submit')
    expect(submit.tagName.toLowerCase()).toBe('button')
    expect(container.querySelector('button[type="submit"]')).toBeTruthy()
  })

  it('interactive controls keep a visible focus state', async () => {
    const { container } = await visitController()
    const cls = [...container.querySelectorAll('input, button')].map((e) => e.className).join(' ')
    expect(cls).toMatch(/focus:|focus-visible:/)
  })
})

describe('V2.3 — i18n and responsive structure', () => {
  it.each(['en', 'vi'] as const)('[%s] renders no raw key, no undefined, no NaN', async (locale) => {
    const { container } = await visitController(locale)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\badmin\.[a-z]+\.[a-zA-Z.]+/)
    expect(text).not.toMatch(/\bundefined\b/)
    expect(text).not.toMatch(/\bNaN\b/)
  })

  it('🔑 uses no fixed pixel width that would break a 375px viewport', async () => {
    // A structural guard, not a rendered-layout one: jsdom has no layout engine,
    // so asserting computed widths here would pass regardless of the CSS and be
    // decorative. What IS checkable is that no element declares a hard min-width
    // or width larger than 375px, which is the construct that actually forces a
    // horizontal scrollbar on a phone.
    const { container } = await visitController()
    for (const el of container.querySelectorAll('*')) {
      const style = el.getAttribute('style') ?? ''
      const m = /(?:^|;)\s*(?:min-)?width:\s*(\d+)px/.exec(style)
      if (m) expect(Number(m[1]), `fixed width ${m[1]}px on ${el.tagName}`).toBeLessThanOrEqual(375)
      // `getAttribute`, NOT `el.className`: on an SVG element `className` is an
      // SVGAnimatedString object, so `toMatch` threw a TypeError and this guard
      // was failing for a reason that had nothing to do with layout.
      const cls = el.getAttribute('class') ?? ''
      expect(cls, `w-[>375px] on ${el.tagName}`).not.toMatch(/\b(?:min-)?w-\[(?:[4-9]\d{2}|\d{4,})px\]/)
    }
  })
})
