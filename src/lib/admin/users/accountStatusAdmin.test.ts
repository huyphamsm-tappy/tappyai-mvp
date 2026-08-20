import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  standingOf,
  isRestricted,
  suspensionExpiry,
  suspendUser,
  unsuspendUser,
  banUser,
  unbanUser,
  standingFilterIds,
  readAccountStatus,
  readAccountStatusMany,
  STANDING_FILTER_CAP,
} from './accountStatusAdmin'

// Module 08 — the ADMIN write path.
//
// These tests exist to pin the four rules the module header names, because each
// of them fails SILENTLY if it regresses:
//
//   * an UPDATE against an absent row reports success and suspends nobody;
//   * a full-row write clears the other sanction without anyone noticing;
//   * an expired suspension mis-filed as "suspended" punishes a free account;
//   * a status label derived independently drifts from what the app enforces.
//
// The Supabase client is faked rather than mocked per-method so the assertions
// can be about the STATEMENT that was built — which verb, which columns — and
// not merely about which helper was called.

const USER = '33333333-3333-3333-3333-333333333333'
const OTHER = '44444444-4444-4444-4444-444444444444'

interface Recorded {
  table: string
  calls: [string, ...unknown[]][]
}

/**
 * A chainable stand-in for the PostgREST query builder.
 *
 * Every method records itself and returns the builder; `single`/`maybeSingle`
 * and awaiting the builder itself resolve to the programmed result. That is
 * enough to observe the whole statement, including the arguments to `upsert`.
 */
function fakeClient(plan: Record<string, unknown[]>): {
  client: SupabaseClient
  recorded: Recorded[]
} {
  const recorded: Recorded[] = []
  const queues: Record<string, unknown[]> = {}
  for (const [table, results] of Object.entries(plan)) queues[table] = [...results]

  const client = {
    from(table: string) {
      const entry: Recorded = { table, calls: [] }
      recorded.push(entry)
      const next = () => {
        const queue = queues[table] ?? []
        // The last programmed result repeats, so a test only states the
        // responses it actually cares about.
        return queue.length > 1 ? queue.shift() : queue[0]
      }
      const builder: Record<string, unknown> = {}
      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_target, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => unknown) => Promise.resolve(next()).then(resolve)
          }
          return (...args: unknown[]) => {
            entry.calls.push([prop, ...args])
            if (prop === 'single' || prop === 'maybeSingle') return Promise.resolve(next())
            return proxy
          }
        },
      }
      const proxy = new Proxy(builder, handler)
      return proxy
    },
  } as unknown as SupabaseClient

  return { client, recorded }
}

/** The arguments a recorded builder passed to one method. */
function argsOf(entry: Recorded, method: string): unknown[] | undefined {
  const call = entry.calls.find(([name]) => name === method)
  return call ? call.slice(1) : undefined
}

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  user_id: USER,
  is_suspended: false,
  suspended_until: null,
  is_banned: false,
  ban_reason: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...over,
})

const NOW = new Date('2026-08-20T12:00:00Z')
const PAST = '2026-08-19T12:00:00Z'
const FUTURE = '2026-08-21T12:00:00Z'

describe('standing is derived from the enforcement rule, not re-implemented', () => {
  it('an absent row is ACTIVE — the table has no backfill, so most users have none', () => {
    expect(standingOf(null, NOW)).toBe('active')
    expect(standingOf(undefined, NOW)).toBe('active')
    expect(isRestricted(null, NOW)).toBe(false)
  })

  it('an EXPIRED suspension reads as active, so the Controller cannot show a badge the app ignores', () => {
    const expired = { is_suspended: true, suspended_until: PAST, is_banned: false }
    expect(standingOf(expired, NOW)).toBe('active')
    expect(isRestricted(expired, NOW)).toBe(false)
  })

  it('a live suspension reads as suspended', () => {
    const live = { is_suspended: true, suspended_until: FUTURE, is_banned: false }
    expect(standingOf(live, NOW)).toBe('suspended')
    expect(isRestricted(live, NOW)).toBe(true)
  })

  it('an indefinite suspension — no expiry at all — reads as suspended', () => {
    expect(standingOf({ is_suspended: true, suspended_until: null, is_banned: false }, NOW)).toBe('suspended')
  })

  it('a ban outranks a suspension, because §4 lets a row carry both', () => {
    expect(standingOf({ is_suspended: true, suspended_until: FUTURE, is_banned: true }, NOW)).toBe('banned')
  })
})

describe('suspensionExpiry', () => {
  it('no duration means INDEFINITE, not "zero hours"', () => {
    expect(suspensionExpiry(undefined, NOW)).toBeNull()
  })

  it('a duration becomes an absolute instant', () => {
    expect(suspensionExpiry(24, NOW)).toBe('2026-08-21T12:00:00.000Z')
  })

  it('the maximum §5 allows lands 30 days out', () => {
    expect(suspensionExpiry(720, NOW)).toBe('2026-09-19T12:00:00.000Z')
  })
})

describe('every write is an UPSERT — an UPDATE would silently suspend nobody', () => {
  it('suspend inserts-or-merges keyed on user_id, and never issues an update', async () => {
    const { client, recorded } = fakeClient({
      account_status: [{ data: null, error: null }, { data: row({ is_suspended: true }), error: null }],
    })

    await suspendUser(client, USER, FUTURE)

    const write = recorded[recorded.length - 1]
    expect(argsOf(write, 'upsert')).toBeDefined()
    // The whole point: an absent row must be created, not missed.
    expect(argsOf(write, 'update')).toBeUndefined()
    expect(argsOf(write, 'upsert')?.[1]).toEqual({ onConflict: 'user_id' })
  })

  it('the before-state is READ, not assumed from the request', async () => {
    const before = row({ is_suspended: true, suspended_until: PAST })
    const { client } = fakeClient({
      account_status: [{ data: before, error: null }, { data: row({ is_suspended: true }), error: null }],
    })

    const transition = await suspendUser(client, USER, FUTURE)
    expect(transition.before).toEqual(before)
  })

  it('a first sanction reports a null before-state, distinguishing it from a re-suspension', async () => {
    const { client } = fakeClient({
      account_status: [{ data: null, error: null }, { data: row({ is_suspended: true }), error: null }],
    })

    const transition = await suspendUser(client, USER, FUTURE)
    expect(transition.before).toBeNull()
  })
})

describe('a transition writes ONLY the columns it owns', () => {
  /** Run one transition and return the payload it upserted. */
  async function payloadOf(run: (c: SupabaseClient) => Promise<unknown>): Promise<Record<string, unknown>> {
    const { client, recorded } = fakeClient({
      account_status: [{ data: row(), error: null }, { data: row(), error: null }],
    })
    await run(client)
    const write = recorded[recorded.length - 1]
    return argsOf(write, 'upsert')?.[0] as Record<string, unknown>
  }

  it('suspend touches is_suspended and suspended_until — never the ban', async () => {
    const payload = await payloadOf((c) => suspendUser(c, USER, FUTURE))
    expect(payload).toEqual({ user_id: USER, is_suspended: true, suspended_until: FUTURE })
    // Named explicitly: a payload that carried these would unban on suspend.
    expect(payload).not.toHaveProperty('is_banned')
    expect(payload).not.toHaveProperty('ban_reason')
  })

  it('unsuspend clears the expiry with the flag, so no stale timestamp is left behind', async () => {
    const payload = await payloadOf((c) => unsuspendUser(c, USER))
    expect(payload).toEqual({ user_id: USER, is_suspended: false, suspended_until: null })
    expect(payload).not.toHaveProperty('is_banned')
  })

  it('ban touches is_banned and ban_reason — never the suspension', async () => {
    const payload = await payloadOf((c) => banUser(c, USER, 'coordinated review fraud, twelve accounts'))
    expect(payload).toEqual({
      user_id: USER,
      is_banned: true,
      ban_reason: 'coordinated review fraud, twelve accounts',
    })
    // `suspended → banned` is a legal edge; clearing it here would erase the
    // suspension the user falls back to if the ban is lifted.
    expect(payload).not.toHaveProperty('is_suspended')
    expect(payload).not.toHaveProperty('suspended_until')
  })

  it('unban clears the flag and its internal note, leaving any suspension intact', async () => {
    const payload = await payloadOf((c) => unbanUser(c, USER))
    expect(payload).toEqual({ user_id: USER, is_banned: false, ban_reason: null })
    expect(payload).not.toHaveProperty('is_suspended')
  })
})

describe('reads', () => {
  it('readAccountStatus returns null for a never-moderated user rather than throwing', async () => {
    const { client } = fakeClient({ account_status: [{ data: null, error: null }] })
    await expect(readAccountStatus(client, USER)).resolves.toBeNull()
  })

  it('a read error is surfaced — the ADMIN path must not fail open the way the consumer path does', async () => {
    const { client } = fakeClient({ account_status: [{ data: null, error: { message: 'boom' } }] })
    await expect(readAccountStatus(client, USER)).rejects.toThrow(/boom/)
  })

  it('readAccountStatusMany issues no query for an empty page', async () => {
    const { client, recorded } = fakeClient({ account_status: [{ data: [], error: null }] })
    const map = await readAccountStatusMany(client, [])
    expect(map.size).toBe(0)
    expect(recorded).toHaveLength(0)
  })

  it('readAccountStatusMany keys rows by user id and omits users with no row', async () => {
    const { client } = fakeClient({
      account_status: [{ data: [row({ user_id: USER, is_banned: true })], error: null }],
    })
    const map = await readAccountStatusMany(client, [USER, OTHER])
    expect(map.get(USER)?.is_banned).toBe(true)
    expect(map.has(OTHER)).toBe(false)
  })
})

describe('the status list filter', () => {
  const suspendedLive = row({ user_id: USER, is_suspended: true, suspended_until: FUTURE })
  const suspendedExpired = row({ user_id: OTHER, is_suspended: true, suspended_until: PAST })
  const banned = row({ user_id: '55555555-5555-5555-5555-555555555555', is_banned: true })

  it('status=suspended includes only LIVE suspensions', async () => {
    const { client } = fakeClient({
      account_status: [{ data: [suspendedLive, suspendedExpired, banned], error: null }],
    })
    const filter = await standingFilterIds(client, 'suspended', NOW)
    expect(filter.mode).toBe('include')
    expect(filter.userIds).toEqual([USER])
  })

  it('status=banned includes the banned, including one who is also suspended', async () => {
    const alsoSuspended = row({ user_id: OTHER, is_suspended: true, suspended_until: FUTURE, is_banned: true })
    const { client } = fakeClient({ account_status: [{ data: [suspendedLive, alsoSuspended], error: null }] })
    const filter = await standingFilterIds(client, 'banned', NOW)
    expect(filter.userIds).toEqual([OTHER])
  })

  it('status=active EXCLUDES only the currently restricted — an expired suspension stays in the list', async () => {
    const { client } = fakeClient({
      account_status: [{ data: [suspendedLive, suspendedExpired, banned], error: null }],
    })
    const filter = await standingFilterIds(client, 'active', NOW)
    expect(filter.mode).toBe('exclude')
    expect(filter.userIds).toEqual([USER, banned.user_id])
    // The regression this guards: excluding OTHER would hide a user the app
    // treats as free from the only list they belong in.
    expect(filter.userIds).not.toContain(OTHER)
  })

  it('reports incomplete once the moderated set passes the cap', async () => {
    const overflowing = Array.from({ length: STANDING_FILTER_CAP + 1 }, (_, i) =>
      row({ user_id: `id-${i}`, is_banned: true })
    )
    const { client } = fakeClient({ account_status: [{ data: overflowing, error: null }] })
    const filter = await standingFilterIds(client, 'active', NOW)
    expect(filter.complete).toBe(false)
  })

  it('reports complete at exactly the cap', async () => {
    const atCap = Array.from({ length: STANDING_FILTER_CAP }, (_, i) =>
      row({ user_id: `id-${i}`, is_banned: true })
    )
    const { client } = fakeClient({ account_status: [{ data: atCap, error: null }] })
    const filter = await standingFilterIds(client, 'active', NOW)
    expect(filter.complete).toBe(true)
  })
})
