import { describe, expect, it } from 'vitest'
import { mySubscription } from './subscriptionState'

const NOW = new Date('2026-10-01T00:00:00Z')
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString()

describe('mySubscription', () => {
  it('NONE without a row; PENDING with a waiting web order', () => {
    expect(mySubscription(null, { now: NOW })).toMatchObject({ state: 'NONE', plan: null, canBuy: true, autoRenew: false })
    expect(mySubscription(null, { now: NOW, pendingOrder: true })).toMatchObject({ state: 'PENDING', canBuy: true })
  })

  it('ACTIVE web plan: never auto-renews, nothing to buy until it ends; then EXPIRED and buyable again', () => {
    const row = { plan: 'pip', status: 'active', current_period_end: inDays(2), source: 'web_sepay' }
    expect(mySubscription(row, { now: NOW })).toMatchObject({
      state: 'ACTIVE', plan: { id: 'pip', name: 'Pip' }, channel: 'web', autoRenew: false, canBuy: false, manage: null,
    })
    expect(mySubscription({ ...row, current_period_end: inDays(-0.01) }, { now: NOW })).toMatchObject({ state: 'EXPIRED', canBuy: true, autoRenew: false })
  })

  it('ACTIVE store plan: auto-renew mirrors the store; turned off = still ACTIVE to the end', () => {
    const row = { plan: 'coco', status: 'active', current_period_end: inDays(30), source: 'google_play', cancel_at_period_end: false }
    expect(mySubscription(row, { now: NOW })).toMatchObject({ state: 'ACTIVE', autoRenew: true, manage: 'google_play', canBuy: false })
    expect(mySubscription({ ...row, cancel_at_period_end: true }, { now: NOW })).toMatchObject({ state: 'ACTIVE', autoRenew: false })
    expect(mySubscription({ ...row, source: 'apple_iap' }, { now: NOW }).manage).toBe('app_store')
  })

  it('EXPIRED after the end (status not yet swept), CANCELLED after a refund/revoke', () => {
    expect(mySubscription({ plan: 'pip', status: 'active', current_period_end: inDays(-1), source: 'web_sepay' }, { now: NOW }))
      .toMatchObject({ state: 'EXPIRED', canBuy: true, autoRenew: false, manage: null })
    expect(mySubscription({ plan: 'pip', status: 'expired', current_period_end: inDays(-1), source: 'google_play' }, { now: NOW }).state).toBe('EXPIRED')
    expect(mySubscription({ plan: 'pip', status: 'canceled', current_period_end: inDays(-1), source: 'manual' }, { now: NOW }).state).toBe('CANCELLED')
  })

  it('never leaks internal fields', () => {
    const out = mySubscription({ plan: 'momo', status: 'active', current_period_end: inDays(5), source: 'manual',
      // fields the row may carry that must never reach a client
      ...({ grant_note: 'staff only', granted_by: 'x', stripe_sub_id: 'sub_1' } as object) } as never, { now: NOW })
    expect(Object.keys(out).sort()).toEqual(['autoRenew', 'canBuy', 'channel', 'manage', 'periodEnd', 'plan', 'state'])
    expect(JSON.stringify(out)).not.toMatch(/staff only|sub_1/)
  })
})
