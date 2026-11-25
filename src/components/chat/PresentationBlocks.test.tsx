// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import PresentationBlocks from './PresentationBlocks'
import { readPresentationFrame } from '@/lib/presentation/read'

// Layout slice 3 (14/11/2026): the three blocks the model may declare, drawn from the checked frame. The model's words are plain text (never HTML), a booking is a real link with the right rel,
// an option is one tap that sends it as the person's reply, and the table scrolls sideways on a phone instead of breaking the page.
afterEach(cleanup)

const LINK = { url: 'https://go.isclix.com/deep_link/1/2?url=https%3A%2F%2Fvexere.com%2Fx', label: 'Vexere', providerId: 'vexere', handoff: 'guest' }
const FRAME = (blocks: unknown[], links: Record<string, unknown> = { b1: LINK }) => readPresentationFrame([{ kind: 'tappy.presentation.v1', v: 1, presentation: { v: 1, blocks }, links }])!
const CMP = { id: 'c1', type: 'compare', title: 'Tàu hay xe khách?', columns: ['Tàu SE8', 'Xe giường nằm'], rows: [{ label: 'Giá', cells: ['315.000đ', '350.000đ'] }, { label: 'Thời gian', cells: ['7h43', '9h'] }], pick: 0 }
const ASK = { id: 'a1', type: 'ask', questions: [{ text: 'Đi ghế ngồi hay giường nằm?', options: ['Ghế ngồi', 'Giường nằm'] }] }
const BOOK = { id: 'b1', type: 'booking', kind: 'transport', title: 'Tàu SE8 Sài Gòn – Nha Trang', detail: '16/11, 2 người', providerId: 'vexere', ref: 'r1' }

describe('PresentationBlocks', () => {
  it('compare: a table with the options as columns and the criteria as row headings; the pick is marked', () => {
    const { container } = render(<PresentationBlocks frame={FRAME([CMP])} onSend={() => {}} />)
    expect(screen.getByText('Tàu hay xe khách?')).toBeTruthy()
    expect(container.querySelectorAll('thead th').length).toBe(3)
    expect(container.querySelectorAll('tbody tr').length).toBe(2)
    expect(container.querySelector('tbody th')?.textContent).toBe('Giá')
    expect(screen.getByText('315.000đ')).toBeTruthy()
    expect(container.querySelector('[data-pick="true"]')?.textContent).toContain('Tàu SE8')
    expect(container.querySelector('[data-compare] [data-scroll]')).toBeTruthy()
  })
  it('ask: each option is one button that sends it as the reply; the block locks after the tap', () => {
    const onSend = vi.fn()
    render(<PresentationBlocks frame={FRAME([ASK])} onSend={onSend} />)
    expect(screen.getByText('Đi ghế ngồi hay giường nằm?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Giường nằm' }))
    expect(onSend).toHaveBeenCalledWith('Giường nằm')
    fireEvent.click(screen.getByRole('button', { name: 'Ghế ngồi' }))
    expect(onSend).toHaveBeenCalledTimes(1)
  })
  it('ask: a disabled block (an older answer) sends nothing', () => {
    const onSend = vi.fn()
    render(<PresentationBlocks frame={FRAME([ASK])} onSend={onSend} disabled />)
    fireEvent.click(screen.getByRole('button', { name: 'Ghế ngồi' }))
    expect(onSend).not.toHaveBeenCalled()
  })
  it('booking: a real https link, opened in a new tab, marked as a partner link, with the title and detail', () => {
    const { container } = render(<PresentationBlocks frame={FRAME([BOOK])} onSend={() => {}} />)
    const a = container.querySelector('a[href]') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe(LINK.url)
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer sponsored')
    expect(a.dataset.ctaType).toBe('booking')
    expect(a.textContent).toContain('Vexere')
    expect(screen.getByText('Tàu SE8 Sài Gòn – Nha Trang')).toBeTruthy()
    expect(screen.getByText('16/11, 2 người')).toBeTruthy()
    expect(screen.getByText('Liên kết đối tác')).toBeTruthy()
  })
  it('booking: a link that is not an affiliate wrapper carries no partner caption; a merchant login is said', () => {
    render(<PresentationBlocks frame={FRAME([BOOK], { b1: { ...LINK, url: 'https://vexere.com/x', handoff: 'merchant_login' } })} onSend={() => {}} />)
    expect(screen.queryByText('Liên kết đối tác')).toBeNull()
    expect(screen.getByText('Cần đăng nhập trên trang đối tác')).toBeTruthy()
  })
  it('English labels follow the language', () => {
    render(<PresentationBlocks frame={FRAME([CMP, BOOK])} onSend={() => {}} lang="en" />)
    expect(screen.getByText("Tappy's pick")).toBeTruthy()
    expect(screen.getByText('Partner link')).toBeTruthy()
    expect(screen.getByText('Book with Vexere')).toBeTruthy()
  })
  it('the model\'s words are text, never markup', () => {
    const { container } = render(<PresentationBlocks frame={FRAME([{ ...CMP, title: '<img src=x onerror=alert(1)>', rows: [{ label: '<b>x</b>', cells: ['<script>1</script>', 'b'] }] }])} onSend={() => {}} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('tbody th b')).toBeNull()
    expect(container.textContent).toContain('<b>x</b>')
  })
  it('blocks come in the order they were declared', () => {
    const { container } = render(<PresentationBlocks frame={FRAME([ASK, CMP, BOOK])} onSend={() => {}} />)
    const kinds = [...container.querySelectorAll('[data-block]')].map(e => e.getAttribute('data-block'))
    expect(kinds).toEqual(['ask', 'compare', 'booking'])
  })
})
