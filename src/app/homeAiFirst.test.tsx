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

/** Every href on the page, in document order. */
function hrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map(a => a.getAttribute('href')!)
}

/** Home's own content region — everything the shell renders is excluded. */
function homeRegion(container: HTMLElement): HTMLElement {
  const first = container.querySelector('[data-home-section]')!
  return first.parentElement as HTMLElement
}

describe('Home is ONE PAGE, not an ecosystem dashboard', () => {
  it('renders exactly the five approved sections, in order', () => {
    const { container } = renderHome()
    const sections = [...container.querySelectorAll('[data-home-section]')]
      .map(s => s.getAttribute('data-home-section'))
    // 🚨 FIVE NOW, AND THE FIFTH IS THE POINT OF THE AI-FIRST PASS — but the RULE this file
    // exists to enforce is unchanged and is asserted just as hard below: Home may not reproduce
    // another destination. `capabilities` does not: every tile opens /chat with one of the five
    // real `CATEGORIES` preselected, so it is a way to START A CONVERSATION, not a slice of
    // Explore, Deals or Marketplace. The dashboard this file was written against was fifteen
    // panels of OTHER PAGES' CONTENT; a capability strip that only leads into the assistant is
    // the opposite of that, and the next test proves it rather than trusting this comment.
    //
    // Order is an OWNER DECISION: ask → what Tappy can do → discover → tools → resume.
    expect(sections).toEqual(['hero', 'capabilities', 'for-you', 'tools', 'continue'])
  })

  it('the capabilities strip leads into the assistant, never into another destination', () => {
    // The guard on the new section. Each tile must open the chat with a REAL category, and the
    // only tile allowed to leave the assistant is the "more" one, which goes to the Tools page.
    const { container } = renderHome()
    const tiles = [...container.querySelectorAll('[data-capability]')]
    expect(tiles.length, 'five real categories plus the way out').toBe(6)
    for (const tile of tiles) {
      const href = tile.getAttribute('href')!
      const id = tile.getAttribute('data-capability')
      if (id === 'more') { expect(href).toBe('/tools'); continue }
      expect(href, `${id} must open the assistant`).toBe(`/chat?category=${id}`)
    }
    // The ids are the product's own vocabulary, not a taxonomy invented for the grid.
    expect(tiles.map(t => t.getAttribute('data-capability')))
      .toEqual(['food', 'shopping', 'travel', 'entertainment', 'spa', 'more'])
  })

  it('renders no other destination inside Home', () => {
    // Each of these is its OWN page. A Home card may LINK to one; Home may not BE one. The check
    // is on Home's content region, because the shell legitimately links to all of them.
    const { container } = renderHome()
    const region = homeRegion(container)
    const own = new Set([...region.querySelectorAll('[data-home-section]')].map(s => s.getAttribute('data-home-section')))
    expect(own.size, 'Home owns only its five sections').toBe(5)

    // No destination's content is reproduced here: no feed, no inbox rows, no deal cards,
    // no marketplace, no profile panel.
    const text = region.textContent ?? ''
    for (const [what, pattern] of [
      ['an Explore feed', /video feed|feed video/i],
      ['an Inbox', /messages & notifications|tin nhắn & thông báo/i],
      ['a Deals surface', /groupon/i],
      ['Marketplace', /marketplace/i],
      ['a Profile panel', /profile \(me\)/i],
    ] as const) {
      expect(text, `Home must not render ${what} — it is its own page`).not.toMatch(pattern)
    }
  })

  it('does not reproduce a destination page inside a Home card', () => {
    const { container } = renderHome()
    const region = homeRegion(container)
    // The dashboard version put a filter-chip row on Home for Explore, Inbox and Deals — each the
    // top of somebody else's page. Home's only chip row is its own contextual prompts, and those
    // are buttons that ask Tappy, not filters over a feed Home does not have.
    const chipRows = region.querySelectorAll('.v3-chip')
    for (const chip of chipRows) {
      expect(chip.tagName, 'Home chips ask Tappy; they do not filter another page').toBe('BUTTON')
    }
  })
})

describe('Home is AI-first (DD-002)', () => {
  it('puts a way into the assistant above the tool strip', () => {
    const { container } = renderHome()
    const region = homeRegion(container)
    const order = hrefs(region)

    // The first /chat entry in document order must precede the first tool destination.
    const firstChatEntry = order.findIndex(h => h.startsWith('/chat'))
    const firstTool = order.findIndex(h =>
      // '/music' dropped: Music is hidden by default (SHOW_MUSIC, owner decision 2026-09-24).
      ['/boi', '/scan', '/group/new', '/currency', '/split-bill', '/translate', '/viet-content']
        .some(t => h.startsWith(t)),
    )

    expect(firstChatEntry, 'a way into the assistant must exist on Home').toBeGreaterThanOrEqual(0)
    expect(firstTool, 'the tools must still be on Home').toBeGreaterThanOrEqual(0)
    expect(firstChatEntry, 'asking Tappy comes before the tool strip').toBeLessThan(firstTool)
  })

  it('leads with the greeting and the composer, not with a section header', () => {
    const { container } = renderHome()
    const hero = container.querySelector('[data-home-section="hero"]')!
    expect(hero, 'the hero is the first section').toBe(container.querySelector('[data-home-section]'))
    // The greeting is the page's first heading, and the composer lives in the hero.
    const firstHeading = screen.getAllByRole('heading', { level: 2 })[0]
    expect(hero.contains(firstHeading), 'the greeting heads the page').toBe(true)
    expect(hero.querySelector('form input')).toBeTruthy()
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
    // There IS a composer — but it must submit by routing to /chat, and the page must not
    // contain any surface that renders an assistant reply.
    expect(container.querySelector('form input[type="text"], form input:not([type])')).toBeTruthy()
    expect(hrefs(container).some(h => h.startsWith('/chat'))).toBe(true)
  })
})

describe('no tool was dropped when Home stopped being a dashboard', () => {
  // Tools belong to Home by the approved layout (grouped, with a hierarchy). Losing one while
  // trimming the page would be a real capability loss, so the list is pinned.
  //
  // '/music' is intentionally NOT here: Music is hidden by default (SHOW_MUSIC, owner decision
  // 2026-09-24), so its route is deliberately unreachable from the page — the opposite of a
  // dropped-by-accident tool. Restoring SHOW_MUSIC restores every music entry point at once.
  const REQUIRED_TOOLS = [
    '/boi', '/scan', '/group/new', '/currency', '/split-bill',
    '/translate', '/scam-shield', '/viet-content', '/recommendations',
  ]

  it('leaves no tool route unreachable from the page', () => {
    // 🚨 THE RULE CHANGED SHAPE, AND THIS IS THE POINT OF THE FILE.
    //
    // It used to be "Home links every tool", which conflated a capability rule with an
    // information-architecture one. Home is a CURATED entry point — the owner cut it to five —
    // and reading "no capability may be lost" as "every route must appear on Home" is what
    // produced a two-row tool wall nobody asked for.
    //
    // What actually matters is that no route is ORPHANED. So the check is on the whole rendered
    // page, Home content plus shell: five tools live on Home, the rest live in the sidebar.
    // Measured before this change, `/group/new`, `/music`, `/boi` and `/viet-content` had zero
    // navigation anywhere — cutting Home to five without moving them would have stranded four
    // working routes, and a Home-only assertion would not have noticed.
    const { container } = renderHome()
    const all = hrefs(container)
    const missing = REQUIRED_TOOLS.filter(r => !all.some(h => h.startsWith(r)))
    expect(missing, 'every tool must be reachable from Home or the shell').toEqual([])
  })

  it('curates Home itself down to five', () => {
    // 🚨 COUNTS TOOL CARDS, NOT LINKS — and that is a TIGHTENING, not a loosening.
    //
    // This used to count every `a[href]` in the section, which worked only while the heading had
    // no action. The section now carries a "see all" into /tools, so a link count of 5 would have
    // failed for the right structure and, worse, a future sixth tool would have passed the moment
    // someone removed the see-all. `[data-tool]` is on the tool cards and nothing else, so the
    // curation is now pinned directly instead of inferred from a total.
    const { container } = renderHome()
    const tools = container.querySelector('[data-home-section="tools"]')!
    expect(tools.querySelectorAll('[data-tool]').length, 'Home shows five, not the catalogue').toBe(5)
    // And the only other link in the section is that see-all, at the REAL destination.
    const others = [...tools.querySelectorAll('a[href]')].filter(a => !a.hasAttribute('data-tool'))
    expect(others.map(a => a.getAttribute('href')), 'one see-all, pointing at the Tools page').toEqual(['/tools'])
  })

  it('the tools section carries the anchor two nav entries spent months pointing at', () => {
    // `/#smart-tools` was the sidebar row's and the tab bar's href, and nothing in the codebase
    // had that id — both scrolled to the top of Home. They point at /tools now; the id is here so
    // the old anchor also lands.
    const { container } = renderHome()
    expect(container.querySelector('#smart-tools'), 'the Home anchor must exist').toBeTruthy()
  })

  it('paints them with the SAME tile /tools uses — one registry, one visual language', () => {
    // Owner sync (2026-09-12): the redesigned /tools tile and Home's rail used to be two paint
    // jobs over one registry. Both now render `SmartToolCard`; Home takes the `compact` size.
    // Pinned on the class and the variant marker, which only that component emits.
    const { container } = renderHome()
    const cards = [...container.querySelectorAll('[data-home-section="tools"] [data-tool]')]
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(card.classList.contains('v3-toolcard'), `${card.getAttribute('data-tool')} is not the shared tile`).toBe(true)
      expect(card.getAttribute('data-variant')).toBe('compact')
      expect(card.getAttribute('data-hue'), 'every curated tool has a skin').toBeTruthy()
    }
  })

  it('presents them as one row, not labelled groups', () => {
    // Was `.grid === 3` (three named groups from the older written spec), then briefly asserted
    // ten tiles. The approved reference shows a single row of five; the count lives in the test
    // above so this one only pins the shape.
    const { container } = renderHome()
    const tools = container.querySelector('[data-home-section="tools"]')!
    expect(tools.querySelectorAll('.grid').length, 'one grid, not a group per row').toBe(1)
  })
})

describe('guest and empty states survive the correction', () => {
  it('a guest is offered login rather than a broken Continue', () => {
    const { container } = renderHome({ user: false, conversations: [] })
    expect(hrefs(container)).toContain('/login')
  })

  it('a signed-in user with no history gets the empty state', () => {
    const { container } = renderHome({ conversations: [] })
    expect(hrefs(container)).toContain('/chat')
  })

  it('omits "Dành cho bạn" entirely when there is nothing to show (ND-001)', () => {
    // Not an empty box, and above all not a filled one: no source, no section.
    const { container } = renderHome({ suggestions: [] })
    expect(container.querySelector('[data-home-section="for-you"]')).toBeNull()
  })
})
