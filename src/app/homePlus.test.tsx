// @vitest-environment jsdom
// 15/11 (owner: "thanh chat ở trang chủ không có dấu cộng để chọn nghiên cứu sâu và chèn ảnh, tệp như trong mục chat"): the home page's box has the chat's "+". Pictures / PDF / Word / Excel and Deep Research
// are chosen there and travel to the chat page, which sends the question with them. Home still never answers in place: it navigates.
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const push = vi.fn()
let deepOffered = true
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/subscription/modeAccess', () => ({ useDeepResearchOffered: () => deepOffered }))
Object.defineProperty(window, 'matchMedia', { writable: true, value: (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }) })
Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:preview', configurable: true })
Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true })

import HomeV3 from './HomeV3'
import { takeHomeHandoff, setHomeHandoff } from '@/lib/chat/homeHandoff'

beforeEach(() => { deepOffered = true; takeHomeHandoff() })
afterEach(() => { cleanup(); push.mockClear(); takeHomeHandoff() })

const home = () => render(<HomeV3 user={false} userInfo={undefined} firstName="Huy" suggestions={[]} conversations={[]} hero={{ hour: 10, isWeekend: false, dayOfMonth: 1 }} />)
const pdf = (name = 'bao-cao.pdf', size = 50_000) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })
const xlsx = () => new File([new Uint8Array(1000)], 'chi-tieu.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

describe('homeHandoff', () => {
  it('is taken ONCE; an empty hand-off leaves nothing', () => {
    setHomeHandoff({ files: [pdf()], mode: 'auto' })
    expect(takeHomeHandoff()?.files).toHaveLength(1)
    expect(takeHomeHandoff()).toBeNull()
    setHomeHandoff({ files: [], mode: 'auto' })
    expect(takeHomeHandoff()).toBeNull()
    setHomeHandoff({ files: [], mode: 'deep' })
    expect(takeHomeHandoff()).toEqual({ files: [], mode: 'deep' })
  })
})

describe('the home box\'s "+"', () => {
  it('opens a menu with the attach item and, when the plan offers it, Deep Research (as in the chat); not when it does not', () => {
    const { getByTestId, queryByTestId } = home()
    expect(queryByTestId('home-plus-menu')).toBeNull()
    fireEvent.click(getByTestId('home-plus'))
    expect(getByTestId('home-attach')).toBeTruthy()
    expect(getByTestId('home-deep')).toBeTruthy()
    cleanup(); deepOffered = false
    const again = home()
    fireEvent.click(again.getByTestId('home-plus'))
    expect(again.getByTestId('home-attach')).toBeTruthy()
    expect(again.queryByTestId('home-deep')).toBeNull()
  })
  it('the picker takes pictures, PDF, Word and Excel, several at once', () => {
    const { getByTestId } = home()
    const input = getByTestId('home-file-input') as HTMLInputElement
    expect(input.multiple).toBe(true)
    for (const s of ['.docx', '.xlsx', 'application/pdf', 'image/png']) expect(input.accept).toContain(s)
  })
  it('chosen files show as chips (a document its name), can be removed, and a refused file says why', async () => {
    const { getByTestId, queryAllByTestId, container } = home()
    const input = getByTestId('home-file-input') as HTMLInputElement
    await act(async () => { fireEvent.change(input, { target: { files: [pdf(), xlsx()] } }) })
    await waitFor(() => expect(queryAllByTestId('home-file-chip')).toHaveLength(2))
    expect(container.textContent).toContain('bao-cao.pdf')
    expect(container.textContent).toContain('chi-tieu.xlsx')
    fireEvent.click(queryAllByTestId('home-file-chip')[0].querySelector('button')!)
    expect(queryAllByTestId('home-file-chip')).toHaveLength(1)
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['x'], 'a.doc', { type: 'application/msword' })] } }) })
    await waitFor(() => expect(container.querySelector('[role="status"]')?.textContent).toContain('.docx'))
  })
  it('sending with files opens the chat and leaves the files for it; sending a plain question leaves nothing', async () => {
    const { getByTestId, container } = home()
    await act(async () => { fireEvent.change(getByTestId('home-file-input'), { target: { files: [pdf()] } }) })
    await waitFor(() => expect(container.querySelector('[data-testid="home-file-chip"]')).toBeTruthy())
    fireEvent.submit(container.querySelector('form')!)
    expect(push).toHaveBeenCalledWith('/chat?q=')
    const handed = takeHomeHandoff()
    expect(handed?.files.map(f => f.name)).toEqual(['bao-cao.pdf'])
    expect(handed?.mode).toBe('auto')
    cleanup(); push.mockClear()
    const plain = home()
    fireEvent.change(plain.container.querySelector('input[type="text"], input:not([type])') as HTMLInputElement, { target: { value: 'quán cà phê Quận 1' } })
    fireEvent.submit(plain.container.querySelector('form')!)
    expect(push).toHaveBeenCalledWith(`/chat?q=${encodeURIComponent('quán cà phê Quận 1')}`)
    expect(takeHomeHandoff()).toBeNull()
  })
  it('Deep Research chosen: a removable chip, and the chat is told', () => {
    const { getByTestId, queryByTestId, container } = home()
    fireEvent.click(getByTestId('home-plus'))
    fireEvent.click(getByTestId('home-deep'))
    expect(getByTestId('home-deep-chip')).toBeTruthy()
    fireEvent.click(getByTestId('home-deep-chip').querySelector('button')!)
    expect(queryByTestId('home-deep-chip')).toBeNull()
    fireEvent.click(getByTestId('home-plus')); fireEvent.click(getByTestId('home-deep'))
    fireEvent.change(container.querySelector('input:not([type="file"])') as HTMLInputElement, { target: { value: 'so sánh chip AI' } })
    fireEvent.submit(container.querySelector('form')!)
    expect(takeHomeHandoff()).toEqual({ files: [], mode: 'deep' })
  })
  it('an empty box with nothing chosen does nothing', () => {
    const { container } = home()
    fireEvent.submit(container.querySelector('form')!)
    expect(push).not.toHaveBeenCalled()
  })
})

describe('the chat page takes the hand-off once, before it would send the question by itself', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/ChatInterface.tsx'), 'utf8')
  it('ChatInterface takes it on mount, sets Deep Research, checks the files like a pick, then sends', () => {
    const at = src.indexOf('takeHomeHandoff()')
    const send = src.indexOf('if (initialMessage && messages.length === 0)')
    expect(at).toBeGreaterThan(0)
    expect(at).toBeLessThan(send)
    const block = src.slice(at, send)
    expect(block).toContain("setChatMode('deep')")
    expect(block).toContain('acceptAttachments(handoff.files)')
    expect(block).toContain('requestSubmit()')
  })
})
