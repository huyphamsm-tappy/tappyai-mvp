// @vitest-environment jsdom
// 19/11 (owner): a stay card's "highlights" box carries the reference-price line (provider's structured nightly rate, platform, check time) with the source "Agoda".
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import V206PlaceCard from './V206PlaceCard'
import type { LivePlace } from '@/lib/recommendation/liveView'

vi.mock('next/navigation', () => ({ usePathname: () => '/chat/c1', useRouter: () => ({ push: vi.fn() }) }))

const hotel = (extra: Record<string, unknown> = {}) => ({ id: 'stay:1', domain: 'travel', kind: 'stay', name: 'Hotel A', address: '1 Tran Phu', rank: 1, actions: [], ...extra }) as unknown as LivePlace
const offer = { platform: 'Agoda', amount: 231_481, currency: 'VND', unit: 'per_night', nights: 2, guests: 2, checkedAt: '2026-11-19T14:47:00+07:00' }

beforeEach(() => setLocale('vi'))
afterEach(() => cleanup())

describe('V206PlaceCard stay price line', () => {
  it('a stay with a structured offer: the highlights box holds the price line and the source Agoda', () => {
    render(<V206PlaceCard p={hotel({ stayOffer: offer })} position={0} ranked={false} />)
    expect(screen.getByTestId('v206-pc-notes').textContent).toContain('Đặc trưng nổi bật')
    expect(screen.getByTestId('v206-pc-stay-price').textContent).toBe('Giá tham khảo: 231.481đ/đêm cho 2 người, chưa gồm thuế và phí; Agoda kiểm tra lúc 14:47 ngày 19/11/2026. Bấm nút đặt phòng để xem giá cuối cùng.')
    expect(screen.getByTestId('v206-pc-notes-src').textContent).toBe('Nguồn: Agoda')
  })

  it('the model\'s own points stay, the price line leads, and the source list has no duplicates', () => {
    render(<V206PlaceCard p={hotel({ stayOffer: offer })} position={0} ranked={false} notes={[{ text: 'Gần chợ' }]} noteSources={['Agoda', 'Google Maps']} />)
    const items = screen.getByTestId('v206-pc-notes').querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].getAttribute('data-testid')).toBe('v206-pc-stay-price')
    expect(screen.getByTestId('v206-pc-notes-src').textContent).toBe('Nguồn: Agoda, Google Maps')
  })

  it('English wording', () => {
    setLocale('en')
    render(<V206PlaceCard p={hotel({ stayOffer: offer })} position={0} ranked={false} />)
    expect(screen.getByTestId('v206-pc-stay-price').textContent).toBe('Reference price: 231,481 VND/night for 2 guests, excluding taxes and fees; checked on Agoda at 14:47 on 19/11/2026. Open the booking page for the final price.')
  })

  it('no offer: no price line and no box', () => {
    const { container } = render(<V206PlaceCard p={hotel()} position={0} ranked={false} />)
    expect(container.querySelector('[data-testid="v206-pc-stay-price"]')).toBeNull()
    expect(container.querySelector('[data-testid="v206-pc-notes"]')).toBeNull()
  })
})
