// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'

// CHARACTERISATION of proposal D1 (docs/phase8/MESSENGER-NOTIFICATION-COLLAPSE-PROPOSAL.md §7): TODAY ThreadView marks the thread read at MOUNT, before the first page of messages
// has loaded, and also again after a failed load. The approved design marks read only after the first page succeeded. When ThreadView changes, this test is rewritten in the same commit.

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

beforeEach(() => { refetch.mockClear(); markThreadRead.mockClear(); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ThreadView · when the thread is marked read (today)', () => {
  it('the history request is still PENDING and the thread has already been marked read', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))                              // never resolves
    render(<ThreadView thread={THREAD as never} onBack={() => {}} />)
    await waitFor(() => expect(markThreadRead).toHaveBeenCalledWith('t1'))
    expect(markThreadRead).toHaveBeenCalledTimes(1)
  })

  it('the history request FAILED (500) and the thread was marked read anyway', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response))
    render(<ThreadView thread={THREAD as never} onBack={() => {}} />)
    await waitFor(() => expect(document.body.textContent).toBeTruthy())
    await new Promise((r) => setTimeout(r, 30))
    expect(markThreadRead).toHaveBeenCalledWith('t1')
  })
})
