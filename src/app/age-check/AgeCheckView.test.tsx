// @vitest-environment jsdom
//
// /age-check — approved design 2026-09-10 (three dropdowns, card first on mobile).
// PRESENTATION ONLY: these tests pin the structure AND that the form still sends
// the exact same request body it sent when the fields were text inputs.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// The router must be a STABLE object, as Next's is: the view's load effect
// depends on it, and a fresh object per render would re-run that effect forever.
const { replace, router, params } = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    replace,
    router: { push: () => {}, replace, back: () => {}, refresh: () => {} },
    params: new URLSearchParams('next=/onboarding'),
  }
})
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/age-check',
  useSearchParams: () => params,
}))
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ priority: _priority, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}))
vi.mock('@/lib/auth/signOut', () => ({ performSignOut: vi.fn() }))

import { AgeCheckView } from './AgeCheckView'
import { setLocale } from '@/lib/i18n/useTranslation'

const fetchMock = vi.fn()

beforeEach(() => {
  setLocale('vi')
  replace.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ageStatus: 'eligible' }) })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('age gate — structure (design 2026-09-10)', () => {
  it('renders header, intro, card, trust row and footer', async () => {
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    expect(screen.getByTestId('age-brand').textContent).toBe('TappyAI')
    expect(screen.getByText('Discover. Chat. Shop. Together.')).toBeTruthy()
    expect(screen.getByTestId('age-language').textContent).toContain('Tiếng Việt')
    expect(screen.getByText('CỘNG ĐỒNG TAPPYAI')).toBeTruthy()
    expect(screen.getByText('cùng nhau')).toBeTruthy()
    for (const f of ['Khám phá', 'Mua sắm', 'Cùng nhau']) expect(screen.getByText(f)).toBeTruthy()

    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('Xác nhận bạn đủ 18 tuổi')
    expect(screen.getByText('đủ 18 tuổi').className).toContain('bg-clip-text')

    expect(screen.getByTestId('age-submit').textContent).toContain('Tiếp tục')
    expect(screen.getByTestId('age-privacy-note').textContent).toContain('Ngày sinh của bạn được giữ riêng tư')
    expect(screen.getByTestId('age-mascot-bubble').textContent).toContain('Cùng bạn khám phá thế giới thú vị hơn!')
    const trust = screen.getByTestId('age-trust-row')
    for (const s of ['An toàn & riêng tư', 'Chỉ xác nhận độ tuổi', 'Trải nghiệm tốt hơn']) expect(trust.textContent).toContain(s)
    expect(screen.getByText('TappyAI — Trải nghiệm tốt hơn, cùng nhau.')).toBeTruthy()
  })

  it('orders the card before the intro on a single-column (mobile) layout', async () => {
    render(<AgeCheckView guest />)
    const card = await screen.findByTestId('age-card')
    expect(card.className).toMatch(/\border-1\b/)
    expect(screen.getByTestId('age-intro').className).toMatch(/\border-2\b/)
  })

  it('uses three labelled dropdowns with stable test ids and DD/MM/YYYY placeholders', async () => {
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    const day = screen.getByLabelText('Ngày') as HTMLSelectElement
    const month = screen.getByLabelText('Tháng') as HTMLSelectElement
    const year = screen.getByLabelText('Năm') as HTMLSelectElement
    expect(day).toBe(screen.getByTestId('age-dob-day'))
    expect(month).toBe(screen.getByTestId('age-dob-month'))
    expect(year).toBe(screen.getByTestId('age-dob-year'))
    for (const el of [day, month, year]) expect(el.tagName).toBe('SELECT')
    expect(day.options[0].text).toBe('DD')
    expect(month.options[0].text).toBe('MM')
    expect(year.options[0].text).toBe('YYYY')
    expect(day.options).toHaveLength(32)
    expect(month.options).toHaveLength(13)
    expect(year.options[1].value).toBe(String(new Date().getFullYear()))
  })
})

describe('age gate — the request is unchanged', () => {
  it('guest: POSTs /api/age-declaration with the same ISO date body', async () => {
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    fireEvent.change(screen.getByTestId('age-dob-day'), { target: { value: '7' } })
    fireEvent.change(screen.getByTestId('age-dob-month'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('age-dob-year'), { target: { value: '1990' } })
    fireEvent.click(screen.getByTestId('age-submit'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/age-declaration')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe(JSON.stringify({ dateOfBirth: '1990-03-07' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'))
  })

  it('signed-in: PATCHes /api/profile with the same body', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (!init) return { ok: true, json: async () => ({ ageStatus: 'unknown', canCorrectAge: true }) }
      return { ok: true, json: async () => ({ ageStatus: 'eligible' }) }
    })
    render(<AgeCheckView />)
    await screen.findByTestId('age-dob-day')
    fireEvent.change(screen.getByTestId('age-dob-day'), { target: { value: '12' } })
    fireEvent.change(screen.getByTestId('age-dob-month'), { target: { value: '11' } })
    fireEvent.change(screen.getByTestId('age-dob-year'), { target: { value: '2000' } })
    fireEvent.click(screen.getByTestId('age-submit'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/profile')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe(JSON.stringify({ dateOfBirth: '2000-11-12' }))
  })

  it('an unpicked field still fails the same client validation, with no request', async () => {
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    fireEvent.change(screen.getByTestId('age-dob-day'), { target: { value: '7' } })
    fireEvent.click(screen.getByTestId('age-submit'))
    expect((await screen.findByRole('alert')).textContent).toBe('Ngày sinh không hợp lệ. Vui lòng kiểm tra lại.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
