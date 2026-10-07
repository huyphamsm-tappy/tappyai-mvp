// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// Home mounts the V3 shell, which reads the app router and the pathname.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// jsdom has no matchMedia, and the dark-mode effect reads it on mount.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

vi.mock('@/lib/config/product', async (orig) => ({ ...(await orig<typeof import('@/lib/config/product')>()), SHOW_HOME_CATEGORY_ROW: true }))

import HomeV3 from './HomeV3'

// P4-11 + V3 Web redesign — the AI-first Home (DD-002 / OD-1) and its limits.
//
// 🚨 THE RULE THIS FILE NOW GUARDS FIRST: **Home is ONE PAGE.**
//
// The first V3 build read the implementation roadmap (shell → Home → Explore → Deals →
// Marketplace → Inbox → Tools → Profile → Chat) as a list of panels to put ON Home, and shipped a
// fifteen-panel grid rendering a slice of every destination in the product. The tests written
// alongside it were green the whole time, because they asserted "every capability is reachable
// from Home" — which the dashboard satisfied perfectly. They measured the wrong thing.
//
// So the inventory check below is inverted: it asserts what Home must NOT contain. Reachability is
// the SHELL's job and is guarded where the shell lives.
//
// The three older rules still stand:
//   1. asking Tappy is the PRIMARY action and comes first in the document;
//   2. Home is NOT Chat — no thread, no streaming, every entry navigates;
//   3. no tool was dropped to make either true.

afterEach(cleanup)

const SUGGESTIONS = [
  { text: 'Ăn tối gần đây', textEn: 'Dinner nearby', category: 'food', emoji: '🍜', gradient: 'from-red-100 to-orange-100' },
  { text: 'Đặt lịch spa', textEn: 'Book a spa', category: 'spa', emoji: '💆', gradient: 'from-pink-100 to-purple-100' },
]

const CONVERSATIONS = [
  { id: 'c1', title: 'Quán ăn Quận 1', messageCount: 4, updated_at: new Date().toISOString() },
]

function renderHome(overrides: Partial<React.ComponentProps<typeof HomeV3>> = {}) {
  return render(
    <HomeV3
      user
      userInfo={undefined}
      firstName="Huy"
      suggestions={SUGGESTIONS}
      conversations={CONVERSATIONS}
      hero={{ hour: 10, isWeekend: false, dayOfMonth: 1 }}
      {...overrides}
    />,
  )
}

// UAT3 (2026-09-27): the category row is hidden by default (SHOW_HOME_CATEGORY_ROW = false). With the
// flag ON it must come back exactly as it was — this is the guard the row carried before it was hidden.
describe('Home category row — behind SHOW_HOME_CATEGORY_ROW', () => {
  afterEach(cleanup)
  it('flag ON: the section sits between the hero and the prompt strip', () => {
    const { container } = renderHome()
    const sections = [...container.querySelectorAll('[data-home-section]')].map(s => s.getAttribute('data-home-section'))
    expect(sections).toEqual(['hero', 'capabilities', 'for-you', 'tools', 'continue'])
  })
  it('flag ON: the strip leads into the assistant, never into another destination', () => {
    const { container } = renderHome()
    const tiles = [...container.querySelectorAll('[data-capability]')]
    expect(tiles.length, 'five real categories plus the way out').toBe(6)
    for (const tile of tiles) {
      const href = tile.getAttribute('href')!
      const id = tile.getAttribute('data-capability')
      if (id === 'more') { expect(href).toBe('/tools'); continue }
      expect(href, `${id} must open the assistant`).toBe(`/chat?category=${id}`)
    }
    expect(tiles.map(t => t.getAttribute('data-capability'))).toEqual(['food', 'shopping', 'travel', 'entertainment', 'spa', 'more'])
  })
})
