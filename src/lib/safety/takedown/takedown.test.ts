import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dueAt, clockState, WINDOW_HOURS } from './clock'
import { CreateTakedownSchema, ActionTakedownSchema } from './schema'
import { createTakedown, executeTakedown, rejectOrAskInfo, listOpenTakedowns, ACTION_FOR_TARGET } from './service'
import { alertTakedownRecipients, newRequestAlert } from './notify'
import { readFileSync } from 'node:fs'

// A tiny in-memory stand-in for the service-role client: enough of the query builder for the takedown service.
type Row = Record<string, unknown>
function fakeAdmin(seed: Record<string, Row[]> = {}, failOn: string[] = []) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed))
  let n = 0
  const client = {
    tables,
    from(name: string) {
      tables[name] ??= []
      const q = { op: 'select' as 'select' | 'insert' | 'update' | 'delete', payload: undefined as Row | undefined, eq: [] as Array<[string, unknown]>, ins: [] as Array<[string, unknown[]]>, wantRows: false, lim: 1000, ord: undefined as { col: string; asc: boolean } | undefined }
      const matches = (r: Row) => q.eq.every(([c, v]) => r[c] === v) && q.ins.every(([c, vs]) => vs.includes(r[c]))
      const run = () => {
        if (failOn.includes(`${q.op}:${name}`)) return { data: null, error: { message: 'boom' } }
        if (q.op === 'insert') { const row = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, created_at: '2026-11-25T00:00:00.000Z', status: 'received', action_taken: null, actioned_at: null, actioned_by: null, ...q.payload } as Row; tables[name].push(row); return { data: [row], error: null } }
        let rows = tables[name].filter(matches)
        if (q.op === 'update') { rows.forEach((r) => Object.assign(r, q.payload)); return { data: rows, error: null } }
        if (q.op === 'delete') { tables[name] = tables[name].filter((r) => !matches(r)); return { data: rows, error: null } }
        if (q.ord) rows = [...rows].sort((a, b) => (String(a[q.ord!.col]) < String(b[q.ord!.col]) ? -1 : 1) * (q.ord!.asc ? 1 : -1))
        return { data: rows.slice(0, q.lim), error: null }
      }
      const b: Record<string, unknown> = {
        select: () => b, insert: (p: Row) => { q.op = 'insert'; q.payload = p; return b }, update: (p: Row) => { q.op = 'update'; q.payload = p; return b }, delete: () => { q.op = 'delete'; return b },
        eq: (c: string, v: unknown) => { q.eq.push([c, v]); return b }, in: (c: string, vs: unknown[]) => { q.ins.push([c, vs]); return b },
        order: (col: string, o?: { ascending?: boolean }) => { q.ord = { col, asc: o?.ascending !== false }; return b }, limit: (k: number) => { q.lim = k; return b },
        maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : null, error: r.error } },
        then: (res: (v: unknown) => unknown) => res(run()),
      }
      return b
    },
  }
  return client as unknown as SupabaseClient & { tables: Record<string, Row[]> }
}

const U = '11111111-1111-4111-8111-111111111111'
const REVIEW = '22222222-2222-4222-8222-222222222222'
const COMMENT = '33333333-3333-4333-8333-333333333333'
const ADMIN = '99999999-9999-4999-8999-999999999999'
const NOW = new Date('2026-11-25T10:00:00.000Z')
const world = () => fakeAdmin({
  reviews: [{ id: REVIEW, user_id: U, place_name: 'Quán A', body: 'nội dung', publication_state: null, created_at: '2026-11-20T00:00:00Z' }],
  review_comments: [{ id: COMMENT, review_id: REVIEW, user_id: U, body: 'bình luận', created_at: '2026-11-21T00:00:00Z', hidden_at: null, hidden_by: null }],
  plan_shares: [{ id: 'abc_123', owner_id: U, plan: { title: 'Đà Lạt' }, created_at: '2026-11-22T00:00:00Z' }],
  profiles: [{ id: U, full_name: 'A', bio: 'b', created_at: '2026-01-01T00:00:00Z' }],
  authority_takedowns: [],
})
const input = (over: Record<string, unknown> = {}) => ({ source: 'authority' as const, agency: 'Cơ quan A', reference_no: 'CV-123', urgency: 'standard_24h' as const, received_at: '2026-11-25T08:00:00.000Z', target_type: 'review' as const, target_id: REVIEW, ...over })

describe('the clock', () => {
  it('24 h, 6 h and 48 h from RECEIPT', () => {
    const r = new Date('2026-11-25T08:00:00Z')
    expect(dueAt(r, 'standard_24h').toISOString()).toBe('2026-11-26T08:00:00.000Z')
    expect(dueAt(r, 'emergency_6h').toISOString()).toBe('2026-11-25T14:00:00.000Z')
    expect(dueAt(r, 'complaint_48h').toISOString()).toBe('2026-11-27T08:00:00.000Z')
    expect(WINDOW_HOURS).toEqual({ standard_24h: 24, emergency_6h: 6, complaint_48h: 48 })
  })
  it('ok, at risk (half the window gone), overdue, closed', () => {
    const row = (status: 'received' | 'needs_info' | 'actioned' | 'rejected') => ({ status, received_at: '2026-11-25T00:00:00.000Z', due_at: '2026-11-26T00:00:00.000Z' })
    expect(clockState(row('received'), new Date('2026-11-25T06:00:00Z'))).toMatchObject({ state: 'ok', minutesLeft: 18 * 60 })
    expect(clockState(row('received'), new Date('2026-11-25T12:00:00Z')).state).toBe('at_risk')
    expect(clockState(row('needs_info'), new Date('2026-11-25T20:00:00Z')).state).toBe('at_risk') // the clock keeps running while information is awaited
    expect(clockState(row('received'), new Date('2026-11-26T00:00:01Z'))).toMatchObject({ state: 'overdue' })
    expect(clockState(row('actioned'), new Date('2026-12-30T00:00:00Z'))).toEqual({ state: 'closed', minutesLeft: null })
    expect(clockState(row('rejected'), NOW).state).toBe('closed')
  })
})

describe('what may be recorded', () => {
  const ok = { source: 'authority', agency: 'Bộ X', urgency: 'standard_24h', received_at: '2026-11-25T08:00:00Z', target_type: 'review', target_id: REVIEW }
  it('accepts a complete request', () => { expect(CreateTakedownSchema.safeParse(ok).success).toBe(true) })
  it('refuses a missing agency, a non-uuid id for a post, an invalid time, a mismatched window', () => {
    expect(CreateTakedownSchema.safeParse({ ...ok, agency: ' ' }).success).toBe(false)
    expect(CreateTakedownSchema.safeParse({ ...ok, target_id: 'not-a-uuid' }).success).toBe(false)
    expect(CreateTakedownSchema.safeParse({ ...ok, received_at: 'yesterday' }).success).toBe(false)
    expect(CreateTakedownSchema.safeParse({ ...ok, urgency: 'complaint_48h' }).success).toBe(false) // authority + complaint window
    expect(CreateTakedownSchema.safeParse({ ...ok, source: 'user_complaint' }).success).toBe(false) // complaint + 24 h
    expect(CreateTakedownSchema.safeParse({ ...ok, source: 'user_complaint', urgency: 'complaint_48h' }).success).toBe(true)
    expect(CreateTakedownSchema.safeParse({ ...ok, target_type: 'plan_share', target_id: 'abc_123' }).success).toBe(true)
    expect(CreateTakedownSchema.safeParse({ ...ok, target_type: 'plan_share', target_id: '../x' }).success).toBe(false)
  })
  it('reject and needs_info need a reason; execute does not', () => {
    expect(ActionTakedownSchema.safeParse({ action: 'execute' }).success).toBe(true)
    expect(ActionTakedownSchema.safeParse({ action: 'reject' }).success).toBe(false)
    expect(ActionTakedownSchema.safeParse({ action: 'reject', notes: 'không đủ căn cứ' }).success).toBe(true)
    expect(ActionTakedownSchema.safeParse({ action: 'needs_info', notes: 'x' }).success).toBe(false)
  })
})

describe('recording a request', () => {
  it('starts the clock at RECEIPT and records who recorded it', async () => {
    const a = world()
    const r = await createTakedown(a, input(), ADMIN, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.row).toMatchObject({ status: 'received', due_at: '2026-11-26T08:00:00.000Z', recorded_by: ADMIN, target_type: 'review', target_id: REVIEW })
  })
  it('refuses content that does not exist, a receipt time in the future, and a second open request for the same content', async () => {
    const a = world()
    expect(await createTakedown(a, input({ target_id: '44444444-4444-4444-8444-444444444444' }), ADMIN, NOW)).toEqual({ ok: false, error: 'target_not_found' })
    expect(await createTakedown(a, input({ received_at: '2026-11-25T12:00:00.000Z' }), ADMIN, NOW)).toEqual({ ok: false, error: 'received_in_future' })
    expect((await createTakedown(a, input(), ADMIN, NOW)).ok).toBe(true)
    expect(await createTakedown(a, input(), ADMIN, NOW)).toEqual({ ok: false, error: 'duplicate_open' })
  })
  it('a database failure is reported, never swallowed', async () => {
    expect(await createTakedown(fakeAdmin({ reviews: [{ id: REVIEW, user_id: U }] }, ['insert:authority_takedowns']), input(), ADMIN, NOW)).toEqual({ ok: false, error: 'db' })
  })
})

describe('carrying a request out', () => {
  const record = async (a: ReturnType<typeof world>, over: Record<string, unknown> = {}) => { const r = await createTakedown(a, input(over), ADMIN, NOW); if (!r.ok) throw new Error('setup'); return r.row }
  it('a post is hidden through the existing publication state, a copy is kept, the request is closed', async () => {
    const a = world(); const row = await record(a)
    const r = await executeTakedown(a, row.id, ADMIN, 'đã gỡ', { now: () => NOW })
    expect(r).toMatchObject({ ok: true, action: 'hidden' })
    expect(a.tables.reviews[0].publication_state).toBe('RESTRICTED')
    expect(a.tables.authority_takedowns[0]).toMatchObject({ status: 'actioned', action_taken: 'hidden', actioned_by: ADMIN, actioned_at: NOW.toISOString() })
    expect(a.tables.authority_takedowns[0].content_snapshot).toMatchObject({ kind: 'review', body: 'nội dung', user_id: U })
  })
  it('a comment is hidden by a moderator and NOT deleted', async () => {
    const a = world(); const row = await record(a, { target_type: 'comment', target_id: COMMENT })
    await executeTakedown(a, row.id, ADMIN, undefined, { now: () => NOW })
    expect(a.tables.review_comments).toHaveLength(1)
    expect(a.tables.review_comments[0]).toMatchObject({ hidden_at: NOW.toISOString(), hidden_by: 'moderator' })
  })
  it('a shared plan link is removed, with a copy of the plan kept in the register', async () => {
    const a = world(); const row = await record(a, { target_type: 'plan_share', target_id: 'abc_123' })
    expect(await executeTakedown(a, row.id, ADMIN, undefined, { now: () => NOW })).toMatchObject({ ok: true, action: 'deleted' })
    expect(a.tables.plan_shares).toHaveLength(0)
    expect(a.tables.authority_takedowns[0].content_snapshot).toMatchObject({ kind: 'plan_share', plan: { title: 'Đà Lạt' } })
  })
  it('an account is banned and its sessions revoked through the injected helpers; without the helper nothing happens', async () => {
    const a = world(); const row = await record(a, { target_type: 'user', target_id: U })
    expect(await executeTakedown(a, row.id, ADMIN, undefined, { now: () => NOW })).toEqual({ ok: false, error: 'effect_failed' })
    expect(a.tables.authority_takedowns[0].status).toBe('received')
    const banUser = vi.fn(async () => undefined); const revokeSessions = vi.fn(async () => true)
    expect(await executeTakedown(a, row.id, ADMIN, undefined, { banUser, revokeSessions, now: () => NOW })).toMatchObject({ ok: true, action: 'banned' })
    expect(banUser).toHaveBeenCalledWith(a, U, expect.stringContaining('CV-123')); expect(revokeSessions).toHaveBeenCalledWith(a, U)
  })
  it('every kind of target has an effect', () => { expect(Object.keys(ACTION_FOR_TARGET).sort()).toEqual(['comment', 'plan_share', 'review', 'user']) })
  it('a request that is already closed is left alone (no second action)', async () => {
    const a = world(); const row = await record(a)
    await executeTakedown(a, row.id, ADMIN, undefined, { now: () => NOW })
    expect(await executeTakedown(a, row.id, ADMIN, undefined, { now: () => NOW })).toEqual({ ok: false, error: 'already_closed' })
    expect(await executeTakedown(a, '55555555-5555-4555-8555-555555555555', ADMIN, undefined)).toEqual({ ok: false, error: 'not_found' })
  })
  it('if the effect fails the request stays OPEN (the clock keeps running)', async () => {
    const a = fakeAdmin({ reviews: [{ id: REVIEW, user_id: U, place_name: 'x', body: 'y', publication_state: null, created_at: 'z' }], authority_takedowns: [] }, ['update:reviews'])
    const row = await record(a as never)
    expect(await executeTakedown(a, row.id, ADMIN, undefined, { now: () => NOW })).toEqual({ ok: false, error: 'effect_failed' })
    expect(a.tables.authority_takedowns[0].status).toBe('received')
  })
  it('content that is already gone closes the request as "none" instead of leaving it open forever', async () => {
    const a = world(); const row = await record(a)
    a.tables.reviews.length = 0
    const r = await executeTakedown(a, row.id, ADMIN, undefined, { now: () => NOW })
    expect(r).toMatchObject({ ok: true, action: 'none' })
    expect(String(a.tables.authority_takedowns[0].notes)).toMatch(/no longer existed/)
  })
  it('reject needs a reason and closes without touching the content; needs_info keeps it open', async () => {
    const a = world(); const row = await record(a)
    expect(await rejectOrAskInfo(a, row.id, ADMIN, 'needs_info', 'xin thêm quyết định', NOW)).toMatchObject({ ok: true, row: { status: 'needs_info' } })
    expect((await listOpenTakedowns(a))!.map((r) => r.id)).toEqual([row.id])
    expect(await rejectOrAskInfo(a, row.id, ADMIN, 'reject', 'không thuộc thẩm quyền', NOW)).toMatchObject({ ok: true, row: { status: 'rejected', action_taken: 'none' } })
    expect(a.tables.reviews[0].publication_state).toBeNull()
    expect(await listOpenTakedowns(a)).toEqual([])
  })
})

describe('the alerts', () => {
  it('a new request alerts the recipients at once; an emergency escalates to the backups; text carries no agency or content', async () => {
    const emit = vi.fn(async () => ({ id: 'n1' }))
    const a = newRequestAlert('emergency_6h', '2026-11-25T14:00:00.000Z')
    expect(a.escalate).toBe(true); expect(a.title).toMatch(/KHẨN/); expect(a.body).toMatch(/21:00/) // 14:00 UTC = 21:00 in Vietnam
    const r = await alertTakedownRecipients(a, { recipients: ['r1', 'r2'], backups: ['b1'], emit: emit as never })
    expect(r).toEqual({ sent: 2, escalated: 1, recipients: 2 })
    expect(newRequestAlert('standard_24h', '2026-11-26T08:00:00.000Z').escalate).toBe(false)
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(/Cơ quan|CV-123|nội dung/)
  })
  it('a failing channel never throws', async () => {
    const r = await alertTakedownRecipients({ title: 't', body: 'b' }, { recipients: ['r1'], emit: (async () => { throw new Error('down') }) as never })
    expect(r.sent).toBe(0)
  })
})

describe('wiring', () => {
  it('the migration is the register: service-role only, RLS on, no delete', () => {
    const sql = readFileSync('supabase/migrations/20261209_authority_takedowns.sql', 'utf8')
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/); expect(sql).toMatch(/REVOKE ALL ON public\.authority_takedowns FROM anon, authenticated/)
    expect(sql).toMatch(/BEFORE DELETE ON public\.authority_takedowns/); expect(sql).not.toMatch(/CREATE POLICY/)
    for (const u of ['standard_24h', 'emergency_6h', 'complaint_48h']) expect(sql).toContain(u)
  })
  it('the routes sit behind the moderation admin flag and the clock cron is scheduled', () => {
    for (const f of ['src/app/api/admin/takedowns/route.ts', 'src/app/api/admin/takedowns/[id]/route.ts', 'src/app/api/cron/takedown-clock/route.ts']) expect(readFileSync(f, 'utf8'), f).toMatch(/if \(!moderationAdminEnabled\(\)\) return new (Response|NextResponse)\(null, \{ status: 404 \}\)/)
    const crons = (JSON.parse(readFileSync('vercel.json', 'utf8')).crons as Array<{ path: string; schedule: string }>).filter((c) => c.path.startsWith('/api/cron/takedown-clock'))
    expect(crons.length).toBeGreaterThanOrEqual(4)
    expect(new Set(crons.map((c) => c.schedule)).size).toBe(crons.length)
    for (const c of crons) expect(c.schedule, 'a daily entry (the plan allows one run per day per entry)').toMatch(/^0 \d+ \* \* \*$/)
  })
})
