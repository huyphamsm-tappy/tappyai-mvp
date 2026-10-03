import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CHANNEL_SOURCE, EntitlementWriteError, grantPlan } from './grantPlan'
import { entitlementFromRow } from '@/lib/plans/entitlement'
import { aiQuotaFor, paymentsCatalog, planForStoreProduct } from '@/lib/plans/planConfig'

// PAYMENTS — grantPlan is a thin, exact caller of the SQL writer (the stacking and the
// idempotency are proven on a real database in supabase/tests/p8_payments.test.ts).

function fakeDb(result: unknown = { status: 'applied', changed: true, plan: 'momo', before_end: null, after_end: '2026-10-27T00:00:00Z' }, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error })
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}

describe('grantPlan', () => {
  it('web/admin grants one plan period, from now', async () => {
    const { db, rpc } = fakeDb()
    const now = new Date('2026-09-27T00:00:00Z')
    const r = await grantPlan('u1', 'momo', 'web_sepay', 'sepay:1', null, { purchasedAt: now, db })
    expect(r).toMatchObject({ status: 'applied', afterEnd: '2026-10-27T00:00:00Z' })
    expect(rpc).toHaveBeenCalledWith('p8_apply_entitlement', expect.objectContaining({
      p_user: 'u1', p_plan: 'momo', p_source: 'web_sepay', p_external_ref: 'sepay:1', p_mode: 'stack',
      p_base_at: now.toISOString(), p_seconds: 30 * 86_400, p_expires_at: null,
    }))
  })

  it('a store grant lasts exactly the store period', async () => {
    const { db, rpc } = fakeDb()
    const bought = new Date('2026-09-27T00:00:00Z')
    const expires = new Date('2026-10-04T00:00:00Z')
    await grantPlan('u1', 'pip', 'android', 'rc:e1', expires, { purchasedAt: bought, db })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_source: 'google_play', p_seconds: 7 * 86_400, p_expires_at: expires.toISOString() })
  })

  it('maps every channel onto an existing subscriptions.source value', () => {
    expect(CHANNEL_SOURCE).toEqual({ web_sepay: 'web_sepay', android: 'google_play', ios: 'apple_iap', admin: 'manual' })
  })

  it('reports a duplicate without claiming a change', async () => {
    const { db } = fakeDb({ status: 'duplicate' })
    expect(await grantPlan('u1', 'pip', 'web_sepay', 'sepay:1', null, { db })).toEqual({ status: 'duplicate' })
  })

  it('throws a typed error (no DB detail) when the write fails', async () => {
    const { db } = fakeDb(null, { code: '42501', message: 'permission denied for function p8_apply_entitlement' })
    await expect(grantPlan('u1', 'pip', 'web_sepay', 'sepay:1', null, { db })).rejects.toBeInstanceOf(EntitlementWriteError)
  })

  it('refuses a store period that ends before it starts', async () => {
    const { db, rpc } = fakeDb()
    const t = new Date('2026-09-27T00:00:00Z')
    await expect(grantPlan('u1', 'pip', 'ios', 'rc:e2', t, { purchasedAt: t, db })).rejects.toBeInstanceOf(EntitlementWriteError)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('quota reads the entitlement only — the channel never matters', () => {
  const future = new Date(Date.now() + 5 * 86_400_000).toISOString()
  it.each(['web_sepay', 'google_play', 'apple_iap', 'manual'])('a %s grant = paid, 30 AI questions a day', (source) => {
    const ent = entitlementFromRow({ plan: 'momo', status: 'active', current_period_end: future, source })
    expect(ent).toMatchObject({ paid: true, plan: 'momo', source })
    expect(aiQuotaFor(ent.plan)).toEqual({ limit: 30, period: 'day' })
  })
})

describe('catalog', () => {
  it('the web catalog has prices and per-day prices for long plans', () => {
    const c = paymentsCatalog()
    expect(c.map((p) => p.id)).toEqual(['pip', 'momo', 'coco', 'milo', 'sunny'])
    expect(c.find((p) => p.id === 'pip')!.pricePerDayVnd).toBeUndefined()
    expect(c.find((p) => p.id === 'sunny')!.pricePerDayVnd).toBe(Math.round(1_719_000 / 365))
  })

  it('the app catalog carries NO web price (Google Play policy)', () => {
    for (const p of paymentsCatalog({ forApp: true })) {
      expect(p.priceVnd).toBeUndefined()
      expect(p.pricePerDayVnd).toBeUndefined()
    }
  })

  it('maps store product ids, including the Play `product:baseplan` form', () => {
    expect(planForStoreProduct('tappy_coco_3m')).toBe('coco')
    expect(planForStoreProduct('tappy_momo_1m:monthly')).toBe('momo')
    expect(planForStoreProduct('com.tappyai.ios.pro.monthly')).toBeNull()
    expect(planForStoreProduct(null)).toBeNull()
  })
})
