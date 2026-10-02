/**
 * security-audit H1 (INSERT half) — POST /api/reviews is the ONLY way a review row is written, and
 * the server decides every sensitive column.
 *
 * Migration 20260928_revoke_reviews_insert.sql takes INSERT on `reviews` away from `authenticated`,
 * so a signed-in user can no longer POST a row to PostgREST with publication_state 'PUBLISHED'
 * and is_verified true. That is only safe if the route (a) writes with the service role and
 * (b) never lets the request body choose identity, verification or moderation state. This suite
 * pins both through the real handler; supabase/tests/reviews_insert_revoke.test.ts pins the
 * database side.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const state = { inserted: [] as Row[], userInserts: 0, user: { id: 'author-1' } as { id: string } | null }
  const builder = (writes: boolean): any => {
    const b: any = {
      select: () => b, eq: () => b, lt: () => b, limit: () => b, order: () => b, in: () => b, or: () => b,
      maybeSingle: () => Promise.resolve({ data: null, error: null }), // no booking, no duplicate
      insert: (row: Row) => {
        if (!writes) { state.userInserts += 1; throw new Error('caller client used for INSERT') }
        state.inserted.push(row)
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'new-review' }, error: null }) }) }
      },
    }
    return b
  }
  const rpc = (fn: string) =>
    fn === 'user_age_status'
      ? Promise.resolve({ data: [{ has_dob: true, age_years: 30, age_band: '25_34', corrections_used: 0 }], error: null })
      : Promise.resolve({ data: null, error: null })
  return { state, client: { from: () => builder(false), rpc }, admin: { from: () => builder(true) } }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}))
vi.mock('@/lib/preferences/profileCache', () => ({ rebuildProfile: () => Promise.resolve() }))
vi.mock('@/lib/security/rateLimit', () => ({ dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({ AI: { vision: () => Promise.resolve({ text: 'TEXT: NONE\nSUBJECTS: bún chả, bàn ăn' }) } }))

import { POST } from './route'

const post = async (body: Row) => {
  const req = { nextUrl: new URL('http://localhost/api/reviews'), headers: new Headers(), json: () => Promise.resolve(body) }
  const res = await POST(req as never)
  return { status: res.status }
}

const legit = {
  placeId: 'ChIJtest', placeName: 'Quán Ngon', placeAddress: '12 Lê Lợi', rating: 5,
  body: 'Quán bún chả ngon, phục vụ nhanh', hashtags: ['anuong'], content_type: 'photo', source_type: 'upload',
  media_url: 'https://storage.googleapis.com/tappyai-media-prod/photos/a.jpg',
  thumbnail: 'https://storage.googleapis.com/tappyai-media-prod/photos/a.jpg',
}
/** Everything a client would like to decide for itself. */
const hostile = {
  ...legit,
  user_id: 'victim-9', id: '00000000-0000-4000-8000-000000000000',
  is_verified: true, publication_state: 'PUBLISHED', safety_state: 'SAFE', evaluated_version: 'forged',
  like_count: 999, view_count: 999, save_count: 999, comment_count: 999, is_hidden: true,
}
const NEVER_WRITTEN = ['id', 'like_count', 'view_count', 'save_count', 'comment_count', 'watch_time_avg', 'completion_rate', 'is_hidden']

beforeEach(() => {
  h.state.inserted = []
  h.state.userInserts = 0
  h.state.user = { id: 'author-1' }
})

describe('POST /api/reviews — the only writer, and the server decides', () => {
  it('creating a review still works, through the service role only', async () => {
    process.env.CONTENT_SAFETY_SCHEMA_MIGRATED = 'true'
    process.env.CONTENT_SAFETY_GATE_ENABLED = 'true'
    expect((await post(legit)).status).toBe(200)
    expect(h.state.inserted).toHaveLength(1)
    expect(h.state.userInserts).toBe(0)
  })

  it('a hostile body cannot choose the author, verification, moderation state or counters (gate ACTIVE)', async () => {
    process.env.CONTENT_SAFETY_SCHEMA_MIGRATED = 'true'
    process.env.CONTENT_SAFETY_GATE_ENABLED = 'true'
    expect((await post({ ...hostile, publication_state: 'RESTRICTED' })).status).toBe(200)
    const row = h.state.inserted[0]
    expect(row.user_id).toBe('author-1')                 // from the session
    expect(row.is_verified).toBe(false)                  // from the booking lookup (none)
    expect(row.publication_state).toBe('PUBLISHED')      // from the gate, not the body's 'RESTRICTED'
    expect(row.evaluated_version).not.toBe('forged')
    for (const k of NEVER_WRITTEN) expect(row, k).not.toHaveProperty(k)
  })

  it('with the gate INACTIVE no lifecycle column is written at all, whatever the body says', async () => {
    delete process.env.CONTENT_SAFETY_SCHEMA_MIGRATED
    delete process.env.CONTENT_SAFETY_GATE_ENABLED
    expect((await post(hostile)).status).toBe(200)
    const row = h.state.inserted[0]
    expect(row.user_id).toBe('author-1')
    expect(row.is_verified).toBe(false)
    for (const k of ['publication_state', 'safety_state', 'evaluated_version', 'evaluated_at', ...NEVER_WRITTEN]) {
      expect(row, k).not.toHaveProperty(k)
    }
  })

  it('signed out: 401 and nothing is written anywhere', async () => {
    h.state.user = null
    expect((await post(legit)).status).toBe(401)
    expect(h.state.inserted).toHaveLength(0)
    expect(h.state.userInserts).toBe(0)
  })
})

describe('guard — no code INSERTs into reviews with the caller\'s client', () => {
  it('every `.from(\'reviews\').insert(` in src goes through a service-role client', () => {
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name)
      return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
    })
    const offenders: string[] = []
    for (const f of walk('src')) {
      const src = fs.readFileSync(f, 'utf8')
      for (const m of src.matchAll(/(\w+)\s*\.from\(\s*'reviews'\s*\)\s*\.insert\(/g)) {
        const client = m[1]
        const boundToAdmin = new RegExp(`\\b${client}\\s*=\\s*createAdminClient\\(`).test(src)
        if (!boundToAdmin) offenders.push(`${f}: ${client}.from('reviews').insert`)
      }
    }
    expect(offenders).toEqual([])
  })
})
