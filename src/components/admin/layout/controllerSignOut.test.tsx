// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AdminShell } from './AdminShell'
import { setLocale } from '@/lib/i18n/useTranslation'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'

// Controller sign-out.
//
// 🔑 THE GAP THIS CLOSES. The Controller shell had NO way to sign out. The only
// thing that looked like one was the "back to app" link — which carries a
// `LogOut` icon, sits exactly where a sign-out belongs, and navigates to
// `/reviews` WITH THE SESSION STILL INTACT. An admin who clicks it believing
// they signed out has not: their session is live, and anyone on that machine can
// walk straight back into `/admin`.
//
// 🔑 ONE AUTH PRIMITIVE, NOT TWO. The consumer app already signs out via
// `supabase.auth.signOut()`. The Controller uses the SAME call through a shared
// helper, so there is exactly one place in the repo that tears a session down —
// asserted below. A second implementation is how the two drift into clearing
// different things.

// `vi.mock` factories are hoisted above every top-level declaration, so the
// spies they close over have to be hoisted with them.
const { push, refresh, signOut, emitAuthLogout } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  emitAuthLogout: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut } }) }))
vi.mock('@/lib/analytics/authEvents', () => ({ emitAuthLogout, markAuthPending: vi.fn(), emitAuthLoginFailed: vi.fn(), getPendingMethod: () => null }))

const ROOT = process.cwd()

const shell = (locale: 'vi' | 'en' = 'vi') => {
  setLocale(locale)
  return render(
    <AdminShell canonicalOrigin={null}
      role="admin"
      isOwner={false}
      email="ops@tappyai.com"
      navGroups={[]}
      env={{ label: 'Production', tone: 'production' } as never}
    >
      <div>content</div>
    </AdminShell>
  )
}

const signOutControl = () => screen.getByTestId('controller-sign-out')

describe('the Controller shell offers a real sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it.each(['vi', 'en'] as const)('[%s] a sign-out control is present and labelled', (locale) => {
    shell(locale)
    const strings = locale === 'vi' ? viStrings : enStrings
    const control = signOutControl()
    expect(control).toBeTruthy()
    expect(control.textContent ?? control.getAttribute('aria-label') ?? '').toContain(
      strings['admin.shell.signOut']
    )
  })

  it('it is NOT the "back to app" link', () => {
    // The two must be distinguishable controls doing different things. Before
    // this change the only LogOut-looking affordance navigated to /reviews and
    // left the session alive.
    shell()
    const control = signOutControl()
    expect(control.getAttribute('href')).toBeNull()
    expect(control.textContent).not.toContain(viStrings['admin.shell.app'])
  })

  it('the "back to app" link still exists and still goes to the consumer app', () => {
    // Not a replacement: leaving the Controller and ending a session are
    // different intentions and both remain available.
    const { container } = shell()
    expect(container.querySelector('a[href="/reviews"]')).toBeTruthy()
  })

  it('clicking it tears the session down through the existing primitive', async () => {
    shell()
    fireEvent.click(signOutControl())
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
  })

  it('it reports the logout for analytics BEFORE the session is gone', async () => {
    shell()
    fireEvent.click(signOutControl())
    await waitFor(() => expect(emitAuthLogout).toHaveBeenCalledTimes(1))
    expect(emitAuthLogout.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0]
    )
  })

  it('afterwards it sends the admin to the CONTROLLER login, not the consumer one', async () => {
    // `/login?returnTo=%2Fadmin` is what selects the Controller sign-in card and
    // what brings them back where they were. A bare `/login` would drop them on
    // the consumer card with Google and Zalo.
    shell()
    fireEvent.click(signOutControl())
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?returnTo=%2Fadmin'))
  })

  it('it refreshes so no server-rendered admin content survives in the router cache', async () => {
    shell()
    fireEvent.click(signOutControl())
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('a failing sign-out still leaves the Controller', async () => {
    // If the network call fails the session may be gone locally anyway; keeping
    // the admin on an admin screen that looks authenticated is the worse of the
    // two outcomes.
    signOut.mockRejectedValueOnce(new Error('network'))
    shell()
    fireEvent.click(signOutControl())
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?returnTo=%2Fadmin'))
  })
})

describe('no second authentication mechanism was introduced', () => {
  it('🔑 exactly ONE `auth.signOut()` call site exists in the whole app', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      const fs = require('node:fs') as typeof import('node:fs')
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) files.push(p)
      }
    }
    walk(join(ROOT, 'src'))

    // Comments legitimately NAME the primitive while explaining why there is
    // only one of it; the invariant is about CODE, so prose is stripped first.
    const callSites = files.filter((f) => {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      return /auth\.signOut\(/.test(code)
    })
    expect(callSites.map((f) => f.replace(ROOT, '').replace(/\\/g, '/'))).toEqual([
      '/src/lib/auth/signOut.ts',
    ])
  })

  it('the consumer sign-out goes through the same helper', () => {
    const consumer = readFileSync(join(ROOT, 'src/app/profile/SignOutButton.tsx'), 'utf8')
    expect(consumer).toContain("from '@/lib/auth/signOut'")
    expect(consumer).not.toContain('auth.signOut(')
  })
})

describe('the label exists in both locales', () => {
  it.each(['admin.shell.signOut'])('%s is present and translated', (key) => {
    expect(viStrings[key]).toBeTruthy()
    expect(enStrings[key]).toBeTruthy()
    expect(viStrings[key]).not.toBe(enStrings[key])
  })
})
