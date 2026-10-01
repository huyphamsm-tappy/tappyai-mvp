import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Reports of comments and users: the gate. What RLS does (own rows, anonymous, other people cannot read) is pinned by
// supabase/tests/user_reports.test.ts on a real PostgreSQL.

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const CID = '33333333-3333-4333-8333-333333333333'

const h = vi.hoisted(() => ({
  user: null as null | { id: string; is_anonymous?: boolean },
  comment: null as null | { id: string; user_id: string },
  profile: null as null | { id: string },
  insertErr: null as null | { code: string },
  inserts: [] as unknown[],
  limit: { ok: true },
  limitKeys: [] as string[],
}))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: h.user,
    supabase: {
      from: (t: string) => t === 'user_reports'
        ? { insert: async (row: unknown) => { h.inserts.push(row); return { error: h.insertErr } } }
        : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.comment, error: null }) }) }) },
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.profile, error: null }) }) }) }) }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: (k: string) => { h.limitKeys.push(k); return { ok: h.limit.ok, retryAfter: 0 } } }))

import { POST as reportComment } from '@/app/api/comments/[id]/report/route'
import { POST as reportUser } from '@/app/api/users/[id]/report/route'

const call = (fn: typeof reportComment, id: string, body: unknown = { reason: 'spam' }) =>
  fn(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }) as never, { params: { id } })

describe('POST /api/comments/{id}/report and /api/users/{id}/report', () => {
  const prev = process.env.REPORTS_ENABLED
  beforeEach(() => {
    process.env.REPORTS_ENABLED = 'true'
    h.user = { id: ME, is_anonymous: false }; h.comment = { id: CID, user_id: OTHER }; h.profile = { id: OTHER }
    h.insertErr = null; h.inserts = []; h.limit = { ok: true }; h.limitKeys = []
  })
  afterEach(() => { if (prev === undefined) delete process.env.REPORTS_ENABLED; else process.env.REPORTS_ENABLED = prev })

  it('flag OFF (default): 404, empty body, nothing written; only the exact value «true» turns it on', async () => {
    delete process.env.REPORTS_ENABLED
    for (const fn of [reportComment, reportUser]) { const r = await call(fn, CID); expect(r.status).toBe(404); expect(await r.text()).toBe('') }
    process.env.REPORTS_ENABLED = '1'
    expect((await call(reportUser, OTHER)).status).toBe(404)
    expect(h.inserts).toEqual([])
  })

  it('401 without a session, 403 anonymous, 400 bad reason / bad id', async () => {
    h.user = null; expect((await call(reportComment, CID)).status).toBe(401)
    h.user = { id: ME, is_anonymous: true }; expect((await call(reportComment, CID)).status).toBe(403)
    h.user = { id: ME, is_anonymous: false }
    expect((await call(reportComment, CID, { reason: 'because' })).status).toBe(400)
    expect((await call(reportComment, CID, {})).status).toBe(400)
    expect((await call(reportComment, 'nope')).status).toBe(400)
    expect(h.inserts).toEqual([])
  })

  it('a comment report writes one row as the caller; the answer is the post-report shape', async () => {
    const r = await call(reportComment, CID, { reason: 'harassment', note: '  rude  ' })
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ ok: true, reported: true })
    expect(h.inserts).toEqual([{ reporter_id: ME, target_type: 'comment', target_id: CID, reason: 'harassment', note: 'rude' }])
  })

  it('a user report writes one row; the note is cut to 300 characters', async () => {
    await call(reportUser, OTHER, { reason: 'spam', note: 'x'.repeat(500) })
    expect((h.inserts[0] as { note: string; target_type: string }).note).toHaveLength(300)
    expect((h.inserts[0] as { target_type: string }).target_type).toBe('user')
  })

  it('native menu reasons are accepted as sent; details is read as the note', async () => {
    for (const reason of ['scam', 'sensitive', 'hate', 'sexual', 'self_harm', 'impersonation']) expect((await call(reportUser, OTHER, { reason, details: 'd' })).status).toBe(200)
    expect(h.inserts[0]).toMatchObject({ reason: 'scam', note: 'd' })
  })

  it('a duplicate is a success flagged alreadyReported', async () => {
    h.insertErr = { code: '23505' }
    expect(await (await call(reportUser, OTHER)).json()).toEqual({ ok: true, reported: true, alreadyReported: true })
  })

  it('reporting yourself is 400 (your own id, your own comment)', async () => {
    expect((await call(reportUser, ME)).status).toBe(400)
    h.comment = { id: CID, user_id: ME }
    expect((await call(reportComment, CID)).status).toBe(400)
    expect(h.inserts).toEqual([])
  })

  it('no existence oracle: a missing (or invisible) comment / user answers like success and writes nothing', async () => {
    h.comment = null; h.profile = null
    for (const [fn, id] of [[reportComment, CID], [reportUser, OTHER]] as const) {
      const r = await call(fn, id); expect(r.status).toBe(200); expect(await r.json()).toEqual({ ok: true, reported: true })
    }
    expect(h.inserts).toEqual([])
  })

  it('10 per 10 minutes per account: the 11th is 429 and writes nothing', async () => {
    h.limit = { ok: false }
    expect((await call(reportUser, OTHER)).status).toBe(429)
    expect(h.limitKeys).toEqual([`user-report:${ME}`])
    expect(h.inserts).toEqual([])
  })

  it('a failed write is a 500, never a silent success', async () => {
    h.insertErr = { code: '42501' }
    expect((await call(reportUser, OTHER)).status).toBe(500)
  })
})
