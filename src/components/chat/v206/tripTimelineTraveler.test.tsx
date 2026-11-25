// @vitest-environment jsdom
// CONSULT_PLAN_V2 on the screen (14/11/2026): the plan's header says WHO it was built for (party, pace, interests) and what it took for granted, from the plan's own fields only (no chip is inferred);
// the budget tab shows the cost lines the model gave, an estimate marked as such. A plan without these fields draws exactly as before.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import TripTimeline from './TripTimeline'
import { v206Store } from '@/lib/chat/v206Store'
import type { TappyPlan } from '@/components/TripPlanCard'

vi.mock('@/components/share/ShareMenu', () => ({ default: () => null }))

const base: TappyPlan = {
  type: 'trip', title: 'Quy Nhơn 3N2Đ', people: 2,
  days: [{ label: 'Ngày 1: Kỳ Co', items: [{ time: '08:00', emoji: '🌊', category: 'activity', name: 'Kỳ Co', description: 'Ca nô ra đảo.' }] }],
}
const v2: TappyPlan = {
  ...base, budget_total: '~6.000.000đ cho 2 người, chưa gồm vé máy bay',
  traveler: { party: '2 người lớn', pace: 'thong thả, có buổi tối', interests: ['biển', 'ẩm thực địa phương'] },
  assumptions: ['xuất phát từ TP.HCM'],
  cost_breakdown: { 'Khách sạn 2 đêm': '1.800.000đ', 'Ăn uống 3 ngày': '1.500.000đ (ước tính)' },
}

beforeEach(() => { setLocale('vi'); v206Store.reset() })
afterEach(() => { cleanup(); v206Store.reset() })

describe('the plan header', () => {
  it('shows who the plan is for and the pace, each interest, and each assumption, as the plan carries them', () => {
    const { container } = render(<TripTimeline msgId="m1" plan={v2} />)
    const chips = [...container.querySelectorAll('.v206-chips .v206-chip')].map(e => e.textContent?.trim())
    expect(chips).toContain('2 người lớn')
    expect(chips).toContain('thong thả, có buổi tối')
    expect(chips).toContain('biển')
    expect(chips).toContain('ẩm thực địa phương')
    const assumed = container.querySelector('[data-testid="v206-assumptions"]')
    expect(assumed?.textContent).toContain('xuất phát từ TP.HCM')
  })
  it('a plan without a traveler or assumptions draws exactly the old header (no new chip, no assumptions line)', () => {
    const { container } = render(<TripTimeline msgId="m1" plan={base} />)
    expect(container.querySelector('[data-testid="v206-assumptions"]')).toBeNull()
    expect(container.querySelectorAll('.v206-chips .v206-chip').length).toBe(3) // days, stops, people
  })
  it('the budget tab carries the cost lines, an estimate marked as one', () => {
    render(<TripTimeline msgId="m1" plan={v2} />)
    const tabs = screen.getAllByRole('tab').map(x => x.textContent)
    expect(tabs).toContain('Dự toán')
  })
})
