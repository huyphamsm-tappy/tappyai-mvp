// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import AskCard from './AskCard'

// The redesigned quick-ask card (owner 30/09): tiles select, the reply is merged as before, the card locks after send.
afterEach(cleanup)
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ version: 't', images: {} }) })))
const QS = [
  { id: 'activity', q: 'Muốn chơi gì?', options: ['Karaoke', 'Xem phim', 'Bar/pub', 'Bida/bowling'] },
  { id: 'party', q: 'Mấy người / đi với ai?', options: ['1 mình', '2 người', 'Nhóm 3-5', 'Nhóm đông'] },
  { id: 'time', q: 'Đi lúc mấy giờ?', options: ['Chiều nay', 'Tối nay', 'Cuối tuần'] },
]
const opt = (label: string) => screen.getAllByRole('button').find(b => b.textContent === label) as HTMLButtonElement

describe('AskCard', () => {
  it('renders the mockup frame: header, numbered steps, photo tiles for "what kind", icon tiles for the rest', () => {
    const { container } = render(<AskCard questions={QS} onSend={() => {}} />)
    expect(screen.getByText('Tìm gì cho bạn hôm nay?')).toBeTruthy()
    expect(screen.getByText('Chọn nhanh vài thứ, Tappy sẽ tìm phần còn lại.')).toBeTruthy()
    expect(container.querySelector('[data-ask-step="activity"]')?.getAttribute('data-ask-kind')).toBe('type')
    expect(container.querySelector('[data-ask-step="party"]')?.getAttribute('data-ask-kind')).toBe('party')
    expect(container.querySelector('[data-image-key="diem-karaoke"]')).toBeTruthy()
    expect(screen.getByText('Chọn một hoặc nhiều')).toBeTruthy()
  })
  it('"what kind" takes several, the others one; sends the merged answer once, then locks', () => {
    const onSend = vi.fn()
    render(<AskCard questions={QS} onSend={onSend} />)
    fireEvent.click(opt('Karaoke')); fireEvent.click(opt('Bida/bowling'))
    fireEvent.click(opt('1 mình')); fireEvent.click(opt('2 người'))
    fireEvent.click(opt('Tối nay'))
    expect(opt('Karaoke').getAttribute('aria-pressed')).toBe('true')
    expect(opt('Bida/bowling').getAttribute('aria-pressed')).toBe('true')
    expect(opt('1 mình').getAttribute('aria-pressed')).toBe('false')
    fireEvent.change(screen.getByPlaceholderText('Hoặc nói thêm ý khác…'), { target: { value: 'có view đẹp' } })
    fireEvent.click(screen.getByText('Tìm cho tôi'))
    expect(onSend).toHaveBeenCalledWith('Karaoke, Bida/bowling · 2 người · Tối nay · có view đẹp')
    expect(screen.getByText('Đang tìm…')).toBeTruthy()
    fireEvent.click(screen.getByText('Đang tìm…'))
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(opt('Xem phim').closest('fieldset')?.disabled).toBe(true)
  })
  it('picks survive the remount after the first reply (router.replace to /chat/<id>), and are dropped once sent', () => {
    const onSend = vi.fn()
    const first = render(<AskCard questions={QS} onSend={onSend} />)
    fireEvent.click(opt('Karaoke')); fireEvent.click(opt('Nhóm 3‑5'))
    first.unmount()
    render(<AskCard questions={QS} onSend={onSend} />)
    expect(opt('Karaoke').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(opt('Xem phim'))
    fireEvent.click(screen.getByText('Tìm cho tôi'))
    expect(onSend).toHaveBeenCalledWith('Karaoke, Xem phim · Nhóm 3-5')
    cleanup()
    render(<AskCard questions={QS} onSend={onSend} />)
    expect(opt('Karaoke').getAttribute('aria-pressed')).toBe('false')
  })
  it('sending with nothing chosen sends "Tìm cho tôi"', () => {
    const onSend = vi.fn()
    render(<AskCard questions={QS} onSend={onSend} />)
    fireEvent.click(screen.getByText('Tìm cho tôi'))
    expect(onSend).toHaveBeenCalledWith('Tìm cho tôi')
  })
})
