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
    const page = readFileSync('src/app/chat/page.tsx', 'utf8')
    expect(page).toContain("searchParams.get('ctx')")
    expect(page).toMatch(/initialContext=\{exploreReviewId \? \{ kind: 'explore_clip', reviewId: exploreReviewId \} : undefined\}/)
    // Still the same route and the same visible question: `q` is read exactly as before.
    expect(page).toContain("searchParams.get('q')")
  })
})
