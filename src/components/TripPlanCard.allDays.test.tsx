// @vitest-environment jsdom
//
// 29/10 (25-question run, one brain UAT): ChatGPT's itinerary shows every day in the answer; ours showed day 1 and the NAMES of days 2-3 as tabs
// ("Lịch trình chi tiết chỉ thấy ngày 1" — the graders' first complaint on Q01 and Q02). With NEXT_PUBLIC_CONSULT_ONE_BRAIN=1 (UAT build, default OFF)
// every day is listed in turn; off, the tabs are as they were.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { TappyPlan } from './TripPlanCard'

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'vi' }),
}))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: async () => null }))

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.resetModules() })

const plan: TappyPlan = {
  type: 'trip', title: 'Phú Quốc 3 ngày 2 đêm', people: 2, budget_total: '',
  days: [
    { label: 'Ngày 1 — Đến nơi', items: [{ time: '09:00', emoji: '✈️', category: 'transport', name: 'Bay Hà Nội – Phú Quốc', description: '', price: '' }] },
    { label: 'Ngày 2 — Nam đảo', items: [{ time: '08:30', emoji: '🏝️', category: 'activity', name: 'Bãi Sao', description: '', price: '' }] },
    { label: 'Ngày 3 — Bắc đảo', items: [{ time: '10:00', emoji: '🛍️', category: 'shopping', name: 'Chợ đêm Dương Đông', description: '', price: '' }] },
  ],
}
const load = async () => (await import('./TripPlanCard')).default

describe('TripPlanCard: day tabs, the designed layout (owner UAT 02/11)', () => {
  // Owner UAT 02/11 (approved): the card is the designed one - a page per day behind day tabs - on the one-brain build too. The 29/10
  // "every day in one long page" variant (NEXT_PUBLIC_CONSULT_ONE_BRAIN) read as one long scroll and is withdrawn.
  it('ONE BRAIN BUILD: day 1 and the day tabs, as designed; tapping a tab shows that day', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONSULT_ONE_BRAIN', '1')
    vi.resetModules()
    const Card = await load()
    const { container, getByText } = render(<Card plan={plan} />)
    expect(container.textContent).toContain('Bay Hà Nội – Phú Quốc')
    expect(container.textContent).not.toContain('Bãi Sao')
    expect(container.querySelectorAll('[data-plan-day-heading]').length).toBe(0)
    expect(container.querySelectorAll('button').length).toBe(2 + 3) // share ×2 + three day tabs
    getByText('Ngày 2 — Nam đảo').click()
    await Promise.resolve()
    expect(container.textContent).toContain('Bãi Sao')
  })
  it('OFF: day 1 and the day tabs, as before', async () => {
    vi.resetModules()
    const Card = await load()
    const { container } = render(<Card plan={plan} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Bay Hà Nội – Phú Quốc')
    expect(text).not.toContain('Bãi Sao')
    expect(container.querySelectorAll('[data-plan-day-heading]').length).toBe(0)
    expect(container.querySelectorAll('button').length).toBe(2 + 3) // share ×2 + three day tabs
  })
  it('a one-day plan is the same either way', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONSULT_ONE_BRAIN', '1')
    vi.resetModules()
    const Card = await load()
    const { container } = render(<Card plan={{ ...plan, days: plan.days.slice(0, 1) }} />)
    expect(container.querySelectorAll('[data-plan-day-heading]').length).toBe(0)
  })
})
