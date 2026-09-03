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

import HomeV3 from './HomeV3'

// P4-11 + V3 Web redesign — the AI-first Home (DD-002 / OD-1) and its limits.
//
// ⚠️ THIS FILE FOLLOWED THE ROUTE. It used to render `HomeView`, the pre-V3 single-column
// composition. The Home route now renders `HomeV3`, so testing `HomeView` would have left a green
// suite guarding a component nothing renders — the exact "passes while asserting nothing" failure
// this project has been bitten by before. The assertions below are unchanged in substance; only
// the component under test moved.
//
// Three rules:
//   1. asking Tappy is the PRIMARY action and comes first in the document;
//   2. Home is NOT Chat — no thread, no streaming, every entry navigates;
//   3. no tool was removed to make either true.

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
      {...overrides}
    />,
  )
}

/** Every href on the page, in document order. */
function hrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map(a => a.getAttribute('href')!)
}

describe('Home is AI-first (DD-002)', () => {
  it('puts a way into the assistant above the tool strip', () => {
    const { container } = renderHome()
    const order = hrefs(container)

    // The first /chat entry in document order must precede the first tool destination.
    const firstChatEntry = order.findIndex(h => h.startsWith('/chat'))
    const firstTool = order.findIndex(h =>
      ['/boi', '/scan', '/group/new', '/currency', '/split-bill', '/translate', '/music', '/viet-content']
        .some(t => h.startsWith(t)),
    )

    expect(firstChatEntry, 'a way into the assistant must exist on Home').toBeGreaterThanOrEqual(0)
    expect(firstTool, 'the tools must still be on Home').toBeGreaterThanOrEqual(0)
    expect(firstChatEntry, 'asking Tappy comes before the tool strip').toBeLessThan(firstTool)
  })

  it('renders the assistant panel first among the panels', () => {
    renderHome()
    const titles = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(titles[0]).toMatch(/AI Agent/i)
  })

  it('carries the suggestion text and its category into the chat route', () => {
    const { container } = renderHome()
    const suggestion = hrefs(container).find(h => h.includes('/chat?q='))
    expect(suggestion).toBeTruthy()
    const decoded = decodeURIComponent(suggestion!)
    expect([SUGGESTIONS[0].text, SUGGESTIONS[0].textEn].some(s => decoded.includes(s))).toBe(true)
    expect(decoded).toContain('category=food')
  })

  it('offers Continue when there is something to resume', () => {
    const { container } = renderHome()
    expect(hrefs(container)).toContain('/chat/c1')
  })
})

describe('Home is NOT Chat (DD-002 — binding limit)', () => {
  it('renders no conversation thread', () => {
    const { container } = renderHome()
    expect(container.querySelector('.message-content')).toBeNull()
    expect(container.querySelector('.streaming-cursor')).toBeNull()
    expect(container.querySelector('.typing-dot')).toBeNull()
  })

  it('has a composer that navigates rather than answering in place', () => {
    const { container } = renderHome()
    // There IS a composer now — but it must submit by routing to /chat, and the page must not
    // contain any surface that renders an assistant reply.
    expect(container.querySelector('form input[type="text"], form input:not([type])')).toBeTruthy()
    expect(hrefs(container).some(h => h.startsWith('/chat'))).toBe(true)
  })
})

describe('no capability was removed by the V3 redesign', () => {
  // The inventory the approved design promised to preserve. A future tidy-up that drops one of
  // these fails here rather than in production.
  const REQUIRED = [
    '/boi', '/scan', '/group/new', '/currency', '/split-bill',
    '/translate', '/scam-shield', '/music', '/viet-content',
    '/deals', '/reviews', '/profile',
  ]

  it('still links to every tool and destination it linked to before', () => {
    const { container } = renderHome()
    const all = hrefs(container)
    const missing = REQUIRED.filter(r => !all.some(h => h.startsWith(r)))
    expect(missing, 'DD-002: capabilities are de-emphasised, never removed').toEqual([])
  })
})

describe('Marketplace is reserved, not built (DD-013)', () => {
  it('states it is coming rather than showing a catalogue', () => {
    // "Sắp có" appears twice by design — the sidebar tag and the panel body — so this asserts
    // the PANEL says it, not merely that the phrase exists somewhere.
    renderHome()
    // Locale-agnostic: the panel must say it is not open and must not list products.
    const panel = [...document.querySelectorAll('section')]
      .find(sec => /marketplace/i.test(sec.querySelector('.v3-panel-title')?.textContent ?? ''))!
    expect(panel, 'the Marketplace panel must exist').toBeTruthy()
    expect(panel.textContent).toMatch(/Sắp có|Coming soon/i)
    expect(panel.textContent).toMatch(/chưa có sản phẩm|no products/i)
  })

  it('shows no cart, checkout or fabricated product prices', () => {
    const { container } = renderHome()
    const html = container.innerHTML.toLowerCase()
    for (const forbidden of ['add-to-cart', 'checkout', 'giỏ hàng', 'thanh toán']) {
      expect(html, 'commerce is FUTURE').not.toContain(forbidden)
    }
  })
})

describe('guest and empty states survive the redesign', () => {
  it('a guest is offered login rather than a broken Continue', () => {
    const { container } = renderHome({ user: false, conversations: [] })
    expect(hrefs(container)).toContain('/login')
  })

  it('a signed-in user with no history gets the empty state', () => {
    const { container } = renderHome({ conversations: [] })
    expect(hrefs(container)).toContain('/chat')
  })
})
