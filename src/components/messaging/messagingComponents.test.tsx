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
// The real menu fetches /api/config on mount (its own tests live in src/components/safety); here it is a stub that exposes its props.
vi.mock('@/components/safety/SafetyMenu', () => ({
  SafetyMenu: (p: { report?: { target: string; id: string }; user?: { id: string; name?: string | null }; onBlockedChange?: (b: boolean) => void }) => (
    <button data-testid="safety-stub" data-target={p.report?.target} data-report-id={p.report?.id} data-user-id={p.user?.id} data-user-name={p.user?.name ?? ''} onClick={() => p.onBlockedChange?.(true)} />
  ),
}))
vi.mock('./NewMessageSheet', () => ({ __esModule: true, default: ({ onStarted }: { onStarted: (id: string) => void }) => <button data-testid="new-sheet" onClick={() => onStarted('t1')} /> }))

import ThreadView from './ThreadView'
import MessagesTab from './MessagesTab'

const THREAD = { id: 't1', kind: 'direct', title: null, unreadCount: 0, lastMessage: null, updatedAt: '2026-10-10T00:00:00Z', participants: [{ userId: 'me', fullName: 'Tôi', avatarUrl: null }, { userId: 'u2', fullName: 'Lan', avatarUrl: null }] } as never
const msg = (n: number, sender = 'u2') => ({ id: `m${n}`, threadId: 't1', senderId: sender, body: `tin ${n}`, createdAt: `2026-10-10T00:00:${String(n).padStart(2, '0')}Z` })
const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/messaging/threads/t1/messages?before=${encodeURIComponent('2026-10-10T00:00:03Z')}&beforeId=m3`) // the exact oldest row: time AND id
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

describe('ThreadView · report a message', () => {
  const stubs = (c: HTMLElement) => [...c.querySelectorAll('[data-testid="safety-stub"]')] as HTMLElement[]
  const messageStubs = (c: HTMLElement) => stubs(c).filter(s => s.getAttribute('data-target') === 'message')

  it('every bubble of ANOTHER person has a report action for that message; my own bubbles have none', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(1, 'u2'), msg(2, 'me'), msg(3, 'u2')], hasMore: false }))
    const { container } = render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 1', 'tin 2', 'tin 3']))
    expect(messageStubs(container).map(s => s.getAttribute('data-report-id'))).toEqual(['m1', 'm3'])
  })

  it('a message report offers no block (blocking is the header\'s job, for the person, not per message)', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(1, 'u2')], hasMore: false }))
    const { container } = render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 1']))
    expect(messageStubs(container)[0]!.getAttribute('data-user-id') ?? '').toBe('')
  })

  it('a message whose author is gone (no sender) can still be reported', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [{ ...msg(1), senderId: null }], hasMore: false }))
    const { container } = render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 1']))
    expect(messageStubs(container)).toHaveLength(1)
  })

  it('the header\'s own menu (report the person, block) is unchanged', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [], hasMore: false }))
    const { container } = render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy())
    const header = stubs(container).filter(s => s.getAttribute('data-target') === 'user')
    expect(header).toHaveLength(1)
    expect(header[0]!.getAttribute('data-user-id')).toBe('u2')
  })
})

describe('ThreadView · who said it and when (bubbles)', () => {
  const GROUP = { ...(THREAD as object), kind: 'group', title: 'Nhóm ăn uống', participants: [
    { userId: 'me', fullName: 'Tôi', avatarUrl: null }, { userId: 'u2', fullName: 'Bình', avatarUrl: null }, { userId: 'u3', fullName: null, avatarUrl: null },
  ] } as never
  const names = (c: HTMLElement) => [...c.querySelectorAll('[data-testid="bubble-name"]')].map(e => e.textContent)
  const times = (c: HTMLElement) => c.querySelectorAll('[data-testid="bubble-time"]').length

  it('a group shows each other person\'s name ONCE per run (never mine), a deleted/unnamed sender under the fallback, and one time per run', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(1, 'u2'), msg(2, 'u2'), msg(3, 'u3'), msg(4, 'me')], hasMore: false }))
    const { container } = render(<ThreadView thread={GROUP} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 1', 'tin 2', 'tin 3', 'tin 4']))
    expect(names(container)).toEqual(['Bình', 'Người dùng'])
    expect(times(container)).toBe(3) // runs: Bình (1,2), unnamed (3), me (4)
  })

  it('a direct thread shows no names (there is one other person) but still a time under each run', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(1, 'u2'), msg(2, 'u2'), msg(3, 'me')], hasMore: false }))
    const { container } = render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 1', 'tin 2', 'tin 3']))
    expect(names(container)).toEqual([])
    expect(times(container)).toBe(2)
  })

  it('the time is the Vietnam-time clock of the message (00:00:05Z on 10/10 is 07:00 in Ho Chi Minh)', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(5, 'u2')], hasMore: false }))
    const { container } = render(<ThreadView thread={THREAD} onBack={() => {}} />)
    await waitFor(() => expect(bodies()).toEqual(['tin 5']))
    expect(container.querySelector('[data-testid="bubble-time"]')?.textContent).toBe('10/10 07:00')
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
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ body: 'xin chào', clientId: expect.stringMatching(UUID_RE) })
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

  describe('what a refused send says (neutral: it must not reveal who blocked whom)', () => {
    const attempt = async (status: number) => {
      fetchMock.mockResolvedValueOnce(json({ messages: [], hasMore: false }))
      render(<ThreadView thread={THREAD} onBack={() => {}} />)
      await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy())
      const box = screen.getByRole('textbox') as HTMLTextAreaElement
      fireEvent.change(box, { target: { value: 'xin chào' } })
      fetchMock.mockResolvedValueOnce(json({}, false, status))
      fireEvent.click(screen.getByRole('button', { name: /gửi|send/i }))
      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
      return { alert: screen.getByRole('alert').textContent ?? '', box }
    }

    it('404 (not a participant, or a block — the server answers both alike) says the conversation cannot be written to, and keeps the draft', async () => {
      const { alert, box } = await attempt(404)
      expect(alert).toBe('Không thể gửi tin nhắn trong cuộc trò chuyện này.')
      expect(alert, 'it must not say "blocked"').not.toMatch(/chặn|block/i)
      expect(box.value).toBe('xin chào')
    })

    it('429 says to slow down', async () => {
      expect((await attempt(429)).alert).toBe('Bạn gửi quá nhanh. Hãy thử lại sau ít phút.')
    })

    it('any other failure keeps the generic message', async () => {
      expect((await attempt(500)).alert).toBe('Không gửi được tin nhắn.')
    })
  })

  describe('clientId — one id per send attempt', () => {
    const clientIdOf = (call: number) => (JSON.parse(String(fetchMock.mock.calls[call][1].body)) as { clientId: string }).clientId
    const click = () => fireEvent.click(screen.getByRole('button', { name: /gửi|send/i }))
    const setup = async () => {
      fetchMock.mockResolvedValueOnce(json({ messages: [], hasMore: false }))
      render(<ThreadView thread={THREAD} onBack={() => {}} />)
      await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy())
      return screen.getByRole('textbox') as HTMLTextAreaElement
    }

    it('a retry of the SAME text after a failed send repeats the same clientId (so a send that did commit is not stored twice)', async () => {
      const box = await setup()
      fireEvent.change(box, { target: { value: 'gửi lại' } })
      fetchMock.mockResolvedValueOnce(json({}, false, 500))
      click()
      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
      fetchMock.mockResolvedValueOnce(json({ message: { ...msg(9, 'me'), body: 'gửi lại' } }))
      click()
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
      expect(clientIdOf(2)).toBe(clientIdOf(1))
    })

    it('changing the text after a failed send makes a NEW clientId (the server must not answer with the old text)', async () => {
      const box = await setup()
      fireEvent.change(box, { target: { value: 'bản một' } })
      fetchMock.mockResolvedValueOnce(json({}, false, 500))
      click()
      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
      fireEvent.change(box, { target: { value: 'bản hai' } })
      fetchMock.mockResolvedValueOnce(json({ message: { ...msg(9, 'me'), body: 'bản hai' } }))
      click()
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
      expect(clientIdOf(2)).not.toBe(clientIdOf(1))
    })

    it('after a successful send the same text sent again is a new message with a new clientId', async () => {
      const box = await setup()
      fireEvent.change(box, { target: { value: 'ok' } })
      fetchMock.mockResolvedValueOnce(json({ message: { ...msg(8, 'me'), body: 'ok' } }))
      click()
      await waitFor(() => expect(box.value).toBe(''))
      fireEvent.change(box, { target: { value: 'ok' } })
      fetchMock.mockResolvedValueOnce(json({ message: { ...msg(9, 'me'), body: 'ok' } }))
      click()
      await waitFor(() => expect(fetchMock.mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(2))
      const posts = fetchMock.mock.calls.filter(c => c[1]?.method === 'POST')
      expect(JSON.parse(String(posts[1][1].body)).clientId).not.toBe(JSON.parse(String(posts[0][1].body)).clientId)
    })
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

describe('MessagesTab · opening a conversation', () => {
  it('a thread that is NOT in the list yet (just created) is opened once the list has been re-read — it used to be cleared at once', async () => {
    store = { threads: [], unreadTotal: 0, loading: false, error: false }
    refetch.mockImplementation(async () => { store = { ...store, threads: [THREAD] } })
    fetchMock.mockResolvedValue(json({ messages: [msg(1)], hasMore: false }))
    render(<MessagesTab signedIn />)
    // the "new message" button of the list opens the (faked) sheet, which reports the thread it started
    fireEvent.click(screen.getByRole('button', { name: /tin nhắn mới|new message/i }))
    fireEvent.click(await screen.findByTestId('new-sheet'))
    await waitFor(() => expect(bodies()).toEqual(['tin 1']))
    expect(refetch).toHaveBeenCalled()
    refetch.mockImplementation(async () => {})
  })

  it('initialThreadId (the profile Message button, ?thread=<id>) opens that conversation after the list is read, once', async () => {
    store = { threads: [], unreadTotal: 0, loading: false, error: false }
    refetch.mockImplementation(async () => { store = { ...store, threads: [THREAD] } })
    fetchMock.mockResolvedValue(json({ messages: [msg(2)], hasMore: false }))
    const { rerender } = render(<MessagesTab signedIn initialThreadId="t1" />)
    await waitFor(() => expect(bodies()).toEqual(['tin 2']))
    const reads = refetch.mock.calls.length
    rerender(<MessagesTab signedIn initialThreadId="t1" />)
    expect(refetch.mock.calls.length).toBe(reads) // not re-opened on every render
    refetch.mockImplementation(async () => {})
  })

  it('an unknown / foreign thread id opens nothing (the guard clears it) and does not break the list', async () => {
    store = { threads: [THREAD], unreadTotal: 0, loading: false, error: false }
    render(<MessagesTab signedIn initialThreadId="not-mine" />)
    await waitFor(() => expect(refetch).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 20))
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('signed out: initialThreadId is ignored', () => {
    render(<MessagesTab signedIn={false} initialThreadId="t1" />)
    expect(refetch).not.toHaveBeenCalled()
  })

  it('LOCK: the Inbox page hands the ?thread= parameter to the Messages tab', () => {
    const src = readFileSync('src/app/(app)/profile/notifications/NotificationsView.tsx', 'utf8')
    expect(src).toContain("useSearchParams()?.get('thread')")
    expect(src).toContain('<MessagesTab signedIn={!!user} initialThreadId={requestedThread} />')
  })
})

describe('ThreadView · Safety menu (WP-06)', () => {
  it('a 1:1 thread offers report/block for the OTHER person, named by the thread title', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [msg(1)], hasMore: false }))
    render(<ThreadView thread={THREAD} onBack={() => {}} />)
    const stub = await screen.findByTestId('safety-stub')
    expect(stub.getAttribute('data-target')).toBe('user')
    expect(stub.getAttribute('data-report-id')).toBe('u2')
    expect(stub.getAttribute('data-user-id')).toBe('u2')
    expect(stub.getAttribute('data-user-name')).toBeTruthy()
  })

  it('a group thread offers none (there is no single "other person")', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [], hasMore: false }))
    render(<ThreadView thread={{ ...(THREAD as object), kind: 'group' } as never} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy())
    expect(screen.queryByTestId('safety-stub')).toBeNull()
  })

  it('after a block the view leaves the thread (the server already closes it); an unblock would not', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [], hasMore: false }))
    const onBack = vi.fn()
    render(<ThreadView thread={THREAD} onBack={onBack} />)
    fireEvent.click(await screen.findByTestId('safety-stub')) // the stub reports onBlockedChange(true)
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('Safety menu wiring at the other call sites (source locks — the menu itself is tested in src/components/safety)', () => {
  const src = (p: string) => readFileSync(p, 'utf8')
  it('ReviewCommentButton: only another person comment, only when signed in', () => {
    const s = src('src/app/reviews/[id]/ReviewCommentButton.tsx')
    expect(s).toContain("import { SafetyMenu } from '@/components/safety/SafetyMenu'")
    expect(s).toContain("{me && c.user_id !== me && (")
    expect(s).toContain("report={{ target: 'comment', id: c.id }} user={{ id: c.user_id, name: c.profiles?.full_name }}")
  })
  it('ReviewDetailView: only a signed-in viewer who is not the author; the page passes the viewer', () => {
    const s = src('src/app/reviews/[id]/ReviewDetailView.tsx')
    expect(s).toContain("{viewerId && viewerId !== review.user_id && (")
    expect(s).toContain("report={{ target: 'review', id: reviewId }} user={{ id: review.user_id, name: review.profiles?.full_name }}")
    expect(src('src/app/reviews/[id]/page.tsx')).toContain('viewerId={viewerId}')
  })
  it('feedShared comment drawer: only another person comment, only when signed in', () => {
    const s = src('src/app/reviews/feedShared.tsx')
    expect(s).toContain("import { SafetyMenu } from '@/components/safety/SafetyMenu'")
    expect(s).toContain('{me && c.user_id !== me && (')
    expect(s).toContain("report={{ target: 'comment', id: c.id }} user={{ id: c.user_id, name: c.profiles?.full_name }}")
  })
  it('clip stage (Explore, shared and profile clip viewers): the creator of a clip that is not mine, signed in; a block removes the clip', () => {
    const s = src('src/app/reviews/clipStage.tsx')
    expect(s).toContain('{!isMe && me && (')
    expect(s).toContain("report={{ target: 'review', id: r.id }} user={{ id: r.user_id, name: r.profiles?.full_name }} onBlockedChange={b => { if (b) onRemoved() }}")
    expect(s).toContain('onClick={e => e.stopPropagation()}') // opening the menu must not open or pause the clip
  })
  it('ProfileTab: only on someone else profile, signed in; a block un-follows locally', () => {
    const s = src('src/app/reviews/ProfileTab.tsx')
    expect(s).toContain('{!isOwnProfile && viewerId && (')
    expect(s).toContain("report={{ target: 'user', id: userId }} user={{ id: userId, name: profile?.full_name }} onBlockedChange={(b) => { if (b) setFollowing(false) }}")
  })
})
