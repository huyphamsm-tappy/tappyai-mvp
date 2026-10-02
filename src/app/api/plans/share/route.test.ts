// POST /api/plans/share — one plan in, one stable link out.
//
// Through the real route. The supabase client is a recording stub that answers
// the two shapes the route uses (lookup by owner+fingerprint, insert returning
// id); everything else — whitelisting, hashing, id minting, status codes — is
// the route's own code.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PLAN_SHARE_ID_RE, canonicalPlanShareJson, toPlanShareSnapshot } from '@/lib/plans/share/planShare'
import { planShareFingerprint } from '@/lib/plans/share/planShareServer'
import type { TappyPlan } from '@/components/TripPlanCard'

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u-owner', is_anonymous: false } as { id: string; is_anonymous?: boolean } | null,
    existing: null as { id: string } | null,
    inserts: [] as Array<Record<string, unknown>>,
    insertError: null as { code: string } | null,
    lookups: [] as Array<Array<[string, unknown]>>,
  }
  const builder = (table: string): any => {
    if (table !== 'plan_shares') throw new Error(`unexpected table ${table}`)
    const filters: Array<[string, unknown]> = []
    let pendingInsert: Record<string, unknown> | null = null
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return b },
      maybeSingle: () => { state.lookups.push(filters); return Promise.resolve({ data: state.existing, error: null }) },
      insert: (row: Record<string, unknown>) => { pendingInsert = row; return b },
      single: () => {
        if (!pendingInsert) throw new Error('single() without insert()')
        state.inserts.push(pendingInsert)
        if (state.insertError) return Promise.resolve({ data: null, error: state.insertError })
        return Promise.resolve({ data: { id: pendingInsert.id }, error: null })
      },
    }
    return b
  }
  return { state, client: { from: (t: string) => builder(t) } }
})
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}))

import { POST } from './route'

const PLAN: TappyPlan = {
  type: 'trip', title: 'Quy Nhơn 3 ngày 2 đêm', people: 2, budget_total: '5.000.000đ',
  days: [{ label: 'Ngày 1', items: [
    { time: '09:00', emoji: '🏖️', category: 'entertainment', name: 'Bãi Kỳ Co', address: 'Xã Nhơn Lý, Quy Nhơn', photo_url: 'https://lh3.googleusercontent.com/p/A', place_id: 'ChIJsecret' },
  ] }],
}

const post = (body: unknown, raw = false) => POST(new Request('https://www.tappyai.com/api/plans/share', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ? (body as string) : JSON.stringify(body),
}))

beforeEach(() => {
  h.state.user = { id: 'u-owner', is_anonymous: false }
  h.state.existing = null
  h.state.inserts = []
  h.state.insertError = null
  h.state.lookups = []
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com')
})

describe('POST /api/plans/share', () => {
  it('publishes the WHITELISTED snapshot under a fresh 12-char id and answers with the canonical /plan url', async () => {
    const r = await post({ plan: PLAN })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.id).toMatch(PLAN_SHARE_ID_RE)
    expect(body.path).toBe(`/plan/${body.id}`)
    expect(body.url).toBe(`https://www.tappyai.com/plan/${body.id}`)
    expect(body.reused).toBe(false)

    expect(h.state.inserts).toHaveLength(1)
    const row = h.state.inserts[0]
    expect(row.id).toBe(body.id)
    expect(row.owner_id).toBe('u-owner')
    const snap = toPlanShareSnapshot(PLAN)!
    expect(row.plan).toEqual(JSON.parse(canonicalPlanShareJson(snap)))
    expect(row.fingerprint).toBe(planShareFingerprint(canonicalPlanShareJson(snap)))
    // The whitelist ran before storage: the Google place id never reached the row.
    expect(JSON.stringify(row)).not.toContain('ChIJsecret')
  })

  it('the same plan again returns the SAME id and inserts nothing', async () => {
    h.state.existing = { id: 'ExistingId01' }
    const r = await post({ plan: PLAN })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ id: 'ExistingId01', url: 'https://www.tappyai.com/plan/ExistingId01', reused: true })
    expect(h.state.inserts).toHaveLength(0)
    // …and the lookup was scoped to THIS owner and THIS plan.
    expect(h.state.lookups[0]).toEqual([['owner_id', 'u-owner'], ['fingerprint', planShareFingerprint(canonicalPlanShareJson(toPlanShareSnapshot(PLAN)!))]])
  })

  it('a race on the unique key reads back the winner instead of failing the share', async () => {
    h.state.insertError = { code: '23505' }
    let calls = 0
    const orig = h.client.from
    h.client.from = (t: string) => { const b = orig(t); const ms = b.maybeSingle; b.maybeSingle = () => { calls++; return calls === 1 ? Promise.resolve({ data: null, error: null }) : Promise.resolve({ data: { id: 'RaceWinner01' }, error: null }) }; void ms; return b }
    try {
      const r = await post({ plan: PLAN })
      expect(r.status).toBe(200)
      expect((await r.json()).id).toBe('RaceWinner01')
    } finally {
      h.client.from = orig
    }
  })

  it('401 for a signed-out caller, 403 for an anonymous session — never a link that outlives a guest', async () => {
    h.state.user = null
    expect((await post({ plan: PLAN })).status).toBe(401)
    h.state.user = { id: 'u-guest', is_anonymous: true }
    const r = await post({ plan: PLAN })
    expect(r.status).toBe(403)
    expect(h.state.inserts).toHaveLength(0)
  })

  it('400 for a body that is not a plan: no title, no stops, not JSON', async () => {
    expect((await post({ plan: { ...PLAN, title: '' } })).status).toBe(400)
    expect((await post({ plan: { ...PLAN, days: [] } })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect((await post('{not json', true)).status).toBe(400)
    expect(h.state.inserts).toHaveLength(0)
  })

  it('413 for an oversized body, before parsing', async () => {
    const r = await post(JSON.stringify({ plan: { ...PLAN, title: 'x'.repeat(200_000) } }), true)
    expect(r.status).toBe(413)
  })

  it('a policy refusal from the database is a 403, not a 500', async () => {
    h.state.insertError = { code: '42501' }
    expect((await post({ plan: PLAN })).status).toBe(403)
  })
})
