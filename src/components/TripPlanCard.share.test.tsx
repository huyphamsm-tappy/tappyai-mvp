// @vitest-environment jsdom
//
// The plan card's Share used to call navigator.share() with the model-authored
// `share_text` — a caption, not the plan. It now opens the TappyAI share menu
// with the deterministic plan brochure built from `days[].items[]`.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import TripPlanCard, { type TappyPlan } from './TripPlanCard'
import { buildPlanArtifact } from '@/lib/share/shareArtifact'

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
    locale: 'vi',
  }),
}))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: async () => null }))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const plan: TappyPlan = {
  type: 'trip',
  title: '2 ngày Đà Lạt cho 2 người',
  people: 2,
  budget_total: '3.000.000₫',
  share_text: 'Đà Lạt cuối tuần thật chill ☕ #TappyAI — xem tại https://evil.example',
  days: [
    {
      label: 'Ngày 1',
      items: [
        { time: '08:00', emoji: '☕', category: 'food', name: 'Cà phê Tùng', description: 'Cà phê sáng kiểu Đà Lạt', price: '60.000₫', address: '6 Khu Hòa Bình', maps_link: 'https://maps.google.com/?q=Tung' },
        { time: '12:00', emoji: '🏨', category: 'hotel', name: 'Le House Đà Lạt', price: '900.000₫/đêm', booking_link: 'https://www.booking.com/hotel/vn/le-house.html' },
      ],
    },
    { label: 'Ngày 2', items: [{ time: '09:00', emoji: '🚗', category: 'transport', name: 'Đồi chè Cầu Đất', price: 'Miễn phí' }] },
  ],
}

describe('TripPlanCard — Share', () => {
  it('opens the approved share sheet (#6, owner SL1) and copies the deterministic plan brochure while there is no link', async () => {
    // Signed out: no plan link, so "copy" carries the brochure built from days[].items[].
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })))
    const writeText = vi.fn(async (_t: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<TripPlanCard plan={plan} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getAllByText('tripPlan.share')[0])
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('[data-share-variant="plan"]')).toBeTruthy()
    expect(dialog.querySelector('[data-share-card-picker]')!.getAttribute('data-layout')).toBe('plan')
    // The plan title names the link card.
    expect(screen.getByText('2 ngày Đà Lạt cho 2 người · TappyAI')).toBeTruthy()
    await waitFor(() => expect(dialog.querySelector('[data-plan-link="sign-in"]')).toBeTruthy())

    await act(async () => { fireEvent.click(screen.getByTestId('share-target-copy')) })
    const text = writeText.mock.calls[0][0] as string
    const expected = buildPlanArtifact(plan, 'vi').text
    expect(text).toBe(expected)
    expect(text.startsWith('Kế hoạch từ TappyAI: 2 ngày Đà Lạt cho 2 người\n')).toBe(true)
    expect(text).toContain('2 người · Ngân sách: 3.000.000₫')
    expect(text).toContain('Ngày 1\n  08:00 ☕ Cà phê Tùng\n     Cà phê sáng kiểu Đà Lạt\n     60.000₫ · 📍 6 Khu Hòa Bình\n     Bản đồ: https://maps.google.com/?q=Tung')
    expect(text).toContain('Đặt phòng: https://www.booking.com/hotel/vn/le-house.html')
    expect(text).toContain('Ngày 2\n  09:00 🚗 Đồi chè Cầu Đất\n     Miễn phí')
    // The model caption with a URL is not copied.
    expect(text).not.toContain('evil.example')
    expect(text.endsWith('Gợi ý bởi TappyAI · www.tappyai.com')).toBe(true)

    // Product targets are all there.
    for (const id of ['facebook', 'zalo', 'viber', 'line', 'email', 'inbox', 'save', 'copy']) {
      expect(screen.getByTestId(`share-target-${id}`)).toBeTruthy()
    }
  })

  it('the shared plan borrows the same turn\'s place-card photos by stop name (canonical photos only)', async () => {
    const fetchMock = vi.fn(async (_u: string, _init?: { body: string }) => ({ ok: false, status: 401, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    const PHOTO = 'https://lh3.googleusercontent.com/p/AF1Qip-tung=s800'
    render(<TripPlanCard plan={plan} placePhotos={[{ name: 'Cà phê Tùng', image: PHOTO }, { name: 'Le House Đà Lạt', image: 'https://evil.example/x.jpg' }]} />)
    fireEvent.click(screen.getAllByText('tripPlan.share')[0])
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body)
    expect(body.plan.days[0].items[0].photo_url).toBe(PHOTO)
    expect(body.plan.days[0].items[1].photo_url).toBeUndefined()
  })

  it('does not call navigator.share on click', () => {
    const share = vi.fn()
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    render(<TripPlanCard plan={plan} />)
    fireEvent.click(screen.getAllByText('tripPlan.share')[0])
    expect(share).not.toHaveBeenCalled()
    delete (navigator as unknown as { share?: unknown }).share
  })
})
