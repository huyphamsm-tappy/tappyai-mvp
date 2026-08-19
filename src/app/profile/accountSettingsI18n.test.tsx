// @vitest-environment jsdom
//
// Regression test for the reported bug: "language is English but Account/Settings
// pages still show Vietnamese". The three screens covered here were React Server
// Components, which cannot read the `'use client'` locale store, so they always
// rendered the author's Vietnamese literals regardless of the language toggle.
// They are now server page (auth + data) + client view (rendering); these tests
// mount the client views under each locale and assert the visible copy follows.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import AccountView from './account/AccountView'
import HistoryView from './history/HistoryView'
import BookingsView from './bookings/BookingsView'

// The views render Header/BottomNav, which pull in next/navigation and next/image.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/profile/account',
  useSearchParams: () => new URLSearchParams(),
}))

// Header reads the colour-scheme preference on mount; jsdom has no matchMedia.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  })
  window.localStorage.clear()
  setLocale('vi')
})

afterEach(cleanup)

const user = { full_name: 'Huy Pham', avatar_url: null, email: 'huy@example.com', created_at: '2026-01-15T00:00:00Z' }

describe('Account screen follows the language toggle', () => {
  it('renders Vietnamese under the vi locale', () => {
    setLocale('vi')
    render(<AccountView user={user} />)
    expect(screen.getByText('Thông tin')).toBeTruthy()
    expect(screen.getByText('Họ và tên')).toBeTruthy()
    expect(screen.getByText('Chỉnh sửa hồ sơ')).toBeTruthy()
  })

  it('renders English under the en locale — no Vietnamese left behind', () => {
    setLocale('en')
    render(<AccountView user={user} />)
    expect(screen.getByText('Information')).toBeTruthy()
    expect(screen.getByText('Full name')).toBeTruthy()
    expect(screen.getByText('Edit profile')).toBeTruthy()
    expect(screen.queryByText('Thông tin')).toBeNull()
    expect(screen.queryByText('Họ và tên')).toBeNull()
  })

  it('formats the join date for the locale rather than always vi-VN', () => {
    setLocale('en')
    const { container } = render(<AccountView user={user} />)
    // en-GB renders 15/01/2026; vi-VN renders 15/1/2026 — the point is that the
    // date is no longer pinned to the Vietnamese format for English readers.
    expect(container.textContent).toContain('15/01/2026')
  })
})

describe('Chat history screen follows the language toggle', () => {
  const conversations = [
    { id: 'c1', title: 'Quán phở ngon', category: 'food', updated_at: new Date().toISOString(), messages: [1, 2, 3] },
  ]

  it('renders Vietnamese under the vi locale', () => {
    setLocale('vi')
    render(<HistoryView user={user} conversations={conversations} />)
    expect(screen.getByText(/tin nhắn/)).toBeTruthy()
  })

  it('renders English under the en locale', () => {
    setLocale('en')
    render(<HistoryView user={user} conversations={conversations} />)
    expect(screen.getByText(/messages/)).toBeTruthy()
    expect(screen.queryByText(/tin nhắn/)).toBeNull()
  })

  it('translates the empty state', () => {
    setLocale('en')
    render(<HistoryView user={user} conversations={[]} />)
    expect(screen.getByText('No conversations yet')).toBeTruthy()
    expect(screen.getByText('Start chat')).toBeTruthy()
  })

  it('never renders the old "phúp trước" typo', () => {
    setLocale('vi')
    const { container } = render(<HistoryView user={user} conversations={conversations} />)
    expect(container.textContent).not.toContain('phúp')
  })
})

describe('Bookings screen follows the language toggle', () => {
  const bookings = [{
    id: 'b1', service_name: 'Spa Sen', service_type: 'spa', customer_name: 'Huy',
    customer_phone: '0900000000', status: 'pending', date: '2026-01-20', time: '19:00',
    guests: 4, notes: null, place_id: null,
  }]

  it('renders Vietnamese under the vi locale', () => {
    setLocale('vi')
    render(<BookingsView user={user} bookings={bookings} reviewedPlaceIds={[]} todayVN="2026-08-04" />)
    expect(screen.getByText('⏳ Đang xử lý')).toBeTruthy()
    expect(screen.getByText('4 khách')).toBeTruthy()
  })

  it('renders English under the en locale', () => {
    setLocale('en')
    render(<BookingsView user={user} bookings={bookings} reviewedPlaceIds={[]} todayVN="2026-08-04" />)
    expect(screen.getByText('⏳ Processing')).toBeTruthy()
    expect(screen.getByText('4 guests')).toBeTruthy()
    expect(screen.queryByText('4 người')).toBeNull()
  })

  it('translates the empty state', () => {
    setLocale('en')
    render(<BookingsView user={user} bookings={[]} reviewedPlaceIds={[]} todayVN="2026-08-04" />)
    expect(screen.getByText('No bookings yet')).toBeTruthy()
  })
})
