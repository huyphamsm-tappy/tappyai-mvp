// @vitest-environment jsdom
// Found by the dev test harness: a conversation OPENED from history showed no "Mẹo" button in its header although its itinerary carries tips. The tips are published
// by the itinerary (a child) while the chat mounts; the chat's own "a conversation switch clears the previous one's tips" effect ran AFTER those child effects and wiped
// them. Opening a conversation must keep its tips; switching away must still clear them.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

Element.prototype.scrollIntoView = vi.fn()
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }),
})

const PLAN = {
  type: 'trip', title: 'Đà Lạt 3N2Đ', people: 3, budget_total: '9.800.000đ',
  days: [{ label: 'Ngày 1', items: [{ time: '09:30', emoji: '✈️', category: 'transport', name: 'Sân bay Liên Khương', description: 'Xe riêng đón.' }] }],
  local_tips: [{ text: 'Đến lúc 08:30 khi cún hoạt bát.', basis: 'general', place: 'Sân bay Liên Khương' }, { text: 'Mang áo ấm.', basis: 'general' }],
}
const MESSAGES = [
  { id: '0', role: 'user', content: 'Lên lịch Đà Lạt' },
  { id: '1', role: 'assistant', content: `Đây là lịch trình.\n\n[TAPPY_PLAN]${JSON.stringify(PLAN)}[/TAPPY_PLAN]` },
]

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/chat/c1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('ai/react', () => ({
  useChat: () => ({
    messages: MESSAGES, input: '', handleInputChange: vi.fn(), handleSubmit: vi.fn(), isLoading: false,
    setInput: vi.fn(), append: vi.fn(), reload: vi.fn(), stop: vi.fn(), error: undefined, setMessages: vi.fn(),
  }),
}))
vi.mock('@/components/share/ShareMenu', () => ({ default: () => null }))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_WORKSPACE_V206', '1')
  vi.stubEnv('NEXT_PUBLIC_RESPONSE_PRESENTATION', '1')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
})
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('tips of an opened conversation', () => {
  it('stay published after the chat mounts (the header button needs them)', async () => {
    const { default: ChatInterface } = await import('@/components/ChatInterface')
    const { v206Store } = await import('@/lib/chat/v206Store')
    render(<ChatInterface conversationId="c1" savedMessages={MESSAGES.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))} />)
    expect(v206Store.getSnapshot().tips.length).toBe(2)
  }, 30_000)

  it('leaving the conversation takes them back (nothing of it stays for the next one)', async () => {
    const { default: ChatInterface } = await import('@/components/ChatInterface')
    const { v206Store } = await import('@/lib/chat/v206Store')
    const { unmount } = render(<ChatInterface conversationId="c1" savedMessages={[]} />)
    expect(v206Store.getSnapshot().tips.length).toBe(2)
    unmount()
    expect(v206Store.getSnapshot().tips.length).toBe(0)
  }, 30_000)

  it('a conversation id change clears the previous conversation\'s open drawer and tips before the new one publishes', async () => {
    const { default: ChatInterface } = await import('@/components/ChatInterface')
    const { v206Store } = await import('@/lib/chat/v206Store')
    const { rerender } = render(<ChatInterface conversationId="c1" savedMessages={[]} />)
    v206Store.openTips()
    expect(v206Store.getSnapshot().drawer?.kind).toBe('tips')
    // the drawer belonged to c1: after the switch it is closed (the new conversation then publishes its own tips, which do not reopen it)
    rerender(<ChatInterface conversationId="c2" savedMessages={[]} />)
    expect(v206Store.getSnapshot().drawer).toBeNull()
  }, 30_000)
})
