// @vitest-environment jsdom
//
// UAT3 P2 (2026-09-27): a trip plan may carry `local_tips` (already filtered server-side by
// planLocalTipsGuard). A tip about a stop shows that stop's name; a general one is labelled
// as general advice; a plan without tips renders no section.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import TripPlanCard, { type TappyPlan } from './TripPlanCard'

vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi' }) }))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: async () => null }))

afterEach(cleanup)

const base: TappyPlan = {
  type: 'trip',
  title: 'Quy Nhơn 3N2Đ',
  days: [{ label: 'Ngày 1', items: [{ time: '07:00', emoji: '🍜', category: 'food', name: 'Bánh xèo Bà Đệ' }] }],
}

describe('TripPlanCard local tips', () => {
  it('shows tool tips with their stop and general tips with a label', () => {
    const { container } = render(<TripPlanCard plan={{ ...base, local_tips: [
      { text: 'Gọi bánh xèo tôm nhảy kèm rau sống.', basis: 'tool', place: 'Bánh xèo Bà Đệ' },
      { text: 'Trưa nắng gắt, đi biển vào sáng sớm.', basis: 'general' },
    ] }} />)
    const section = container.querySelector('[data-plan-local-tips]')!
    expect(section).not.toBeNull()
    expect(screen.getByText('tripPlan.localTips')).toBeTruthy()
    expect(section.textContent).toContain('Bánh xèo Bà Đệ: Gọi bánh xèo tôm nhảy kèm rau sống.')
    expect(section.textContent).toContain('tripPlan.generalTipTrưa nắng gắt')
  })

  it('renders no section without tips (or with malformed ones)', () => {
    const { container, rerender } = render(<TripPlanCard plan={base} />)
    expect(container.querySelector('[data-plan-local-tips]')).toBeNull()
    rerender(<TripPlanCard plan={{ ...base, local_tips: [null as never, { basis: 'general' } as never] }} />)
    expect(container.querySelector('[data-plan-local-tips]')).toBeNull()
  })
})
