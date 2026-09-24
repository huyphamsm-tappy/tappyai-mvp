// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// ── "Hỏi Tappy về chỗ này" — the client half of the fix ─────────────────────
//
// The bridge puts `ctx=<review id>` on `/chat?q=`; the page turns it into
// `initialContext` and `ChatInterface` puts it in the request body as
// `context: { kind: 'explore_clip', reviewId }`. Nothing else in the body
// changes, and a thread that did not start on the button sends no `context`
// key at all — the generic payload is byte-for-byte what it was.
//
// `useChat` is mocked to CAPTURE its options, which is where the body lives.

Element.prototype.scrollIntoView = vi.fn()
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

const captured: Array<Record<string, unknown>> = []

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('ai/react', () => ({
  useChat: (opts: Record<string, unknown>) => {
    captured.push(opts)
    return {
      messages: [], input: '', handleInputChange: vi.fn(), handleSubmit: vi.fn(), isLoading: false,
      setInput: vi.fn(), append: vi.fn(), reload: vi.fn(), stop: vi.fn(), error: undefined, setMessages: vi.fn(),
    }
  },
}))

import ChatInterface from './ChatInterface'

const REVIEW = '9d4cdf3b-a93f-427c-880a-9950472e3705'
const lastBody = () => (captured[captured.length - 1]?.body ?? {}) as Record<string, unknown>

afterEach(() => { cleanup(); captured.length = 0 })

describe('the request body carries the clip reference', () => {
  it('with initialContext, body.context is exactly { kind, reviewId }', () => {
    render(<ChatInterface initialContext={{ kind: 'explore_clip', reviewId: REVIEW }} />)
    expect(captured.length).toBeGreaterThan(0)
    expect(lastBody().context).toEqual({ kind: 'explore_clip', reviewId: REVIEW })
    // Only a reference. No place name, no address — the server reads those from the row.
    expect(Object.keys(lastBody().context as object)).toEqual(['kind', 'reviewId'])
  })

  it('without initialContext, the body has NO context key — generic chat is unchanged', () => {
    render(<ChatInterface />)
    expect('context' in lastBody()).toBe(false)
  })

  it('the existing fields are untouched either way', () => {
    render(<ChatInterface initialContext={{ kind: 'explore_clip', reviewId: REVIEW }} />)
    const keys = Object.keys(lastBody())
    // Everything else is conditional (GPS, prefs, style, evidence) and absent in this render.
    expect(keys).toEqual(['context'])
  })
})

describe('the page → prop contract (source-pinned)', () => {
  it('chat/page.tsx reads `ctx` and forwards it as an explore_clip initialContext', async () => {
    const { readFileSync } = await import('node:fs')
    const page = readFileSync('src/app/(app)/chat/page.tsx', 'utf8')
    expect(page).toContain("searchParams.get('ctx')")
    expect(page).toMatch(/initialContext=\{exploreReviewId \? \{ kind: 'explore_clip', reviewId: exploreReviewId \} : undefined\}/)
    // Still the same route and the same visible question: `q` is read exactly as before.
    expect(page).toContain("searchParams.get('q')")
  })
})

// ── The thread survives its own navigation ──────────────────────────────────
//
// After the first reply the page saves the thread and moves to `/chat/<id>`, which
// rebuilds the chat from the saved row. The reference has to be IN the row for the
// next request to carry it. Two halves: `ChatInterface` puts it on the first saved
// message; `ChatConversation` reads it back and hands it in as `initialContext`.

import ChatConversation from '@/app/(app)/chat/[id]/ChatConversation'

const lastOpts = () => captured[captured.length - 1] as Record<string, unknown> & { onFinish?: (m: unknown) => Promise<void> }

describe('save: the clip reference is written on the first saved message', () => {
  it('onSave receives { role, content, context } on message 0 when the thread has a context', async () => {
    const onSave = vi.fn()
    render(<ChatInterface initialContext={{ kind: 'explore_clip', reviewId: REVIEW }} onSave={onSave} />)
    await lastOpts().onFinish!({ id: 'a1', role: 'assistant', content: 'Góc Huế ở 155 Nguyễn Thái Bình.' })
    expect(onSave).toHaveBeenCalledTimes(1)
    const [saved] = onSave.mock.calls[0]
    expect(saved[0]).toEqual({ role: 'assistant', content: 'Góc Huế ở 155 Nguyễn Thái Bình.', context: { kind: 'explore_clip', reviewId: REVIEW } })
  })

  it('a thread without a context saves exactly { role, content } — the row is unchanged for ordinary chat', async () => {
    const onSave = vi.fn()
    render(<ChatInterface onSave={onSave} />)
    await lastOpts().onFinish!({ id: 'a1', role: 'assistant', content: 'Chào bạn!' })
    const [saved] = onSave.mock.calls[0]
    expect(saved).toEqual([{ role: 'assistant', content: 'Chào bạn!' }])
    expect(Object.keys(saved[0])).toEqual(['role', 'content'])
  })
})

describe('restore: /chat/<id> hands the saved reference back as initialContext', () => {
  const conversation = (messages: Array<Record<string, unknown>>) => ({
    id: 'c1', title: 'Góc Huế', category: 'food', messages,
  }) as unknown as Parameters<typeof ChatConversation>[0]['conversation']

  it('a saved thread that started on the Explore button sends body.context on its follow-ups', () => {
    render(<ChatConversation conversation={conversation([
      { role: 'user', content: 'Cho mình biết thêm về Góc Huế', context: { kind: 'explore_clip', reviewId: REVIEW } },
      { role: 'assistant', content: 'Góc Huế ở 155 Nguyễn Thái Bình.' },
    ])} />)
    expect(lastBody().context).toEqual({ kind: 'explore_clip', reviewId: REVIEW })
  })

  it('a saved ordinary thread sends no context key at all', () => {
    render(<ChatConversation conversation={conversation([
      { role: 'user', content: 'Chào Tappy' },
      { role: 'assistant', content: 'Chào bạn!' },
    ])} />)
    expect('context' in lastBody()).toBe(false)
  })

  it('a malformed saved reference is ignored rather than trusted', () => {
    render(<ChatConversation conversation={conversation([
      { role: 'user', content: 'x', context: { kind: 'explore_clip', reviewId: 'not-a-uuid' } },
    ])} />)
    expect('context' in lastBody()).toBe(false)
  })

  it('ChatConversation re-saves the reference on every PUT, so it is never lost on a later turn', async () => {
    const calls: Array<{ method?: string; body: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push({ method: init?.method, body: JSON.parse(String(init?.body)) })
      return { ok: true, json: async () => ({}) }
    }))
    try {
      render(<ChatConversation conversation={conversation([
        { role: 'user', content: 'Cho mình biết thêm về Góc Huế', context: { kind: 'explore_clip', reviewId: REVIEW } },
      ])} />)
      await lastOpts().onFinish!({ id: 'a2', role: 'assistant', content: 'Mở 7h–21h.' })
      const put = calls.find(c => c.method === 'PUT')!
      expect(put).toBeTruthy()
      const body = put.body as { id: string; messages: Array<Record<string, unknown>> }
      expect(body.id).toBe('c1')
      expect(body.messages[0].context).toEqual({ kind: 'explore_clip', reviewId: REVIEW })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
