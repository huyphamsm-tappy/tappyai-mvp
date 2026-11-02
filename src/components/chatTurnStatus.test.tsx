// @vitest-environment jsdom
// C2 P2 layer 5 — the web client shows the server's turn status (`tappy.turn_status.v1`: incomplete / interrupted) as ONE fixed line under the
// message: from the annotation only (never the text), never inside the answer body (so copy / TTS / the saved message never carry it), only once
// the reply is done, client copy only (the server's reason is never shown), kept across the save navigation in the tab's memory (like the place
// card) — never from that memory while a reply is still streaming. No network.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TURN_STATUS_KIND } from '@/lib/recommendation/progressAnnotation'
import { __resetTurnStatusCache } from '@/lib/recommendation/turnStatusCache'
import { vi as VI, en as EN } from '@/lib/i18n/w5/chatResilience'

Element.prototype.scrollIntoView = vi.fn()
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

const messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; annotations?: unknown[] }> = []
let loading = false

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('ai/react', () => ({
  useChat: () => ({
    messages, input: '', handleInputChange: vi.fn(), handleSubmit: vi.fn(), isLoading: loading, setInput: vi.fn(),
    append: vi.fn(), reload: vi.fn(), stop: vi.fn(), error: undefined, setMessages: vi.fn(),
  }),
}))

import ChatInterface from './ChatInterface'

const ANSWER = 'Lạm phát là khi mặt bằng giá chung tăng theo thời gian, nên cùng một số tiền mua được ít hàng hơn.'
const status = (s: string, reason = 'length_limit') => ({ kind: TURN_STATUS_KIND, v: 1, status: s, reason })
function seed(content: string, annotations?: unknown[], isLoading = false) {
  messages.length = 0
  messages.push({ id: 'u1', role: 'user', content: 'lạm phát là gì' })
  messages.push({ id: 'a1', role: 'assistant', content, annotations })
  loading = isLoading
}
const bodyText = (c: HTMLElement) => [...c.querySelectorAll('.message-content')].map(e => e.textContent ?? '').join('\n')

beforeEach(() => __resetTurnStatusCache())
afterEach(cleanup)

describe('C2 P2 layer 5 · the turn status line', () => {
  it('incomplete → one status line with the fixed incomplete copy, outside the answer body', () => {
    seed(ANSWER, [status('incomplete')])
    const { container } = render(<ChatInterface />)
    const lines = screen.getAllByTestId('turn-status')
    expect(lines).toHaveLength(1)
    expect(lines[0].getAttribute('data-status')).toBe('incomplete')
    expect([VI['chat.turnIncomplete'], EN['chat.turnIncomplete']]).toContain(lines[0].textContent)
    // never part of the answer body (what copy / TTS read and what is saved)
    expect(bodyText(container)).not.toContain(lines[0].textContent!)
    expect(lines[0].closest('.message-content')).toBeNull()
    expect(bodyText(container)).toContain('Lạm phát là khi')
  })
  it('interrupted → the interrupted copy; the server reason is never shown', () => {
    seed(ANSWER, [status('interrupted', 'provider_error')])
    const { container } = render(<ChatInterface />)
    const line = screen.getByTestId('turn-status')
    expect(line.getAttribute('data-status')).toBe('interrupted')
    expect([VI['chat.turnInterrupted'], EN['chat.turnInterrupted']]).toContain(line.textContent)
    expect(container.textContent).not.toContain('provider_error')
  })
  it('no status annotation → no line (every ordinary turn, and every turn with the C2 flags off)', () => {
    seed(ANSWER, undefined)
    render(<ChatInterface />)
    expect(screen.queryByTestId('turn-status')).toBeNull()
  })
  it('an unknown status value or another annotation kind → no line', () => {
    seed(ANSWER, [{ kind: TURN_STATUS_KIND, v: 1, status: 'done', reason: 'x' }, { kind: 'tappy.progress.v1', v: 1, stage: 'writing', text: 'Đang viết' }])
    render(<ChatInterface />)
    expect(screen.queryByTestId('turn-status')).toBeNull()
  })
  it('while the reply is still streaming → no line yet', () => {
    seed(ANSWER, [status('incomplete')], true)
    render(<ChatInterface />)
    expect(screen.queryByTestId('turn-status')).toBeNull()
  })
  it('kept across the save navigation: the remounted message (no annotations, as saved) still shows its status — in the tab memory only', () => {
    seed(ANSWER, [status('interrupted', 'provider_error')])
    render(<ChatInterface />)
    cleanup()
    seed(ANSWER, undefined) // what `/chat/<id>` remounts from: {role, content} only
    render(<ChatInterface />)
    expect(screen.getByTestId('turn-status').getAttribute('data-status')).toBe('interrupted')
  })
  it('🚨 never from the tab memory while a reply is streaming, and never for a different message', () => {
    seed(ANSWER, [status('incomplete')])
    render(<ChatInterface />)
    cleanup()
    seed(ANSWER, undefined, true)
    render(<ChatInterface />)
    expect(screen.queryByTestId('turn-status')).toBeNull()
    cleanup()
    seed('Một câu trả lời khác hẳn, không liên quan tới lượt trước.', undefined)
    render(<ChatInterface />)
    expect(screen.queryByTestId('turn-status')).toBeNull()
  })
  it('both languages have the copy', () => {
    for (const k of ['chat.turnIncomplete', 'chat.turnInterrupted']) { expect(VI[k]).toBeTruthy(); expect(EN[k]).toBeTruthy() }
  })
})
