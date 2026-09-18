import { describe, it, expect } from 'vitest'
import { addDays, computeGrowthMetrics, makeIdentityResolver, vnDayOf, type GrowthEventRow } from './growthMetrics'

// A hand-built event stream, so every definition is checked against numbers a
// person can count. Times are UTC; VN day = UTC+7.

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const V1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const V2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

let seq = 0
function ev(type: string, who: { user?: string; anon?: string }, at: string, meta: Record<string, unknown> = {}, session = 's'): GrowthEventRow {
  seq++
  return { event_type: type, user_id: who.user ?? null, anon_id: who.anon ?? null, session_id: `${who.user ?? who.anon}-${session}`, created_at: at, metadata: meta }
}

const FROM = '2026-09-01T00:00:00Z'
const TO = '2026-09-10T23:59:59Z'
const NOW = new Date('2026-09-25T00:00:00Z')

const rows: GrowthEventRow[] = [
  // A: anonymous first query on 09-01 with a map click in the same session → activated. Returns day 6 → D7 retained.
  ev('first_visit', { anon: A }, '2026-09-01T02:00:00Z'),
  ev('query', { anon: A }, '2026-09-01T02:01:00Z', { source: 'direct', result_id: 'r1' }, 's1'),
  ev('result_action', { anon: A }, '2026-09-01T02:02:00Z', { source: 'direct', action_type: 'outbound_map' }, 's1'),
  ev('query', { anon: A }, '2026-09-07T02:00:00Z', { source: 'direct' }, 's2'),
  // A signs up on 09-07 (anon → user u-A). Later event as user.
  ev('signup', { user: 'u-A', anon: A }, '2026-09-07T02:05:00Z', { source: 'direct', first_source: 'direct' }, 's2'),
  ev('share_created', { user: 'u-A', anon: A }, '2026-09-07T02:10:00Z', { source: 'direct', share_id: 'sh1', slug: 'AbCdEfGh12' }, 's2'),
  // B: first query 09-02, no action in that session, action in a LATER session → not activated. Not retained.
  ev('query', { anon: B }, '2026-09-02T02:00:00Z', { source: 'qr_pos' }, 's1'),
  ev('result_action', { anon: B }, '2026-09-03T02:00:00Z', { source: 'qr_pos', action_type: 'outbound_booking' }, 's2'),
  // C: first query BEFORE the period (08-20) — not in the activation/D7 cohort, but active (queries in period).
  ev('query', { user: 'u-C' }, '2026-08-20T02:00:00Z', { source: 'direct' }),
  ev('query', { user: 'u-C' }, '2026-09-05T02:00:00Z', { source: 'direct' }),
  // Viewers of sh1: V1 views 3 times (3 sessions), then queries with share attribution, then signs up.
  ev('share_viewed', { anon: V1 }, '2026-09-08T01:00:00Z', { source: 'share_out', share_id: 'sh1', slug: 'AbCdEfGh12' }, 's1'),
  ev('share_viewed', { anon: V1 }, '2026-09-08T02:00:00Z', { source: 'share_out', share_id: 'sh1', slug: 'AbCdEfGh12' }, 's2'),
  ev('share_viewed', { anon: V1 }, '2026-09-08T03:00:00Z', { source: 'share_out', share_id: 'sh1', slug: 'AbCdEfGh12' }, 's3'),
  ev('query', { anon: V1 }, '2026-09-08T03:05:00Z', { source: 'share_out', share_id: 'sh1', is_follow_up: true }, 's3'),
  ev('result_action', { anon: V1 }, '2026-09-08T03:05:01Z', { source: 'share_out', share_id: 'sh1', action_type: 'follow_up_query' }, 's3'),
  ev('signup', { user: 'u-V1', anon: V1 }, '2026-09-08T03:10:00Z', { source: 'share_out', first_source: 'share_out', first_share_id: 'sh1' }, 's3'),
  // V1 then shares the answer it got — a second-generation share.
  ev('share_created', { user: 'u-V1', anon: V1 }, '2026-09-08T03:12:00Z', { source: 'share_out', share_id: 'sh2', slug: 'ZzZzZzZzZ2', parent_share_id: 'sh1' }, 's3'),
  // V2 views once and leaves. A query BEFORE viewing must not count as viewer→query.
  ev('query', { anon: V2 }, '2026-09-08T00:00:00Z', { source: 'direct' }),
  ev('share_viewed', { anon: V2 }, '2026-09-09T01:00:00Z', { source: 'zalo_link', share_id: 'sh1', slug: 'AbCdEfGh12' }),
  // Outside the period: must not count.
  ev('share_viewed', { anon: V2 }, '2026-09-20T01:00:00Z', { source: 'share_out', share_id: 'sh1', slug: 'AbCdEfGh12' }),
]
const links = [{ anon_id: A, user_id: 'u-A' }, { anon_id: V1, user_id: 'u-V1' }]

describe('helpers', () => {
  it('vnDayOf buckets in Asia/Ho_Chi_Minh', () => {
    expect(vnDayOf('2026-09-01T16:59:59Z')).toBe('2026-09-01')
    expect(vnDayOf('2026-09-01T17:00:00Z')).toBe('2026-09-02')
    expect(addDays('2026-09-30', 2)).toBe('2026-10-02')
  })
  it('resolves an anon id to the user it became, else itself', () => {
    const r = makeIdentityResolver(links)
    expect(r({ user_id: null, anon_id: A })).toBe('u:u-A')
    expect(r({ user_id: 'u-A', anon_id: A })).toBe('u:u-A')
    expect(r({ user_id: null, anon_id: B })).toBe(`a:${B}`)
    expect(r({ user_id: null, anon_id: null })).toBeNull()
  })
})

describe('computeGrowthMetrics', () => {
  const m = computeGrowthMetrics({ rows, links, from: FROM, to: TO, now: NOW })

  it('counts resolved identities: A across signup is ONE person', () => {
    // A, B, C, V1, V2 → 5 seen; active (query in period): A, B, C, V1, V2 → 5
    expect(m.identities.seen).toBe(5)
    expect(m.identities.active).toBe(5)
    expect(m.identities.signups).toBe(2)
  })

  it('activation = result_action in the FIRST-query session, cohort = first query in period', () => {
    // cohort: A, B, V1, V2 (C's first query was before the period)
    // activated: A (map click same session), V1 (follow-up same session). B acted in a later session.
    expect(m.identities.activated).toBe(2)
    expect(m.activationRate).toBeCloseTo(2 / 4)
  })

  it('D7 = active on day 5–9 after the first query, only for closed windows', () => {
    // A first 09-01, queried 09-07 (day 6) → retained. B 09-02 → not. V1 09-08, window closes 09-17 < now → not. V2 09-08 → not.
    expect(m.d7.cohortSize).toBe(4)
    expect(m.d7.retained).toBe(1)
    expect(m.d7.rate).toBeCloseTo(0.25)
    expect(m.d7.window).toEqual({ fromDay: 5, toDay: 9 })
  })

  it('an open D7 window is not measured', () => {
    const early = computeGrowthMetrics({ rows, links, from: FROM, to: TO, now: new Date('2026-09-12T00:00:00Z') })
    // Only A (09-01, closes 09-10) and B (09-02, closes 09-11) have closed windows on 09-12.
    expect(early.d7.cohortSize).toBe(2)
  })

  it('views are deduplicated per (share, viewer): 3 refreshes by V1 are one unique view', () => {
    expect(m.shares.rawViewEvents).toBe(4)
    expect(m.shares.uniqueViews).toBe(2)
    expect(m.shares.created).toBe(2)
    expect(m.shares.viewsPerShare).toBe(1)
    expect(m.shares.shareRate).toBeCloseTo(2 / 5)
  })

  it('viewer → query / signup counts only events AFTER the first view', () => {
    expect(m.shares.viewersWhoQueried).toBe(1) // V1 (V2 queried before viewing)
    expect(m.shares.viewersWhoSignedUp).toBe(1)
    expect(m.shares.viewerToQuery).toBeCloseTo(0.5)
    expect(m.shares.viewerToSignup).toBeCloseTo(0.5)
  })

  it('second-generation shares and viewer→share are counted from share ancestry', () => {
    expect(m.shares.secondGeneration).toBe(1)
    expect(m.shares.viewersWhoShared).toBe(1) // V1
    expect(m.shares.viewerToShare).toBeCloseTo(0.5)
  })

  it('multi-generation attribution walks the parent chain: sh1 is generation 1, sh2 generation 2', () => {
    expect(m.shares.byGeneration).toEqual({ 1: 1, 2: 1 })
    expect(m.shares.maxGeneration).toBe(2)
  })

  it('a third generation and an out-of-window parent are both counted honestly', () => {
    const more: GrowthEventRow[] = [
      ...rows,
      ev('share_created', { anon: V2 }, '2026-09-09T02:00:00Z', { source: 'share_out', share_id: 'sh3', slug: 'Qq3', parent_share_id: 'sh2' }),
      ev('share_created', { anon: V2 }, '2026-09-09T03:00:00Z', { source: 'share_out', share_id: 'sh4', slug: 'Qq4', parent_share_id: 'sh-before-window' }),
      ev('share_created', { anon: V2 }, '2026-09-09T04:00:00Z', { source: 'share_out', share_id: 'sh5', slug: 'Qq5', parent_share_id: 'sh5' }), // self-loop: must terminate
    ]
    const x = computeGrowthMetrics({ rows: more, links, from: FROM, to: TO, now: NOW })
    expect(x.shares.byGeneration[3]).toBe(1) // sh3
    expect(x.shares.byGeneration[2]).toBe(2) // sh2 + sh4 (unknown parent = at least generation 2)
    expect(x.shares.byGeneration[1]).toBe(2) // sh1 + the self-loop, which stops where it stands
    expect(x.shares.maxGeneration).toBe(3)
    expect(Object.values(x.shares.byGeneration).reduce((a, b) => a + b, 0)).toBe(5)
  })

  it('acquisition: first queries in the period are broken down by source', () => {
    // A (direct), B (qr_pos), V1 (share_out), V2 (direct). C's first query was before the period.
    expect(m.acquisition.firstQueriesBySource).toEqual({ direct: 2, qr_pos: 1, share_out: 1 })
  })

  it('k-factor = share-attributed NEW actives / actives', () => {
    // New in period with share attribution: V1 only (V2's first query was direct).
    expect(m.shares.kFactor).toBeCloseTo(1 / 5)
  })

  it('useful-result actions are counted by type; outbound bookings surfaced', () => {
    expect(m.actions.total).toBe(3)
    expect(m.actions.byType).toEqual({ outbound_map: 1, outbound_booking: 1, follow_up_query: 1 })
    expect(m.actions.outboundBookingClicks).toBe(1)
    expect(m.actions.resultActionRate).toBeCloseTo(3 / 5) // A, B, V1 acted of 5 actives
  })

  it('gates report insufficient_sample honestly below the minimum n', () => {
    expect(m.gates.gate0.status).toBe('insufficient_sample')
    expect(m.gates.gate1.status).toBe('insufficient_sample')
    expect(m.gates.gate2.status).toBe('insufficient_sample')
    expect(m.gates.gate0.value).toBeCloseTo(0.5)
  })

  it('gates pass / warn / fail at the pinned thresholds once the sample is large enough', () => {
    const big: GrowthEventRow[] = []
    for (let i = 0; i < 40; i++) {
      const anon = `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`
      big.push(ev('query', { anon }, '2026-09-01T02:00:00Z', { source: 'direct' }, 's1'))
      if (i < 14) big.push(ev('result_action', { anon }, '2026-09-01T02:01:00Z', { source: 'direct', action_type: 'share' }, 's1'))
    }
    const g = computeGrowthMetrics({ rows: big, links: [], from: FROM, to: TO, now: NOW }).gates.gate0
    expect(g.sample).toBe(40)
    expect(g.value).toBeCloseTo(0.35)
    expect(g.status).toBe('warn')
    expect(g.onFail).toMatch(/fix product/)
  })

  it('ignores rows with no identity and rows outside the period', () => {
    const extra = [...rows, { event_type: 'query', user_id: null, anon_id: null, session_id: null, created_at: '2026-09-03T00:00:00Z', metadata: {} }]
    expect(computeGrowthMetrics({ rows: extra, links, from: FROM, to: TO, now: NOW }).identities.active).toBe(5)
  })
})
