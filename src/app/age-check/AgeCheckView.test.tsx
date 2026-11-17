// @vitest-environment jsdom
//
// /age-check — ONE BUTTON (owner decision 18/11/2026): a statement, "I confirm I am 18 or older", and a
// quiet "I am under 18". The date-of-birth dropdowns survive only for the single self-correction of an
// account whose date of birth reads as under 18.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// The router must be a STABLE object, as Next's is: the view's load effect
// depends on it, and a fresh object per render would re-run that effect forever.
const { replace, router, params } = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    replace,
    router: { push: () => {}, replace, back: () => {}, refresh: () => {} },
    params: { current: new URLSearchParams('next=/onboarding') },
  }
})
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/age-check',
  useSearchParams: () => params.current,
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
  params.current = new URLSearchParams('next=/onboarding')
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ageStatus: 'eligible' }) })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('age gate — structure', () => {
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

    expect(screen.getByTestId('age-confirm-adult').textContent).toContain('Tôi xác nhận mình đã đủ 18 tuổi')
    expect(screen.getByTestId('age-confirm-minor').textContent).toBe('Tôi chưa đủ 18 tuổi')
    expect(screen.getByTestId('age-privacy-note').textContent).toContain('Xác nhận của bạn được lưu lại')
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

  it('asks for NO date of birth: no dropdowns, one primary button and one quiet secondary choice', async () => {
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    expect(screen.queryByTestId('age-dob-day')).toBeNull()
    expect(screen.queryByTestId('age-dob-month')).toBeNull()
    expect(screen.queryByTestId('age-dob-year')).toBeNull()
    expect(screen.queryByTestId('age-submit')).toBeNull()
    expect(screen.getByTestId('age-confirm-adult').className).toContain('bg-gradient-to-r')
    expect(screen.getByTestId('age-confirm-minor').className).not.toContain('bg-gradient-to-r')
  })

  it('English: the same two choices', async () => {
    setLocale('en')
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    expect(screen.getByTestId('age-confirm-adult').textContent).toContain('I confirm I am 18 or older')
    expect(screen.getByTestId('age-confirm-minor').textContent).toBe('I am under 18')
  })
})

describe('age gate — the button request', () => {
  it('guest: "I confirm" POSTs { confirm18: true } to /api/age-declaration and follows the verdict', async () => {
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    fireEvent.click(screen.getByTestId('age-confirm-adult'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/age-declaration')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe(JSON.stringify({ confirm18: true }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'))
  })

  it('signed-in: the same endpoint and body (the server stores it on the account)', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init) return { ok: true, json: async () => ({ ageStatus: 'unknown', canCorrectAge: true }) }
      return { ok: true, json: async () => ({ ageStatus: 'eligible' }) }
    })
    render(<AgeCheckView />)
    await screen.findByTestId('age-confirm-adult')
    fireEvent.click(screen.getByTestId('age-confirm-adult'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/age-declaration')
    expect(init.body).toBe(JSON.stringify({ confirm18: true }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'))
  })

  it('"I am under 18" POSTs { under18: true } and shows the polite refusal, with no way back to the question', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ageStatus: 'ineligible', canCorrectAge: false, ageDeclaration: 'minor' }) })
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    fireEvent.click(screen.getByTestId('age-confirm-minor'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ under18: true }))
    expect(await screen.findByText('TappyAI dành cho người từ 18 tuổi')).toBeTruthy()
    expect(screen.getByText(/Bạn cho biết mình chưa đủ 18 tuổi/)).toBeTruthy()
    expect(screen.queryByTestId('age-confirm-adult')).toBeNull()
    expect(screen.queryByTestId('age-confirm-minor')).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it('a refusal from the server for the adult button (device remembers a minor) shows the refusal, never admits', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ageStatus: 'ineligible' }) })
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    fireEvent.click(screen.getByTestId('age-confirm-adult'))
    expect(await screen.findByText('TappyAI dành cho người từ 18 tuổi')).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it('FAIL CLOSED: a 503 (answer could not be stored) keeps the question on screen with the server message, no redirect', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'age_unavailable', message: 'Chưa thể lưu xác nhận lúc này.' }) })
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    fireEvent.click(screen.getByTestId('age-confirm-adult'))
    expect((await screen.findByRole('alert')).textContent).toBe('Chưa thể lưu xác nhận lúc này.')
    expect(screen.getByTestId('age-confirm-adult')).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it('a network failure also fails closed', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    fireEvent.click(screen.getByTestId('age-confirm-adult'))
    expect((await screen.findByRole('alert')).textContent).toBe('Không thể lưu. Vui lòng thử lại.')
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('age gate — the destination is the strict one', () => {
  for (const hostile of ['/\\evil.com', '//evil.com', '/%5Cevil.com', 'https://evil.com', 'javascript:alert(1)']) {
    it(`next=${hostile} lands on "/"`, async () => {
      params.current = new URLSearchParams({ next: hostile })
      render(<AgeCheckView guest />)
      await screen.findByTestId('age-card')
      fireEvent.click(screen.getByTestId('age-confirm-adult'))
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    })
  }
  it('a normal path with a query is kept', async () => {
    params.current = new URLSearchParams({ next: '/chat?x=1' })
    render(<AgeCheckView guest />)
    await screen.findByTestId('age-card')
    fireEvent.click(screen.getByTestId('age-confirm-adult'))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/chat?x=1'))
  })
})

describe('age gate — an account with a date of birth keeps the old path', () => {
  const blocked = { ok: true, json: async () => ({ ageStatus: 'ineligible', canCorrectAge: true, ageDeclaration: null }) }

  it('an under-18 date of birth shows the date refusal and the one correction, which PATCHes /api/profile as before', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init) return blocked
      return { ok: true, json: async () => ({ ageStatus: 'eligible' }) }
    })
    render(<AgeCheckView />)
    expect(await screen.findByText(/Theo ngày sinh bạn cung cấp/)).toBeTruthy()
    expect(screen.queryByTestId('age-confirm-adult')).toBeNull()
    fireEvent.click(screen.getByText('Tôi nhập sai ngày sinh'))

    fireEvent.change(await screen.findByTestId('age-dob-day'), { target: { value: '12' } })
    fireEvent.change(screen.getByTestId('age-dob-month'), { target: { value: '11' } })
    fireEvent.change(screen.getByTestId('age-dob-year'), { target: { value: '2000' } })
    fireEvent.click(screen.getByTestId('age-submit'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/profile')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe(JSON.stringify({ dateOfBirth: '2000-11-12' }))
  })

  it('an unpicked date field still fails client validation, with no request', async () => {
    fetchMock.mockResolvedValue(blocked)
    render(<AgeCheckView />)
    fireEvent.click(await screen.findByText('Tôi nhập sai ngày sinh'))
    fireEvent.change(await screen.findByTestId('age-dob-day'), { target: { value: '7' } })
    fireEvent.click(screen.getByTestId('age-submit'))
    expect((await screen.findByRole('alert')).textContent).toBe('Ngày sinh không hợp lệ. Vui lòng kiểm tra lại.')
    expect(fetchMock).toHaveBeenCalledTimes(1) // only the profile read
  })

  it('an account that declared a minor sees the polite refusal, no date correction, and a support address', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ageStatus: 'ineligible', canCorrectAge: false, ageDeclaration: 'minor' }) })
    render(<AgeCheckView />)
    expect(await screen.findByText(/Bạn cho biết mình chưa đủ 18 tuổi/)).toBeTruthy()
    expect(screen.queryByText('Tôi nhập sai ngày sinh')).toBeNull()
    expect(screen.getByText(/Lựa chọn này được ghi nhớ trên tài khoản/)).toBeTruthy()
  })
})
