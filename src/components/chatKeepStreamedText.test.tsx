// @vitest-environment jsdom
// C2 P2 6.2 (F-3 (b), owner 19/10) — NEXT_PUBLIC_C2_KEEP_STREAMED_TEXT: a reply whose text was on screen while it streamed is kept EXACTLY as
// received — the client's repeat cleaner does not rewrite it (on screen or in what is saved) and the finish reveal does not hide and re-type
// it. Flag off, or a reply that only arrived as one frame at the very end → exactly the former behaviour. useChat is mocked; no network.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { cleanRepeats } from '@/lib/chat/replyRepeat'
import { shownWhileStreaming, STREAM_SHOWN_MIN_MS, StreamedTextKeeper } from '@/lib/chat/streamedText'

Element.prototype.scrollIntoView = vi.fn()
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }),
})

const messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }> = []
let loading = false
let opts: Record<string, any> = {}
const setMessages = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => '/chat', useSearchParams: () => new URLSearchParams() }))
vi.mock('ai/react', () => ({
  useChat: (o: Record<string, any>) => {
    opts = o
    return { messages, input: '', handleInputChange: vi.fn(), handleSubmit: vi.fn(), isLoading: loading, setInput: vi.fn(), append: vi.fn(), reload: vi.fn(), stop: vi.fn(), error: undefined, setMessages }
  },
}))

import ChatInterface from './ChatInterface'

// paragraphs alike enough for the client's sentence de-duplication to rewrite them (what happened on screen in the C2 browser probe)
const TEXT = ['một', 'hai', 'ba', 'bốn'].map(w => `Đây là đoạn thứ ${w} của câu trả lời thử nghiệm, viết bằng những câu ngắn và rõ ràng để đọc dễ hơn.`).join('\n\n')
const body = (c: HTMLElement) => [...c.querySelectorAll('[data-msg-id="a1"] .message-content')].map(e => e.textContent ?? '').join('\n')

let now = 0
beforeEach(() => {
  now = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  setMessages.mockClear()
  messages.length = 0
  messages.push({ id: 'u1', role: 'user', content: 'giải thích giúp mình' }, { id: 'a1', role: 'assistant', content: TEXT })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete process.env.NEXT_PUBLIC_C2_KEEP_STREAMED_TEXT })

/** The reply streams (on screen while loading) for `shownMs`, the server asked for the reveal, then it finishes. */
async function turn(shownMs: number, flag: boolean) {
  if (flag) process.env.NEXT_PUBLIC_C2_KEEP_STREAMED_TEXT = '1'
  const onSave = vi.fn()
  loading = true
  const r = render(<ChatInterface onSave={onSave} />)
  await act(async () => { opts.onResponse?.({ headers: new Headers({ 'x-tappy-reveal': '1' }) }) })
  // more text keeps arriving: a render while still receiving, just before the end — the FIRST time text showed must be kept, not this one
  now += Math.max(0, shownMs - 10)
  r.rerender(<ChatInterface onSave={onSave} />)
  now += Math.min(10, shownMs)
  loading = false
  r.rerender(<ChatInterface onSave={onSave} />)
  const afterFinish = body(r.container)
  await act(async () => { await opts.onFinish?.({ id: 'a1', role: 'assistant', content: TEXT }) })
  const saved = onSave.mock.calls.at(-1)?.[0] as Array<{ role: string; content: string }> | undefined
  return { afterFinish, saved: saved?.at(-1)?.content ?? null, rewrote: setMessages.mock.calls.length > 0 }
}

describe('C2 P2 6.2 · NEXT_PUBLIC_C2_KEEP_STREAMED_TEXT', () => {
  it('fixture check: the client cleaner DOES rewrite this reply (otherwise these tests prove nothing)', () => {
    expect(cleanRepeats(TEXT)).not.toBe(TEXT)
  })
  it('flag ON, the reply was on screen while it streamed → saved exactly as received, not rewritten, not hidden and re-typed', async () => {
    const t = await turn(1_500, true)
    expect(t.saved).toBe(TEXT)
    expect(t.rewrote).toBe(false)
    expect(t.afterFinish.replace(/\s+/g, '')).toBe(TEXT.replace(/\s+/g, ''))
  })
  it('flag OFF (the default) → exactly the former behaviour: cleaned (saved + on screen), and the finish reveal restarts from nothing', async () => {
    const t = await turn(1_500, false)
    expect(t.saved).toBe(cleanRepeats(TEXT))
    expect(t.rewrote).toBe(true)
    expect(t.afterFinish).toBe('')
  })
  it(`flag ON but the text only appeared at the very end (< ${STREAM_SHOWN_MIN_MS} ms on screen) → the former behaviour (cleaned, revealed)`, async () => {
    const t = await turn(50, true)
    expect(t.saved).toBe(cleanRepeats(TEXT))
    expect(t.afterFinish).toBe('')
  })
  it('🚨 the decision is taken ONCE per reply (at its finish) and never flips later — re-deciding mid-reveal stopped the reveal half-way (measured in the browser: text stuck at 48 chars)', () => {
    process.env.NEXT_PUBLIC_C2_KEEP_STREAMED_TEXT = '1'
    const k = new StreamedTextKeeper()
    k.noteShown('a1', 1_000)
    expect(k.keep('a1', 1_050)).toBe(false) // arrived at the very end: revealed as before
    expect(k.keep('a1', 5_000)).toBe(false) // …and still revealed 4 s later (the reveal is not cut off)
    k.noteShown('a2', 10_000); k.noteShown('a2', 10_900) // the FIRST time text showed counts
    expect(k.keep('a2', 11_000)).toBe(true)
  })
  it('flag OFF → never kept (exactly the former behaviour), whatever the timing', () => {
    const k = new StreamedTextKeeper()
    k.noteShown('a1', 0)
    expect(k.keep('a1', 60_000)).toBe(false)
  })
  it('shownWhileStreaming: same reply id and long enough on screen; another reply or too short → false', () => {
    expect(shownWhileStreaming({ id: 'a1', at: 0 }, 'a1', STREAM_SHOWN_MIN_MS)).toBe(true)
    expect(shownWhileStreaming({ id: 'a1', at: 0 }, 'a1', STREAM_SHOWN_MIN_MS - 1)).toBe(false)
    expect(shownWhileStreaming({ id: 'a1', at: 0 }, 'a2', 10_000)).toBe(false)
    expect(shownWhileStreaming(null, 'a1', 10_000)).toBe(false)
  })
})
