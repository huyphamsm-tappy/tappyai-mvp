import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { pruneMarketingRetention, RETENTION_MS } from './retention'

// V2.2-2 — retention pruning (M-26, M-27, M-27a).
//
// The properties under test are the ones a silent failure would hide: that the
// prune runs at all, that deliveries go FIRST, that consent is never touched,
// and that a failure is reported rather than swallowed into "0 deleted".

type Op = { table: string; filter: [string, string] }

function fakeAdmin(opts: { deliveries?: number; campaigns?: number; error?: string } = {}) {
  const ops: Op[] = []
  const client = {
    from: (table: string) => ({
      delete: () => ({
        lt: (column: string, value: string) => ({
          select: () => {
            ops.push({ table, filter: [column, value] })
            if (opts.error) return Promise.resolve({ data: null, error: { message: opts.error } })
            const n = table === 'notification_deliveries' ? (opts.deliveries ?? 0) : (opts.campaigns ?? 0)
            return Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ id: `r${i}` })), error: null })
          },
        }),
      }),
    }),
  }
  return { admin: client as unknown as SupabaseClient, ops }
}

const NOW = new Date('2027-09-01T00:00:00.000Z')

describe('the prune runs and reports what it did', () => {
  it('✅ POSITIVE CONTROL — deletes old rows from both tables and counts them', async () => {
    // Without this, every ordering assertion below would pass against a
    // function that deleted nothing.
    const { admin } = fakeAdmin({ deliveries: 12, campaigns: 3 })
    const r = await pruneMarketingRetention(admin, NOW)
    expect(r.deliveriesDeleted).toBe(12)
    expect(r.campaignsDeleted).toBe(3)
  })

  it('cuts off at exactly one year', async () => {
    const { admin, ops } = fakeAdmin()
    const r = await pruneMarketingRetention(admin, NOW)
    expect(r.cutoff).toBe(new Date(NOW.getTime() - RETENTION_MS).toISOString())
    expect(ops.every((o) => o.filter[1] === r.cutoff)).toBe(true)
  })

  it('pins the period doc 34 states', () => {
    expect(RETENTION_MS).toBe(365 * 24 * 60 * 60 * 1000)
  })
})

describe('🚨 M-27a — order and scope', () => {
  it('deletes DELIVERIES before CAMPAIGNS', async () => {
    // The FK is ON DELETE RESTRICT, so the other order fails outright. This
    // asserts the code does not depend on that failure to be correct.
    const { admin, ops } = fakeAdmin({ deliveries: 1, campaigns: 1 })
    await pruneMarketingRetention(admin, NOW)
    expect(ops.map((o) => o.table)).toEqual(['notification_deliveries', 'marketing_campaigns'])
  })

  it('both deletes are filtered by age, never unfiltered', async () => {
    const { admin, ops } = fakeAdmin()
    await pruneMarketingRetention(admin, NOW)
    expect(ops).toHaveLength(2)
    expect(ops.every((o) => o.filter[0] === 'created_at')).toBe(true)
  })

  it('🚨 marketing_consent is NEVER touched', async () => {
    // Consent records what a person agreed to and what they revoked. Deleting
    // an old row returns them to "absence" — behaviourally opted out, and the
    // proof that they ever asked is gone (M-24). No document assigns consent a
    // retention period, and this must not invent one.
    const { admin, ops } = fakeAdmin({ deliveries: 5, campaigns: 5 })
    await pruneMarketingRetention(admin, NOW)
    expect(ops.map((o) => o.table)).not.toContain('marketing_consent')
  })

  it('🚨 notification_subscriptions is never touched either', async () => {
    // Push ownership is I1/I1' territory. A retention job that pruned it would
    // silently unsubscribe devices.
    const { admin, ops } = fakeAdmin()
    await pruneMarketingRetention(admin, NOW)
    expect(ops.map((o) => o.table)).not.toContain('notification_subscriptions')
  })
})

describe('failures are reported, not swallowed', () => {
  it('🚨 throws rather than returning "0 deleted"', async () => {
    // A prune that silently did nothing is indistinguishable from one that had
    // nothing to do, and the retention obligation would quietly stop being met.
    const { admin } = fakeAdmin({ error: 'permission denied' })
    await expect(pruneMarketingRetention(admin, NOW)).rejects.toThrow(/prune failed/)
  })

  it('a delivery-prune failure stops before campaigns are touched', async () => {
    // Deleting campaigns after a failed delivery prune is exactly how an
    // orphan is created.
    const { admin, ops } = fakeAdmin({ error: 'timeout' })
    await expect(pruneMarketingRetention(admin, NOW)).rejects.toThrow()
    expect(ops.map((o) => o.table)).toEqual(['notification_deliveries'])
  })
})
