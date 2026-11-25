// @vitest-environment jsdom
// The itinerary as the RFC-001 mockup draws it (14/11/2026): the budget table closes the whole trip in three columns (item / basis / cost) with the total, and a stop's picture carries a
// caption and the profile button on it. All from the plan's own fields: the basis column exists only when the plan marked its amounts; a stop with no picture draws as before.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import TripTimeline from './TripTimeline'
import { v206Store } from '@/lib/chat/v206Store'
import { budgetLines } from '@/lib/chat/v206'
import type { TappyPlan } from '@/components/TripPlanCard'

vi.mock('@/components/share/ShareMenu', () => ({ default: () => null }))

const plan = (over: Partial<TappyPlan> = {}): TappyPlan => ({
  type: 'trip', title: 'Đà Lạt 2N1Đ', people: 2, budget_total: '~4.000.000đ cho 2 người',
  days: [
    { label: 'Ngày 1: Hồ Xuân Hương', items: [{ time: '08:00', emoji: '🌲', category: 'activity', name: 'Hồ Xuân Hương', description: 'Dạo quanh hồ.', address: 'Phường 1, Đà Lạt', photo_url: 'https://img.example.com/hxh.jpg' }] },
    { label: 'Ngày 2: Cầu Đất', items: [{ time: '09:00', emoji: '🍵', category: 'activity', name: 'Đồi chè Cầu Đất', description: 'Ngắm đồi chè.' }] },
  ],
  cost_breakdown: { 'Khách sạn 1 đêm': '800.000đ', 'Ăn uống 2 ngày': '900.000đ (ước tính)' },
  ...over,
})

beforeEach(() => { setLocale('vi'); v206Store.reset() })
afterEach(() => { cleanup(); v206Store.reset() })

describe('pictures found after the answer (16/11)', () => {
  const p = plan({ days: [{ label: 'Ngày 1: Hồ Xuân Hương', items: [
    { time: '08:00', emoji: '🌲', category: 'activity', name: 'Hồ Xuân Hương', description: 'Dạo.', address: 'Phường 1, Đà Lạt' },
    { time: '10:00', emoji: '☕', category: 'food', name: 'Cafe Tùng', description: 'Cà phê.', address: '6 Hoàng Văn Thụ', photo_url: 'https://img.example.com/own.jpg' },
    { time: '12:00', emoji: '🍲', category: 'food', name: 'Bánh căn Cô Thương', description: 'Ăn.', address: 'x' },
  ] }] })
  it('a stop with no picture of its own takes the one found for it (name key: accents and case do not matter); its own picture always wins', () => {
    const { container } = render(<TripTimeline msgId="m1" plan={p} stopImages={new Map([['ho xuan huong', 'https://img.example.com/ho.jpg'], ['cafe tung', 'https://img.example.com/other.jpg']])} />)
    const srcs = [...container.querySelectorAll('.v206-stop img')].map(i => i.getAttribute('src'))
    expect(srcs).toEqual(['https://img.example.com/ho.jpg', 'https://img.example.com/own.jpg'])
  })
  it('an unsafe address is never drawn, and no map means the stops draw as before', () => {
    const bad = render(<TripTimeline msgId="m1" plan={p} stopImages={new Map([['ho xuan huong', 'http://insecure.example.com/ho.jpg']])} />)
    expect([...bad.container.querySelectorAll('.v206-stop img')].map(i => i.getAttribute('src'))).toEqual(['https://img.example.com/own.jpg'])
    cleanup()
    const none = render(<TripTimeline msgId="m1" plan={p} />)
    expect(none.container.querySelectorAll('.v206-stop img')).toHaveLength(1)
  })
})

describe('budgetLines', () => {
  it('splits the plan\'s own "(ước tính)" mark off the amount; the basis exists only when the plan marks something', () => {
    expect(budgetLines(plan())).toEqual({ hasBasis: true, lines: [{ label: 'Khách sạn 1 đêm', amount: '800.000đ', estimate: false }, { label: 'Ăn uống 2 ngày', amount: '900.000đ', estimate: true }] })
    expect(budgetLines(plan({ cost_breakdown: { 'Vé': '100.000đ' } }))).toEqual({ hasBasis: false, lines: [{ label: 'Vé', amount: '100.000đ', estimate: false }] })
    expect(budgetLines(plan({ cost_breakdown: { 'Food': '50 USD (estimate)' } })).lines[0]).toMatchObject({ amount: '50 USD', estimate: true })
    expect(budgetLines(plan({ cost_breakdown: undefined }))).toEqual({ hasBasis: false, lines: [] })
  })
})

describe('the budget table', () => {
  it('closes the all-days view in three columns with the total and the plan\'s own note', () => {
    const { container } = render(<TripTimeline msgId="m1" plan={plan()} />)
    const table = container.querySelector('[data-testid="v206-budget"] table') as HTMLElement
    expect([...table.querySelectorAll('thead th')].map(e => e.textContent)).toEqual(['Hạng mục chi phí', 'Cơ sở', 'Chi phí'])
    const rows = [...table.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent))
    expect(rows).toEqual([['Khách sạn 1 đêm', 'Từ kết quả tra cứu', '800.000đ'], ['Ăn uống 2 ngày', 'Ước tính', '900.000đ']])
    expect([...table.querySelectorAll('tfoot tr')[0].children].map(c => c.textContent)).toEqual(['Tổng dự kiến', '', '~4.000.000đ cho 2 người'])
    expect(container.querySelector('.v206-note')?.textContent).toContain('chưa kiểm chứng')
    // it follows the days in the page
    const days = container.querySelector('.v206-tl') as HTMLElement
    expect(days.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('one day alone does not carry it; the budget tab still does', () => {
    const { container } = render(<TripTimeline msgId="m1" plan={plan()} />)
    fireEvent.click(screen.getAllByRole('tab')[1]) // [all days, day 1, day 2, budget]
    expect(container.querySelector('[data-testid="v206-budget"]')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Dự toán' }))
    expect(container.querySelector('[data-testid="v206-budget"]')).toBeTruthy()
  })
  it('a plan that marks nothing keeps two columns (no basis is invented); a plan with no costs has no table', () => {
    const a = render(<TripTimeline msgId="m1" plan={plan({ cost_breakdown: { 'Vé': '100.000đ' } })} />)
    expect([...a.container.querySelectorAll('[data-testid="v206-budget"] thead th')].map(e => e.textContent)).toEqual(['Hạng mục chi phí', 'Chi phí'])
    cleanup()
    const b = render(<TripTimeline msgId="m2" plan={plan({ cost_breakdown: undefined })} />)
    expect(b.container.querySelector('[data-testid="v206-budget"]')).toBeNull()
  })
})

describe('the hero picture of a stop', () => {
  it('carries the stop\'s own name and address as a caption, and the profile button sits on it when there is a profile to open', () => {
    const { container } = render(<TripTimeline msgId="m1" plan={plan()} places={[{ name: 'Hồ Xuân Hương', address: 'Phường 1, Đà Lạt', rating_value: 4.6, rating_count: 1200 } as never]} />)
    const photo = container.querySelector('.v206-photo') as HTMLElement
    expect(photo.querySelector('img')?.getAttribute('src')).toBe('https://img.example.com/hxh.jpg')
    expect(photo.querySelector('[data-testid="v206-photo-caption"]')?.textContent).toBe('Hồ Xuân Hương · Phường 1, Đà Lạt')
    expect(photo.querySelector('[data-testid="v206-open-entity"]')).toBeTruthy()
    // the address is on the picture, not repeated under it; the profile button is not drawn twice
    expect(container.querySelectorAll('[data-testid="v206-open-entity"]').length).toBe(1)
    expect(container.querySelector('.v206-stop .v206-addr')).toBeNull()
  })
  it('a stop with no picture is drawn as before: the address line and the links row, no caption', () => {
    const p = plan({ days: [{ label: 'Ngày 1', items: [{ time: '08:00', emoji: '🌲', category: 'activity', name: 'Hồ Xuân Hương', address: 'Phường 1, Đà Lạt', maps_link: 'https://maps.example.com/x' }] }] })
    const { container } = render(<TripTimeline msgId="m1" plan={p} />)
    expect(container.querySelector('.v206-photo')).toBeNull()
    expect(container.querySelector('[data-testid="v206-photo-caption"]')).toBeNull()
    expect(container.querySelector('.v206-addr')?.textContent).toContain('Phường 1, Đà Lạt')
    expect(container.querySelector('.v206-links a')).toBeTruthy()
  })
})
