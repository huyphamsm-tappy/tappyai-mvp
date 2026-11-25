// @vitest-environment jsdom
// Layout slice 3 (14/11/2026) — NEXT_PUBLIC_PRESENT_BLOCKS: the web client draws the blocks the model declared (the server's live frame `tappy.presentation.v1`) under the answer: from the
// annotation only (never the text), kept across the save navigation in the tab's memory (like the place card), a booking only with a valid https link for its own block. Flag off: nothing is
// read and nothing is drawn, whatever the message carries. No network.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

Element.prototype.scrollIntoView = vi.fn()
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }),
})

const messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; annotations?: unknown[] }> = []
let loading = false
const append = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('ai/react', () => ({
  useChat: () => ({
    messages, input: '', handleInputChange: vi.fn(), handleSubmit: vi.fn(), isLoading: loading, setInput: vi.fn(),
    append, reload: vi.fn(), stop: vi.fn(), error: undefined, setMessages: vi.fn(),
  }),
}))

const ANSWER = 'Mình chọn tàu SE8 vì hợp giờ và rẻ hơn xe giường nằm khoảng 35.000đ, nên đi tàu nếu bạn không vội.'
const LINK = { url: 'https://vexere.com/vn/ve-tau-hoa/dat-ve-tau.vi', label: 'Vexere', providerId: 'vexere', handoff: 'guest' }
const FRAME = (links: Record<string, unknown> = { b1: LINK }) => ({
  kind: 'tappy.presentation.v1', v: 1, links,
  presentation: { v: 1, blocks: [
    { id: 'c1', type: 'compare', title: 'Tàu hay xe khách?', columns: ['Tàu SE8', 'Xe giường nằm'], rows: [{ label: 'Giá', cells: ['315.000đ', '350.000đ'] }], pick: 0 },
    { id: 'a1', type: 'ask', questions: [{ text: 'Đi ghế ngồi hay giường nằm?', options: ['Ghế ngồi', 'Giường nằm'] }] },
    { id: 'b1', type: 'booking', kind: 'transport', title: 'Tàu SE8 Sài Gòn – Nha Trang', providerId: 'vexere', ref: 'r1' },
  ] },
})
function seed(content: string, annotations?: unknown[], isLoading = false) {
  messages.length = 0
  messages.push({ id: 'u1', role: 'user', content: 'tàu hay xe khách đi Nha Trang' })
  messages.push({ id: 'a1', role: 'assistant', content, annotations })
  loading = isLoading
}
async function load(flag: '1' | undefined) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_PRESENT_BLOCKS', flag as string)
  return (await import('./ChatInterface')).default
}

beforeEach(() => { append.mockClear() })
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

// 15/11 (owner: "không vá từng case; layout chuẩn, Tappy nhận biết câu hỏi rồi dùng bố cục phù hợp"): the follow-up chips under an answer are the SAME ones the model declared, whatever the
// question; the look only draws them (round pills, one uniform icon, the first one the lead). Nothing is added per question, and with the look off they are the old chips.
describe('look flag: the follow-up chips are the model\'s own, drawn in one standard style', () => {
  const WITH_CHIPS = 'Cafe Bờ Sông gần bạn nhất, còn Coffee Bờ Sông Xanh thoáng hơn.\n[FOLLOWUPS]Tư vấn chi tiết|Quán nào có chỗ đậu xe|Lên kế hoạch đi[/FOLLOWUPS]'
  async function loadLook(on: boolean) {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_WORKSPACE_V206', on ? '1' : '0')
    vi.stubEnv('NEXT_PUBLIC_RESPONSE_PRESENTATION', on ? '1' : '0')
    return (await import('./ChatInterface')).default
  }
  it('look ON: exactly the declared suggestions, as pills, the first one the lead, each with the same icon', async () => {
    const ChatInterface = await loadLook(true)
    seed(WITH_CHIPS)
    const { container } = render(<ChatInterface />)
    const chips = [...container.querySelectorAll('button.v206-followup')]
    expect(chips.map(c => c.textContent?.trim())).toEqual(['Tư vấn chi tiết', 'Quán nào có chỗ đậu xe', 'Lên kế hoạch đi'])
    expect(chips.map(c => c.classList.contains('v206-followup-lead'))).toEqual([true, false, false])
    expect(chips.every(c => c.querySelectorAll('svg').length === 1)).toBe(true)
    fireEvent.click(chips[1])
    expect(append).toHaveBeenCalledWith({ role: 'user', content: 'Quán nào có chỗ đậu xe' })
  }, 30000)
  it('look OFF: the same suggestions as the old chips, no pill class, no icon', async () => {
    const ChatInterface = await loadLook(false)
    seed(WITH_CHIPS)
    const { container } = render(<ChatInterface />)
    expect(container.querySelectorAll('.v206-followup').length).toBe(0)
    expect(screen.getByRole('button', { name: 'Quán nào có chỗ đậu xe' })).toBeTruthy()
  }, 30000)
})

describe('NEXT_PUBLIC_PRESENT_BLOCKS · the blocks the model declared', () => {
  it('flag ON: a table, the options and the booking button are drawn from the frame, outside the answer text', async () => {
    const ChatInterface = await load('1')
    seed(ANSWER, [FRAME()])
    const { container } = render(<ChatInterface />)
    expect(container.querySelectorAll('[data-block]').length).toBe(3)
    expect(container.querySelector('[data-compare] table')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Giường nằm' })).toBeTruthy()
    const a = container.querySelector('[data-block="booking"] a') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe(LINK.url)
    expect(container.querySelector('.message-content')?.textContent ?? '').not.toContain('Tàu hay xe khách?')
    expect(container.textContent).toContain('Mình chọn tàu SE8')
  }, 30000) // the first test of the file pays for the dynamic import of the whole chat module: it passed alone and timed out at 5 s under the full parallel run
  it('flag ON: tapping an option sends it as the person\'s reply', async () => {
    const ChatInterface = await load('1')
    seed(ANSWER, [FRAME()])
    render(<ChatInterface />)
    fireEvent.click(screen.getByRole('button', { name: 'Ghế ngồi' }))
    expect(append).toHaveBeenCalledWith({ role: 'user', content: 'Ghế ngồi' })
  })
  it('flag ON: while the reply is still streaming the options do not send', async () => {
    const ChatInterface = await load('1')
    seed(ANSWER, [FRAME()], true)
    render(<ChatInterface />)
    fireEvent.click(screen.getByRole('button', { name: 'Ghế ngồi' }))
    expect(append).not.toHaveBeenCalled()
  })
  it('flag ON: kept across the save navigation (the remounted message has no annotations), for that answer only', async () => {
    const ChatInterface = await load('1')
    seed(ANSWER, [FRAME()])
    render(<ChatInterface />)
    cleanup()
    seed(ANSWER, undefined)
    const again = render(<ChatInterface />)
    expect(again.container.querySelectorAll('[data-block]').length).toBe(3)
    cleanup()
    seed('Một câu trả lời khác hẳn, không liên quan tới lượt trước, dài hơn một chút để khác hình dạng.', undefined)
    const other = render(<ChatInterface />)
    expect(other.container.querySelectorAll('[data-block]').length).toBe(0)
  })
  it('flag ON: a booking whose block has no valid https link is not drawn; the rest is', async () => {
    const ChatInterface = await load('1')
    seed(ANSWER, [FRAME({ b1: { ...LINK, url: 'javascript:alert(1)' } })])
    const { container } = render(<ChatInterface />)
    expect(container.querySelector('[data-block="booking"]')).toBeNull()
    expect(container.querySelectorAll('[data-block]').length).toBe(2)
  })
  it('flag ON, no frame (every ordinary turn): nothing is drawn', async () => {
    const ChatInterface = await load('1')
    seed(ANSWER, undefined)
    const { container } = render(<ChatInterface />)
    expect(container.querySelectorAll('[data-block]').length).toBe(0)
  })
  it('flag OFF: the same message draws nothing, and nothing is remembered', async () => {
    const ChatInterface = await load(undefined)
    seed(ANSWER, [FRAME()])
    const { container } = render(<ChatInterface />)
    expect(container.querySelectorAll('[data-block]').length).toBe(0)
    cleanup()
    seed(ANSWER, undefined)
    const again = render(<ChatInterface />)
    expect(again.container.querySelectorAll('[data-block]').length).toBe(0)
  })
})
