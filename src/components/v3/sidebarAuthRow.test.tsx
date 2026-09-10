// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

// ─────────────────────────────────────────────────────────────────────────────
// THE SESSION ROW.
//
// 🚨 THE BUG THIS PINS, as reported and then reproduced on localhost:
//
//   1. the sidebar said "Logout"        (it was a STATIC nav row — no auth check)
//   2. clicking it went to `/login`     (a Link, not a sign-out)
//   3. `/login` saw the browser's ANONYMOUS session, called it "signed in",
//      and replaced the route with `/`
//   4. Home still said "Logout", and a refresh still said "Logout"
//   5. nothing was ever signed out, so the anonymous 5/day quota kept counting
//
// The browser's session was real: `sb-…-auth-token` carried
// `"email":"", "amr":[{"method":"anonymous"}], "is_anonymous":true`.
//
// So the invariant under test is the one the report asked for:
//   member  → Logout, and clicking it performs the real teardown
//   visitor → Login  (an anonymous session is a visitor)
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  user: null as { id: string; is_anonymous?: boolean } | null,
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  emit: null as ((event: string, session: unknown) => void) | null,
  performSignOut: vi.fn(async () => {}),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: h.getUser,
      onAuthStateChange: h.onAuthStateChange,
    },
  }),
}))
vi.mock('@/lib/auth/signOut', () => ({ performSignOut: h.performSignOut }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: h.replace, refresh: h.refresh, push: vi.fn() }),
}))
vi.mock('@/components/NotificationProvider', () => ({ useNotifications: () => ({ unreadCount: 0 }) }))
vi.mock('@/components/BottomNav', () => ({ default: () => null }))
vi.mock('@/lib/theme/useThemeMode', () => ({ useThemeMode: () => ({ mode: 'dark', toggle: vi.fn() }) }))

import V3Shell from './V3Shell'
import { setLocale } from '@/lib/i18n/useTranslation'

beforeEach(() => {
  vi.clearAllMocks()
  setLocale('en')
  h.getUser.mockImplementation(async () => ({ data: { user: h.user } }))
  h.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    h.emit = cb
    return { data: { subscription: { unsubscribe: h.unsubscribe } } }
  })
})
afterEach(cleanup)

const shell = () => render(<V3Shell title="t">x</V3Shell>)

const member = { id: 'u-1', is_anonymous: false }
const visitor = { id: 'anon-1', is_anonymous: true }

describe('A — an authenticated member sees Logout', () => {
  it('renders the Logout row, and no Login row', async () => {
    h.user = member
    shell()
    expect(await screen.findByTestId('nav-logout')).toBeTruthy()
    expect(screen.queryByTestId('nav-login')).toBeNull()
    expect(screen.getByTestId('nav-logout').textContent).toContain('Logout')
  })
})

describe('B — clicking Logout runs the real sign-out', () => {
  it('🚨 calls performSignOut — the single auth.signOut() call site', async () => {
    h.user = member
    shell()
    fireEvent.click(await screen.findByTestId('nav-logout'))
    await waitFor(() => expect(h.performSignOut).toHaveBeenCalledTimes(1))
  })

  it('goes Home afterwards, and re-runs the server render', async () => {
    h.user = member
    shell()
    fireEvent.click(await screen.findByTestId('nav-logout'))
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/'))
    expect(h.refresh).toHaveBeenCalled()
  })

  it('🚨 signs out BEFORE navigating — the old order left the session alive', async () => {
    h.user = member
    const order: string[] = []
    h.performSignOut.mockImplementationOnce(async () => { order.push('signOut') })
    h.replace.mockImplementationOnce(() => { order.push('navigate') })
    shell()
    fireEvent.click(await screen.findByTestId('nav-logout'))
    await waitFor(() => expect(order).toEqual(['signOut', 'navigate']))
  })
})

describe('C — after sign-out the row becomes Login', () => {
  it('🚨 reacts to SIGNED_OUT without a page load', async () => {
    h.user = member
    shell()
    await screen.findByTestId('nav-logout')
    h.emit!('SIGNED_OUT', null)
    expect(await screen.findByTestId('nav-login')).toBeTruthy()
    expect(screen.queryByTestId('nav-logout')).toBeNull()
  })

  it('🚨 an anonymous session re-minted after sign-out is still a VISITOR', async () => {
    // `ensureAnonymousSession` gives the browser a new anonymous identity so the
    // free questions keep working. That must not read as "signed in" again.
    h.user = member
    shell()
    await screen.findByTestId('nav-logout')
    h.emit!('SIGNED_IN', { user: visitor })
    expect(await screen.findByTestId('nav-login')).toBeTruthy()
  })
})

describe('D — a refresh keeps the truth', () => {
  it('🚨 a fresh mount holding an ANONYMOUS session shows Login', async () => {
    // The reported symptom: refresh, still "Logout". This is that exact mount.
    h.user = visitor
    shell()
    expect(await screen.findByTestId('nav-login')).toBeTruthy()
    expect(screen.queryByTestId('nav-logout')).toBeNull()
    expect(screen.getByTestId('nav-login').getAttribute('href')).toBe('/login')
  })

  it('a fresh mount with NO session at all shows Login', async () => {
    h.user = null
    shell()
    expect(await screen.findByTestId('nav-login')).toBeTruthy()
  })

  it('a fresh mount holding a real account shows Logout', async () => {
    h.user = member
    shell()
    expect(await screen.findByTestId('nav-logout')).toBeTruthy()
  })
})

describe('G — a failed sign-out must not claim success', () => {
  it('🚨 the row stays Logout while the session survives', async () => {
    // The label is derived from the session, never set by the click. If the
    // teardown failed, telling somebody they are signed out is the dangerous lie.
    h.user = member
    h.performSignOut.mockImplementationOnce(async () => { /* session survives */ })
    shell()
    fireEvent.click(await screen.findByTestId('nav-logout'))
    await waitFor(() => expect(h.performSignOut).toHaveBeenCalled())
    expect(screen.getByTestId('nav-logout')).toBeTruthy()
    expect(screen.queryByTestId('nav-login')).toBeNull()
  })

  it('renders NEITHER row until the session has been resolved', async () => {
    // A guess here flashes the wrong word on every page load, and the wrong word
    // is the entire bug.
    let settle: (v: unknown) => void = () => {}
    h.getUser.mockImplementationOnce(() => new Promise(r => { settle = r }))
    shell()
    expect(screen.queryByTestId('nav-login')).toBeNull()
    expect(screen.queryByTestId('nav-logout')).toBeNull()
    settle({ data: { user: visitor } })
    expect(await screen.findByTestId('nav-login')).toBeTruthy()
  })
})

describe('the row is a real control, not a link that pretends', () => {
  it('Logout is a button; Login is a link to /login', async () => {
    h.user = member
    shell()
    expect((await screen.findByTestId('nav-logout')).tagName).toBe('BUTTON')
    cleanup()
    h.user = visitor
    shell()
    expect((await screen.findByTestId('nav-login')).tagName).toBe('A')
  })

  it('unsubscribes from auth changes on unmount', async () => {
    h.user = visitor
    const { unmount } = shell()
    await screen.findByTestId('nav-login')
    unmount()
    expect(h.unsubscribe).toHaveBeenCalled()
  })
})
