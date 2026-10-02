// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync, existsSync } from 'node:fs'
import { SHOW_MARKETPLACE } from '@/lib/config/product'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import V3Shell from './V3Shell'

// ── Marketplace is hidden, and stays hidden until it is built ───────────────
//
// 🚨 IT WAS ADVERTISED TWICE AND BUILT ZERO TIMES. The sidebar listed it with a
// "Sắp có" tag and the top tab bar listed it again with no tag at all; both led
// to `MarketplaceReserved`, a page whose own text says it is not built. On a
// pre-release build that is a navigation slot promising a feature the product
// does not have.
//
// 🔑 HIDDEN, NOT DELETED. The route, the component and its own test are all
// still here — this file asserts the *entry points* are gone, not the code, so
// the later phase that builds Marketplace flips one boolean rather than
// recovering deleted work.

const read = (p: string) => readFileSync(p, 'utf8')
const renderShell = () => render(<V3Shell title="Home"><div /></V3Shell>)

afterEach(cleanup)

describe('the flag is off', () => {
  it('SHOW_MARKETPLACE is false', () => {
    expect(SHOW_MARKETPLACE).toBe(false)
  })
})

describe('no navigation offers Marketplace', () => {
  it('renders no link to /marketplace anywhere in the shell', () => {
    renderShell()
    const hrefs = [...document.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(hrefs).not.toContain('/marketplace')
  })

  it('shows no Marketplace label in the sidebar or the tab bar', () => {
    const { container } = renderShell()
    expect(container.textContent ?? '').not.toMatch(/marketplace/i)
  })

  it('leaves the rest of the commerce group intact', () => {
    // Deals is real and shipping; hiding its neighbour must not take it with it.
    renderShell()
    const hrefs = [...document.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(hrefs).toContain('/deals')
  })
})

describe('nothing was deleted', () => {
  it('keeps the route, the component and its test', () => {
    for (const f of [
      'src/app/(app)/marketplace/page.tsx',
      'src/app/(app)/marketplace/MarketplaceReserved.tsx',
      'src/app/(app)/marketplace/marketplaceReserved.test.tsx',
    ]) {
      expect(existsSync(f), f).toBe(true)
    }
  })

  it('keeps both entry points behind the flag rather than removing them', () => {
    // A later phase flips one boolean; it does not re-author the nav rows.
    const shell = read('src/components/v3/V3Shell.tsx')
    expect(shell).toContain('SHOW_MARKETPLACE')
    expect(shell).toContain("href: '/marketplace'")
  })

  it('keeps the i18n strings the page and the rows use', () => {
    const dict = read('src/lib/i18n/v3/web.ts')
    for (const key of ['v3.nav.marketplace', 'v3.marketplace.title', 'v3.marketplace.body']) {
      expect(dict, key).toContain(key)
    }
  })
})

describe('the route itself does not stay reachable', () => {
  it('answers with the app’s own not-found rather than a coming-soon page', () => {
    // 🚨 Hiding the nav is not hiding the feature: a bookmark, a shared link or a
    // crawler would still have reached a page announcing a product that does not
    // exist. `notFound()` is the app's existing answer for a route that is not
    // there — no new "unavailable" screen was invented for this.
    const page = read('src/app/(app)/marketplace/page.tsx')
    expect(page).toContain('notFound()')
    expect(page).toContain('if (!SHOW_MARKETPLACE)')
  })
})
