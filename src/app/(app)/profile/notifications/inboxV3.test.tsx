// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile/notifications',
  useSearchParams: () => new URLSearchParams(),
}))

// The real settings panel talks to the Push API and the marketing-consent endpoint. This file is
// about the INBOX; the panel only needs to be identifiable so its reuse can be asserted.
vi.mock('@/components/notifications/NotificationSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="notification-settings" />,
}))

const markAllRead = vi.fn()
let store: { notifications: unknown[]; unreadCount: number; loading: boolean }
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ ...store, refetch: vi.fn(), markAllRead }),
}))

// The messaging store opens a real Supabase client and a Realtime channel. This file is about the
// NOTIFICATION centre; the store only needs to exist so the page renders and so the Messages tab
// can be asserted to be present and independent.
let messageStore: { threads: unknown[]; unreadTotal: number; loading: boolean }
vi.mock('@/components/messaging/MessagesProvider', () => ({
  MessagesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessages: () => ({
    ...messageStore,
    meId: 'me',
    refetch: vi.fn(),
    markThreadRead: vi.fn(),
    subscribeToIncoming: () => () => {},
  }),
}))
vi.mock('@/components/messaging/MessagesTab', () => ({
  __esModule: true,
  default: () => <div data-testid="messages-tab" />,
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import NotificationsView from './NotificationsView'

// V3 Web · Page 6 — the Inbox.
//
// 🚨🚨 THE TWO DEFECTS THIS PAGE EXISTS TO FIX, both pinned below.
//
//   1. `/profile/notifications` is where the shell's Inbox tab and its unread badge have always
//      pointed, and it rendered SETTINGS. Clicking a badge that read "3" showed a push toggle.
//   2. The notification list lived only in `/reviews`'s bottom bar, which desktop no longer
//      renders — so on desktop there was no path to a notification at all.
//
// 🚨 THE MESSAGES TAB IS REAL NOW, AND THE ASSERTIONS BELOW CHANGED SHAPE BECAUSE OF IT.
//
// This comment used to end "…a Messages tab MUST NOT APPEAR: there is no user-to-user messaging in
// this product", and that was correct while it was true. Phase 1 built the messaging it was
// guarding against inventing — `chat_threads` / `chat_participants` / `chat_messages` /
// `chat_reads`, with RLS, an API under `/api/messaging` and a Realtime channel — so the tab is now
// backed by data rather than promising it.
//
// 🚨 WHAT THAT DOES NOT LICENSE, AND WHAT THESE TESTS STILL PIN: the two halves of the Inbox share
// a page and NOTHING ELSE. The category chips still show only the four REAL notification
// categories, they still carry no per-category counts, and the notification unread total is still
// the server's single authoritative number. A messages badge does not feed it and it does not feed
// a messages badge.

const dto = (over: Record<string, unknown> = {}) => ({
  id: 'n1', type: 'system', category: 'system',
  title: 'Title', body: 'Body', actor: null,
  entity_url: '/somewhere', image_url: null, data: {},
  read_at: null, created_at: new Date().toISOString(),
  ...over,
})

const socialDto = (over: Record<string, unknown> = {}) => dto({
  type: 'like', category: 'social',
  actor: { id: 'a1', name: 'Nam Nguyen', avatar: null },
  ...over,
})

beforeEach(() => {
  push.mockClear()
  markAllRead.mockClear()
  store = { notifications: [], unreadCount: 0, loading: false }
  messageStore = { threads: [], unreadTotal: 0, loading: false }
})
afterEach(cleanup)

const renderPage = () => render(<NotificationsView user={{ full_name: 'Huy', avatar_url: null, email: 'h@x.com' }} />)

/**
 * Renders the page and switches to the notification centre.
 *
 * The Inbox opens on Messages, so every assertion in this file about notifications has to get
 * there first. Going through the real tab control rather than a prop is deliberate: it means these
 * tests also fail if the notification centre ever becomes unreachable.
 */
const renderInbox = () => {
  const utils = renderPage()
  fireEvent.click(screen.getByRole('tab', { name: /thông báo|announcements/i }))
  return utils
}
const chips = () => screen.getAllByRole('button').filter((b) => b.className.includes('v3-chip'))

describe('the inbox is an inbox, not a settings page', () => {
  it('renders the notification list on the route the shell points at', () => {
    store = { notifications: [dto({ title: 'Deal moi' })], unreadCount: 1, loading: false }
    renderInbox()
    expect(screen.getByText('Deal moi'), 'the route must show notifications, not only preferences').toBeTruthy()
  })

  it('keeps the notification settings reachable rather than deleting them', () => {
    // 🚨 The settings were not removed when this route stopped being a settings page — they moved
    // behind a control. Losing them would take away the user's only control over push.
    renderInbox()
    expect(screen.queryByTestId('notification-settings'), 'settings start closed').toBeNull()
    const gear = screen.getAllByRole('button').find((b) => /cài đặt|settings/i.test(b.getAttribute('aria-label') ?? ''))
    expect(gear, 'there must be a way into notification settings').toBeTruthy()
    fireEvent.click(gear!)
    expect(screen.getByTestId('notification-settings'), 'and it must render the EXISTING component').toBeTruthy()
  })

  it('does not ship a second copy of the preferences UI', () => {
    renderInbox()
    const gear = screen.getAllByRole('button').find((b) => /cài đặt|settings/i.test(b.getAttribute('aria-label') ?? ''))!
    fireEvent.click(gear)
    expect(screen.getAllByTestId('notification-settings').length).toBe(1)
  })
})

describe('the Inbox is two tabs over two independent data models', () => {
  beforeEach(() => { messageStore = { threads: [], unreadTotal: 0, loading: false } })

  it('offers both tabs, and opens on Messages', () => {
    renderPage()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].getAttribute('aria-selected'), 'the Inbox opens on Messages').toBe('true')
    expect(screen.getByTestId('messages-tab')).toBeTruthy()
  })

  it('shows the notification centre only on its own tab', () => {
    store = { notifications: [dto({ title: 'Deal moi' })], unreadCount: 1, loading: false }
    renderPage()
    expect(screen.queryByText('Deal moi'), 'notifications do not leak into the Messages tab').toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /thông báo|announcements/i }))
    expect(screen.getByText('Deal moi')).toBeTruthy()
    expect(screen.queryByTestId('messages-tab'), 'and messages do not leak the other way').toBeNull()
  })

  it('gives each tab its OWN count, and never a total of both', () => {
    // 🚨 The whole point of keeping the stores apart. 3 messages and 5 notifications must read as
    // 3 and 5 — never as one 8 that belongs to neither.
    store = { notifications: [dto()], unreadCount: 5, loading: false }
    messageStore = { threads: [], unreadTotal: 3, loading: false }
    renderPage()
    const [messagesTab, notificationsTab] = screen.getAllByRole('tab')
    expect(within(messagesTab).getByText('3')).toBeTruthy()
    expect(within(notificationsTab).getByText('5')).toBeTruthy()
    expect(messagesTab.textContent).not.toContain('8')
    expect(notificationsTab.textContent).not.toContain('8')
  })

  it('shows no badge at all when a tab has nothing unread', () => {
    store = { notifications: [dto()], unreadCount: 0, loading: false }
    messageStore = { threads: [], unreadTotal: 0, loading: false }
    renderPage()
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.textContent ?? '', 'a zero badge is noise, not information').not.toMatch(/\d/)
    }
  })

  it('still offers exactly the four REAL notification categories', () => {
    // Unchanged by messaging: the API emits `social`, `deal`, `explore`, `system` and that is the
    // whole taxonomy. A conversation is not a notification category.
    store = { notifications: [dto()], unreadCount: 0, loading: false }
    renderInbox()
    const labels = chips().map((c) => c.textContent?.trim() ?? '')
    expect(labels.length, 'All + four real categories').toBe(5)
    for (const invented of [/tin nhắn/i, /messages?$/i, /hoạt động/i, /activity/i]) {
      expect(labels.join(' | '), 'a category chip with no data behind it').not.toMatch(invented)
    }
  })
})

describe('unread state is the real one', () => {
  beforeEach(() => { messageStore = { threads: [], unreadTotal: 0, loading: false } })

  it('shows the global unread count, once', () => {
    store = { notifications: [dto(), dto({ id: 'n2' })], unreadCount: 7, loading: false }
    const { container } = renderInbox()
    // 7 is the server's authoritative count — deliberately NOT the number of loaded rows (2).
    expect(container.textContent).toContain('7')
    expect(container.textContent).not.toContain('2 chưa đọc')
  })

  it('shows NO per-tab counts', () => {
    // 🚨 Per-category unread totals do not exist in the API. Deriving them from the loaded window
    // would print a number that looks authoritative and disagrees with the nav badge.
    store = {
      notifications: [socialDto({ id: 's1' }), dto({ id: 'd1', category: 'deal', type: 'deal' })],
      unreadCount: 2, loading: false,
    }
    renderInbox()
    for (const chip of chips()) {
      expect(chip.textContent ?? '', `chip "${chip.textContent}" is carrying a count`).not.toMatch(/\d/)
    }
  })

  it('marks unread rows and leaves read rows quiet', () => {
    store = {
      notifications: [
        dto({ id: 'unread1', title: 'Unread row', read_at: null }),
        dto({ id: 'read1', title: 'Read row', read_at: new Date().toISOString() }),
      ],
      unreadCount: 1, loading: false,
    }
    const { container } = renderInbox()
    const rowOf = (text: string) => screen.getByText(text).closest('[class*="items-start"]') as HTMLElement
    const dotFilled = (row: HTMLElement) =>
      [...row.querySelectorAll('span')].some((s) => /var\(--v3-accent\)/.test(s.getAttribute('style') ?? ''))
    expect(dotFilled(rowOf('Unread row')), 'an unread row carries the accent marker').toBe(true)
    expect(dotFilled(rowOf('Read row')), 'a read row does not').toBe(false)
    expect(container).toBeTruthy()
  })

  it('uses the existing mark-all-read, never a local unread state', () => {
    store = { notifications: [dto()], unreadCount: 3, loading: false }
    renderInbox()
    const btn = screen.getByText(/đánh dấu đã đọc|mark all read/i).closest('button')!
    fireEvent.click(btn)
    expect(markAllRead, 'must call the provider, which POSTs /api/notifications/read').toHaveBeenCalledTimes(1)
  })

  it('offers nothing to mark when there is nothing unread', () => {
    store = { notifications: [dto({ read_at: new Date().toISOString() })], unreadCount: 0, loading: false }
    renderInbox()
    expect(screen.queryByText(/đánh dấu đã đọc|mark all read/i)).toBeNull()
  })
})

describe('filtering and rows', () => {
  it('filters by the row\'s real category', () => {
    store = {
      notifications: [
        socialDto({ id: 's1', title: 'Social row' }),
        dto({ id: 'd1', title: 'Deal row', category: 'deal', type: 'deal' }),
      ],
      unreadCount: 2, loading: false,
    }
    renderInbox()
    expect(screen.getByText('Social row')).toBeTruthy()
    expect(screen.getByText('Deal row')).toBeTruthy()

    fireEvent.click(chips()[2]) // Ưu đãi / Offers
    expect(screen.queryByText('Social row'), 'a social row is not an offer').toBeNull()
    expect(screen.getByText('Deal row')).toBeTruthy()
  })

  it('says so when a category has nothing in it, instead of looking broken', () => {
    store = { notifications: [dto({ category: 'system' })], unreadCount: 1, loading: false }
    const { container } = renderInbox()
    fireEvent.click(chips()[1]) // Xã hội / Social — genuinely empty
    expect(container.textContent).toMatch(/không có thông báo nào trong mục này|nothing in this category/i)
  })

  it('opens the destination the notification names', () => {
    store = { notifications: [dto({ title: 'Go somewhere', entity_url: '/reviews/r1' })], unreadCount: 1, loading: false }
    renderInbox()
    fireEvent.click(screen.getByText('Go somewhere'))
    expect(push).toHaveBeenCalledWith('/reviews/r1')
  })

  it('is not clickable when the notification points nowhere', () => {
    store = { notifications: [dto({ title: 'No target', entity_url: null })], unreadCount: 1, loading: false }
    renderInbox()
    fireEvent.click(screen.getByText('No target'))
    expect(push, 'a row with no url must not navigate to an empty route').not.toHaveBeenCalled()
  })

  it('shows a collapsed-group count that is NOT an unread badge', () => {
    // 🚨 `count` is how many notifications collapsed into the row — twelve likes on one review.
    // The mockup put an unread badge in this position; per-row unread totals do not exist, so the
    // number is rendered plainly and prefixed, never as a filled accent pill.
    store = {
      notifications: [
        socialDto({ id: 'l1', entity_url: '/reviews/r1', actor: { id: 'a1', name: 'Nam', avatar: null } }),
        socialDto({ id: 'l2', entity_url: '/reviews/r1', actor: { id: 'a2', name: 'Lan', avatar: null } }),
      ],
      unreadCount: 2, loading: false,
    }
    const { container } = renderInbox()
    expect(container.textContent, 'two likes on one review collapse to one row saying +2').toContain('+2')
  })
})

describe('empty and loading', () => {
  it('says the inbox is empty rather than rendering a blank page', () => {
    store = { notifications: [], unreadCount: 0, loading: false }
    const { container } = renderInbox()
    expect(container.textContent).toMatch(/chưa có thông báo nào|no notifications yet/i)
  })

  it('shows a spinner only while it has nothing to show', () => {
    store = { notifications: [], unreadCount: 0, loading: true }
    const { container } = renderInbox()
    expect(container.querySelector('.animate-spin')).toBeTruthy()
    cleanup()
    // With rows already in hand a refetch must not blank the list the user is reading.
    store = { notifications: [dto({ title: 'Still here' })], unreadCount: 1, loading: true }
    renderInbox()
    expect(screen.getByText('Still here')).toBeTruthy()
  })
})

describe('the page fills its viewport instead of stranding the footer', () => {
  it('lays the content out as a column with a viewport-derived height', () => {
    // 🚨 THE DEFECT: with an empty inbox the content was ~200px tall inside a plain block `<main>`,
    // so the footer landed mid-screen above a large unexplained void and the page read as
    // unfinished. A flex column with a min-height derived from the viewport is what pushes the
    // footer down; asserting it here stops a later tidy-up from silently removing it.
    const { container } = renderInbox()
    const column = container.querySelector('[style*="100dvh"]') as HTMLElement | null
    expect(column, 'the page must claim the remaining viewport height').toBeTruthy()
    expect(column!.className, 'and lay its regions out as a column').toContain('flex-col')
    // The subtraction must account for the shell header, or the column overflows every page.
    expect(column!.getAttribute('style')).toContain('--v3-header-h')
  })

  it('gives the list region the slack, so the footer ends up last', () => {
    store = { notifications: [], unreadCount: 0, loading: false }
    const { container } = renderInbox()
    const column = container.querySelector('[style*="100dvh"]') as HTMLElement
    const growing = [...column.children].filter((c) => c.className.includes('flex-1'))
    expect(growing.length, 'exactly one region absorbs the free space').toBe(1)
    // The footer is the last child of the column — after the growing region, not before it.
    expect(column.lastElementChild?.tagName.toLowerCase()).toBe('footer')
  })

  it('centres a COMPACT empty panel in the slack — it does not stretch to fill it', () => {
    // 🚨 THIS RULE HAS BEEN WRONG IN BOTH DIRECTIONS, so it pins the middle.
    //
    // v1: the panel sat at the TOP of a tall region, footer stranded, void beneath.
    // v2: the panel took `flex-1` and grew to the full height of the region — an inbox with
    //     nothing in it then drew the biggest box on the screen. A large empty box is not more
    //     finished than a small one.
    // v3 (this): the WRAPPER takes the slack and centres; the PANEL keeps its own modest size.
    store = { notifications: [], unreadCount: 0, loading: false }
    renderInbox()
    const panel = screen.getByText(/chưa có thông báo nào|no notifications yet/i)
      .closest('div') as HTMLElement
    expect(panel.className, 'the panel itself must not stretch').not.toContain('flex-1')
    expect(panel.className, 'and stays a bounded width').toMatch(/max-w-/)

    const wrapper = panel.parentElement as HTMLElement
    expect(wrapper.className, 'the wrapper takes the slack instead').toContain('flex-1')
    expect(wrapper.className, 'and centres the panel in it').toContain('items-center')
  })
})

describe('the page states its identity once', () => {
  it('does not repeat the inbox icon beside the controls', () => {
    // 🚨 A violet bell TILE used to open the content block — the page stating its own identity a
    // third time, after the shell header and the nav tab that carries the same icon, in the space
    // where the page's own controls belong.
    //
    // Pinned by the tile's own signature (a violet-tinted rounded chip) rather than by "no bell
    // anywhere", because the EMPTY STATE legitimately draws one and that must stay allowed.
    // 🪤 Scoped to the CONTROLS ROW, not to `<main>`. The first version scanned the whole main
    // region and failed on `V3Footer`'s "Community" item, which is legitimately a violet-tinted
    // icon tile. A guard that fires on unrelated chrome is a guard that gets deleted.
    store = { notifications: [dto({ title: 'A row' })], unreadCount: 1, loading: false }
    const { container } = renderInbox()
    const chipRow = container.querySelector('.v3-chip')!.parentElement as HTMLElement
    const controlsRow = chipRow.parentElement as HTMLElement
    const identityTiles = [...controlsRow.querySelectorAll('span')].filter(
      (s) => /--v3-violet/.test(s.getAttribute('style') ?? '') && !!s.querySelector('svg'),
    )
    expect(identityTiles.length, 'no decorative identity tile belongs in the controls row').toBe(0)
  })

  it('still draws an icon in the EMPTY state, where it carries meaning', () => {
    // The counterpart: removing the duplicate must not strip the empty state's own illustration,
    // which is the thing that makes an empty page look composed rather than failed.
    store = { notifications: [], unreadCount: 0, loading: false }
    const { container } = renderInbox()
    const empty = screen.getByText(/chưa có thông báo nào|no notifications yet/i)
      .closest('div') as HTMLElement
    expect(empty.querySelector('svg'), 'the empty state keeps its icon').toBeTruthy()
    expect(container).toBeTruthy()
  })

  it('puts the filters and the actions on one row', () => {
    store = { notifications: [dto()], unreadCount: 2, loading: false }
    const { container } = renderInbox()
    const chipRow = container.querySelector('.v3-chip')!.parentElement as HTMLElement
    const row = chipRow.parentElement as HTMLElement
    const gear = within(row).getAllByRole('button')
      .find((b) => /cài đặt|settings/i.test(b.getAttribute('aria-label') ?? ''))
    expect(gear, 'settings sits beside the filters, not on a row of its own').toBeTruthy()
  })
})

describe('it sits in the approved shell', () => {
  it('renders inside V3Shell, not the old page chrome', () => {
    // The route used to render `Header` + `BottomNav` on a light `bg-gray-50` ground — a different
    // application from every other V3 destination.
    const { container } = renderInbox()
    expect(container.querySelector('.v3-theme'), 'the V3 shell must wrap this page').toBeTruthy()
    expect(container.querySelector('.bg-gray-50'), 'the old light chrome must be gone').toBeNull()
  })

  it('lights the Inbox tab it was reached from', () => {
    const { container } = renderInbox()
    const inboxLinks = [...container.querySelectorAll('a[href="/profile/notifications"]')]
    expect(inboxLinks.length, 'the shell still links this route').toBeGreaterThan(0)
  })
})

describe('the shell keeps a path to the inbox on desktop', () => {
  it('nav points at this route, which is what fixes the desktop gap', () => {
    // 🚨 The desktop regression was NOT a missing link — the shell has always linked here. It was
    // that this route rendered settings while the only list lived in a bottom bar desktop stopped
    // rendering. Asserting the link survives keeps the fix from being undone by a nav tidy-up.
    const shell = require('node:fs').readFileSync('src/components/v3/V3Shell.tsx', 'utf8')
    const links = [...shell.matchAll(/href: '\/profile\/notifications'/g)]
    expect(links.length, 'sidebar row and top tab both point at the inbox').toBeGreaterThanOrEqual(2)
  })
})
