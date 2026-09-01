import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readRecentSends, alreadyRecorded, recordDeliveries } from './deliveryLedger'
import { WINDOW_7D_MS } from './governance'

// V2.2-2 — the delivery ledger.
//
// This table is the frequency cap's history AND the idempotency ledger, so the
// tests here are about the two ways it could quietly stop being either: a read
// that returns empty on failure (removing the cap for everyone), and a write
// that overwrites instead of conflicting (rewriting history on a resume).

type Row = Record<string, unknown>

function fakeAdmin(opts: { rows?: Row[]; error?: string } = {}) {
  const filters: [string, unknown][] = []
  const writes: { rows: Row[]; options: Record<string, unknown> }[] = []
  const result = () =>
    opts.error ? { data: null, error: { message: opts.error } } : { data: opts.rows ?? [], error: null }

  const client = {
    from: () => client,
    select: () => client,
    eq: (c: string, v: unknown) => {
      filters.push([c, v])
      return client
    },
    gte: (c: string, v: unknown) => {
      filters.push([c, v])
      return Promise.resolve(result())
    },
    in: (c: string, v: unknown) => {
      filters.push([c, v])
      // `readRecentSends` chains `.gte()` after `.in()`; `alreadyRecorded` ends
      // here. A thenable covers both without two doubles.
      return Object.assign(Promise.resolve(result()), {
        gte: (gc: string, gv: unknown) => {
          filters.push([gc, gv])
          return Promise.resolve(result())
        },
      })
    },
    upsert: (rows: Row[], options: Record<string, unknown>) => {
      writes.push({ rows, options })
      return Promise.resolve({ error: opts.error ? { message: opts.error } : null })
    },
  }
  return { admin: client as unknown as SupabaseClient, filters, writes }
}

const NOW = new Date('2026-09-01T12:00:00.000Z')

// ═════════════════════════════════════════════════════════════════════════════
describe('readRecentSends — the cap’s history', () => {
  it('groups timestamps by user', async () => {
    const { admin } = fakeAdmin({
      rows: [
        { user_id: 'a', created_at: '2026-09-01T10:00:00.000Z' },
        { user_id: 'a', created_at: '2026-08-31T10:00:00.000Z' },
        { user_id: 'b', created_at: '2026-09-01T09:00:00.000Z' },
      ],
    })
    const map = await readRecentSends(admin, ['a', 'b'], NOW)
    expect(map.get('a')).toHaveLength(2)
    expect(map.get('b')).toHaveLength(1)
    expect(map.get('a')![0]).toBeInstanceOf(Date)
  })

  it('🔑 a user with no history is ABSENT from the map, not defaulted in', async () => {
    const { admin } = fakeAdmin({ rows: [{ user_id: 'a', created_at: NOW.toISOString() }] })
    const map = await readRecentSends(admin, ['a', 'b'], NOW)
    expect(map.has('b')).toBe(false)
  })

  it('reads only SENT marketing rows — a skip is not history', async () => {
    // Counting skips would let one quiet-hours skip silence somebody for the
    // next 24 hours.
    const { admin, filters } = fakeAdmin({ rows: [] })
    await readRecentSends(admin, ['a'], NOW)
    expect(filters).toContainEqual(['status', 'sent'])
    expect(filters).toContainEqual(['category', 'marketing'])
  })

  it('bounds the read to the widest cap window, not to retention', async () => {
    const { admin, filters } = fakeAdmin({ rows: [] })
    await readRecentSends(admin, ['a'], NOW)
    const since = filters.find(([c]) => c === 'created_at')
    expect(since?.[1]).toBe(new Date(NOW.getTime() - WINDOW_7D_MS).toISOString())
  })

  it('does not query for an empty audience', async () => {
    const { admin, filters } = fakeAdmin()
    expect((await readRecentSends(admin, [], NOW)).size).toBe(0)
    expect(filters).toHaveLength(0)
  })

  it('🚨 THROWS on a read failure rather than returning an empty history', async () => {
    // An empty history PERMITS a send. A failed read that returned one would
    // silently remove the frequency cap for everybody — the one direction that
    // must never happen by accident.
    const { admin } = fakeAdmin({ error: 'timeout' })
    await expect(readRecentSends(admin, ['a'], NOW)).rejects.toThrow(/history read failed/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('alreadyRecorded — the resume question', () => {
  it('returns the users already written for this campaign', async () => {
    const { admin } = fakeAdmin({ rows: [{ user_id: 'a' }] })
    const seen = await alreadyRecorded(admin, 'camp-1', ['a', 'b'])
    expect(seen.has('a')).toBe(true)
    expect(seen.has('b')).toBe(false)
  })

  it('scopes the question to one campaign', async () => {
    const { admin, filters } = fakeAdmin({ rows: [] })
    await alreadyRecorded(admin, 'camp-1', ['a'])
    expect(filters).toContainEqual(['campaign_id', 'camp-1'])
  })

  it('does not query for an empty list', async () => {
    const { admin, filters } = fakeAdmin()
    expect((await alreadyRecorded(admin, 'c', [])).size).toBe(0)
    expect(filters).toHaveLength(0)
  })

  it('throws on a read failure — a resume must not proceed blind', async () => {
    const { admin } = fakeAdmin({ error: 'down' })
    await expect(alreadyRecorded(admin, 'c', ['a'])).rejects.toThrow(/ledger read failed/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('recordDeliveries', () => {
  it('writes a sent row with no skip reason', async () => {
    const { admin, writes } = fakeAdmin()
    await recordDeliveries(admin, [
      { campaignId: 'c1', userId: 'a', status: 'sent', notificationId: 'n1' },
    ])
    expect(writes[0].rows[0]).toEqual({
      campaign_id: 'c1',
      user_id: 'a',
      status: 'sent',
      skip_reason: null,
      notification_id: 'n1',
    })
  })

  it('writes a skipped row carrying its reason', async () => {
    const { admin, writes } = fakeAdmin()
    await recordDeliveries(admin, [
      { campaignId: 'c1', userId: 'b', status: 'skipped', skipReason: 'consent' },
    ])
    expect(writes[0].rows[0]).toMatchObject({ status: 'skipped', skip_reason: 'consent' })
  })

  it('🚨 a sent row NEVER carries a skip reason, even if one is passed', async () => {
    const { admin, writes } = fakeAdmin()
    await recordDeliveries(admin, [
      // A caller mistake. The database CHECK would reject it; this makes the
      // library reject it first, so a whole batch is not lost to one bad row.
      { campaignId: 'c1', userId: 'a', status: 'sent', skipReason: 'consent' },
    ])
    expect(writes[0].rows[0].skip_reason).toBeNull()
  })

  it('🚨 conflicts are IGNORED, not overwritten', async () => {
    // A conflict means this person was already recorded for this campaign —
    // exactly the state a resume must leave alone. An update would let a re-run
    // rewrite history, and could turn a `sent` row into a `skipped` one, which
    // hands the person back to the frequency cap as if never messaged.
    const { admin, writes } = fakeAdmin()
    await recordDeliveries(admin, [{ campaignId: 'c1', userId: 'a', status: 'sent' }])
    expect(writes[0].options).toMatchObject({
      onConflict: 'campaign_id,user_id',
      ignoreDuplicates: true,
    })
  })

  it('writes a mixed batch in one statement', async () => {
    const { admin, writes } = fakeAdmin()
    await recordDeliveries(admin, [
      { campaignId: 'c1', userId: 'a', status: 'sent' },
      { campaignId: 'c1', userId: 'b', status: 'skipped', skipReason: 'quiet_hours' },
    ])
    expect(writes).toHaveLength(1)
    expect(writes[0].rows).toHaveLength(2)
  })

  it('does nothing for an empty batch', async () => {
    const { admin, writes } = fakeAdmin()
    await recordDeliveries(admin, [])
    expect(writes).toHaveLength(0)
  })

  it('throws when the write fails rather than reporting success', async () => {
    const { admin } = fakeAdmin({ error: 'permission denied' })
    await expect(
      recordDeliveries(admin, [{ campaignId: 'c1', userId: 'a', status: 'sent' }]),
    ).rejects.toThrow(/write failed/)
  })
})
