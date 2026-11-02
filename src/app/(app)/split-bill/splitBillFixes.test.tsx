// @vitest-environment jsdom
// Regressions for two split-bill money/identity bugs (source commit 4e5534907):
//  1. a negative or sentinel tip reached the arithmetic (−1 % tip after clearing the custom field);
//  2. add-after-remove re-issued a live person id, so two rows shared one id and edited together.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { setLocale } from '@/lib/i18n/useTranslation'
import { render, cleanup, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/split-bill',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
vi.mock('@/components/BottomNav', () => ({ __esModule: true, default: () => <nav data-testid="bottom-nav" /> }))
vi.mock('@/components/v3/TappyPresence', () => ({
  __esModule: true,
  default: ({ pose }: { pose?: string }) => <span data-testid="tappy" data-pose={pose} />,
}))
vi.mock('@/components/chat/AskTappyButton', () => ({
  __esModule: true,
  default: ({ subject }: { subject: string }) => <button type="button" data-testid="ask-tappy" data-subject={subject} />,
}))

import SplitBillPage from './page'

const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 0 })
const total = () => document.getElementById('sb-total') as HTMLInputElement
const perPerson = () => document.querySelector('[data-sb-per-person]') as HTMLElement
const tipCustom = () => document.getElementById('sb-tip-custom') as HTMLInputElement
const amountIds = () => [...document.querySelectorAll('[id^="sb-amount-"]')].map(el => el.id)

beforeEach(() => setLocale('en'))
afterEach(cleanup)

describe('split-bill tip is never negative', () => {
  it('a negative custom tip is treated as 0 — the grand total is not reduced', () => {
    render(<SplitBillPage />)
    fireEvent.change(total(), { target: { value: '1000000' } })
    fireEvent.change(tipCustom(), { target: { value: '-5' } })
    expect(perPerson().textContent).toBe(`${fmt(500000)} đ`)
  })

  it('clearing the custom field after typing does not fall back to the −1 sentinel', () => {
    render(<SplitBillPage />)
    fireEvent.change(total(), { target: { value: '1000000' } })
    fireEvent.change(tipCustom(), { target: { value: '5' } })
    fireEvent.change(tipCustom(), { target: { value: '' } })
    expect(perPerson().textContent).toBe(`${fmt(500000)} đ`)
    expect(document.querySelector('[data-sb-includes-tip]')).toBeNull()
  })

  it('a valid positive custom tip still applies', () => {
    render(<SplitBillPage />)
    fireEvent.change(total(), { target: { value: '1000000' } })
    fireEvent.change(tipCustom(), { target: { value: '10' } })
    expect(perPerson().textContent).toBe(`${fmt(550000)} đ`)
  })
})

describe('split-bill person ids are unique after add / remove / add', () => {
  it('re-adding after a removal never re-issues a live id', () => {
    render(<SplitBillPage />)
    fireEvent.click(document.querySelector('[data-sb-mode-custom]') as HTMLButtonElement)
    fireEvent.click(document.querySelector('[data-sb-add]') as HTMLButtonElement) // 3 people
    expect(amountIds()).toHaveLength(3)
    const remove = document.querySelectorAll<HTMLButtonElement>('[data-danger]')
    fireEvent.click(remove[1]) // drop the middle person → 2 people
    fireEvent.click(document.querySelector('[data-sb-add]') as HTMLButtonElement) // add again → 3 people
    const ids = amountIds()
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })
})
