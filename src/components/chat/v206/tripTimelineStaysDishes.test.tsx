// @vitest-environment jsdom
// 20/11 (owner): the plan card has its own "where to stay" and "what to try" sections, drawn only from the plan's own fields. A plan without them draws exactly as before.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import TripTimeline from './TripTimeline'
import { v206Store } from '@/lib/chat/v206Store'
import type { TappyPlan } from '@/components/TripPlanCard'

vi.mock('@/components/share/ShareMenu', () => ({ default: () => null }))

const base: TappyPlan = {
  type: 'trip', title: 'Ha Noi 2N1D',
  days: [
    { label: 'Ngay 1', items: [{ time: '08:00', emoji: 'x', category: 'activity', name: 'Pho co' }] },
    { label: 'Ngay 2', items: [{ time: '08:00', emoji: 'x', category: 'food', name: 'Bun cha' }] },
  ],
}
const withBoth: TappyPlan = {
  ...base,
  stays: [{ name: 'Hotel A', why: 'Gan Ho Guom', price: '1.250.000d/dem', booking_link: 'https://www.agoda.com/p?x=1' }, { name: 'Hotel B' }],
  dishes: [{ dish: 'Bun cha', venue: 'Huong Lien', address: '24 Le Van Huu', price: '60.000d', note: 'an voi nem cua be' }, { dish: 'Cha ca' }],
}

beforeEach(() => { setLocale('vi'); v206Store.reset() })
afterEach(() => { cleanup(); v206Store.reset() })

describe('the plan card: stays and dishes', () => {
  it('shows each stay with its reason, price per night and booking button, and each dish with its venue, address, price and note', () => {
    const { container } = render(<TripTimeline msgId="m1" plan={withBoth} />)
    const stays = container.querySelector('[data-testid="v206-stays"]')!
    expect(stays.textContent).toContain('Chỗ ở gợi ý')
    expect(stays.textContent).toContain('Hotel A')
    expect(stays.textContent).toContain('Gan Ho Guom')
    expect(stays.textContent).toContain('1.250.000d/dem')
    expect(stays.querySelector('a[href="https://www.agoda.com/p?x=1"]')).not.toBeNull()
    expect(stays.textContent).toContain('Hotel B')
    const dishes = container.querySelector('[data-testid="v206-dishes"]')!
    expect(dishes.textContent).toContain('Món nên thử')
    for (const w of ['Bun cha', 'Huong Lien', '24 Le Van Huu', '60.000d', 'an voi nem cua be', 'Cha ca']) expect(dishes.textContent).toContain(w)
  })
  it('a booking link that is not https is not drawn as a link', () => {
    const plan = { ...withBoth, stays: [{ name: 'Hotel A', booking_link: 'javascript:alert(1)' }] } as unknown as TappyPlan
    const { container } = render(<TripTimeline msgId="m1" plan={plan} />)
    expect(container.querySelector('[data-testid="v206-stays"] a')).toBeNull()
  })
  it('a plan without them draws neither section', () => {
    const { container } = render(<TripTimeline msgId="m1" plan={base} />)
    expect(container.querySelector('[data-testid="v206-stays"]')).toBeNull()
    expect(container.querySelector('[data-testid="v206-dishes"]')).toBeNull()
  })
})
