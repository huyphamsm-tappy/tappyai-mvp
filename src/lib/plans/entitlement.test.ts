import { describe, expect, it, vi } from 'vitest'
import {
  SUBSCRIPTION_COLUMNS,
  entitlementFromRow,
  getEntitlement,
  type SubscriptionRow,
} from './entitlement'
import { PAID_PLAN_IDS } from './planConfig'

describe('SUBSCRIPTION_COLUMNS definition', () => {
  it('includes plan, status, current_period_end, and source for full entitlement resolution', () => {
    const cols = SUBSCRIPTION_COLUMNS.split(',').map((c) => c.trim())
    expect(cols).toContain('plan')
    expect(cols).toContain('status')
    expect(cols).toContain('current_period_end')
    expect(cols).toContain('source')
  })
})

describe('entitlementFromRow — pure entitlement decision', () => {
  const future = new Date(Date.now() + 14 * 86_400_000).toISOString()
  const past = new Date(Date.now() - 86_400_000).toISOString()

  it('returns FREE when row is null or undefined', () => {
    expect(entitlementFromRow(null)).toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
    expect(entitlementFromRow(undefined)).toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
  })

  it('returns FREE when status is not active (canceled, expired, pending, etc.)', () => {
    expect(entitlementFromRow({ plan: 'momo', status: 'canceled', current_period_end: future, source: 'web_sepay' }))
      .toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
    expect(entitlementFromRow({ plan: 'momo', status: 'expired', current_period_end: future, source: 'web_sepay' }))
      .toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
    expect(entitlementFromRow({ plan: 'momo', status: 'pending', current_period_end: future, source: 'web_sepay' }))
      .toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
  })

  it('returns FREE when current_period_end is missing or past (expired)', () => {
    expect(entitlementFromRow({ plan: 'momo', status: 'active', current_period_end: null, source: 'web_sepay' }))
      .toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
    expect(entitlementFromRow({ plan: 'momo', status: 'active', current_period_end: 'invalid-date', source: 'web_sepay' }))
      .toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
    expect(entitlementFromRow({ plan: 'momo', status: 'active', current_period_end: past, source: 'web_sepay' }))
      .toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
  })

  it('returns FREE when current_period_end exactly equals now', () => {
    const exactNow = new Date('2026-10-22T10:00:00.000Z')
    expect(entitlementFromRow({ plan: 'momo', status: 'active', current_period_end: exactNow.toISOString() }, exactNow))
      .toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
  })

  it.each([...PAID_PLAN_IDS])('resolves active %s plan with web_sepay source', (plan) => {
    const res = entitlementFromRow({ plan, status: 'active', current_period_end: future, source: 'web_sepay' })
    expect(res).toEqual({ plan, paid: true, periodEnd: future, source: 'web_sepay' })
  })

  it.each(['apple_iap', 'google_play', 'manual', 'web'] as const)(
    'resolves active subscription with source %s',
    (source) => {
      const res = entitlementFromRow({ plan: 'coco', status: 'active', current_period_end: future, source })
      expect(res).toEqual({ plan: 'coco', paid: true, periodEnd: future, source })
    },
  )

  it('treats legacy rows with plan = null as "pro" when active and unexpired', () => {
    const res = entitlementFromRow({ plan: null, status: 'active', current_period_end: future, source: 'web' })
    expect(res).toEqual({ plan: 'pro', paid: true, periodEnd: future, source: 'web' })
  })

  it('rejects unknown plan names and falls back to FREE', () => {
    const res = entitlementFromRow({ plan: 'ultra_premium_unknown', status: 'active', current_period_end: future, source: 'web_sepay' })
    expect(res).toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
  })

  it('sets source to null when source is unknown or unlisted, but preserves paid status if plan is valid', () => {
    const res = entitlementFromRow({ plan: 'sunny', status: 'active', current_period_end: future, source: 'crypto_rail' })
    expect(res).toEqual({ plan: 'sunny', paid: true, periodEnd: future, source: null })
  })
})

describe('getEntitlement — database reader and user boundary', () => {
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString()

  const mockSupabase = (data: SubscriptionRow | null, shouldThrow = false) => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockImplementation(async () => {
            if (shouldThrow) throw new Error('Database connection failed')
            return { data, error: null }
          }),
        }),
      }),
    }),
  })

  it('returns GUEST for null or undefined user', async () => {
    const client = mockSupabase(null)
    expect(await getEntitlement(client as any, null)).toEqual({ plan: 'guest', paid: false, periodEnd: null, source: null })
    expect(client.from).not.toHaveBeenCalled()
  })

  it('returns GUEST for anonymous users (is_anonymous = true) without touching the database', async () => {
    const client = mockSupabase(null)
    const user = { id: 'anon-user-123', is_anonymous: true }
    expect(await getEntitlement(client as any, user)).toEqual({ plan: 'guest', paid: false, periodEnd: null, source: null })
    expect(client.from).not.toHaveBeenCalled()
  })

  it('returns active Entitlement with source for registered user with active subscription', async () => {
    const row: SubscriptionRow = { plan: 'sunny', status: 'active', current_period_end: future, source: 'web_sepay' }
    const client = mockSupabase(row)
    const user = { id: 'user-real-456', is_anonymous: false }
    const res = await getEntitlement(client as any, user)
    expect(res).toEqual({ plan: 'sunny', paid: true, periodEnd: future, source: 'web_sepay' })
    expect(client.from).toHaveBeenCalledWith('subscriptions')
  })

  it('returns FREE when registered user has no subscriptions row in DB', async () => {
    const client = mockSupabase(null)
    const user = { id: 'user-no-sub-789', is_anonymous: false }
    const res = await getEntitlement(client as any, user)
    expect(res).toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
  })

  it('fails closed to FREE without throwing when database query throws an error', async () => {
    const client = mockSupabase(null, true)
    const user = { id: 'user-err-999', is_anonymous: false }
    const res = await getEntitlement(client as any, user)
    expect(res).toEqual({ plan: 'free', paid: false, periodEnd: null, source: null })
  })
})
