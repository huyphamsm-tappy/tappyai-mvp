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
  // Owner 01/11/2026: new plan catalog (plan momo = Coco 1 month, 175.000đ)
  order: { id: '0b3c0f7e-0000-4000-8000-000000000001', code: 'TAPPYAB23CD', plan: 'momo', amountVnd: 175000, status: 'pending', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() },
  bank: { accountNumber: '0011223344', accountName: 'PHAM HUY', bankCode: 'MBBank' },
  qrUrl: 'https://qr.sepay.vn/img?acc=0011223344&bank=MBBank&amount=175000&des=TAPPYAB23CD',
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
  it('shows five plans, Coco 1 month (plan momo) marked popular and pre-selected, unlimited AI questions, one primary button', () => {
    render(<PaymentsFlow plans={paymentsCatalog()} current={null} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(5)
    // Owner 01/11/2026: new plan catalog (MoMo trial, Coco 1/3 months, Tappy 1/3 months; Milo/Sunny not sold)
    expect(radios.map((r) => r.textContent)).toEqual([
      'MoMo7 ngày · Không giới hạn câu hỏi AI25.000đ',
      'CocoPhổ biến1 tháng · Không giới hạn câu hỏi AI175.000đ',
      'Coco3 tháng · Không giới hạn câu hỏi AI472.500đ≈ 5.250đ/ngày',
      'Tappy1 tháng · Không giới hạn câu hỏi AI225.000đ',
      'Tappy3 tháng · Không giới hạn câu hỏi AI607.500đ≈ 6.750đ/ngày',
    ])
    expect(screen.getByText('Phổ biến').closest('[role=radio]')!.textContent).toBe('CocoPhổ biến1 tháng · Không giới hạn câu hỏi AI175.000đ') // Owner 01/11/2026: new plan catalog
    expect(screen.getByRole('radio', { checked: true }).textContent).toContain('175.000đ')
    // owner 01/11/2026: "30 câu hỏi AI mỗi ngày" -> "Không giới hạn câu hỏi AI" (accounts have no visible limit; hidden anti-abuse ceiling)
    expect(screen.getAllByText(/Không giới hạn câu hỏi AI/)).toHaveLength(5)
    expect(document.body.textContent).not.toMatch(/câu hỏi AI mỗi ngày|1000|1\.000/) // the hidden ceiling is never shown
    expect(screen.getByText('175.000đ')).toBeTruthy() // Owner 01/11/2026: new plan catalog
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
    expect(screen.getByText('Bạn đã là thành viên Coco 🎉')).toBeTruthy() // Owner 01/11/2026: new plan catalog
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
