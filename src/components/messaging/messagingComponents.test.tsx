// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// Web Messenger — component behaviour that had no test: loading history, "load older", retry on a failed history / list, send, and the
// realtime echo. The provider and the network are faked; nothing here talks to Supabase.

let store: { threads: unknown[]; unreadTotal: number; loading: boolean; error: boolean }
const refetch = vi.fn(async () => {})
const markThreadRead = vi.fn(async () => {})
let incoming: Array<(m: unknown) => void> = []
vi.mock('./MessagesProvider', () => ({
  MessagesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessages: () => ({
    ...store,
    meId: 'me',
    refetch,
    markThreadRead,
    subscribeToIncoming: (fn: (m: unknown) => void) => { incoming.push(fn); return () => { incoming = incoming.filter(f => f !== fn) } },
  }),
}))
vi.mock('./NewMessageSheet', () => ({ __esModule: true, default: () => <div data-testid="new-sheet" /> }))

import ThreadView from './ThreadView'
import MessagesTab from './MessagesTab'

const THREAD = { id: 't1', kind: 'direct', title: null, unreadCount: 0, lastMessage: null, updatedAt: '2026-10-10T00:00:00Z', participants: [{ userId: 'me', fullName: 'Tôi', avatarUrl: null }, { userId: 'u2', fullName: 'Lan', avatarUrl: null }] } as never
const msg = (n: number, sender = 'u2') => ({ id: `m${n}`, threadId: 't1', senderId: sender, body: `tin ${n}`, createdAt: `2026-10-10T00:00:${String(n).padStart(2, '0')}Z` })
const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  store = { threads: [], unreadTotal: 0, loading: false, error: false }
  incoming = []
  refetch.mockClear(); markThreadRead.mockClear()
  Element.prototype.scrollIntoView = vi.fn()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const bodies = () => [...document.querySelectorAll('.whitespace-pre-wrap')].map(e => e.textContent)

describe('ThreadView · history', () => {
  it('shows the first page in order, marks the thread read, and offers "load older" only when the server says there is more', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(3), msg(4)], hasMore: true }))
    render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 3', 'tin 4']))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/messaging/threads/t1/messages')
    expect(markThreadRead).toHaveBeenCalledWith('t1')
    expect(screen.getByRole('button', { name: 'Tải tin nhắn cũ hơn' })).toBeTruthy()
  })

  it('REGRESSION: the history is fetched ONCE per thread — re-rendering (typing a draft) must not refetch or clear it (t() is a new function every render)', async () => {
    fetchMock.mockResolvedValue(json({ messages: [msg(1)], hasMore: false }))
    render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 1']))
    const box = screen.getByRole('textbox')
    for (const v of ['a', 'ab', 'abc']) fireEvent.change(box, { target: { value: v } })
    await new Promise(r => setTimeout(r, 30))
    expect(bodies()).toEqual(['tin 1'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('LOCK (a render loop is a hang, not a failure): the history effect depends on the thread and the retry key, never on t()', () => {
    const src = readFileSync('src/components/messaging/ThreadView.tsx', 'utf8')
    expect(src).toContain('}, [thread.id, reloadKey])')
    expect(src).not.toMatch(/}, [thread.id, t[,]]/)
  })

  it('no "load older" when the first page was the whole history', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(1)], hasMore: false }))
    render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 1']))
    expect(screen.queryByRole('button', { name: 'Tải tin nhắn cũ hơn' })).toBeNull()
  })

  it('"load older" asks for the page BEFORE the oldest message shown, prepends it in order, never adds an id twice, and hides itself at the end', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(3), msg(4)], hasMore: true }))
    render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 3', 'tin 4']))
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(1), msg(2), msg(3)], hasMore: false })) // msg(3) overlaps on purpose
    fireEvent.click(screen.getByRole('button', { name: 'Tải tin nhắn cũ hơn' }))
    await waitFor(() => expect(bodies()).toEqual(['tin 1', 'tin 2', 'tin 3', 'tin 4']))
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/messaging/threads/t1/messages?before=${encodeURIComponent('2026-10-10T00:00:03Z')}`)
    expect(screen.queryByRole('button', { name: 'Tải tin nhắn cũ hơn' })).toBeNull()
  })

  it('a failed "load older" keeps what is on screen, says so, and the button stays so the user can try again', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(3)], hasMore: true }))
    render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 3']))
    fetchMock.mockResolvedValueOnce(json({}, false, 500))
    fireEvent.click(screen.getByRole('button', { name: 'Tải tin nhắn cũ hơn' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(bodies()).toEqual(['tin 3'])
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(2)], hasMore: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Tải tin nhắn cũ hơn' }))
    await waitFor(() => expect(bodies()).toEqual(['tin 2', 'tin 3']))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a failed FIRST load shows an error and a retry that loads the history', async () => {
    fetchMock.mockResolvedValueOnce(json({}, false, 500))
    render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('Không tải được tin nhắn')
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(1)], hasMore: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(bodies()).toEqual(['tin 1']))
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull()
  })
})

describe('ThreadView · send and realtime', () => {
  it('sends the trimmed draft, shows the server row once even when the realtime echo arrives, and clears the draft', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [], hasMore: false }))
    render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('Chưa có tin nhắn nào.', { exact: false })).toBeTruthy())
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '  xin chào  ' } })
    const sent = { ...msg(9, 'me'), body: 'xin chào' }
    fetchMock.mockResolvedValueOnce(json({ message: sent }))
    fireEvent.click(screen.getByRole('button', { name: /gửi|send/i }))
    await waitFor(() => expect(bodies()).toEqual(['xin chào']))
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ body: 'xin chào' })
    incoming.forEach(fn => fn(sent)) // the echo of my own INSERT
    expect(bodies()).toEqual(['xin chào'])
    expect(box.value).toBe('')
  })

  it('a failed send keeps the draft and shows an error', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [], hasMore: false }))
    render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy())
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'giữ lại' } })
    fetchMock.mockResolvedValueOnce(json({}, false, 404))
    fireEvent.click(screen.getByRole('button', { name: /gửi|send/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(box.value).toBe('giữ lại')
  })

  it('an incoming message for ANOTHER thread is ignored; for this thread it is appended and the thread is marked read', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(1)], hasMore: false }))
    render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 1']))
    markThreadRead.mockClear()
    incoming.forEach(fn => fn({ ...msg(2), threadId: 'other' }))
    expect(bodies()).toEqual(['tin 1'])
    incoming.forEach(fn => fn(msg(2)))
    await waitFor(() => expect(bodies()).toEqual(['tin 1', 'tin 2']))
    expect(markThreadRead).toHaveBeenCalledWith('t1')
  })
})

describe('MessagesTab · conversation list', () => {
  it('a failed list with nothing to show says so and offers a retry that re-reads the list', async () => {
    store = { threads: [], unreadTotal: 0, loading: false, error: true }
    render(<MessagesTab signedIn />)
    expect(screen.getByRole('alert').textContent).toContain('Không tải được tin nhắn')
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  })

  it('a failed refresh does NOT replace a list that is already on screen with an error', () => {
    store = { threads: [THREAD], unreadTotal: 0, loading: false, error: true }
    render(<MessagesTab signedIn />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull()
  })

  it('signed out: the sign-in prompt, no error, no list fetch', () => {
    render(<MessagesTab signedIn={false} />)
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull()
    expect(refetch).not.toHaveBeenCalled()
  })
})
