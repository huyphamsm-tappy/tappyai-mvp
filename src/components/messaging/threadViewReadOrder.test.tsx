// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor, screen, fireEvent } from '@testing-library/react'

// D1 (DR-4, approved 04/11/2026): a thread is marked read only AFTER the first page of its messages has loaded. Before this, ThreadView marked it
// at mount — before the page arrived, and again after a failed load — so a person who never saw the messages cleared their unread state.

const refetch = vi.fn(async () => {})
const markThreadRead = vi.fn(async () => {})
vi.mock('./MessagesProvider', () => ({
  MessagesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessages: () => ({ threads: [], unreadTotal: 0, loading: false, error: false, meId: 'me', refetch, markThreadRead, subscribeToIncoming: () => () => {} }),
}))
vi.mock('@/components/safety/SafetyMenu', () => ({ SafetyMenu: () => null }))
vi.mock('./NewMessageSheet', () => ({ __esModule: true, default: () => null }))

import ThreadView from './ThreadView'

const THREAD = { id: 't1', kind: 'direct', title: null, unreadCount: 2, lastMessage: null, updatedAt: '2026-10-10T00:00:00Z', participants: [{ userId: 'me', fullName: 'Tôi', avatarUrl: null }, { userId: 'u2', fullName: 'Bạn', avatarUrl: null }] }
const page = (n = 1) => ({ ok: true, status: 200, json: async () => ({ messages: Array.from({ length: n }, (_, i) => ({ id: `m${i}`, threadId: 't1', senderId: 'u2', body: `tin ${i}`, createdAt: `2026-10-10T00:00:0${i}Z` })), hasMore: false }) }) as Response
const failed = () => ({ ok: false, status: 500, json: async () => ({}) }) as Response

beforeEach(() => { refetch.mockClear(); markThreadRead.mockClear(); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ThreadView · when the thread is marked read (D1)', () => {
  it('while the history request is still PENDING the thread is NOT marked read', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // never resolves
    render(<ThreadView thread={THREAD as never} onBack={() => {}} />)
    await new Promise(r => setTimeout(r, 30))
    expect(markThreadRead).not.toHaveBeenCalled()
  })

  it('when the history request FAILED (500) the thread is NOT marked read: the person did not see the messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => failed()))
    render(<ThreadView thread={THREAD as never} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy())
    expect(markThreadRead).not.toHaveBeenCalled()
  })

  it('once the first page has loaded the thread is marked read, exactly once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => page(2)))
    render(<ThreadView thread={THREAD as never} onBack={() => {}} />)
    await waitFor(() => expect(markThreadRead).toHaveBeenCalledWith('t1'))
    await new Promise(r => setTimeout(r, 30))
    expect(markThreadRead).toHaveBeenCalledTimes(1)
  })

  it('an EMPTY first page counts as loaded (there is nothing to read, but the thread was opened and shown)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => page(0)))
    render(<ThreadView thread={THREAD as never} onBack={() => {}} />)
    await waitFor(() => expect(markThreadRead).toHaveBeenCalledWith('t1'))
  })

  it('a failed load followed by a successful retry marks it read after the retry — not before', async () => {
    const f = vi.fn().mockResolvedValueOnce(failed()).mockResolvedValue(page(1))
    vi.stubGlobal('fetch', f)
    render(<ThreadView thread={THREAD as never} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy())
    expect(markThreadRead).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(markThreadRead).toHaveBeenCalledWith('t1'))
  })
})
