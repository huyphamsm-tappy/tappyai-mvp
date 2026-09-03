// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// Home mounts Header, SearchBar and BottomNav, which all read the app router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// jsdom has no matchMedia, and Header's dark-mode effect reads it on mount.
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

import HomeView from './HomeView'

// P4-11 — the AI-first Home (DD-002 / OD-1), and the limits the owner put on it.
//
// The three rules this file exists to hold:
//   1. asking Tappy is the PRIMARY action and comes first in the document;
//   2. Home is NOT Chat — it renders no thread, streams nothing, and every control navigates away;
//   3. no tool was removed to make either of those true.
//
// Rule 3 is the one most at risk from a future "simplification", so it is asserted as an explicit
// route inventory rather than a count.

afterEach(cleanup)

const SUGGESTIONS = [
  { text: 'Ăn tối gần đây', textEn: 'Dinner nearby', category: 'food', emoji: '🍜', gradient: 'from-red-100 to-orange-100' },
  { text: 'Đặt lịch spa', textEn: 'Book a spa', category: 'spa', emoji: '💆', gradient: 'from-pink-100 to-purple-100' },
]

const CONVERSATIONS = [
  { id: 'c1', title: 'Quán ăn Quận 1', messageCount: 4, updated_at: new Date().toISOString() },
]

function renderHome(overrides: Partial<React.ComponentProps<typeof HomeView>> = {}) {
  return render(
    <HomeView
      user
      userInfo={null}
      firstName="Huy"
      heroTextVi="Chào bạn"
      heroHour={12}
      heroIsWeekend={false}
      heroDom={1}
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
  it('puts asking Tappy above the tools', () => {
    const { container } = renderHome()
    const order = hrefs(container)

    const firstChatEntry = order.findIndex(h => h.startsWith('/chat'))
    const firstTool = order.findIndex(h =>
      ['/boi', '/scan', '/group', '/currency', '/split-bill', '/translate', '/scam-shield', '/music', '/viet-content', '/recommendations']
        .some(t => h.startsWith(t)),
    )

    expect(firstChatEntry, 'a way into the assistant must exist on Home').toBeGreaterThanOrEqual(0)
    expect(firstTool, 'the tools must still be on Home').toBeGreaterThanOrEqual(0)
    expect(firstChatEntry, 'asking Tappy comes before the tool grid').toBeLessThan(firstTool)
  })

  it('puts Continue above the tools too', () => {
    const { container } = renderHome()
    const order = hrefs(container)
    const cont = order.findIndex(h => h === '/chat/c1')
    const firstTool = order.findIndex(h => h.startsWith('/boi'))
    expect(cont, 'a returning user mostly resumes').toBeGreaterThanOrEqual(0)
    expect(cont).toBeLessThan(firstTool)
  })

  it('carries the suggestion text and its category into the chat route', () => {
    const { container } = renderHome()
    const suggestion = hrefs(container).find(h => h.includes('/chat?q='))
    expect(suggestion).toBeTruthy()

    const decoded = decodeURIComponent(suggestion!)
    // Whichever locale is active, the prompt that travels is the one the user read.
    expect([SUGGESTIONS[0].text, SUGGESTIONS[0].textEn].some(s => decoded.includes(s))).toBe(true)
    expect(decoded, 'the category rides along so the turn opens in the right context')
      .toContain('category=food')
  })
})

describe('Home is NOT Chat (DD-002 — binding limit)', () => {
  it('renders no conversation thread', () => {
    const { container } = renderHome()
    // The chat thread's own containers. None of them belongs on Home.
    expect(container.querySelector('.message-content')).toBeNull()
    expect(container.querySelector('.streaming-cursor')).toBeNull()
    expect(container.querySelector('.typing-dot')).toBeNull()
  })

  it('has no composer that submits in place — every entry point navigates', () => {
    const { container } = renderHome()
    // Home's assistant entry points are links to /chat, not a form that posts here.
    const chatEntries = hrefs(container).filter(h => h.startsWith('/chat'))
    expect(chatEntries.length).toBeGreaterThan(0)
    expect(container.querySelector('form[data-chat-composer]')).toBeNull()
  })
})

describe('no tool was removed to make Home AI-first', () => {
  // The inventory the approved design promised to preserve. A future tidy-up that drops one of
  // these fails here rather than in production.
  const REQUIRED = [
    '/boi/tarot', '/boi/tu-vi', '/boi/cung-hoang-dao',
    '/scan', '/group/new', '/recommendations', '/music',
    '/currency', '/split-bill', '/translate', '/scam-shield', '/viet-content',
  ]

  it('still links to every tool it linked to before', () => {
    const { container } = renderHome()
    const all = hrefs(container)
    const missing = REQUIRED.filter(r => !all.includes(r))
    expect(missing, 'DD-002: tools are de-emphasised, never removed').toEqual([])
  })
})

describe('For You is a preview, not a personalization system (ND-001)', () => {
  it('is hidden when no existing source supplies it', () => {
    renderHome()
    expect(
      screen.queryByTestId('home-for-you'),
      'when nothing can fill the section it is hidden, never padded with invented content',
    ).toBeNull()
  })

  it('is hidden for an empty list too', () => {
    renderHome({ forYou: [] })
    expect(screen.queryByTestId('home-for-you')).toBeNull()
  })

  it('renders items it is given, with no score or rank of its own', () => {
    renderHome({ forYou: [{ href: '/deals/1', title: 'Giảm 30% buffet', image: null }] })
    const section = screen.getByTestId('home-for-you')
    expect(section.textContent).toContain('Giảm 30% buffet')
    expect(section.querySelector('a')!.getAttribute('href')).toBe('/deals/1')
  })
})

describe('guest and empty states survive the reorder', () => {
  it('a guest is still offered login rather than a broken Continue', () => {
    const { container } = renderHome({ user: false, conversations: [] })
    expect(hrefs(container)).toContain('/login')
  })

  it('a signed-in user with no history gets the empty state', () => {
    const { container } = renderHome({ conversations: [] })
    expect(hrefs(container)).toContain('/chat')
  })
})
