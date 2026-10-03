// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { subscriptionCatalog } from '@/lib/payments/subscriptionCatalog'
import { mySubscription } from '@/lib/payments/subscriptionState'

// SUBSCRIPTIONS — the web screens (docs/payments/PLAN.md). Written by the security session.

const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: () => channel, removeChannel: vi.fn() }) }))
vi.mock('@/lib/i18n/useTranslation', async () => {
  const { vi: dict } = await import('@/lib/i18n/payments')
  const t = (k: string, vars?: Record<string, string>) =>
    Object.entries(vars ?? {}).reduce((s, [n, v]) => s.split(`{${n}}`).join(v), dict[k] ?? k)
  return { useTranslation: () => ({ t, locale: 'vi' }) }
})

import SubscriptionFlow, { type MyPlanResponse } from './SubscriptionFlow'

const catalog = subscriptionCatalog({ env: {} as NodeJS.ProcessEnv })
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()
const quota = { limit: 15, used: 3, remaining: 12, period: 'day' as const }
const free: MyPlanResponse = { signedIn: true, subscription: mySubscription(null), quota }
const activeWeb = (endDays = 20): MyPlanResponse => ({
  signedIn: true, quota: { limit: 30, used: 2, remaining: 28, period: 'day' },
  subscription: mySubscription({ plan: 'momo', status: 'active', current_period_end: inDays(endDays), source: 'web_sepay' }),
})
const ORDER = {
  order: { id: '0b3c0f7e-0000-4000-8000-000000000001', code: 'TAPPYAB23CD', plan: 'coco', amountVnd: 489000, status: 'pending', expiresAt: inDays(0.01) },
  bank: { accountNumber: '0011223344', accountName: 'TEST', bankCode: 'MBBank' },
  qrUrl: 'https://qr.sepay.vn/img?x',
}

let orderStatus = 'pending'
let meAfterPay: MyPlanResponse = free
beforeEach(() => {
  orderStatus = 'pending'
  meAfterPay = free
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/payments/orders' && init?.method === 'POST') return new Response(JSON.stringify(ORDER), { status: 201 })
    if (url.startsWith('/api/payments/orders?id=')) return new Response(JSON.stringify({ order: { ...ORDER.order, status: orderStatus } }))
    if (url === '/api/payments/me') return new Response(JSON.stringify(meAfterPay))
    return new Response('{}', { status: 404 })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

const goTo = (plan: string) => {
  fireEvent.click(document.querySelector(`[data-plan="${plan}"]`)!)
  fireEvent.click(screen.getByRole('button', { name: `Chọn ${plan[0].toUpperCase()}${plan.slice(1)}` }))
}

describe('plan list', () => {
  it('five plans by duration, no badge, Free limit from the server, honest hints only', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    const ids = [...document.querySelectorAll('[data-plan]')].map((e) => e.getAttribute('data-plan'))
    expect(ids).toEqual(['pip', 'momo', 'coco', 'milo', 'sunny'])
    // the one approved badge, on Sunny only (mobile card + desktop column are both in the DOM)
    const badges = screen.getAllByText('Phổ biến nhất')
    expect(badges.length).toBe(2)
    for (const b of badges) expect(b.closest('[data-plan],[data-plan-col]')?.getAttribute(b.closest('[data-plan]') ? 'data-plan' : 'data-plan-col')).toBe('sunny')
    expect(screen.queryByText(/Best|Winner|Tiết kiệm so với|Giá trị lâu dài/)).toBeNull()
    expect(screen.getAllByText('15 câu hỏi AI mỗi ngày').length).toBeGreaterThan(0) // Free = live backend value
    expect(screen.getAllByText('5 câu hỏi AI trọn đời').length).toBe(1)
    // USD list prices on the plans (owner P7 decision); the VND amount appears only at payment; no price per day, no %
    expect(document.body.textContent).toMatch(/\$1 \/ 7 ngày/)
    expect(document.body.textContent).toMatch(/\$66 \/ 12 tháng/)
    expect(document.body.textContent).toMatch(/\$7 \/ 1 tháng/)
    expect(document.body.textContent).not.toMatch(/\d\.\d{3}đ|đ\s*\/\s*ngày|\/ngày/)
    expect(document.body.textContent).not.toMatch(/%/)
  })

  it('ACTIVE: opens on "Gói của tôi"; in the list the buy buttons are disabled and the plan says "Gói hiện tại"', () => {
    const { unmount } = render(<SubscriptionFlow catalog={catalog} initialMe={activeWeb()} />)
    expect(screen.getByTestId('sub-manage')).toBeTruthy()
    unmount()
    render(<SubscriptionFlow catalog={catalog} initialMe={activeWeb()} initial={{ screen: 'home' }} />)
    for (const b of document.querySelectorAll('[data-plan]')) expect((b as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByText('Gói hiện tại').length).toBeGreaterThanOrEqual(2) // the summary card + Momo's card(s)
  })
})

describe('purchase (web)', () => {
  it('detail → method: only bank transfer, disclosure next to the pay button, never "tự gia hạn"', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    goTo('coco')
    const disclosure = screen.getByTestId('sub-disclosure').textContent!
    expect(disclosure).toMatch(/489\.000đ cho 3 tháng/)
    expect(disclosure).toMatch(/không tự trừ tiền/)
    expect(disclosure).toMatch(/Gói dùng đến hết ngày .*, mua lại để tiếp tục\./)
    expect(disclosure).not.toMatch(/nhắc|Nhắc/)
    expect(screen.getByRole('link', { name: 'Điều khoản' }).getAttribute('href')).toBe('/terms')
    expect(screen.getByRole('link', { name: 'Chính sách quyền riêng tư' }).getAttribute('href')).toBe('/privacy')
    expect(screen.getAllByRole('radio')).toHaveLength(1) // card / Apple Pay / Google Pay are not drawn
    expect(document.body.textContent).not.toMatch(/tự gia hạn|nhắc gia hạn|thanh toán tiếp theo|Apple Pay|Google Pay|thẻ ngân hàng/i)
    expect(screen.getByText('Thanh toán an toàn và bảo mật')).toBeTruthy()
    expect(screen.getByText('Chuyển khoản ngân hàng (SePay)')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Ví điện tử|(^|\s)ví(\s|$)/i) // no \b: it never matches after a Vietnamese vowel
  })

  it('Sunny detail: "Chỉ khoảng $5.5 / tháng" from the configured list price; other plans show no monthly figure', () => {
    const { unmount } = render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    fireEvent.click(document.querySelector('[data-plan="sunny"]')!)
    expect(screen.getByTestId('sub-monthly').textContent).toBe('Chỉ khoảng $5.5 / tháng')
    expect(screen.getByText('Tappy Sunny')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chọn Sunny' })).toBeTruthy()
    const detail = screen.getByTestId('sub-detail').textContent!
    expect(detail).toMatch(/30 câu hỏi AI mỗi ngày/)
    expect(detail).toMatch(/Dùng cho mọi tính năng AI của Tappy/)
    expect(detail).not.toMatch(/\bPro\b/)
    unmount()
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    fireEvent.click(document.querySelector('[data-plan="milo"]')!)
    expect(screen.queryByTestId('sub-monthly')).toBeNull()
    // Huy 2026-10-02: Pip/Momo/Coco/Milo show 3 lines (no "dùng chung số câu hỏi" line)
    const lines = [...screen.getByTestId('sub-detail').querySelectorAll('li')].map((li) => li.textContent)
    expect(lines).toEqual(['30 câu hỏi AI mỗi ngày', 'Dùng cho mọi tính năng AI của Tappy', 'Đồng hành lâu dài, trải nghiệm trọn vẹn hơn'])
  })

  it('the order row says paid but the server does not show ACTIVE → failure, not success', async () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    goTo('coco')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Thanh toán 489\.000đ/ })) })
    await waitFor(() => expect(screen.getByTestId('pay-qr')).toBeTruthy())
    orderStatus = 'paid'
    meAfterPay = free // a client-side "paid" without the server's ACTIVE
    await waitFor(() => expect(screen.getByTestId('sub-failure')).toBeTruthy(), { timeout: 5_000 })
    expect(screen.getByText('Thanh toán chưa thành công. Gói của bạn chưa thay đổi.')).toBeTruthy()
  })

  it('server ACTIVE → "Xong rồi! Coco đã đồng hành cùng bạn."', async () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    goTo('coco')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Thanh toán 489\.000đ/ })) })
    orderStatus = 'paid'
    meAfterPay = { signedIn: true, quota: { limit: 30, used: 0, remaining: 30, period: 'day' },
      subscription: mySubscription({ plan: 'coco', status: 'active', current_period_end: inDays(90), source: 'web_sepay' }) }
    await waitFor(() => expect(screen.getByTestId('sub-success')).toBeTruthy(), { timeout: 5_000 })
    expect(screen.getByText('Xong rồi! Coco đã đồng hành cùng bạn.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Bắt đầu trải nghiệm' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Xem chi tiết gói' })).toBeTruthy()
  })

  it('a short transfer → failure screen; "Thử lại" keeps the chosen plan', async () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    goTo('coco')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Thanh toán 489\.000đ/ })) })
    orderStatus = 'mismatch'
    await waitFor(() => expect(screen.getByTestId('sub-failure')).toBeTruthy(), { timeout: 5_000 })
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(screen.getByTestId('sub-disclosure').textContent).toMatch(/Coco/)
  })
})

describe('my plan', () => {
  it('web plan: one-time wording, no reminder, no renew button, no "next payment"; EXPIRED → "Mua lại"', () => {
    const { unmount } = render(<SubscriptionFlow catalog={catalog} initialMe={activeWeb(2)} />)
    expect(screen.getByText(/Chuyển khoản một lần, không tự trừ tiền\. Gói dùng đến hết ngày .*, mua lại để tiếp tục\./)).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: /Gia hạn|Mua lại/ })).toBeNull()
    expect(document.body.textContent).not.toMatch(/tự gia hạn|Nhắc gia hạn|thanh toán tiếp theo/i)
    unmount()
    const expired: MyPlanResponse = { signedIn: true, pipUsed: true, quota, subscription: mySubscription({ plan: 'pip', status: 'expired', current_period_end: inDays(-1), source: 'web_sepay' }) }
    render(<SubscriptionFlow catalog={catalog} initialMe={expired} initial={{ screen: 'manage' }} />)
    expect(screen.getByText('Đã hết hạn')).toBeTruthy()
    expect(screen.getByText(/^Hết hạn: /)).toBeTruthy()
    expect(screen.queryByText(/Hủy gói|Thanh toán tiếp theo/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mua lại' }))
    // Pip was used by this account: it is not offered again; every other plan can be bought
    expect(document.querySelectorAll('[data-plan]').length).toBe(4)
    expect(document.querySelector('[data-plan="pip"]')).toBeNull()
    expect((document.querySelector('[data-plan="momo"]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('store plan with auto-renew turned off: "vẫn dùng được đến hết hạn ngày …" and the store link', () => {
    const me: MyPlanResponse = { signedIn: true, quota, subscription: mySubscription({ plan: 'milo', status: 'active', current_period_end: inDays(40), source: 'google_play', cancel_at_period_end: true }) }
    render(<SubscriptionFlow catalog={catalog} initialMe={me} />)
    expect(screen.getByText(/Gói của bạn vẫn dùng được đến hết hạn ngày/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mở Google Play' }).getAttribute('href')).toBe('https://play.google.com/store/account/subscriptions')
    expect(screen.queryByRole('switch')).toBeNull()
  })
})

describe('Pip — one-time trial', () => {
  it('first time: "$1 · 7 ngày · Dùng thử 1 lần" with the detail note, and the VND transfer shown at payment', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    expect(screen.queryByTestId('sub-pip-used')).toBeNull()
    expect(document.querySelector('[data-plan="pip"]')!.textContent).toMatch(/\$1/)
    expect(document.querySelector('[data-plan="pip"]')!.textContent).toMatch(/Dùng thử 1 lần/)
    goTo('pip')
    expect(screen.getByTestId('sub-method').textContent).toMatch(/\$1 · 7 ngày · Dùng thử 1 lần/)
    expect(screen.getByTestId('sub-charged').textContent).toMatch(/29\.000đ/)
  })

  it('the detail screen carries the trial note', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    fireEvent.click(document.querySelector('[data-plan="pip"]')!)
    expect(screen.getByTestId('sub-trial').textContent).toMatch(/Dùng thử 1 lần.*chỉ có thể mua một lần cho mỗi tài khoản/)
  })

  it('after use: "Bạn đã sử dụng gói Pip" + the once-per-account note, and Pip is no longer an option', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={{ ...free, pipUsed: true }} />)
    const notice = screen.getByTestId('sub-pip-used').textContent!
    expect(notice).toMatch(/Bạn đã sử dụng gói Pip/)
    expect(notice).toMatch(/Gói dùng thử này chỉ có thể mua một lần cho mỗi tài khoản/)
    expect(document.querySelector('[data-plan="pip"]')).toBeNull()
    expect(document.querySelector('[data-plan-col="pip"]')).toBeNull()
    expect([...document.querySelectorAll('[data-plan]')].map((e) => e.getAttribute('data-plan'))).toEqual(['momo', 'coco', 'milo', 'sunny'])
  })

  it('a guest is shown as "Khách" with 5 questions for life — never as the Free tier — and Free asks them to sign in', () => {
    const guest: MyPlanResponse = { signedIn: false, pipUsed: false, subscription: mySubscription(null), quota: { limit: 5, used: 0, remaining: 5, period: 'lifetime' } }
    render(<SubscriptionFlow catalog={catalog} initialMe={guest} />)
    const access = screen.getByTestId('sub-access').textContent!
    expect(access).toMatch(/Khách/)
    expect(access).toMatch(/5 câu hỏi AI trọn đời/)
    expect(access).not.toMatch(/Miễn phí|15 câu/)
    expect(screen.getByRole('link', { name: 'Đăng nhập miễn phí' }).getAttribute('href')).toBe('/login?returnTo=%2Fsubscription')
  })

  it('a guest still sees Pip as available; buying sends them to sign in first', () => {
    const guest: MyPlanResponse = { signedIn: false, pipUsed: false, subscription: mySubscription(null), quota: { limit: 5, used: 0, remaining: 5, period: 'lifetime' } }
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<SubscriptionFlow catalog={catalog} initialMe={guest} />)
    expect(document.querySelector('[data-plan="pip"]')).not.toBeNull()
    goTo('pip')
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập để mua' }))
    expect(assign).toHaveBeenCalledWith('/login?returnTo=%2Fsubscription')
  })
})
