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

describe('TripPlanCard: every day listed (one brain UAT build)', () => {
  it('ON: the stops of days 1, 2 and 3 are all in the card, each under its day heading, and there are no day tabs', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONSULT_ONE_BRAIN', '1')
    vi.resetModules()
    const Card = await load()
    const { container } = render(<Card plan={plan} />)
    const text = container.textContent ?? ''
    for (const s of ['Bay Hà Nội – Phú Quốc', 'Bãi Sao', 'Chợ đêm Dương Đông']) expect(text).toContain(s)
    expect([...container.querySelectorAll('[data-plan-day-heading]')].map(e => e.textContent)).toEqual(['Ngày 1 — Đến nơi', 'Ngày 2 — Nam đảo', 'Ngày 3 — Bắc đảo'])
    expect(container.querySelectorAll('button').length).toBe(2) // the two share buttons only
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
