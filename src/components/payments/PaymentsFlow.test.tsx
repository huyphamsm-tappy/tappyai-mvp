// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { paymentsCatalog } from '@/lib/plans/planConfig'

// PAYMENTS — the three web screens: pick → VietQR → success.

const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: () => channel, removeChannel: vi.fn() }) }))
vi.mock('@/lib/i18n/useTranslation', async () => {
  const { vi: dict } = await import('@/lib/i18n/payments')
  const t = (k: string, vars?: Record<string, string>) =>
    Object.entries(vars ?? {}).reduce((s, [n, v]) => s.split(`{${n}}`).join(v), dict[k] ?? k)
  return { useTranslation: () => ({ t, locale: 'vi' }) }
})

import PaymentsFlow from './PaymentsFlow'

const ORDER = {
  order: { id: '0b3c0f7e-0000-4000-8000-000000000001', code: 'TAPPYAB23CD', plan: 'momo', amountVnd: 179000, status: 'pending', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() },
  bank: { accountNumber: '0011223344', accountName: 'PHAM HUY', bankCode: 'MBBank' },
  qrUrl: 'https://qr.sepay.vn/img?acc=0011223344&bank=MBBank&amount=179000&des=TAPPYAB23CD',
}

let orderStatus = 'pending'
beforeEach(() => {
  orderStatus = 'pending'
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/payments/orders' && init?.method === 'POST') return new Response(JSON.stringify(ORDER), { status: 201 })
    if (url.startsWith('/api/payments/orders?id=')) return new Response(JSON.stringify({ order: { ...ORDER.order, status: orderStatus } }))
    if (url === '/api/subscription') return new Response(JSON.stringify({ isPro: true, currentPeriodEnd: '2026-10-27T10:00:00Z' }))
    return new Response('{}', { status: 404 })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('plan picker', () => {
  it('shows five plans, Momo marked popular and pre-selected, 30 questions a day, one primary button', () => {
    render(<PaymentsFlow plans={paymentsCatalog()} current={null} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(5)
    expect(radios.map((r) => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Pip'), expect.stringContaining('Sunny')]))
    expect(screen.getByText('Phổ biến').closest('[role=radio]')!.textContent).toContain('Momo')
    expect(screen.getByRole('radio', { checked: true }).textContent).toContain('Momo')
    expect(screen.getAllByText(/30 câu hỏi AI mỗi ngày/)).toHaveLength(5)
    expect(screen.getByText('179.000đ')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Tiếp tục' })).toHaveLength(1)
  })

  it('shows the current plan and its end date', () => {
    render(<PaymentsFlow plans={paymentsCatalog()} current={{ name: 'Coco', periodEnd: '2026-12-01T00:00:00Z' }} />)
    expect(screen.getByText(/Bạn đang dùng gói Coco đến hết ngày 01\/12\/2026/)).toBeTruthy()
  })
})

describe('VietQR → success', () => {
  it('creates the order, shows QR + copyable details, and moves to success once the order is paid', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<PaymentsFlow plans={paymentsCatalog()} current={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await waitFor(() => expect(screen.getByTestId('pay-qr')).toBeTruthy())
    expect((screen.getByRole('img') as HTMLImageElement).src).toBe(ORDER.qrUrl)
    expect(screen.getByText('TAPPYAB23CD')).toBeTruthy()
    expect(screen.getByText('Đang chờ thanh toán…')).toBeTruthy()
    expect(screen.getByText(/Mã còn hiệu lực 1[45]:\d\d/)).toBeTruthy()

    // "I've made the transfer" only shows the wait — it grants nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Tôi đã chuyển khoản' }))
    expect(screen.getByText(/đang chờ ngân hàng báo về/)).toBeTruthy()

    orderStatus = 'paid'
    await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
    await waitFor(() => expect(screen.getByTestId('pay-success')).toBeTruthy())
    expect(screen.getByText('Bạn đã là thành viên Momo 🎉')).toBeTruthy()
    expect(screen.getByText(/27\/10\/2026/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Bắt đầu hỏi Tappy' }).getAttribute('href')).toBe('/chat')
  })

  it('a short payment explains itself in plain words', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<PaymentsFlow plans={paymentsCatalog()} current={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await waitFor(() => expect(screen.getByTestId('pay-qr')).toBeTruthy())
    orderStatus = 'mismatch'
    await act(async () => { await vi.advanceTimersByTimeAsync(3_100) })
    await waitFor(() => expect(screen.getByText(/số tiền chưa khớp/)).toBeTruthy())
  })

  it('a refused order shows the server’s plain message, never a code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'too_many_pending', message: 'Bạn đang có vài đơn chờ thanh toán.' }), { status: 429 })))
    render(<PaymentsFlow plans={paymentsCatalog()} current={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Bạn đang có vài đơn chờ thanh toán.'))
    expect(screen.queryByText(/too_many_pending/)).toBeNull()
  })
})
