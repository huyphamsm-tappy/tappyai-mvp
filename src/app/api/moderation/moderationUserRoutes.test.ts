import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The person-facing half (owner 01/10): my decisions, my one appeal per decision, the status of the reports I filed.
// The caller is always the filter; nobody can reach another person's decisions or reports, and a reporter learns one of four states.

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const D1 = '33333333-3333-4333-8333-333333333333'

const h = vi.hoisted(() => ({
  user: { id: '11111111-1111-4111-8111-111111111111', is_anonymous: false } as { id: string; is_anonymous?: boolean } | null,
  decisions: [] as Array<Record<string, unknown>>,
  decisionRow: null as Record<string, unknown> | null,
  appeals: [] as Array<Record<string, unknown>>,
  insertErr: null as null | { code: string },
  inserts: [] as unknown[],
  ownReports: [] as Array<Record<string, unknown>>,
  postReports: [] as Array<Record<string, unknown>>,
  queue: [] as Array<Record<string, unknown>>,
  filters: [] as Array<[string, string, unknown]>,
}))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: h.user, supabase: { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: h.ownReports, error: null }) }) }) }) } }),
}))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (c: string, v: unknown) => { h.filters.push([table, c, v]); return b }
      b.neq = () => b; b.in = () => b; b.order = () => b; b.limit = () => b
      b.filter = (c: string, _o: string, v: unknown) => { h.filters.push([table, c, v]); return b }
      b.maybeSingle = async () => ({ data: h.decisionRow, error: null })
      b.insert = async (v: unknown) => { h.inserts.push(v); return { error: h.insertErr } }
      b.then = (res: (v: unknown) => unknown) => {
        const data = table === 'moderation_decisions' ? h.decisions : table === 'moderation_appeals' ? h.appeals : table === 'content_reports' ? h.postReports : table === 'moderation_queue' ? h.queue : []
        return Promise.resolve({ data, error: null }).then(res)
      }
      return b
    },
  }),
}))

import { GET as MINE } from '@/app/api/reports/mine/route'
import { GET as DECISIONS } from './decisions/route'
import { POST as APPEAL } from './decisions/[id]/appeal/route'

const get = (fn: (r: never) => Promise<Response>) => fn(new Request('http://localhost/x') as never)
const appeal = (message: unknown, id = D1) => APPEAL(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ message }) }) as never, { params: { id } })

describe('violation notices and appeals', () => {
  const prev = { m: process.env.MODERATION_ADMIN_ENABLED, r: process.env.REPORTS_ENABLED }
  beforeEach(() => {
    process.env.MODERATION_ADMIN_ENABLED = 'true'; process.env.REPORTS_ENABLED = 'true'
    h.user = { id: ME, is_anonymous: false }; h.decisions = []; h.decisionRow = null; h.appeals = []; h.insertErr = null; h.inserts = []; h.ownReports = []; h.postReports = []; h.queue = []; h.filters = []
  })
  afterEach(() => { for (const [k, v] of [['MODERATION_ADMIN_ENABLED', prev.m], ['REPORTS_ENABLED', prev.r]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })

  it('flag OFF: 404 with an empty body', async () => {
    delete process.env.MODERATION_ADMIN_ENABLED; delete process.env.REPORTS_ENABLED
    for (const r of [await get(DECISIONS as never), await appeal('a long enough message'), await get(MINE as never)]) { expect(r.status).toBe(404); expect(await r.text()).toBe('') }
  })

  it('401 without a session; decisions are filtered by the CALLER, never by a query string', async () => {
    h.user = null; expect((await get(DECISIONS as never)).status).toBe(401)
    h.user = { id: ME }
    await DECISIONS(new Request(`http://localhost/api/moderation/decisions?user=${OTHER}`) as never)
    expect(h.filters).toContainEqual(['moderation_decisions', 'subject_user_id', ME])
    expect(h.filters.some(([, , v]) => v === OTHER)).toBe(false)
  })

  it('decisions list: an appeal state per decision, and can_appeal only inside the window and without a prior appeal', async () => {
    const fresh = new Date().toISOString(); const old = new Date(Date.now() - 40 * 86_400_000).toISOString()
    h.decisions = [{ id: 'a', created_at: fresh }, { id: 'b', created_at: fresh }, { id: 'c', created_at: old }]
    h.appeals = [{ decision_id: 'b', status: 'pending', created_at: fresh }]
    const out = (await (await get(DECISIONS as never)).json()).decisions as Array<{ id: string; can_appeal: boolean; appeal: unknown }>
    expect(out.map((d) => [d.id, d.can_appeal, !!d.appeal])).toEqual([['a', true, false], ['b', false, true], ['c', false, false]])
    expect(JSON.stringify(out)).not.toContain('reviewer')
  })

  it('appeal: only the subject, only once, only inside the window, message 10–1000', async () => {
    const fresh = new Date().toISOString()
    h.decisionRow = { id: D1, created_at: fresh, outcome: 'content_removed', subject_user_id: OTHER }
    expect((await appeal('this is a long enough message')).status).toBe(404) // someone else's decision = not found, no oracle
    h.decisionRow = { id: D1, created_at: fresh, outcome: 'content_removed', subject_user_id: ME }
    expect((await appeal('short')).status).toBe(400)
    expect((await appeal('x'.repeat(1001))).status).toBe(400)
    expect((await appeal('this is a long enough message')).status).toBe(200)
    expect(h.inserts[0]).toMatchObject({ decision_id: D1, appellant_id: ME, source: 'app' })
    h.insertErr = { code: '23505' }
    expect((await appeal('this is a long enough message')).status).toBe(409)
    h.insertErr = null
    h.decisionRow = { id: D1, created_at: new Date(Date.now() - 40 * 86_400_000).toISOString(), outcome: 'content_removed', subject_user_id: ME }
    expect((await appeal('this is a long enough message')).status).toBe(409)
    h.decisionRow = { id: D1, created_at: fresh, outcome: 'no_violation', subject_user_id: ME }
    expect((await appeal('this is a long enough message')).status).toBe(404)
  })

  it('reports/mine: four states only, post + comment + user reports merged, nothing about the decision or the reviewer', async () => {
    h.ownReports = [{ id: 'u1', target_type: 'comment', target_id: 'c1', reason: 'spam', created_at: '2026-10-01T10:00:00Z' }, { id: 'u2', target_type: 'user', target_id: 'p1', reason: 'scam', created_at: '2026-10-01T11:00:00Z' }]
    h.postReports = [{ id: 'p9', content_id: 'r9', reason: 'violence', created_at: '2026-10-01T12:00:00Z' }]
    h.queue = [{ status: 'dismissed', metadata: { source_id: 'u1' } }, { status: 'resolved', metadata: { source_id: 'u2' } }, { status: 'in_review', metadata: { source_id: 'p9' } }]
    // the fake returns the same queue rows for each lookup; ids that do not match fall back to "received"
    const out = (await (await get(MINE as never)).json()).reports as Array<{ id: string; status: string; target_id: string }>
    expect(Object.fromEntries(out.map((r) => [r.id, r.status]))).toEqual({ u1: 'no_violation', u2: 'actioned', p9: 'in_review' })
    expect(JSON.stringify(out)).not.toMatch(/resolved_by|reviewer|resolution|reported_by/)
    // the caller is the only filter on the post reports: the opaque per-reporter hash, never a query parameter
    expect(h.filters.some(([t, c]) => t === 'content_reports' && c === 'reporter_source_id')).toBe(true)
  })
})
