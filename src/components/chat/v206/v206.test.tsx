// @vitest-environment jsdom
// Workspace v206 in the browser: the itinerary timeline (tabs, time chips, numbered stops, the tip beside its stop, the plan's own budget), the entity drawer (real fields only, Esc closes
// and gives the focus back), the tips drawer (the answer's own tips; a search only when it is worth having) and the flag-off promise (the research canvas is unchanged).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen, within, act } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import { formatMessage } from '@/components/ChatInterface'
import ResearchCanvas from '@/components/chat/ResearchCanvas'
import TripTimeline, { TipsPublisher } from './TripTimeline'
import V206DrawerHost from './V206Drawers'
import { v206Store } from '@/lib/chat/v206Store'
import type { TappyPlan } from '@/components/TripPlanCard'
import type { PlanTip } from '@/lib/chat/v206'

vi.mock('@/components/share/ShareMenu', () => ({ default: () => null }))

const plan: TappyPlan = {
  type: 'trip', title: 'Đà Lạt 3N2Đ', people: 3, budget_total: '9.800.000đ',
  days: [
    { label: 'Ngày 1: Hồ Tuyền Lâm', items: [
      { time: '9h30', emoji: '✈️', category: 'transport', name: 'Sân bay Liên Khương', description: 'Xe riêng đón.' },
      { time: '14:00', emoji: '🏨', category: 'hotel', name: 'Terracotta Resort', price: '1.850.000đ', address: 'Hồ Tuyền Lâm, Đà Lạt', maps_link: 'https://maps.google.com/?q=terracotta', photo_url: 'https://example.com/t.jpg' },
    ] },
    { label: 'Ngày 2: Puppy Farm', items: [{ time: '08:30', emoji: '🐶', category: 'entertainment', name: 'Nông trại Cún Puppy Farm', description: 'Vé 100.000đ.' }] },
  ],
  cost_breakdown: { 'Lưu trú': '3.700.000đ', 'Ăn uống': '1.500.000đ' },
  local_tips: [{ text: 'Đến lúc 08:30 khi cún hoạt bát.', basis: 'tool', place: 'Puppy Farm' }, { text: 'Mang áo ấm.', basis: 'general' }],
}
const place = { id: 'p1', name: 'Terracotta Resort', address: '7.9 Tuyền Lâm', rating: 4.6, ratingCount: 800, phone: '+84 263 3555 888', image: 'https://example.com/p.jpg' }

beforeEach(() => { setLocale('vi'); v206Store.reset() })
afterEach(() => { cleanup(); v206Store.reset() })

const stops = () => screen.queryAllByTestId('v206-stop')

describe('TripTimeline', () => {
  it('draws the whole trip with real tabs, time chips, numbered stops and the plan facts only', () => {
    const { container } = render(<TripTimeline msgId="m1" plan={plan} />)
    expect(screen.getByRole('heading', { name: 'Đà Lạt 3N2Đ' })).toBeTruthy()
    const tabs = screen.getAllByRole('tab').map(x => x.textContent)
    expect(tabs).toEqual(['Tất cả 2 ngày', 'Ngày 1', 'Ngày 2', 'Dự toán'])
    expect(stops()).toHaveLength(3)
    expect(container.textContent).toContain('09:30')
    expect(Array.from(container.querySelectorAll('.v206-node')).map(n => n.textContent)).toEqual(['1', '2', '3'])
    expect(container.textContent).toContain('3 người')
    expect(container.textContent).toContain('9.800.000đ')
    // nothing the plan does not state
    expect(container.textContent).not.toMatch(/verified|Evidence|đối tác|giảm giá|partner/i)
  })

  it('a day tab shows only that day and keeps the stop numbers of the whole trip', () => {
    const { container } = render(<TripTimeline msgId="m1" plan={plan} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Ngày 2' }))
    expect(stops()).toHaveLength(1)
    expect(container.querySelector('.v206-node')!.textContent).toBe('3')
    expect(screen.getByRole('tab', { name: 'Ngày 2' }).getAttribute('aria-selected')).toBe('true')
  })

  it('arrow keys move between the tabs', () => {
    render(<TripTimeline msgId="m1" plan={plan} />)
    const first = screen.getAllByRole('tab')[0]
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getAllByRole('tab')[1])
  })

  it('the budget tab lists the plan\'s own rows', () => {
    render(<TripTimeline msgId="m1" plan={plan} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Dự toán' }))
    const t = within(screen.getByTestId('v206-budget'))
    expect(t.getByText('3.700.000đ')).toBeTruthy()
    expect(t.getByText('Ăn uống')).toBeTruthy()
    expect(stops()).toHaveLength(0)
  })

  it('no budget rows, no budget tab', () => {
    render(<TripTimeline msgId="m1" plan={{ ...plan, cost_breakdown: undefined }} />)
    expect(screen.queryByRole('tab', { name: 'Dự toán' })).toBeNull()
  })

  it('a tip that names a stop sits beside it; the tips button counts the answer\'s tips', () => {
    render(<TripTimeline msgId="m1" plan={plan} />)
    const tip = screen.getByTestId('v206-inline-tip')
    expect(tip.textContent).toContain('08:30 khi cún')
    expect(tip.closest('[data-testid="v206-stop"]')!.textContent).toContain('Puppy Farm')
    expect(screen.getByTestId('v206-open-tips').textContent).toContain('(2)')
    expect(v206Store.getSnapshot().tips).toHaveLength(2)
  })

  it('a plan without tips has no tips button and publishes nothing', () => {
    render(<TripTimeline msgId="m1" plan={{ ...plan, local_tips: undefined }} />)
    expect(screen.queryByTestId('v206-open-tips')).toBeNull()
    expect(v206Store.getSnapshot().tips).toEqual([])
  })

  it('leaving the page takes the tips back', () => {
    const { unmount } = render(<TripTimeline msgId="m1" plan={plan} />)
    expect(v206Store.getSnapshot().tips.length).toBe(2)
    unmount()
    expect(v206Store.getSnapshot().tips).toEqual([])
  })

  it('a stop with a link shows it as a safe external link; an unsafe photo is not drawn', () => {
    const bad = { ...plan, days: [{ label: 'Ngày 1', items: [{ time: '9:00', name: 'X', maps_link: 'javascript:alert(1)', photo_url: 'http://insecure.test/a.jpg' }] }] }
    const { container } = render(<TripTimeline msgId="m1" plan={bad as TappyPlan} />)
    expect(container.querySelector('a[href^="javascript"]')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('entity drawer', () => {
  it('the profile button needs real data (a matching place card); it opens the drawer with that card\'s fields and Esc gives the focus back', () => {
    const { rerender } = render(<><TripTimeline msgId="m1" plan={plan} places={[]} /><V206DrawerHost /></>)
    // no place card of the turn: no profile button at all (a stop alone would only repeat what the timeline shows)
    expect(screen.queryAllByTestId('v206-open-entity')).toHaveLength(0)
    rerender(<><TripTimeline msgId="m1" plan={plan} places={[place]} /><V206DrawerHost /></>)
    expect(screen.getAllByTestId('v206-open-entity')).toHaveLength(1)
    const btn = screen.getAllByTestId('v206-open-entity')[0]
    btn.focus()
    fireEvent.click(btn)
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    const facts = within(screen.getByTestId('v206-facts'))
    expect(facts.getByText('4.6 (800 lượt)')).toBeTruthy()
    expect(dlg.textContent).not.toMatch(/verified|Evidence|đối tác/i)
    expect(document.activeElement).toBe(screen.getByTestId('v206-drawer-close'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(btn)
  })

  it('the backdrop and the close button close it; Tab stays inside', () => {
    render(<V206DrawerHost />)
    act(() => v206Store.openEntity({ key: 'a', title: 'Quán A', facts: [{ label: 'Địa chỉ', value: 'Q1' }], links: [{ kind: 'maps', href: 'https://maps.google.com/?q=a', label: 'Mở bản đồ' }] }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    const last = screen.getByRole('button', { name: /Đóng \[Esc\]/ })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByTestId('v206-drawer-close'))
    fireEvent.keyDown(screen.getByTestId('v206-drawer-close'), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    fireEvent.click(screen.getByTestId('v206-backdrop'))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => v206Store.openEntity({ key: 'a', title: 'Quán A', facts: [], links: [], note: 'x' }))
    fireEvent.click(screen.getByTestId('v206-drawer-close'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opening the tips replaces the entity drawer (never two)', () => {
    render(<><TipsPublisher msgId="m" tips={[{ id: 'a', text: 'Mẹo', source: 'answer' }]} /><V206DrawerHost /></>)
    act(() => v206Store.openEntity({ key: 'a', title: 'Quán A', facts: [], links: [], note: 'x' }))
    act(() => v206Store.openTips())
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByTestId('v206-tips-drawer')).toBeTruthy()
  })
})

describe('tips drawer', () => {
  const mk = (n: number): PlanTip[] => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, text: i === 0 ? 'Mang áo khoác dày' : `Mẹo số ${i}`, source: 'answer' as const }))
  const open = (tips: PlanTip[]) => {
    render(<><TipsPublisher msgId="m" tips={tips} /><V206DrawerHost /></>)
    act(() => v206Store.openTips())
  }
  it('lists the answer\'s tips as written, with no verification claim', () => {
    open(mk(3))
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getAllByTestId('v206-tip')).toHaveLength(3)
    expect(dlg.textContent).toContain('Mang áo khoác dày')
    expect(dlg.textContent).not.toMatch(/đối soát thực địa|chuyên gia|verified/i)
    expect(screen.queryByTestId('v206-tips-search')).toBeNull()
  })
  it('a search appears from four tips and filters ignoring accents', () => {
    open(mk(5))
    fireEvent.change(screen.getByTestId('v206-tips-search'), { target: { value: 'ao khoac' } })
    expect(screen.getAllByTestId('v206-tip')).toHaveLength(1)
    fireEvent.change(screen.getByTestId('v206-tips-search'), { target: { value: 'zzzz' } })
    expect(screen.queryAllByTestId('v206-tip')).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toContain('Không có mẹo')
  })
})

describe('flag off', () => {
  it('the research canvas carries no v206 class and nothing is drawn by the drawers', () => {
    const { container } = render(<><ResearchCanvas msgId="m1" text={'# Báo cáo\n\n## 1. A\n\nNội dung.\n\n## 2. B\n\nNội dung.'} streaming={false} format={formatMessage} research={null} /><V206DrawerHost /></>)
    expect(container.querySelector('[data-testid="research-canvas"]')!.className).not.toContain('v206')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
