// @vitest-environment jsdom
/**
 * Regression test for the legal-page Back navigation bug.
 *
 * Bug: Settings → Privacy Policy → Back landed on Home instead of Settings.
 * The legal pages were consolidated into one shared LegalDocument that passed
 * `backHref="/"` to Header. With a `backHref`, Header renders a <Link>, which
 * *pushes* that route — so Back was a forward navigation to Home for everyone,
 * regardless of where they came from. Browser/Android Back were never affected;
 * only the in-app control was.
 *
 * Fix: the legal pages omit `backHref` so Back pops history via router.back(),
 * returning the user to whatever screen linked them. Because these documents are
 * also opened directly (deep links, the Google Play Console listing), Header
 * gained an optional `backFallbackHref` used only when there is no history entry
 * to pop — otherwise Back would dead-end, and in an Android TWA it would close
 * the app.
 *
 * These tests drive the REAL Header and lock in all three behaviours.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import Header from './Header'

const back = vi.fn()
const replace = vi.fn()
const push = vi.fn()

vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ back, replace, push, refresh: vi.fn() }) }))
vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }),
}))

// jsdom has no matchMedia, and Header's dark-mode effect reads it on mount.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

/** history.length is read-only, so stub the getter for the duration of a test. */
function setHistoryLength(n: number) {
  Object.defineProperty(window.history, 'length', { value: n, configurable: true })
}

describe('Header back navigation', () => {
  beforeEach(() => {
    back.mockClear()
    replace.mockClear()
    push.mockClear()
    localStorage.clear()
  })
  // The project registers no vitest setupFiles, so Testing Library's automatic
  // cleanup is not installed — without this, renders accumulate in the document
  // and role queries match elements from earlier tests.
  afterEach(() => {
    cleanup()
    setHistoryLength(1)
  })

  it('pops history instead of pushing a destination when no backHref is given', () => {
    setHistoryLength(5) // arrived here from another in-app screen
    render(<Header showBack backFallbackHref="/" />)

    fireEvent.click(screen.getByRole('button', { name: /common\.back/ }))

    expect(back).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('falls back to the declared route when the tab opened directly on the page', () => {
    setHistoryLength(1) // deep link / Play Console listing — nothing to pop
    render(<Header showBack backFallbackHref="/" />)

    fireEvent.click(screen.getByRole('button', { name: /common\.back/ }))

    // replace(), not push() — the dead-end entry must not be left in history.
    expect(replace).toHaveBeenCalledWith('/')
    expect(back).not.toHaveBeenCalled()
  })

  it('keeps plain router.back() for callers that declare no fallback', () => {
    // Pages that used showBack without backHref before this change must behave
    // exactly as they did, even with no history to pop.
    setHistoryLength(1)
    render(<Header showBack />)

    fireEvent.click(screen.getByRole('button', { name: /common\.back/ }))

    expect(back).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it('still renders a link for pages that declare a single fixed parent', () => {
    setHistoryLength(5)
    const { container } = render(<Header showBack backHref="/profile/settings" />)

    const link = container.querySelector('a[href="/profile/settings"]')
    expect(link).not.toBeNull()
    // A fixed parent must not render the history-popping button.
    expect(screen.queryByRole('button', { name: /common\.back/ })).toBeNull()
  })
})
