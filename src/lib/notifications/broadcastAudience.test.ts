import { describe, it, expect, vi } from 'vitest'
import { selectEligibleRecipients, buildBroadcastAudience } from './broadcastAudience'
import type { AccountStatusRow } from '@/lib/account/accountStatus'

// Contract §2, §2.1, §2.2, §2.3 — O-1 = B, O-2 = A. C-21, C-24, C-31, C-32, C-33.
//
// 🚨 POSITIVE CONTROLS ARE NOT OPTIONAL HERE. Every exclusion rule below can be
// satisfied by an audience of nobody. A suite that only asserted "the suspended
// user is absent" would pass against a builder that returns [] for everyone —
// which is precisely the bug an INNER JOIN on `account_status` produces, and it
// would report success while reaching no one. So each exclusion case also
// asserts who REMAINS.

const NOW = new Date('2026-08-30T00:00:00.000Z')

const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'
const C = 'cccccccc-0000-0000-0000-000000000003'
const D = 'dddddddd-0000-0000-0000-000000000004'

const active: AccountStatusRow = { is_suspended: false, suspended_until: null, is_banned: false }
const banned: AccountStatusRow = { is_suspended: false, suspended_until: null, is_banned: true }
const suspendedIndefinitely: AccountStatusRow = { is_suspended: true, suspended_until: null, is_banned: false }
const suspendedUntilTomorrow: AccountStatusRow = {
  is_suspended: true,
  suspended_until: '2026-08-31T00:00:00.000Z',
  is_banned: false,
}
const suspensionExpired: AccountStatusRow = {
  is_suspended: true, // 🔑 still true — the auto-unsuspend cron has not run
  suspended_until: '2026-08-29T00:00:00.000Z',
  is_banned: false,
}

const select = (
  candidates: string[],
  profiles: string[],
  statuses: [string, AccountStatusRow][] = [],
) => selectEligibleRecipients(candidates, new Set(profiles), new Map(statuses), NOW)

describe('O-2 = A — suspended and banned are excluded ENTIRELY', () => {
  it('🚨 a banned account is excluded, and an active one still receives', () => {
    const { recipients, excluded } = select([A, B], [A, B], [[A, banned], [B, active]])
    expect(recipients).toEqual([B]) // positive control
    expect(excluded.banned).toBe(1)
  })

  it('🚨 an indefinitely suspended account is excluded, and an active one still receives', () => {
    const { recipients, excluded } = select([A, B], [A, B], [[A, suspendedIndefinitely], [B, active]])
    expect(recipients).toEqual([B])
    expect(excluded.suspended).toBe(1)
  })

  it('a suspension that has not yet expired excludes', () => {
    const { recipients } = select([A, B], [A, B], [[A, suspendedUntilTomorrow], [B, active]])
    expect(recipients).toEqual([B])
  })
})

describe('🔑 THE INCLUSION CASES — where a plausible implementation goes silently wrong', () => {
  it('🚨 MUTATION TARGET — a user with NO account_status row is INCLUDED', () => {
    // The table has no backfill and no signup trigger: a row exists only after
    // an administrator acts, so almost every user has none. An INNER JOIN here
    // empties the audience while the broadcast reports success.
    const { recipients, excluded } = select([A, B], [A, B], [])
    expect(recipients).toEqual([A, B])
    expect(excluded).toEqual({ banned: 0, suspended: 0, noProfile: 0 })
  })

  it('🚨 MUTATION TARGET — an EXPIRED suspension is INCLUDED even though is_suspended is still true', () => {
    // Auto-unsuspend is a cron, and a cron is not a guarantee. Reading the raw
    // column turns a lapsed 7-day suspension into a permanent one — invisibly,
    // because the person simply stops receiving things.
    expect(suspensionExpired.is_suspended).toBe(true)
    const { recipients, excluded } = select([A], [A], [[A, suspensionExpired]])
    expect(recipients).toEqual([A])
    expect(excluded.suspended).toBe(0)
  })

  it('an explicitly active row is INCLUDED', () => {
    expect(select([A], [A], [[A, active]]).recipients).toEqual([A])
  })

  it('🔑 uses ONE definition of "suspended" — the same evaluator the consumer guard uses', async () => {
    // Not a claim about imports: this asserts the BEHAVIOUR that definition
    // produces. `evaluateAccountStatus` treats a ban as outranking a suspension
    // and an unparseable timestamp as still-suspended. A second, hand-rolled
    // definition in the audience builder would almost certainly differ on both.
    const { evaluateAccountStatus } = await import('@/lib/account/accountStatus')
    const bothFlags: AccountStatusRow = { is_suspended: true, suspended_until: null, is_banned: true }
    expect(evaluateAccountStatus(bothFlags, NOW).reason).toBe('banned')
    expect(select([A], [A], [[A, bothFlags]]).excluded).toMatchObject({ banned: 1, suspended: 0 })

    const garbage: AccountStatusRow = { is_suspended: true, suspended_until: 'not-a-date', is_banned: false }
    expect(select([A], [A], [[A, garbage]]).recipients).toEqual([])
  })
})

describe('C-2 — accounts with no profile are excluded', () => {
  it('🚨 excluded, while a profiled user in the same batch still receives', () => {
    const { recipients, excluded } = select([A, B], [B], [])
    expect(recipients).toEqual([B])
    expect(excluded.noProfile).toBe(1)
  })
})

describe('ORDER IS PRESERVED (C-24)', () => {
  it('🚨 the eligible subset keeps the order it arrived in', () => {
    const { recipients } = select([D, C, B, A], [D, C, B, A], [[C, banned]])
    expect(recipients).toEqual([D, B, A]) // not sorted, not reordered
  })
})

// ─── THE DB-FACING BUILDER ───────────────────────────────────────────────────

/**
 * A Supabase stub that records the query it was asked to run.
 *
 * It answers per table rather than per call order, so a change in the order of
 * the two lookups does not silently invalidate the test.
 */
function stubClient(opts: {
  subs?: { user_id: string }[]
  profiles?: { id: string }[]
  statuses?: Record<string, unknown>[]
  subsError?: string
}) {
  const calls: { table: string; ordered?: { column: string; ascending: boolean }; eq?: [string, unknown][] } = {
    table: '',
    eq: [],
  }
  const orderCalls: { column: string; ascending: boolean }[] = []
  const eqCalls: [string, unknown][] = []

  const from = vi.fn((table: string) => {
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val])
        return builder
      },
      in: () => builder,
      order: (column: string, o?: { ascending?: boolean }) => {
        orderCalls.push({ column, ascending: o?.ascending !== false })
        return builder
      },
      then: undefined as unknown,
    }
    // Resolve when awaited.
    const result =
      table === 'notification_subscriptions'
        ? opts.subsError
          ? { data: null, error: { message: opts.subsError } }
          : { data: opts.subs ?? [], error: null }
        : table === 'profiles'
          ? { data: opts.profiles ?? [], error: null }
          : { data: opts.statuses ?? [], error: null }

    builder.then = (resolve: (v: unknown) => void) => resolve(result)
    return builder
  })

  return { client: { from } as never, from, orderCalls, eqCalls, calls }
}

describe('buildBroadcastAudience', () => {
  it('🚨 MUTATION TARGET — orders IN THE QUERY, not in JavaScript afterwards', async () => {
    // Without ORDER BY, PostgreSQL may return rows in any order, and it changes
    // in practice after an update, a vacuum, or a plan flip. "Resume from chunk
    // 3" is then meaningless. Sorting in JS instead would not survive
    // pagination, which is why the assertion is about the QUERY.
    const s = stubClient({ subs: [{ user_id: A }], profiles: [{ id: A }] })
    await buildBroadcastAudience(s.client, NOW)
    expect(s.orderCalls).toContainEqual({ column: 'user_id', ascending: true })
  })

  it('🚨 filters to enabled subscriptions only', async () => {
    const s = stubClient({ subs: [{ user_id: A }], profiles: [{ id: A }] })
    await buildBroadcastAudience(s.client, NOW)
    expect(s.eqCalls).toContainEqual(['enabled', true])
  })

  it('🔑 de-duplicates by USER — two rows for one person yield one recipient', async () => {
    // Safe only because of I1 (one enabled row per credential). This asserts
    // the dedupe; T-30 in the DB suite asserts the invariant it depends on.
    const s = stubClient({ subs: [{ user_id: A }, { user_id: A }], profiles: [{ id: A }] })
    const audience = await buildBroadcastAudience(s.client, NOW)
    expect(audience.recipients).toEqual([A])
    expect(audience.candidates).toBe(1)
  })

  it('combines eligibility with the subscription read', async () => {
    const s = stubClient({
      subs: [{ user_id: A }, { user_id: B }, { user_id: C }],
      profiles: [{ id: A }, { id: B }, { id: C }],
      statuses: [{ user_id: B, ...banned }],
    })
    const audience = await buildBroadcastAudience(s.client, NOW)
    expect(audience.recipients).toEqual([A, C])
    expect(audience.candidates).toBe(3)
    expect(audience.excluded.banned).toBe(1)
  })

  it('🚨 THROWS on a read failure rather than returning a partial audience', async () => {
    // A broadcast that reached half the platform because a lookup failed is
    // worse than one that did not run.
    const s = stubClient({ subsError: 'connection reset' })
    await expect(buildBroadcastAudience(s.client, NOW)).rejects.toThrow(/subscription read failed/)
  })

  it('an empty subscriber base short-circuits without further queries', async () => {
    const s = stubClient({ subs: [] })
    const audience = await buildBroadcastAudience(s.client, NOW)
    expect(audience).toEqual({
      recipients: [],
      candidates: 0,
      excluded: { banned: 0, suspended: 0, noProfile: 0 },
    })
    expect(s.from).toHaveBeenCalledTimes(1)
  })
})
