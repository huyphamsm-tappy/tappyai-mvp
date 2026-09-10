// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/tools',
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

import ToolsView from './ToolsView'
import { smartTools, smartToolGroups } from '@/lib/tools/registry'

// ── V3 Web · Smart Tools (/tools) ───────────────────────────────────────────
//
// The page renders the registry and nothing else. `registry.test.ts` proves the registry is
// real; this proves the page does not add to it, subtract from it, or dress it up as commerce.

afterEach(cleanup)

const user = { full_name: 'Huy', avatar_url: null, email: 'h@example.com' }
const renderTools = () => render(<ToolsView user={user} />)

/** The tool cards, excluding every other link the shell puts on the page. */
function toolCards(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('[data-tool]')] as HTMLElement[]
}

describe('the page renders the real registry, exactly', () => {
  it('renders one card per available tool — no more, no fewer', () => {
    const { container } = renderTools()
    expect(toolCards(container).map((c) => c.getAttribute('data-tool')))
      .toEqual(smartTools().map((t) => t.id))
  })

  it('every card links to that tool\'s real route', () => {
    const { container } = renderTools()
    for (const tool of smartTools()) {
      const card = container.querySelector(`[data-tool="${tool.id}"]`)!
      expect(card.getAttribute('href'), `${tool.id} must open its own route`).toBe(tool.href)
    }
  })

  it('shows each tool\'s identity AND its purpose', () => {
    const { container } = renderTools()
    // English dictionary in jsdom. Both lines render, which is the whole point of the redesign:
    // the descriptions existed and were shown nowhere.
    const scan = within(container.querySelector('[data-tool="scan"]') as HTMLElement)
    expect(scan.getByText('Scan Documents')).toBeTruthy()
    expect(scan.getByText('Photograph a document or receipt and extract it')).toBeTruthy()
  })

  it('groups them under the three authored utility headings', () => {
    const { container } = renderTools()
    expect([...container.querySelectorAll('[data-tool-group]')].map((s) => s.getAttribute('data-tool-group')))
      .toEqual(smartToolGroups().map((g) => g.titleKey))
  })
})

describe('it is a utility shelf, not a marketplace', () => {
  it('shows no rating, price, usage count, badge or review count', () => {
    const { container } = renderTools()
    const text = container.querySelector('main')?.textContent ?? container.textContent ?? ''
    for (const claim of ['★', '⭐', 'reviews', 'đánh giá', 'lượt dùng', 'popular']) {
      expect(text, `"${claim}" has no source in the tool registry`).not.toContain(claim)
    }
    // 🔑 A PRICE IS A NUMBER WITH A CURRENCY, NOT THE WORD. Currency Converter's real
    // description legitimately names VND, USD and JPY — banning the token would ban the tool's
    // own copy. What must never appear is an AMOUNT, or a rating dressed as a statistic.
    expect(text, 'no price').not.toMatch(/\d[\d.,]*\s*(₫|VND|USD|đ)/)
    expect(text, 'no rating').not.toMatch(/\d+(\.\d+)?\s*(★|\/5)/)
  })

  it('renders no food, travel or shopping category filter', () => {
    const { container } = renderTools()
    const text = container.querySelector('main')?.textContent ?? ''
    for (const cat of ['Ăn uống', 'Lưu trú', 'Tham quan', 'Mua sắm', 'Giải trí', 'Di chuyển']) {
      expect(text, `"${cat}" belongs to discovery, not Smart Tools`).not.toContain(cat)
    }
  })

  it('pads nothing — the card count follows the registry, not a target grid size', () => {
    const { container } = renderTools()
    expect(toolCards(container).length).toBe(smartTools().length)
  })
})

describe('accessibility basics', () => {
  it('every tool is a real link, reachable by keyboard', () => {
    const { container } = renderTools()
    for (const card of toolCards(container)) {
      expect(card.tagName, 'a tool is navigation, so it is an anchor').toBe('A')
      expect(card.getAttribute('href')).toBeTruthy()
    }
  })

  it('every tool has an accessible name that is its label, not its icon', () => {
    const { container } = renderTools()
    for (const tool of smartTools()) {
      const card = container.querySelector(`[data-tool="${tool.id}"]`) as HTMLElement
      expect(card.textContent?.trim().length, `${tool.id} must have a text name`).toBeGreaterThan(0)
      // The glyphs are decorative and must not be announced — each is either aria-hidden
      // itself or sits inside an aria-hidden wrapper.
      for (const svg of card.querySelectorAll('svg')) {
        const hidden = svg.getAttribute('aria-hidden') === 'true' || !!svg.closest('[aria-hidden="true"]')
        expect(hidden, `${tool.id}: a decorative glyph is exposed to assistive tech`).toBe(true)
      }
    }
  })

  it('each group heading labels its own region', () => {
    const { container } = renderTools()
    for (const section of container.querySelectorAll('[data-tool-group]')) {
      const id = section.getAttribute('aria-labelledby')!
      expect(document.getElementById(id), 'the heading it names must exist').toBeTruthy()
    }
  })

  it('sign-in is communicated in text, never by colour alone', () => {
    const { container } = renderTools()
    const gated = smartTools().filter((t) => t.auth)
    expect(gated.length, 'the fixture assumes at least one auth-gated tool').toBeGreaterThan(0)
    for (const tool of gated) {
      const card = container.querySelector(`[data-tool="${tool.id}"]`) as HTMLElement
      expect(card.textContent, `${tool.id} must SAY it needs sign-in`).toContain('Sign-in required')
    }
  })

  it('an open tool carries no sign-in hint', () => {
    const { container } = renderTools()
    const open = smartTools().find((t) => !t.auth)!
    const card = container.querySelector(`[data-tool="${open.id}"]`) as HTMLElement
    expect(card.textContent).not.toContain('Sign-in required')
  })
})

describe('responsive structure', () => {
  it('steps its columns rather than forcing one row or one column', () => {
    const { container } = renderTools()
    const grid = container.querySelector('[data-tool-group] .grid')!
    const cls = grid.className
    // Two up on the narrowest phone, never ten across on a desktop.
    expect(cls).toContain('grid-cols-2')
    expect(cls).toMatch(/md:grid-cols-\d/)
    expect(cls).not.toMatch(/grid-cols-(1|[6-9]|1\d)\b/)
  })

  it('no card sets a fixed pixel width that could overflow a 360px viewport', () => {
    const { container } = renderTools()
    for (const card of toolCards(container)) {
      expect(card.className, 'widths come from the grid, not from the card').not.toMatch(/\bw-\[\d+px\]/)
    }
  })
})
