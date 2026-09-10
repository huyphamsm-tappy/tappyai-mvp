// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import V3Shell from './V3Shell'
import BottomNav from '@/components/BottomNav'
import { SHOW_MARKETPLACE, SHOW_WALLET } from '@/lib/config/product'

// ─────────────────────────────────────────────────────────────────────────────
// Two features are NOT launched, and the navigation used to advertise both.
//
//   · Marketplace — a "Sắp có" page listed in the sidebar AND the tab bar.
//   · Wallet / Tappy Points — a sidebar row for a feature that does not exist in
//     this repository at all (no route, no API, no table), whose href went to
//     `/subscription`, i.e. somewhere else entirely.
//
// The rule this file enforces is HIDDEN, NOT DELETED: no user-facing entry point
// while the flag is false, and the implementation still on disk so the flag is
// all that stands between here and launch. Deleting the feature would pass the
// first half of that and fail the product.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(cleanup)

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** Every link the shell and the bottom nav render, as a user could follow them. */
function navHrefs(container: HTMLElement): string[] {
  return [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')
}

describe('unlaunched features are hidden from the current product', () => {
  it('🚨 Marketplace has no entry point anywhere in the V3 shell', () => {
    expect(SHOW_MARKETPLACE, 'this test describes the flag being OFF').toBe(false)
    const { container } = render(<V3Shell title="Trang chủ"><div /></V3Shell>)

    expect(navHrefs(container).filter((h) => h.startsWith('/marketplace'))).toEqual([])
    expect(screen.queryByText(/marketplace/i)).toBeNull()
    // Vietnamese label, in case the dictionary is the one rendering.
    expect(screen.queryByText(/chợ|gian hàng/i)).toBeNull()
  })

  it('🚨 Wallet / Tappy Points has no entry point anywhere in the V3 shell', () => {
    expect(SHOW_WALLET, 'this test describes the flag being OFF').toBe(false)
    const { container } = render(<V3Shell title="Trang chủ"><div /></V3Shell>)

    expect(screen.queryByText(/wallet|tappy points/i)).toBeNull()
    expect(screen.queryByText(/^ví|số dư/i)).toBeNull()
    // The row's href was `/subscription`; the premium upsell legitimately uses that
    // route, so the assertion is about the WALLET LABEL, not about the route.
    expect(navHrefs(container).filter((h) => h.startsWith('/wallet'))).toEqual([])
  })

  it('neither feature appears in the bottom navigation', () => {
    const { container } = render(<BottomNav />)
    const hrefs = navHrefs(container)
    expect(hrefs.filter((h) => h.startsWith('/marketplace'))).toEqual([])
    expect(hrefs.filter((h) => h.startsWith('/wallet'))).toEqual([])
    expect(screen.queryByText(/marketplace|wallet/i)).toBeNull()
  })

  it('🚨 hides them by FLAG, never by deletion — the implementations are still on disk', () => {
    // If a later cleanup deletes these instead of gating them, flipping the flag
    // stops being enough and the feature has to be rebuilt.
    expect(existsSync(join(process.cwd(), 'src/app/marketplace/page.tsx'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'src/app/marketplace/MarketplaceReserved.tsx'))).toBe(true)

    const shell = read('src/components/v3/V3Shell.tsx')
    // The rows still exist in the source, behind their flags.
    expect(shell).toContain("SHOW_MARKETPLACE")
    expect(shell).toContain("'/marketplace'")
    expect(shell).toContain("SHOW_WALLET")
    expect(shell).toContain("'v3.nav.wallet'")

    // And the labels are still translated, so nothing has to be re-authored either.
    const dict = read('src/lib/i18n/v3/web.ts')
    expect(dict).toContain("'v3.nav.marketplace'")
    expect(dict).toContain("'v3.nav.wallet'")
  })

  it('the flags are a pair of booleans a launch can flip, not a code change', () => {
    const product = read('src/lib/config/product.ts')
    expect(product).toMatch(/export const SHOW_MARKETPLACE = (true|false)/)
    expect(product).toMatch(/export const SHOW_WALLET = (true|false)/)
  })
})
