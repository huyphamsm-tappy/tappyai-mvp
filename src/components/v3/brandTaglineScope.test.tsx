// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import V3Shell from './V3Shell'
import { vi as viDict, en as enDict } from '@/lib/i18n/v3/web'

// The Home visual gate wanted the reference's wording — "Personal AI Agent", no "Your" — in the
// sidebar lockup. The first attempt edited `v3.brand.tagline`, which is SHARED: the V3 shell reads
// it for Deals, Marketplace and Profile, and Explore's own sidebar (src/app/reviews/page.tsx)
// reads it too. A one-word Home change silently rebranded four other destinations.
//
// 🚨 That is the failure this file exists to prevent, and it is invisible on Home: every Home
// screenshot looked correct while four other pages had quietly changed. The Home wording now
// travels as a PROP that only Home passes.

afterEach(cleanup)

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the Home tagline does not leak to other destinations', () => {
  it('keeps the shared dictionary string as the original wording', () => {
    // Deals, Marketplace, Profile and Explore all resolve this key.
    expect(viDict['v3.brand.tagline']).toBe('Your Personal AI Agent')
    expect(enDict['v3.brand.tagline']).toBe('Your Personal AI Agent')
  })

  it('carries the Home wording in a separate key', () => {
    expect(viDict['v3.brand.taglineHome']).toBe('Personal AI Agent')
    expect(enDict['v3.brand.taglineHome']).toBe('Personal AI Agent')
  })

  it('shows the SHARED wording when a page does not opt in', () => {
    // This is what Deals, Marketplace and Profile render — none of them passes `brandTagline`.
    const { container } = render(<V3Shell title="Deals"><div /></V3Shell>)
    expect(container.textContent).toContain('Your Personal AI Agent')
    expect(container.textContent).not.toContain('Personal AI Agent — ')
  })

  it('shows the Home wording only when a page opts in', () => {
    const { container } = render(
      <V3Shell title="Trang chủ" brandTagline="Personal AI Agent"><div /></V3Shell>,
    )
    const lockup = container.querySelector('aside a')!
    expect(lockup.textContent).toContain('Personal AI Agent')
    expect(lockup.textContent).not.toContain('Your Personal AI Agent')
  })

  it('is Home, and only Home, that opts in', () => {
    // 🚨 The real guard. A future page copying Home's shell invocation would spread the Home
    // wording again — the same defect in a new place, and equally invisible from Home.
    const optIn = 'brandTagline='
    const pages = [
      'src/app/HomeV3.tsx',
      'src/app/(app)/deals/DealsView.tsx',
      'src/app/(app)/marketplace/MarketplaceReserved.tsx',
      'src/app/(app)/profile/ProfileView.tsx',
      'src/app/(app)/profile/GuestProfileView.tsx',
    ]
    const optedIn = pages.filter(p => read(p).includes(optIn))
    expect(optedIn, 'exactly one page may carry the Home wording').toEqual(['src/app/HomeV3.tsx'])
  })

  it('leaves Explore reading the shared key directly', () => {
    // Explore builds its own sidebar rather than using V3Shell, so it can only ever get the
    // shared string — but it must still be READING that key, not a copy of the wording.
    const src = read('src/app/reviews/page.tsx')
    expect(src).toContain("t('v3.brand.tagline')")
    expect(src, 'Explore must not hardcode a tagline of its own').not.toContain('Personal AI Agent')
  })
})
