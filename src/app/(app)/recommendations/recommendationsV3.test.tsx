// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/recommendations',
  useSearchParams: () => new URLSearchParams(),
}))

const apiFetch = vi.fn()
vi.mock('@/lib/account/ageGateClient', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

import RecommendationsPage from './page'
import { vi as viCopy } from '@/lib/i18n/w4/misc'

// ── "Gợi ý cho bạn" — the 2026-09-22 design over the SAME /api/recommendations ──
// The card draws only what the payload carries (name + matched signals). The
// design's photo, verified badge, address, rating/visit counts and "Recently
// Active" have no field there, so they must not appear.

const PAYLOAD = {
  recommendations: [
    { placeId: 'p1', placeName: 'Phở Phú Vương', finalScore: 0.8, matchedSignals: ['Phở', '4.5★'] },
    { placeId: 'p2', placeName: '', finalScore: 0.5, matchedSignals: [] },
  ],
  explanation: [],
  personalized: false,
}

const respond = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body })

beforeEach(() => {
  setLocale('vi')
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(respond(200, PAYLOAD))
})
afterEach(() => cleanup())

const q = (sel: string) => document.querySelector(sel) as HTMLElement
const cards = () => [...document.querySelectorAll('[data-rec-card]')] as HTMLElement[]

describe('chrome + hero', () => {
  it('has Back and the "Gợi ý cho bạn" title', () => {
    render(<RecommendationsPage />)
    expect(q('[data-in-app-back]').textContent).toContain('Quay lại')
    expect(document.querySelector('h1')?.textContent).toBe('Gợi ý cho bạn')
  })

  it('titles the hero with "gần bạn" as the accent and shows the subtitle', () => {
    render(<RecommendationsPage />)
    const hero = q('[data-rec-hero]')
    expect(hero.querySelector('h2')?.textContent).toBe('Khám phá những địa điểm nổi bật gần bạn')
    expect(q('[data-rec-accent]').textContent).toBe('gần bạn')
    expect(q('[data-rec-accent]').className).toContain('text-primary-500')
    expect(hero.textContent).toContain(viCopy['recommendations.heroSubtitle'])
  })

  it('shows the three highlight chips, each with a round icon', () => {
    render(<RecommendationsPage />)
    const chips = [...document.querySelectorAll('[data-rec-highlight]')] as HTMLElement[]
    expect(chips.map((c) => c.textContent)).toEqual(['Khám phá địa điểm mới', 'Kết nối cộng đồng', 'Trải nghiệm cuộc sống xung quanh'])
    chips.forEach((c) => {
      expect(c.querySelector('.rounded-full svg')).not.toBeNull()
    })
  })

  it('uses the local mascot art, never a remote image', () => {
    render(<RecommendationsPage />)
    const imgs = [...document.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '')
    expect(imgs).toContain('/tappy/recommendation.png')
    expect(imgs.every((s) => s.startsWith('/'))).toBe(true)
  })
})

describe('places section', () => {
  it('is headed "Địa điểm nổi bật gần đây" with "Xem thêm" to Explore', async () => {
    render(<RecommendationsPage />)
    const section = q('[data-rec-section]')
    expect(section.querySelector('h2')?.textContent).toBe('Địa điểm nổi bật gần đây')
    expect(q('[data-rec-see-more]').getAttribute('href')).toBe('/reviews')
    expect(q('[data-rec-see-more]').textContent).toContain('Xem thêm')
    await waitFor(() => expect(cards()).toHaveLength(2))
  })

  it('still loads through the shared age-gate handler from /api/recommendations', async () => {
    render(<RecommendationsPage />)
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/recommendations'))
  })

  it('card: name, real signals, and "Hỏi Tappy về chỗ này" linking to chat prefilled with the place', async () => {
    render(<RecommendationsPage />)
    await waitFor(() => expect(cards()).toHaveLength(2))
    const [first, second] = cards()
    expect(first.querySelector('h3')?.textContent).toBe('Phở Phú Vương')
    expect([...first.querySelectorAll('[data-rec-signals] li')].map((l) => l.textContent)).toEqual(['Phở', '4.5★'])
    const ask = first.querySelector('[data-rec-ask]') as HTMLAnchorElement
    expect(ask.textContent).toContain('Hỏi Tappy về chỗ này')
    expect(ask.getAttribute('href')).toBe(`/chat?q=${encodeURIComponent('Kể mình nghe về Phở Phú Vương')}`)
    // Nameless place falls back to the generic label + "địa điểm này" in the prompt.
    expect(second.querySelector('h3')?.textContent).toBe('Địa điểm')
    expect((second.querySelector('[data-rec-ask]') as HTMLAnchorElement).getAttribute('href'))
      .toBe(`/chat?q=${encodeURIComponent('Kể mình nghe về địa điểm này')}`)
    expect(second.querySelector('[data-rec-signals]')).toBeNull()
  })

  it('invents nothing the payload lacks: no photo, visit count, verified badge or activity chip', async () => {
    render(<RecommendationsPage />)
    await waitFor(() => expect(cards()).toHaveLength(2))
    const text = cards().map((c) => c.textContent).join(' ')
    expect(text).not.toMatch(/lượt ghé|Recently Active|k lượt/)
    cards().forEach((c) => expect(c.querySelector('img')).toBeNull())
  })

  it('personalized results relabel the section', async () => {
    apiFetch.mockResolvedValue(respond(200, { ...PAYLOAD, personalized: true }))
    render(<RecommendationsPage />)
    await waitFor(() => expect(q('[data-rec-section] h2').textContent).toBe(viCopy['recommendations.subtitle']))
  })

  it('a signed-out 401 shows the sign-in message', async () => {
    apiFetch.mockResolvedValue(respond(401, {}))
    render(<RecommendationsPage />)
    await waitFor(() => expect(document.body.textContent).toContain(viCopy['recommendations.error.auth']))
  })
})

describe('footer', () => {
  it('closes with the two footer lines', () => {
    render(<RecommendationsPage />)
    const f = q('[data-rec-footer]')
    expect(f.textContent).toContain('Thế giới xung quanh bạn luôn có những câu chuyện thú vị')
    expect(f.textContent).toContain('Hãy bắt đầu khám phá ngay hôm nay!')
  })
})
