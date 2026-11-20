// @vitest-environment jsdom
// Owner 20/11: buying again while a plan runs ADDS the days to its end date. The screen says so before any money moves and computes the end date from the current end, not from today.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { subscriptionCatalog } from '@/lib/payments/subscriptionCatalog'
import { mySubscription } from '@/lib/payments/subscriptionState'
import { FREE_DAILY_LIMIT, PAID_DAILY_CEILING } from '@/lib/config/product'

const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: () => channel, removeChannel: vi.fn() }) }))
vi.mock('@/lib/i18n/useTranslation', async () => {
  const { vi: dict } = await import('@/lib/i18n/payments')
  const t = (k: string, vars?: Record<string, string>) => Object.entries(vars ?? {}).reduce((s, [n, v]) => s.split(`{${n}}`).join(v), dict[k] ?? k)
  return { useTranslation: () => ({ t, locale: 'vi' }) }
})

import SubscriptionFlow, { endIfBoughtNow, formatDay, type MyPlanResponse } from './SubscriptionFlow'

const catalog = subscriptionCatalog({ env: {} as NodeJS.ProcessEnv })
const coco = catalog.plans.find(p => p.id === 'coco')!
const DAY = 86_400_000
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString()
const quota = { limit: FREE_DAILY_LIMIT, used: 3, remaining: FREE_DAILY_LIMIT - 3, period: 'day' as const }
const free: MyPlanResponse = { signedIn: true, subscription: mySubscription(null), quota }
const activeWeb = (days: number, plan = 'momo', source = 'web_sepay'): MyPlanResponse => ({
  signedIn: true, quota: { limit: PAID_DAILY_CEILING, used: 2, remaining: PAID_DAILY_CEILING - 2, period: 'day' },
  subscription: mySubscription({ plan, status: 'active', current_period_end: inDays(days), source }),
})

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 }))) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('endIfBoughtNow: where a purchase ends', () => {
  const now = Date.parse('2026-11-20T00:00:00Z')
  it('with a running plan the days are added to ITS end (10 days left + one period = 10 + period), not to today', () => {
    const end = new Date(now + 10 * DAY).toISOString()
    expect(Date.parse(endIfBoughtNow(coco, now, end))).toBe(now + (10 + coco.durationDays) * DAY)
  })
  it('with no plan, an ended one or nonsense it starts now', () => {
    expect(Date.parse(endIfBoughtNow(coco, now))).toBe(now + coco.durationDays * DAY)
    expect(Date.parse(endIfBoughtNow(coco, now, new Date(now - DAY).toISOString()))).toBe(now + coco.durationDays * DAY)
    expect(Date.parse(endIfBoughtNow(coco, now, 'not a date'))).toBe(now + coco.durationDays * DAY)
  })
})

describe('the purchase screen while a plan runs', () => {
  const open = (me: MyPlanResponse) => {
    render(<SubscriptionFlow catalog={catalog} initialMe={me} initial={{ screen: 'home' }} />)
    fireEvent.click(document.querySelector('[data-plan="coco"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Chọn Coco' }))
    return screen.getByTestId('sub-disclosure').textContent!
  }
  it('says the days are added and shows the end date counted from the current end', () => {
    const me = activeWeb(10)
    const text = open(me)
    expect(text).toContain('cộng vào hạn hiện tại')
    const expected = formatDay(new Date(Date.parse(me.subscription.periodEnd!) + coco.durationDays * DAY).toISOString(), 'vi')
    expect(text).toContain(`hết ngày ${expected}`)
  })
  it('an upgrade (Coco -> Tappy) says the account moves up and the days left are kept and added', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={activeWeb(10)} initial={{ screen: 'home' }} />)
    fireEvent.click(document.querySelector('[data-plan="promax1m"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Chọn Tappy' }))
    const text = screen.getByTestId('sub-disclosure').textContent!
    expect(text).toContain('nâng lên Tappy')
    expect(text).toContain('cộng vào hạn hiện tại')
  })
  it('the same kind of plan does not say the account moves up', () => {
    expect(open(activeWeb(10))).not.toContain('nâng lên')
  })
  it('a visitor with no plan sees no such line and the end date counted from today', () => {
    const text = open(free)
    expect(text).not.toContain('cộng vào hạn hiện tại')
    expect(text).toContain(`hết ngày ${formatDay(endIfBoughtNow(coco), 'vi')}`)
  })
  it('a store plan can not be topped up here: every buy button stays disabled', () => {
    render(<SubscriptionFlow catalog={catalog} initialMe={activeWeb(10, 'coco', 'google_play')} initial={{ screen: 'home' }} />)
    for (const b of document.querySelectorAll('[data-plan]')) expect((b as HTMLButtonElement).disabled).toBe(true)
  })
  it('the "my plan" screen offers "Mua thêm ngày" for a running web plan, and nothing for a store plan', () => {
    const { unmount } = render(<SubscriptionFlow catalog={catalog} initialMe={activeWeb(10)} />)
    expect(screen.getByRole('button', { name: 'Mua thêm ngày' })).toBeTruthy()
    unmount()
    render(<SubscriptionFlow catalog={catalog} initialMe={activeWeb(10, 'coco', 'google_play')} />)
    expect(screen.queryByRole('button', { name: /Mua thêm ngày|Mua lại/ })).toBeNull()
  })
})
