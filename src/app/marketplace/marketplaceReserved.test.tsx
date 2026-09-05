// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/marketplace',
  useSearchParams: () => new URLSearchParams(),
}))

import MarketplaceReserved from './MarketplaceReserved'

// V3 Web redesign · §5. Two things must stay true about Marketplace, and both have already
// been violated once during this redesign:
//
//   1. It must RESOLVE. The V3 shell puts it in the sidebar and the tab bar; when the route
//      did not exist, both links 404'd. A nav entry that dead-ends is worse than no entry.
//   2. It must stay RESERVED. Commerce is FUTURE (DD-001 / DD-013). No catalogue, cart,
//      checkout, payment, merchant onboarding — and no fabricated product or price, which is
//      the failure mode a "placeholder store" invites.

afterEach(cleanup)

const ROOT = resolve(process.cwd(), 'src/app')

/** Every routable path under src/app, with route-group segments removed. */
function routes(dir = ROOT, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      // `(group)` segments do not appear in the URL; `@slot` and `_private` are not routes.
      if (entry.startsWith('_') || entry.startsWith('@')) continue
      const seg = entry.startsWith('(') && entry.endsWith(')') ? '' : `/${entry}`
      out.push(...routes(full, prefix + seg))
    } else if (entry === 'page.tsx' || entry === 'page.ts') {
      out.push(prefix || '/')
    }
  }
  return out
}

describe('Marketplace is reserved, and reachable', () => {
  it('resolves as a real route', () => {
    expect(routes()).toContain('/marketplace')
  })

  it('says plainly that it is not open', () => {
    render(<MarketplaceReserved />)
    // Locale-agnostic — the page must state the absence, in whichever language is active.
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/Sắp có|Coming soon/i)
    expect(body).toMatch(/chưa mở|not open/i)
  })

  it('offers no catalogue, cart, checkout, payment or merchant onboarding', () => {
    const { container } = render(<MarketplaceReserved />)
    const html = container.innerHTML.toLowerCase()
    for (const forbidden of [
      'add-to-cart', 'addtocart', 'checkout', 'giỏ hàng', 'thanh toán',
      'merchant', 'cs-cart', 'data-price', 'product-card',
    ]) {
      expect(html, `commerce is FUTURE — found "${forbidden}"`).not.toContain(forbidden)
    }
  })

  it('shows no product and therefore no price', () => {
    render(<MarketplaceReserved />)
    // A placeholder store would fabricate both. Nothing here may look like a money amount.
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/\d[\d.,]*\s*(₫|đ\b|VND|USD|\$)/i)
    // ...and the page's own panel carries no listing structure. Scoped to the panel on purpose:
    // the shell's sidebar is full of <li> navigation, which is not a catalogue.
    const panel = document.querySelector('.v3-panel')!
    expect(panel, 'the reserved panel must exist').toBeTruthy()
    expect(panel.querySelectorAll('li').length).toBe(0)
    expect(panel.querySelectorAll('img').length, 'no product imagery').toBe(0)
  })

  it('sends the user to capabilities that actually exist', () => {
    const { container } = render(<MarketplaceReserved />)
    const hrefs = [...container.querySelectorAll('a[href]')].map(a => a.getAttribute('href')!)
    expect(hrefs).toContain('/deals')
    expect(hrefs).toContain('/chat')
  })
})

describe('every V3 shell destination resolves', () => {
  // The 404 above was not a one-off: the shell hard-codes a nav inventory, and any future entry
  // can point at a route nobody created. This checks the whole inventory at once.
  it('has no nav entry pointing at a route that does not exist', () => {
    const shell = readFileSync(resolve(process.cwd(), 'src/components/v3/V3Shell.tsx'), 'utf8')
    // 🔑 THE REGISTRY IS PART OF THE INVENTORY NOW. The shell's Smart Tools row and its Scam
    // Shield row take their hrefs from `src/lib/tools/registry.ts`, so a literal-only scan of
    // this file would have quietly stopped covering them — and would have kept passing. Both
    // sources are unioned, which widens what this guard sees rather than narrowing it.
    const registry = readFileSync(resolve(process.cwd(), 'src/lib/tools/registry.ts'), 'utf8')
    const targets = new Set(
      [...shell.matchAll(/href: '([^']+)'/g), ...registry.matchAll(/href: '([^']+)'/g),
       ...registry.matchAll(/SMART_TOOLS_HREF = '([^']+)'/g)]
        .map(m => m[1].split('#')[0])          // an anchor's page is what has to exist
        .map(h => (h === '' ? '/' : h))
        .filter(h => h.startsWith('/')),
    )
    const available = new Set(routes())
    const missing = [...targets].filter(h => !available.has(h))
    expect(missing, 'a sidebar/tab entry must never 404').toEqual([])
  })
})
