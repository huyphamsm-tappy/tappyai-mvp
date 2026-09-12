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
}))

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: null, supabase: {} }),
}))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/preferences/profileCache', () => ({ rebuildProfile: () => Promise.resolve() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ upsert: (rows: Array<Record<string, unknown>>, opts: unknown) => { h.upserts.push({ rows, opts }); return Promise.resolve({ data: null, error: null }) } }),
  }),
}))

import { POST } from './route'

const post = (events: unknown[]) => POST({
  headers: new Headers({ 'content-type': 'application/json' }),
  json: () => Promise.resolve({ events }),
} as never)

const stored = () => h.upserts.flatMap(u => u.rows)

beforeEach(() => { h.upserts = [] })

// Digit-heavy but perfectly valid v4 UUIDs — the shapes the phone pattern used to swallow.
const DIGIT_HEAVY = [
  '12345678-1234-4123-8123-123456789012',
  '9d4cdf3b-a93f-4271-8803-995047230705',
  '00000000-0000-4000-8000-000000000000',
]

describe('UUIDs in metadata are stored, not rejected as phone numbers', () => {
  it('keeps an ask_tappy_place click whose review_id is digit-heavy', async () => {
    await post(DIGIT_HEAVY.map((id, i) => ({
      event_id: `e${i}`, anon_id: 'anon-1', event_type: 'ask_tappy_place', platform: 'web',
      metadata: { phase: 'click', review_id: id, source_surface: 'feed', clip_target_status: 'unknown', has_address: true },
    })))
    expect(stored().map(r => (r.metadata as Record<string, unknown>).review_id)).toEqual(DIGIT_HEAVY)
    expect(stored().every(r => r.is_unknown_event === false), 'ask_tappy_place is part of the known taxonomy').toBe(true)
    expect(stored().every(r => r.event_type === 'ask_tappy_place')).toBe(true)
  })

  it('keeps the existing review events too — review_like / place_save / review_share carry review_id', async () => {
    await post([
      { event_id: 'a', anon_id: 'anon-1', event_type: 'review_like', metadata: { review_id: DIGIT_HEAVY[0], liked: true } },
      { event_id: 'b', anon_id: 'anon-1', event_type: 'place_save', metadata: { review_id: DIGIT_HEAVY[1] } },
      { event_id: 'c', anon_id: 'anon-1', event_type: 'review_share', metadata: { review_id: DIGIT_HEAVY[2] } },
    ])
    expect(stored().map(r => r.event_type)).toEqual(['review_like', 'place_save', 'review_share'])
  })

  it('stores the UUID VERBATIM — masking is for the check only, never for the row', async () => {
    await post([{ event_id: 'a', anon_id: 'anon-1', event_type: 'ask_tappy_place', metadata: { review_id: DIGIT_HEAVY[0] } }])
    expect(JSON.stringify(stored()[0].metadata)).toContain(DIGIT_HEAVY[0])
    expect(JSON.stringify(stored()[0].metadata)).not.toContain('uuid')
  })
})

describe('the PII rule itself is unchanged', () => {
  it('still rejects an email and a phone number, alone or next to a UUID', async () => {
    await post([
      { event_id: 'a', anon_id: 'anon-1', event_type: 'feature_use', metadata: { note: 'call me 0901 234 567' } },
      { event_id: 'b', anon_id: 'anon-1', event_type: 'feature_use', metadata: { note: 'someone@example.com' } },
      { event_id: 'c', anon_id: 'anon-1', event_type: 'feature_use', metadata: { review_id: DIGIT_HEAVY[0], note: '+84 901 234 567' } },
      { event_id: 'd', anon_id: 'anon-1', event_type: 'feature_use', metadata: { ok: 'clean' } },
    ])
    expect(stored().map(r => r.event_id)).toEqual(['d'])
  })

  it('a bare digit run that is NOT a UUID is still treated as a phone number', async () => {
    await post([{ event_id: 'a', anon_id: 'anon-1', event_type: 'feature_use', metadata: { n: '1234-5678-9012' } }])
    expect(stored()).toEqual([])
  })
})
