// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile',
  useSearchParams: () => new URLSearchParams(),
}))

import { AccountSettingsHub, ProfileRowList, accountRows, accountHubRows, accountMoreRows, settingsRows, signInHref } from './ProfileRows'
import { setLocale } from '@/lib/i18n/useTranslation'

// "Tài khoản & Cài đặt" — owner reference 2026-09-22. Header + TÀI KHOẢN card + CÀI ĐẶT card,
// every row linking to a route that exists.

beforeEach(() => setLocale('vi'))
afterEach(cleanup)

const hrefsIn = (el: Element) => [...el.querySelectorAll('li a[href]')].map((a) => a.getAttribute('href'))

// The reference's order. Every one of these routes exists under src/app.
const DESIGN_ACCOUNT_ROUTES = [
  '/profile/account', '/profile/history', '/profile/bookings', '/profile/preferences',
  '/profile/favorites', '/profile/price-watches', '/planner', '/profile/tappy-knows', '/group/new',
]

describe('Account & Settings hub', () => {
  it('renders the header title and subtitle', () => {
    const { container } = render(<AccountSettingsHub />)
    const hub = container.querySelector('[data-account-hub]') as HTMLElement
    expect(within(hub).getByRole('heading', { level: 2 }).textContent).toBe('Tài khoản & Cài đặt')
    expect(hub.textContent).toContain('Quản lý thông tin cá nhân, sở thích và tùy chỉnh trải nghiệm TappyAI theo cách của bạn.')
  })

  it('renders the two group cards with their headings', () => {
    const { container } = render(<AccountSettingsHub />)
    const account = container.querySelector('[data-hub-group="account"]') as HTMLElement
    const settings = container.querySelector('[data-hub-group="settings"]') as HTMLElement
    expect(within(account).getByRole('heading', { level: 3 }).textContent).toBe('Tài khoản')
    expect(within(settings).getByRole('heading', { level: 3 }).textContent).toBe('Cài đặt')
    expect(account.textContent).toContain('Quản lý thông tin và trải nghiệm của bạn')
    expect(settings.textContent).toContain('Tùy chỉnh ứng dụng theo sở thích của bạn')
  })

  it('the account card is compact: one row to /profile/account', () => {
    const { container } = render(<AccountSettingsHub />)
    const hrefs = hrefsIn(container.querySelector('[data-hub-group="account"]')!)
    expect(hrefs).toEqual(['/profile/account'])
  })

  it('the full reference inventory stays reachable, in order, via the Account page list', () => {
    const all = [accountRows()[0], ...accountMoreRows()].map((r) => r.href)
    const positions = DESIGN_ACCOUNT_ROUTES.map((r) => all.indexOf(r))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    const { container } = render(<ProfileRowList rows={accountMoreRows()} />)
    const row = (href: string) => container.querySelector(`a[href="${href}"]`)!.textContent
    expect(row('/profile/history')).toContain('Lịch sử chat')
    expect(row('/profile/bookings')).toContain('Lịch đặt chỗ')
    expect(row('/profile/preferences')).toContain('Sở thích của tôi')
    expect(row('/profile/favorites')).toContain('Đã lưu')
    expect(row('/profile/price-watches')).toContain('Theo dõi giá')
    expect(row('/planner')).toContain('AI Planner (My Plans)')
    expect(row('/profile/tappy-knows')).toContain('Tappy biết gì về bạn')
    expect(row('/group/new')).toContain('Đi nhóm')
  })

  it('the settings card has the one Settings row', () => {
    const { container } = render(<AccountSettingsHub />)
    const settings = container.querySelector('[data-hub-group="settings"]')!
    expect(hrefsIn(settings)).toEqual(settingsRows().map((r) => r.href))
    expect(hrefsIn(settings)).toEqual(['/profile/settings'])
    expect(settings.querySelector('a')!.textContent).toContain('Ngôn ngữ, thông báo, giao diện')
  })

  it('the guest variant locks every row behind sign-in with the real returnTo', () => {
    const { container } = render(<AccountSettingsHub locked />)
    const all = hrefsIn(container.querySelector('[data-account-hub]')!)
    expect(all).toEqual([...accountHubRows(), ...settingsRows()].map((r) => signInHref(r.href)))
  })

  it('uses a local mascot asset, never a remote image', () => {
    const { container } = render(<AccountSettingsHub />)
    const img = container.querySelector('[data-hub-banner] img')
    expect(img?.getAttribute('src')).toMatch(/^\/tappy\//)
  })

  it('has English copy', () => {
    setLocale('en')
    const { container } = render(<AccountSettingsHub />)
    expect(container.querySelector('#account-hub-title')!.textContent).toBe('Account & Settings')
  })
})
