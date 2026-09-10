// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/deals',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))

import V3Shell from './V3Shell'

// ── BottomNav owns navigation below `lg` (DD-003) ───────────────────────────
//
// 🚨 THE MEASURED DEFECT. The header tab row carried no breakpoint gate, so below
// `lg` it rendered as a full-width scroll row AT THE SAME TIME as `BottomNav`.
// Measured in the real browser at 375x812 on /deals, before the fix:
//
//     TABS       visible  h=50  top=104   → / /reviews /deals /profile/notifications /tools
//     BottomNav  visible  h=65  top=747   → Trang chủ Chat Khám phá Deals Tôi
//     overlapping destinations: /  /reviews  /deals
//
// which contradicts the ownership rule stated at the top of `V3Shell`. After the
// fix, same page and viewport: TABS display:none, BottomNav visible.
//
// 🚨 WHY THIS ASSERTS CLASSES AND NOT COMPUTED VISIBILITY. jsdom applies no
// stylesheet, so `getComputedStyle(...).display` is identical at every width and
// a breakpoint cannot be observed here at all — a test written that way would
// pass whether or not the gate exists. The class contract is the strongest thing
// this infrastructure can hold; the visibility itself was verified in the browser
// at 375 and 1440 and is recorded above.

afterEach(cleanup)

/** The header tab row — identified the way the shell marks it, not by label. */
function tabRow(): HTMLElement | null {
  return document.querySelector('nav.v3-scroll-x')
}

describe('the header tab row is desktop-only', () => {
  it('renders the row at all', () => {
    render(<V3Shell title="t"><div /></V3Shell>)
    expect(tabRow(), 'the shell must still render its tab row').toBeTruthy()
  })

  it('is hidden by default and only becomes a flex row at lg', () => {
    render(<V3Shell title="t"><div /></V3Shell>)
    const cls = tabRow()!.className
    expect(cls, 'must be hidden at mobile widths').toContain('hidden')
    expect(cls, 'must come back as a flex row on desktop').toContain('lg:flex')
  })

  it('carries no unguarded `flex` that would show it below lg', () => {
    render(<V3Shell title="t"><div /></V3Shell>)
    const cls = tabRow()!.className
    // A bare `flex` token (not `lg:flex`) is exactly what made it visible on mobile.
    const bare = cls.split(/\s+/).filter(c => c === 'flex')
    expect(bare, 'a bare `flex` token reintroduces the mobile duplicate').toHaveLength(0)
  })

  it('keeps its destinations unchanged — this is a visibility fix, not an IA change', () => {
    render(<V3Shell title="t"><div /></V3Shell>)
    const hrefs = [...tabRow()!.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(hrefs).toEqual(['/', '/reviews', '/deals', '/profile/notifications', '/tools'])
  })

  it('still renders BottomNav for mobile, inside its own lg:hidden wrapper', () => {
    const { container } = render(<V3Shell title="t"><div /></V3Shell>)
    const wrapper = [...container.querySelectorAll('div')].find(d => d.className === 'lg:hidden')
    expect(wrapper, 'BottomNav must stay mounted below lg').toBeTruthy()
    expect(wrapper!.querySelector('nav'), 'the mobile bar itself').toBeTruthy()
  })
})
