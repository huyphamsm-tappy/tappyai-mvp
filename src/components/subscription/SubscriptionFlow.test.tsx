// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { subscriptionCatalog } from '@/lib/payments/subscriptionCatalog'
import { mySubscription } from '@/lib/payments/subscriptionState'
import { ANON_LIFETIME_LIMIT, FREE_DAILY_LIMIT, PAID_DAILY_CEILING } from '@/lib/config/product'

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
const quota = { limit: FREE_DAILY_LIMIT, used: 3, remaining: FREE_DAILY_LIMIT - 3, period: 'day' as const }
const free: MyPlanResponse = { signedIn: true, subscription: mySubscription(null), quota }
const activeWeb = (endDays = 20): MyPlanResponse => ({
  signedIn: true, quota: { limit: PAID_DAILY_CEILING, used: 2, remaining: PAID_DAILY_CEILING - 2, period: 'day' },
  subscription: mySubscription({ plan: 'momo', status: 'active', current_period_end: inDays(endDays), source: 'web_sepay' }),
})
const ORDER = {
  // Owner 01/11/2026: new plan catalog (coco = Coco 3 months, 472.500đ)
  order: { id: '0b3c0f7e-0000-4000-8000-000000000001', code: 'TAPPYAB23CD', plan: 'coco', amountVnd: 472500, status: 'pending', expiresAt: inDays(0.01) },
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

// Owner 01/11/2026: new plan catalog - the shown name is no longer the id (pip = MoMo, momo/coco = Coco, promax* = Tappy)
const PLAN_NAME: Record<string, string> = { pip: 'MoMo', momo: 'Coco', coco: 'Coco', promax1m: 'Tappy', promax3m: 'Tappy' }
const goTo = (plan: string) => {
  fireEvent.click(document.querySelector(`[data-plan="${plan}"]`)!)
  fireEvent.click(screen.getByRole('button', { name: `Chọn ${PLAN_NAME[plan]}` }))
}

describe('plan list', () => {
  it('five plans by duration, no badge, Free shown as unlimited (no number), honest hints only', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    const ids = [...document.querySelectorAll('[data-plan]')].map((e) => e.getAttribute('data-plan'))
    // Owner 01/11/2026: new plan catalog (by duration, stable)
    expect(ids).toEqual(['pip', 'momo', 'promax1m', 'coco', 'promax3m'])
    expect([...document.querySelectorAll('[data-plan]')].map((e) => e.querySelector('span.text-xl')?.textContent)).toEqual(['MoMo', 'Coco', 'Tappy', 'Coco', 'Tappy'])
    // Owner 01/11/2026: new plan catalog - no plan carries a badge (mobile card nor desktop column)
    expect(screen.queryAllByText('Phổ biến nhất')).toHaveLength(0)
    expect(screen.queryByText(/Best|Winner|Tiết kiệm so với|Giá trị lâu dài/)).toBeNull()
    // owner 01/11/2026: "10 câu hỏi AI mỗi ngày" -> "Không giới hạn câu hỏi AI", guest 5 -> 10 (accounts have no visible limit; hidden anti-abuse ceiling)
    expect(screen.getAllByText('Không giới hạn câu hỏi AI').length).toBeGreaterThan(0) // Free = no visible limit
    expect(document.body.textContent).not.toMatch(/câu hỏi AI mỗi ngày/) // the hidden ceiling is never shown as a daily number
    expect(document.body.textContent).not.toMatch(new RegExp(`(^|\\D)(${FREE_DAILY_LIMIT}|${PAID_DAILY_CEILING}) câu`))
    expect(screen.getAllByText(`${ANON_LIFETIME_LIMIT} câu hỏi AI trọn đời`).length).toBe(1)
    // Standardized VND prices on the plans; no price per day, no %, no USD
    // Owner 01/11/2026: new plan catalog
    expect(document.body.textContent).toMatch(/25\.000đ \/ 7 ngày/)
    expect(document.body.textContent).toMatch(/175\.000đ \/ 1 tháng/)
    expect(document.body.textContent).toMatch(/225\.000đ \/ 1 tháng/)
    expect(document.body.textContent).toMatch(/472\.500đ \/ 3 tháng/)
    expect(document.body.textContent).toMatch(/607\.500đ \/ 3 tháng/)
    expect(document.body.textContent).not.toMatch(/939\.000đ|1\.719\.000đ|6 tháng|12 tháng/) // Milo / Sunny are not sold
    expect(document.body.textContent).not.toMatch(/\$[0-9]+/)
    expect(document.body.textContent).not.toMatch(/đ\s*\/\s*ngày|\/ngày/)
    // Owner 01/11/2026: "Mua 3 tháng giảm 10%" - the only % on the page is that 10% on the two 3-month plans (Coco, Tappy)
    expect(document.body.textContent!.match(/\d+%/g)).toEqual(['10%', '10%'])
    expect(document.body.textContent!.match(/%/g)).toHaveLength(2)
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
    expect(disclosure).toMatch(/472\.500đ cho 3 tháng/) // Owner 01/11/2026: new plan catalog
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

  // Owner 01/11/2026: new plan catalog - Sunny (the only "about …/month" plan) is not sold, so no detail shows a monthly figure
  it('Tappy (promax1m) detail: plan name alone, 50 Deep Research line, no monthly figure; Coco detail: 10 Deep Research line', () => {
    expect(catalog.plans.some((p) => p.id === 'sunny' || p.id === 'milo')).toBe(false)
    const { unmount } = render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    fireEvent.click(document.querySelector('[data-plan="promax1m"]')!)
    expect(screen.queryByTestId('sub-monthly')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tappy') // 'sub.plan.fullName' = '{plan}'
    expect(screen.getByRole('button', { name: 'Chọn Tappy' })).toBeTruthy()
    const detail = screen.getByTestId('sub-detail').textContent!
    expect(detail).toMatch(/Không giới hạn câu hỏi AI/)
    expect(detail).toMatch(/Dùng cho mọi tính năng AI của Tappy/)
    expect(detail).not.toMatch(/\bPro\b/)
    expect([...screen.getByTestId('sub-detail').querySelectorAll('li')].map((li) => li.textContent))
      .toEqual(['Không giới hạn câu hỏi AI', 'Dùng cho mọi tính năng AI của Tappy', 'Suy nghĩ, Tìm web và 50 lượt Nghiên cứu sâu mỗi tháng'])
    unmount()
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    fireEvent.click(document.querySelector('[data-plan="coco"]')!)
    expect(screen.queryByTestId('sub-monthly')).toBeNull()
    // Huy 2026-10-02: non-Sunny plans show 3 lines (no "dùng chung số câu hỏi" line)
    const lines = [...screen.getByTestId('sub-detail').querySelectorAll('li')].map((li) => li.textContent)
    expect(lines).toEqual(['Không giới hạn câu hỏi AI', 'Dùng cho mọi tính năng AI của Tappy', 'Suy nghĩ, Tìm web và 10 lượt Nghiên cứu sâu mỗi tháng'])
  })

  it('the order row says paid but the server does not show ACTIVE → failure, not success', async () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    goTo('coco')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Thanh toán 472\.500đ/ })) }) // Owner 01/11/2026: new plan catalog
    await waitFor(() => expect(screen.getByTestId('pay-qr')).toBeTruthy())
    orderStatus = 'paid'
    meAfterPay = free // a client-side "paid" without the server's ACTIVE
    await waitFor(() => expect(screen.getByTestId('sub-failure')).toBeTruthy(), { timeout: 5_000 })
    expect(screen.getByText('Thanh toán chưa thành công. Gói của bạn chưa thay đổi.')).toBeTruthy()
  })

  it('server ACTIVE → "Xong rồi! Coco đã đồng hành cùng bạn."', async () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    goTo('coco')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Thanh toán 472\.500đ/ })) }) // Owner 01/11/2026: new plan catalog
    orderStatus = 'paid'
    meAfterPay = { signedIn: true, quota: { limit: PAID_DAILY_CEILING, used: 0, remaining: PAID_DAILY_CEILING, period: 'day' },
      subscription: mySubscription({ plan: 'coco', status: 'active', current_period_end: inDays(90), source: 'web_sepay' }) }
    await waitFor(() => expect(screen.getByTestId('sub-success')).toBeTruthy(), { timeout: 5_000 })
    expect(screen.getByText('Xong rồi! Coco đã đồng hành cùng bạn.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Bắt đầu trải nghiệm' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Xem chi tiết gói' })).toBeTruthy()
  })

  it('a short transfer → failure screen; "Thử lại" keeps the chosen plan', async () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    goTo('coco')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Thanh toán 472\.500đ/ })) }) // Owner 01/11/2026: new plan catalog
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
  // Owner 01/11/2026: new plan catalog (plan `pip` is the MoMo trial, 25.000đ)
  it('first time: "25.000đ / 7 ngày · Dùng thử 1 lần" with the detail note, and the VND transfer shown at payment', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    expect(screen.queryByTestId('sub-pip-used')).toBeNull()
    expect(document.querySelector('[data-plan="pip"]')!.textContent).toMatch(/25\.000đ \/ 7 ngày/)
    expect(document.querySelector('[data-plan="pip"]')!.textContent).toMatch(/Dùng thử 1 lần/)
    goTo('pip')
    expect(screen.getByTestId('sub-method').textContent).toMatch(/25\.000đ \/ 7 ngày · Dùng thử 1 lần/)
    expect(screen.getByTestId('sub-charged').textContent).toMatch(/25\.000đ/)
  })

  it('the detail screen carries the trial note', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    fireEvent.click(document.querySelector('[data-plan="pip"]')!)
    expect(screen.getByTestId('sub-trial').textContent).toMatch(/Dùng thử 1 lần.*chỉ có thể mua một lần cho mỗi tài khoản/)
  })

  it('after use: "Bạn đã dùng gói dùng thử MoMo" + the once-per-account note, and the trial is no longer an option', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={{ ...free, pipUsed: true }} />)
    const notice = screen.getByTestId('sub-pip-used').textContent!
    expect(notice).toMatch(/Bạn đã dùng gói dùng thử MoMo/) // Owner 01/11/2026: new plan catalog
    expect(notice).toMatch(/Gói dùng thử này chỉ có thể mua một lần cho mỗi tài khoản/)
    expect(document.querySelector('[data-plan="pip"]')).toBeNull()
    expect(document.querySelector('[data-plan-col="pip"]')).toBeNull()
    // Owner 01/11/2026: new plan catalog
    expect([...document.querySelectorAll('[data-plan]')].map((e) => e.getAttribute('data-plan'))).toEqual(['momo', 'promax1m', 'coco', 'promax3m'])
  })

  it(`a guest is shown as "Welcome Guest" with ${ANON_LIFETIME_LIMIT} questions for life — never as the Free tier — and Free asks them to sign in`, () => {
    const guest: MyPlanResponse = { signedIn: false, pipUsed: false, subscription: mySubscription(null), quota: { limit: ANON_LIFETIME_LIMIT, used: 0, remaining: ANON_LIFETIME_LIMIT, period: 'lifetime' } }
    render(<SubscriptionFlow catalog={catalog} initialMe={guest} />)
    const access = screen.getByTestId('sub-access').textContent!
    expect(access).toMatch(/Welcome Guest/)
    expect(access).toMatch(new RegExp(`(^|\\D)${ANON_LIFETIME_LIMIT} câu hỏi AI trọn đời`))
    // the Free tier's wording is now "Không giới hạn câu hỏi AI" (was "10 câu ... mỗi ngày"): a guest must see neither
    expect(access).not.toMatch(/Miễn phí|Không giới hạn|mỗi ngày/)
    expect(screen.getByRole('link', { name: 'Đăng nhập miễn phí' }).getAttribute('href')).toBe('/login?returnTo=%2Fsubscription')
  })

  it('a guest still sees Pip as available; buying sends them to sign in first', () => {
    const guest: MyPlanResponse = { signedIn: false, pipUsed: false, subscription: mySubscription(null), quota: { limit: ANON_LIFETIME_LIMIT, used: 0, remaining: ANON_LIFETIME_LIMIT, period: 'lifetime' } }
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<SubscriptionFlow catalog={catalog} initialMe={guest} />)
    expect(document.querySelector('[data-plan="pip"]')).not.toBeNull()
    goTo('pip')
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập để mua' }))
    expect(assign).toHaveBeenCalledWith('/login?returnTo=%2Fsubscription')
  })
})

// Owner 01/11/2026: new plan catalog - the free plan is now named "Pip" (art /subscription/pip.webp)
describe('naming — the free plan is "Pip", "Miễn phí" is only its price', () => {
  it('the free column is titled Pip with "Miễn phí" as the price line; no column or access card is named "Miễn phí"', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={free} />)
    const cols = screen.getByTestId('sub-columns')
    const freeCols = [...cols.children].filter((c) => c.querySelector('img[src="/subscription/pip.webp"]'))
    expect(freeCols).toHaveLength(1)
    const paragraphs = [...freeCols[0].querySelectorAll('p')].map((p) => p.textContent)
    expect(paragraphs[0]).toBe('Pip')
    expect(paragraphs).toContain('Miễn phí')
    expect(screen.getByTestId('sub-access').textContent).toMatch(/Pip/)
    expect(screen.getByTestId('sub-access').textContent).not.toMatch(/Miễn phí/)
    expect([...cols.querySelectorAll('p')].filter((p) => p.textContent === 'Miễn phí').length).toBe(2) // the two free columns' price lines (guest + Pip)
  })
})

describe('Back inside checkout returns to the plan it came from', () => {
  it('registers a handler: pay-method -> detail -> list; the list leaves the page (handler declines)', () => {
    let handler: (() => boolean) | null = null
    render(<SubscriptionFlow catalog={catalog} initialMe={free} onBackHandler={(fn) => { handler = fn }} />)
    expect(handler!()).toBe(false) // list: nothing to step back to inside the flow
    goTo('pip')
    expect(screen.getByTestId('sub-method')).toBeTruthy()
    act(() => { expect(handler!()).toBe(true) })
    expect(screen.getByTestId('sub-detail')).toBeTruthy()
    act(() => { expect(handler!()).toBe(true) })
    expect(screen.getByTestId('sub-home')).toBeTruthy()
    expect(handler!()).toBe(false)
  })

  it('from the QR screen Back returns to the payment-method step (the plan is kept), never leaves the flow', async () => {
    let handler: (() => boolean) | null = null
    render(<SubscriptionFlow catalog={catalog} initialMe={free} onBackHandler={(fn) => { handler = fn }} />)
    goTo('coco')
    fireEvent.click(screen.getByRole('button', { name: /^Thanh toán/ }))
    await waitFor(() => expect(screen.queryByTestId('sub-method')).toBeNull())
    act(() => { expect(handler!()).toBe(true) })
    expect(screen.getByTestId('sub-method')).toBeTruthy()
  })
})
