// @vitest-environment jsdom
//
// /onboarding interests step — approved design 2026-09-11 (counter now "Bước 1/2", six
// described cards with chevrons). PRESENTATION ONLY: selection and the single
// POST /api/onboarding are pinned unchanged.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const { replace, router, params } = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    replace,
    router: { push: () => {}, replace, back: () => {}, refresh: () => {} },
    params: new URLSearchParams('next=/chat'),
  }
})
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/onboarding',
  useSearchParams: () => params,
}))
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ priority: _priority, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}))

import OnboardingPage from './page'
import { setLocale } from '@/lib/i18n/useTranslation'
import { ONBOARDING_INTERESTS } from '@/lib/config/product'

const fetchMock = vi.fn()

beforeEach(() => {
  setLocale('vi')
  replace.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('onboarding interests — structure (design 2026-09-11)', () => {
  // Owner 2026-09-28: the counter shows the page's real steps (interests 1/2, location 2/2), not the mock's 2/4.
  it('shows a 2-segment progress bar with step 1 filled and "Bước 1/2"', () => {
    render(<OnboardingPage />)
    const bar = screen.getByTestId('onboarding-progress')
    expect(bar.getAttribute('aria-valuemax')).toBe('2')
    expect(bar.getAttribute('aria-valuenow')).toBe('1')
    const segs = Array.from(bar.children).map((c) => c.getAttribute('data-filled'))
    expect(segs).toEqual(['true', 'false'])
    expect(screen.getByText('Bước 1/2')).toBeTruthy()
  })

  it('renders the brand, tagline, accented title, subtitle and mascot bubble', () => {
    render(<OnboardingPage />)
    expect(screen.getByTestId('onboarding-brand').textContent).toBe('TappyAI')
    expect(screen.getByText('Your AI friend for a happier you')).toBeTruthy()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent?.replace(/\s+/g, ' ').trim()).toBe('Chào mừng đến với TappyAI! 👋')
    expect(screen.getByText('TappyAI!').className).toContain('text-blue-400')
    expect(screen.getByText('Cho mình biết bạn quan tâm đến lĩnh vực nào để cá nhân hóa trải nghiệm nhé.')).toBeTruthy()
    expect(screen.getByText('Chọn những chủ đề bạn yêu thích nhé! 💙')).toBeTruthy()
    expect(screen.getByTestId('onboarding-next').textContent).toContain('Tiếp theo')
    expect(screen.getByTestId('onboarding-skip').textContent).toBe('Bỏ qua')
  })

  it('maps the six design cards onto the existing interest ids, each with title + description', () => {
    render(<OnboardingPage />)
    expect(ONBOARDING_INTERESTS.map((i) => i.id)).toEqual(['food', 'spa', 'travel', 'shopping', 'entertainment', 'hotel'])
    const expected: Record<string, [string, string]> = {
      food: ['Ăn uống', 'Khám phá quán ngon, công thức nấu ăn và xu hướng ẩm thực mới'],
      spa: ['Spa & Làm đẹp', 'Chăm sóc bản thân, làm đẹp và sống khỏe mỗi ngày'],
      travel: ['Du lịch', 'Khám phá điểm đến, lên kế hoạch và trải nghiệm những vùng đất mới'],
      shopping: ['Mua sắm', 'Tìm kiếm sản phẩm yêu thích và cập nhật ưu đãi mới nhất'],
      entertainment: ['Giải trí', 'Phim ảnh, âm nhạc, sự kiện và những hoạt động thú vị'],
      hotel: ['Khách sạn', 'Tìm nơi lưu trú lý tưởng cho mọi hành trình'],
    }
    const grid = screen.getByTestId('onboarding-interest-grid')
    expect(grid.children).toHaveLength(6)
    for (const [id, [title, desc]] of Object.entries(expected)) {
      const card = screen.getByTestId(`onboarding-interest-${id}`)
      expect(card.textContent).toContain(title)
      expect(card.textContent).toContain(desc)
      expect(card.getAttribute('aria-pressed')).toBe('false')
    }
  })
})

describe('onboarding interests — selection still saves', () => {
  it('toggles a card and POSTs the selected interest ids once, then replaces to next', async () => {
    render(<OnboardingPage />)
    const next = screen.getByTestId('onboarding-next') as HTMLButtonElement
    expect(next.disabled).toBe(true)

    const food = screen.getByTestId('onboarding-interest-food')
    fireEvent.click(food)
    expect(food.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('onboarding-interest-hotel'))
    fireEvent.click(screen.getByTestId('onboarding-interest-hotel'))
    expect(screen.getByTestId('onboarding-interest-hotel').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByTestId('onboarding-interest-travel'))

    expect(next.disabled).toBe(false)
    fireEvent.click(next)
    expect(screen.getByText('Bước 2/2')).toBeTruthy()

    fireEvent.click(screen.getByText('Hà Nội'))
    fireEvent.click(screen.getByText('🚀 Bắt đầu khám phá'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/onboarding')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ interests: ['food', 'travel'], city: 'Hà Nội' })
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/chat'))
  })
})
