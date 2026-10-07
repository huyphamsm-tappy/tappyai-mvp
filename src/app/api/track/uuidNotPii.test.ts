import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── /api/track — a row id is not a phone number ─────────────────────────────
//
// Found while wiring `ask_tappy_place` (2026-09-12): the §8A.3 PII filter's phone
// pattern (`\d[\d\s().-]{7,}\d`) matches any UUID whose hex runs digit-heavy across
// a hyphen — about ONE IN FOUR random UUIDs. Every event carrying a `review_id`
// (`review_like`, `place_save`, `review_share`, and now `ask_tappy_place`) was
// silently losing that share of its rows. UUIDs are masked before the PII test;
// real emails and phone numbers are still rejected.

const h = vi.hoisted(() => ({
  upserts: [] as Array<{ rows: Array<Record<string, unknown>>; opts: unknown }>,
  // When set, the mock rejects any upsert call whose batch contains a row with this event_type
  // (simulating a strict-column / CHECK violation on that one row). This lets a test prove the
  // route salvages the valid rows when a bad sibling would otherwise reject the whole batch.
  rejectType: null as string | null,
  // When set, the mock rejects EVERY upsert call — a total write failure.
  upsertError: null as { code?: string } | null,
}))

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: null, supabase: {} }),
}))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/preferences/profileCache', () => ({ rebuildProfile: () => Promise.resolve() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ upsert: (rows: Array<Record<string, unknown>>, opts: unknown) => {
      const rejected = h.upsertError || (h.rejectType && rows.some(r => r.event_type === h.rejectType) ? { code: '23514' } : null)
      if (!rejected) h.upserts.push({ rows, opts })
      return Promise.resolve({ data: null, error: rejected })
    } }),
  }),
}))

import { POST } from './route'

const post = (events: unknown[]) => POST({
  headers: new Headers({ 'content-type': 'application/json' }),
  json: () => Promise.resolve({ events }),
} as never)

const stored = () => h.upserts.flatMap(u => u.rows)

beforeEach(() => { h.upserts = []; h.upsertError = null; h.rejectType = null })
const json = async (res: Response) => res.json() as Promise<{ ok: boolean; error?: string }>

// Digit-heavy but perfectly valid v4 UUIDs — the shapes the phone pattern used to swallow.
const DIGIT_HEAVY = [
  '12345678-1234-4123-8123-123456789012',
  '9d4cdf3b-a93f-4271-8803-995047230705',
  '00000000-0000-4000-8000-000000000000',
]

// `anon_id` and `event_id` are UUID columns — the fixtures use real UUIDs so they exercise the same
// strict-column path production does (a non-uuid `anon_id` would be rejected by Postgres, a gap this
// mock hid). `eid(i)` gives each event a stable, valid, distinguishable id.
const ANON = 'aaaaaaaa-0000-4000-8000-000000000001'
const eid = (i: number) => `eeeeeeee-0000-4000-8000-00000000000${i}`

describe('UUIDs in metadata are stored, not rejected as phone numbers', () => {
  it('keeps an ask_tappy_place click whose review_id is digit-heavy', async () => {
    await post(DIGIT_HEAVY.map((id, i) => ({
      event_id: eid(i), anon_id: ANON, event_type: 'ask_tappy_place', platform: 'web',
      metadata: { phase: 'click', review_id: id, source_surface: 'feed', clip_target_status: 'unknown', has_address: true },
    })))
    expect(stored().map(r => (r.metadata as Record<string, unknown>).review_id)).toEqual(DIGIT_HEAVY)
    expect(stored().every(r => r.is_unknown_event === false), 'ask_tappy_place is part of the known taxonomy').toBe(true)
    expect(stored().every(r => r.event_type === 'ask_tappy_place')).toBe(true)
  })

  it('keeps the existing review events too — review_like / place_save / review_share carry review_id', async () => {
    await post([
      { event_id: eid(1), anon_id: ANON, event_type: 'review_like', metadata: { review_id: DIGIT_HEAVY[0], liked: true } },
      { event_id: eid(2), anon_id: ANON, event_type: 'place_save', metadata: { review_id: DIGIT_HEAVY[1] } },
      { event_id: eid(3), anon_id: ANON, event_type: 'review_share', metadata: { review_id: DIGIT_HEAVY[2] } },
    ])
    expect(stored().map(r => r.event_type)).toEqual(['review_like', 'place_save', 'review_share'])
  })

  it('stores the UUID VERBATIM — masking is for the check only, never for the row', async () => {
    await post([{ event_id: eid(1), anon_id: ANON, event_type: 'ask_tappy_place', metadata: { review_id: DIGIT_HEAVY[0] } }])
    expect(JSON.stringify(stored()[0].metadata)).toContain(DIGIT_HEAVY[0])
    expect(JSON.stringify(stored()[0].metadata)).not.toContain('uuid')
  })
})

describe('the PII rule itself is unchanged', () => {
  it('still rejects an email and a phone number, alone or next to a UUID', async () => {
    await post([
      { event_id: eid(1), anon_id: ANON, event_type: 'feature_use', metadata: { note: 'call me 0901 234 567' } },
      { event_id: eid(2), anon_id: ANON, event_type: 'feature_use', metadata: { note: 'someone@example.com' } },
      { event_id: eid(3), anon_id: ANON, event_type: 'feature_use', metadata: { review_id: DIGIT_HEAVY[0], note: '+84 901 234 567' } },
      { event_id: eid(4), anon_id: ANON, event_type: 'feature_use', metadata: { ok: 'clean' } },
    ])
    expect(stored().map(r => r.event_id)).toEqual([eid(4)])
  })

  it('a bare digit run that is NOT a UUID is still treated as a phone number', async () => {
    await post([{ event_id: eid(1), anon_id: ANON, event_type: 'feature_use', metadata: { n: '1234-5678-9012' } }])
    expect(stored()).toEqual([])
  })
})

// F-015-adjacent (owner P1): the write must reach the DB, and one malformed event must not lose the
// rest of the batch, and a genuine write failure must not report success.
describe('a malformed event does not poison the batch, and a failed write is not a silent success', () => {
  it('a non-uuid anon_id (no session) is dropped, not fatal — its valid siblings still store', async () => {
    await post([
      { event_id: eid(1), anon_id: ANON, event_type: 'good_before', metadata: {} },
      { event_id: eid(2), anon_id: 'NOT-A-UUID', event_type: 'poison', metadata: {} }, // no user → dropped
      { event_id: eid(3), anon_id: ANON, event_type: 'good_after', metadata: {} },
    ])
    // The poison event is filtered out (no user, invalid anon_id); the two good ones survive.
    expect(stored().map(r => r.event_type)).toEqual(['good_before', 'good_after'])
    // Every stored row carries a VALID uuid in each strict column, so Postgres cannot reject the batch.
    expect(stored().every(r => /^[0-9a-f-]{36}$/i.test(String(r.event_id)) && /^[0-9a-f-]{36}$/i.test(String(r.anon_id)))).toBe(true)
  })

  it('a non-uuid event_id is replaced with a fresh uuid rather than crashing the batch', async () => {
    await post([{ event_id: 'not-a-uuid', anon_id: ANON, event_type: 'feature_use', metadata: { ok: 1 } }])
    expect(stored()).toHaveLength(1)
    expect(String(stored()[0].event_id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(String(stored()[0].event_id)).not.toBe('not-a-uuid')
  })

  it('when one row rejects the batch (e.g. an event_type outside the DB taxonomy), the valid siblings are salvaged', async () => {
    h.rejectType = 'not_in_taxonomy' // the DB CHECK rejects any batch containing this row
    await post([
      { event_id: eid(1), anon_id: ANON, event_type: 'feature_use', metadata: { pos: 'before' } },
      { event_id: eid(2), anon_id: ANON, event_type: 'not_in_taxonomy', metadata: {} },
      { event_id: eid(3), anon_id: ANON, event_type: 'review_like', metadata: { pos: 'after' } },
    ])
    // The whole batch was rejected, then re-tried per row: the two valid events persisted, the bad one dropped.
    expect(stored().map(r => r.event_type)).toEqual(['feature_use', 'review_like'])
  })

  it('when the write fails entirely, the route answers ok:false — not a silent 200 that loses the events', async () => {
    h.upsertError = { code: '22P02' } // every write fails (e.g. an outage)
    const res = await post([{ event_id: eid(1), anon_id: ANON, event_type: 'feature_use', metadata: {} }])
    expect(await json(res)).toEqual({ ok: false, error: 'persist_failed' })
    expect(stored()).toEqual([])
  })

  it('a clean batch still answers ok:true', async () => {
    const res = await post([{ event_id: eid(1), anon_id: ANON, event_type: 'feature_use', metadata: {} }])
    expect(await json(res)).toEqual({ ok: true })
    expect(stored()).toHaveLength(1)
  })
})
