// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'

// The Inbox tab logic (18/11): `?tab=` is honoured, the default tab follows what is unread, a tap on a row reads that row,
// the two tab counts add up to the bell, and an unknown notification type renders as a safe generic row.

const push = vi.fn()
let query = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile/notifications',
  useSearchParams: () => new URLSearchParams(query),
}))
vi.mock('@/components/notifications/NotificationSettings', () => ({ __esModule: true, default: () => <div /> }))

const markAllRead = vi.fn()
const markRead = vi.fn()
let store: { notifications: unknown[]; unreadCount: number; loading: boolean }
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ ...store, refetch: vi.fn(), markAllRead, markRead }),
}))

let messageStore: { threads: unknown[]; unreadTotal: number; loading: boolean }
vi.mock('@/components/messaging/MessagesProvider', () => ({
  MessagesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessages: () => ({ ...messageStore, meId: 'me', refetch: vi.fn(), markThreadRead: vi.fn(), subscribeToIncoming: () => () => {} }),
}))
let initialThread: string | undefined
vi.mock('@/components/messaging/MessagesTab', () => ({
  __esModule: true,
  default: (p: { initialThreadId?: string }) => { initialThread = p.initialThreadId; return <div data-testid="messages-tab" /> },
}))
let pair = { messages: 0, messageNotifications: 0 }
vi.mock('@/lib/messaging/useMessageUnread', () => ({
  useMessageUnread: () => pair,
  badgeTotal: (n: number, u: { messages: number; messageNotifications: number }) => Math.max(0, n - u.messageNotifications) + u.messages,
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }),
})

import NotificationsView from './NotificationsView'

const dto = (over: Record<string, unknown> = {}) => ({
  id: 'n1', type: 'system', category: 'system', title: 'Title', body: 'Body', actor: null,
  entity_url: '/somewhere', image_url: null, data: {}, read_at: null, created_at: new Date().toISOString(), ...over,
})

beforeEach(() => {
  push.mockClear(); markRead.mockClear(); markAllRead.mockClear()
  query = ''; initialThread = undefined
  pair = { messages: 0, messageNotifications: 0 }
  store = { notifications: [], unreadCount: 0, loading: false }
  messageStore = { threads: [], unreadTotal: 0, loading: false }
})
afterEach(cleanup)

const renderPage = () => render(<NotificationsView user={{ full_name: 'Huy', avatar_url: null, email: 'h@x.com' }} />)
const selected = () => screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')!

describe('which tab the Inbox opens on', () => {
  it('?tab=notifications opens Notifications even with unread messages', () => {
    query = 'tab=notifications'
    messageStore.unreadTotal = 4
    renderPage()
    expect(selected().textContent).toMatch(/thông báo|announcements/i)
    expect(screen.queryByTestId('messages-tab')).toBeNull()
  })

  it('?tab=messages opens Messages even when only notifications are unread', () => {
    query = 'tab=messages'
    store = { notifications: [dto()], unreadCount: 3, loading: false }
    renderPage()
    expect(screen.getByTestId('messages-tab')).toBeTruthy()
  })

  it('keeps the thread deep link: ?tab=messages&thread=<id> opens that conversation', () => {
    query = 'tab=messages&thread=t-42'
    renderPage()
    expect(screen.getByTestId('messages-tab')).toBeTruthy()
    expect(initialThread).toBe('t-42')
  })

  it('the profile Message button (?thread= alone) opens Messages even when only notifications are unread', () => {
    query = 'thread=t-42'
    store = { notifications: [dto()], unreadCount: 3, loading: false }
    renderPage()
    expect(screen.getByTestId('messages-tab')).toBeTruthy()
    expect(initialThread).toBe('t-42')
  })

  it('an unknown ?tab= value is ignored (falls back to the default rule)', () => {
    query = 'tab=bogus'
    renderPage()
    expect(screen.getByTestId('messages-tab')).toBeTruthy()
  })

  it('no ?tab=: unread notifications and NO unread messages -> Notifications', () => {
    store = { notifications: [dto({ title: 'Fresh' })], unreadCount: 2, loading: false }
    renderPage()
    expect(screen.getByText('Fresh')).toBeTruthy()
    expect(screen.queryByTestId('messages-tab')).toBeNull()
  })

  it('no ?tab=: unread messages (with or without unread notifications) -> Messages', () => {
    store = { notifications: [dto()], unreadCount: 2, loading: false }
    messageStore.unreadTotal = 1
    renderPage()
    expect(screen.getByTestId('messages-tab')).toBeTruthy()
  })

  it('no ?tab=: nothing unread -> Messages, as before', () => {
    renderPage()
    expect(screen.getByTestId('messages-tab')).toBeTruthy()
  })

  it('does not jump tabs by itself once the person has read everything', () => {
    store = { notifications: [dto({ title: 'Fresh' })], unreadCount: 2, loading: false }
    const { rerender } = renderPage()
    expect(screen.getByText('Fresh')).toBeTruthy()
    store = { notifications: [dto({ title: 'Fresh', read_at: new Date().toISOString() })], unreadCount: 0, loading: false }
    rerender(<NotificationsView user={{ full_name: 'Huy', avatar_url: null, email: 'h@x.com' }} />)
    expect(screen.getByText('Fresh'), 'still on Notifications').toBeTruthy()
  })

  it('a click on a tab wins over the automatic choice, and the badges stay on both tabs', () => {
    store = { notifications: [dto()], unreadCount: 5, loading: false }
    messageStore.unreadTotal = 3
    renderPage()
    const [messagesTab, notificationsTab] = screen.getAllByRole('tab')
    fireEvent.click(notificationsTab)
    expect(screen.queryByTestId('messages-tab')).toBeNull()
    expect(within(messagesTab).getByText('3')).toBeTruthy()
    expect(within(notificationsTab).getByText('5')).toBeTruthy()
    fireEvent.click(messagesTab)
    expect(screen.getByTestId('messages-tab')).toBeTruthy()
    expect(within(notificationsTab).getByText('5')).toBeTruthy()
  })
})

describe('the tab counts add up to the bell', () => {
  it('flag on: message notifications are not counted again on the Notifications tab', () => {
    // 5 unread notifications, 2 of them are message notifications; 3 unread messages. Bell = (5-2)+3 = 6 = 3 + 3.
    store = { notifications: [dto()], unreadCount: 5, loading: false }
    messageStore.unreadTotal = 3
    pair = { messages: 3, messageNotifications: 2 }
    renderPage()
    const [messagesTab, notificationsTab] = screen.getAllByRole('tab')
    expect(within(messagesTab).getByText('3')).toBeTruthy()
    expect(within(notificationsTab).getByText('3')).toBeTruthy()
  })
})

describe('tapping a row reads it', () => {
  const open = () => { query = 'tab=notifications' }

  it('marks that row read and still navigates', () => {
    open()
    store = { notifications: [dto({ id: 'r1', title: 'Row', entity_url: '/reviews/x' })], unreadCount: 1, loading: false }
    renderPage()
    fireEvent.click(screen.getByText('Row'))
    expect(markRead).toHaveBeenCalledWith(['r1'])
    expect(push).toHaveBeenCalledWith('/reviews/x')
  })

  it('a stack of likes marks every unread member, and only the unread ones', () => {
    open()
    const like = (id: string, read: boolean) => dto({
      id, type: 'like', category: 'social', entity_url: '/reviews/r1', title: 'Like',
      actor: { id: 'a' + id, name: 'Nam', avatar: null }, read_at: read ? new Date().toISOString() : null,
    })
    store = { notifications: [like('l1', false), like('l2', true), like('l3', false)], unreadCount: 2, loading: false }
    renderPage()
    fireEvent.click(screen.getByText('Like'))
    expect(markRead).toHaveBeenCalledTimes(1)
    expect([...markRead.mock.calls[0][0]].sort()).toEqual(['l1', 'l3'])
  })

  it('a row that is already read sends nothing', () => {
    open()
    store = { notifications: [dto({ id: 'r2', title: 'Seen', read_at: new Date().toISOString() })], unreadCount: 0, loading: false }
    renderPage()
    fireEvent.click(screen.getByText('Seen'))
    expect(markRead).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/somewhere')
  })

  it('"mark all read" is still there and still calls the provider', () => {
    open()
    store = { notifications: [dto()], unreadCount: 3, loading: false }
    renderPage()
    fireEvent.click(screen.getByText(/đánh dấu đã đọc|mark all read/i).closest('button')!)
    expect(markAllRead).toHaveBeenCalledTimes(1)
  })
})

describe('new and unknown types render safely', () => {
  it.each(['reply', 'share', 'some_future_type'])('type "%s" is a generic row with its own title', (type) => {
    query = 'tab=notifications'
    store = { notifications: [dto({ type, category: type === 'some_future_type' ? 'weird' : 'social', title: `T-${type}`, body: 'B' })], unreadCount: 1, loading: false }
    renderPage()
    expect(screen.getByText(`T-${type}`)).toBeTruthy()
  })
})
