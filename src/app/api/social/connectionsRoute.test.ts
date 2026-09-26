import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `GET /api/social/connections` — the two directions of `user_follows`.
 *
 * 🚨 DIRECTION IS THE WHOLE CONTRACT. `following` and `followers` are different
 * sets over the same table, and querying the wrong column silently returns a
 * plausible list of the wrong people. The assertions below pin which column is
 * matched and which is read for each type, because nothing about the response
 * shape would reveal a swap.
 */

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'me' } as Record<string, unknown> | null,
    results: [] as unknown[],
    i: 0,
    calls: [] as { table: string; select: string; eq: [string, unknown][] }[],
  }
  const builder = (table: string) => {
    const call = { table, select: '', eq: [] as [string, unknown][] }
    state.calls.push(call)
    const b: Record<string, unknown> = {}
    b.select = (cols: string) => { call.select = cols; return b }
    b.eq = (col: string, val: unknown) => { call.eq.push([col, val]); return b }
    for (const m of ['in', 'order', 'limit', 'maybeSingle', 'single']) b[m] = () => b
    ;(b as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(state.results[state.i++] ?? { data: [], error: null }).then(res, rej)
    return b
  }
  const client = { from: (table: string) => builder(table) }
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: client }))
  return { state, getRequestUser }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))

import { GET } from './connections/route'

const call = (qs = '') => GET(new Request('http://localhost/api/social/connections' + qs) as never)

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'me' }
  h.state.results = []
  h.state.i = 0
  h.state.calls = []
})

describe('authorization', () => {
  it('refuses a signed-out caller and touches nothing', async () => {
    h.state.user = null
    const res = await call('?type=following')
    expect(res.status).toBe(401)
    expect(h.state.calls).toHaveLength(0)
  })
})

describe('direction', () => {
  it('following: matches on follower_id and reads following_id', async () => {
    h.state.results = [
      { data: [{ following_id: 'them', created_at: 't' }], error: null },
      { data: [{ id: 'them', full_name: 'Mai Anh', avatar_url: null, follower_count: 3, following_count: 1 }], error: null },
    ]
    const res = await call('?type=following')
    expect(res.status).toBe(200)

    const edges = h.state.calls[0]
    expect(edges.table).toBe('user_follows')
    expect(edges.select).toContain('following_id')
    expect(edges.eq).toEqual([['follower_id', 'me']])

    const body = await res.json()
    expect(body.users[0]).toMatchObject({ id: 'them', is_following: true })
  })

  it('followers: matches on following_id and reads follower_id', async () => {
    h.state.results = [
      { data: [{ follower_id: 'fan', created_at: 't' }], error: null },
      { data: [{ id: 'fan', full_name: 'Nam', avatar_url: null, follower_count: 0, following_count: 9 }], error: null },
      { data: [], error: null }, // I do not follow them back
    ]
    const res = await call('?type=followers')
    const edges = h.state.calls[0]
    expect(edges.select).toContain('follower_id')
    expect(edges.eq).toEqual([['following_id', 'me']])

    const body = await res.json()
    // 🚨 A follower is NOT automatically someone you follow. Assuming it would
    // render "Following" on a button that has never been pressed.
    expect(body.users[0].is_following).toBe(false)
  })

  it('followers: reports a mutual follow as following, because it asked', async () => {
    h.state.results = [
      { data: [{ follower_id: 'fan', created_at: 't' }], error: null },
      { data: [{ id: 'fan', full_name: 'Nam', avatar_url: null, follower_count: 0, following_count: 9 }], error: null },
      { data: [{ following_id: 'fan' }], error: null },
    ]
    const body = await (await call('?type=followers')).json()
    expect(body.users[0].is_following).toBe(true)
  })

  it('defaults to following for a missing or unknown type', async () => {
    for (const qs of ['', '?type=', '?type=bạn-bè']) {
      h.state.calls = []
      h.state.results = [{ data: [], error: null }]
      h.state.i = 0
      await call(qs)
      expect(h.state.calls[0].eq, qs).toEqual([['follower_id', 'me']])
    }
  })
})

describe('what the response may contain', () => {
  it('selects only the public-safe profile columns', async () => {
    h.state.results = [
      { data: [{ following_id: 'them', created_at: 't' }], error: null },
      { data: [], error: null },
    ]
    await call('?type=following')
    const profiles = h.state.calls.find(c => c.table === 'profiles')!
    // 🚨 `profiles` also holds `email`. A discovery page listing everyone you
    // follow is the last place an address should appear.
    expect(profiles.select).not.toContain('email')
    expect(profiles.select).toBe('id, full_name, avatar_url, follower_count, following_count')
  })

  it('returns an empty list, not an error, when there are no connections', async () => {
    h.state.results = [{ data: [], error: null }]
    const res = await call('?type=following')
    expect(res.status).toBe(200)
    expect((await res.json()).users).toEqual([])
    // No profile lookup for an empty edge set.
    expect(h.state.calls.find(c => c.table === 'profiles')).toBeUndefined()
  })

  it('keeps the edge order — most recently connected first', async () => {
    h.state.results = [
      { data: [{ following_id: 'b', created_at: '2' }, { following_id: 'a', created_at: '1' }], error: null },
      // The profile fetch may come back in any order; the edge order wins.
      { data: [
        { id: 'a', full_name: 'A', avatar_url: null, follower_count: 0, following_count: 0 },
        { id: 'b', full_name: 'B', avatar_url: null, follower_count: 0, following_count: 0 },
      ], error: null },
    ]
    const body = await (await call('?type=following')).json()
    expect(body.users.map((u: { id: string }) => u.id)).toEqual(['b', 'a'])
  })

  it('drops an edge whose profile row is missing rather than emitting a blank card', async () => {
    h.state.results = [
      { data: [{ following_id: 'ghost', created_at: 't' }], error: null },
      { data: [], error: null },
    ]
    const body = await (await call('?type=following')).json()
    expect(body.users).toEqual([])
  })

  it('surfaces a query failure as 500 rather than an empty list', async () => {
    h.state.results = [{ data: null, error: { message: 'boom' } }]
    expect((await call('?type=following')).status).toBe(500)
  })
})
