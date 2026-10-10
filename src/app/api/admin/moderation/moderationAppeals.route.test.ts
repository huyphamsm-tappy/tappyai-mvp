import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AdminError } from '@/lib/admin/rbac'

// Appeals and who may reach the desk (owner 01/10). Only staff reach any desk route (a person without admin identity is refused before
// anything is read); an appeal is resolved once, by someone allowed to; a reversal restores what the decision took and lifts the
// restriction only when nothing else still justifies it.

const ACTOR = '22222222-2222-4222-8222-222222222222'
const SUBJECT = '44444444-4444-4444-8444-444444444444'
const APPEAL = '66666666-6666-4666-8666-666666666666'
const DEC = '77777777-7777-4777-8777-777777777777'

const h = vi.hoisted(() => ({
  identity: vi.fn(), permission: vi.fn(), unsuspend: vi.fn(), unban: vi.fn(), emit: vi.fn(), audit: vi.fn(),
  appeal: null as Record<string, unknown> | null,
  decision: null as Record<string, unknown> | null,
  others: [] as Array<Record<string, unknown>>,
  wonAppeals: [] as Array<Record<string, unknown>>,
  ops: [] as Array<{ table: string; op: string; value?: unknown }>,
  insertErr: null as null | { code: string },
  status: null as null | Record<string, unknown>,
  actions: [] as Array<Record<string, unknown>>,          // moderation_actions rows of kind hide_content on the post
  contentDecisions: [] as Array<Record<string, unknown>>, // other decisions on the same post
  holds: [] as Array<Record<string, unknown>>,            // open queue items on the post that are in_review
  restoreRows: [{ id: 'rv1' }] as Array<Record<string, unknown>>, // rows the conditional restore changed
  where: [] as Array<[string, unknown]>,                  // the .eq() conditions of the last update
}))
vi.mock('@/lib/admin/rbac', async (orig) => ({ ...((await orig()) as Record<string, unknown>), isSameOrigin: () => true }))
vi.mock('@/lib/admin/permissions', async (orig) => ({ ...((await orig()) as Record<string, unknown>), requireAdminIdentity: h.identity, requirePermission: h.permission }))
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: async () => ({ ok: true }) }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: h.audit }))
vi.mock('@/lib/admin/users/accountStatusAdmin', () => ({ unsuspendUser: h.unsuspend, unbanUser: h.unban }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: h.emit }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let neqUsed = false
      const eqs: Record<string, unknown> = {}
      const b: Record<string, unknown> = {}
      b.select = () => b; b.in = () => b; b.order = () => b; b.limit = () => b
      b.eq = (c: string, v: unknown) => { eqs[c] = v; return b }
      b.neq = () => { neqUsed = true; return b }
      b.maybeSingle = async () => ({ data: table === 'moderation_appeals' ? h.appeal : table === 'moderation_decisions' ? (h.decision && /reason/.test('reason') ? { ...h.decision, reason: 'the reason written by the reviewer' } : h.decision) : table === 'account_status' ? h.status : null, error: null })
      b.insert = async (value: unknown) => { h.ops.push({ table, op: 'insert', value }); return { error: h.insertErr } }
      b.update = (value: unknown) => { h.ops.push({ table, op: 'update', value }); if (table === 'reviews') h.where = []; return { eq: (c1: string, v1: unknown) => { if (table === 'reviews') h.where.push([c1, v1]); return Object.assign(Promise.resolve({ error: null }), { eq: (c2: string, v2: unknown) => { if (table === 'reviews') h.where.push([c2, v2]); return Object.assign(Promise.resolve({ error: null }), { select: async () => ({ data: h.restoreRows, error: null }) }) } }) } } }
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: table === 'moderation_actions' ? h.actions : table === 'moderation_queue' ? h.holds : table === 'moderation_decisions' && neqUsed ? (eqs.content_id ? h.contentDecisions : h.others) : table === 'moderation_appeals' ? h.wonAppeals : [], error: null }).then(res)
      return b
    },
  }),
}))

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { POST as RESOLVE } from './appeals/[id]/resolve/route'
import { POST as CREATE } from './appeals/route'
import { GET as DESK } from './desk/route'
import { POST as DECIDE } from './[id]/decide/route'
import { hideProvenanceNotes } from '@/lib/safety/postHideProvenance'

const resolve = (body: unknown) => RESOLVE(new Request('https://www.tappyai.com/x', { method: 'POST', body: JSON.stringify(body) }), { params: { id: APPEAL } })
const NOTE = 'Checked the whole thread again'
const dec = (over: Record<string, unknown> = {}) => ({ id: DEC, queue_id: null, subject_user_id: SUBJECT, reviewer_id: '99999999-9999-4999-8999-999999999999', outcome: 'content_removed', restrict_days: null, content_type: 'comment', content_id: 'cm1', content_snapshot: { review_id: 'rv1', body: 'my comment', created_at: '2026-10-01T00:00:00Z', parent_comment_id: null }, created_at: '2026-10-01T00:00:00Z', ...over })

describe('who reaches the desk, and appeals', () => {
  const prev = process.env.MODERATION_ADMIN_ENABLED
  beforeEach(() => {
    process.env.MODERATION_ADMIN_ENABLED = 'true'; delete process.env.MODERATION_APPEAL_DIFFERENT_REVIEWER
    for (const f of [h.identity, h.permission, h.unsuspend, h.unban, h.emit, h.audit]) f.mockReset()
    h.identity.mockResolvedValue({ user: { id: ACTOR, email: 'a@tappyai.com' }, actor: { userId: ACTOR, isOwner: false, roles: ['admin'], capabilities: [] } })
    h.permission.mockResolvedValue({}); h.emit.mockResolvedValue({ id: 'n1' })
    h.appeal = { id: APPEAL, decision_id: DEC, status: 'pending' }; h.decision = dec(); h.others = []; h.wonAppeals = []; h.ops = []; h.insertErr = null
    h.actions = []; h.contentDecisions = []; h.holds = []; h.restoreRows = [{ id: 'rv1' }]
    h.status = { is_banned: true, ban_reason: 'the reason written by the reviewer', is_suspended: true, suspended_until: new Date('2026-10-08T00:00:00Z').toISOString() }
  })
  afterEach(() => { if (prev === undefined) delete process.env.MODERATION_ADMIN_ENABLED; else process.env.MODERATION_ADMIN_ENABLED = prev })

  it('a person without admin identity is refused (401/403) by EVERY desk route before anything is read or written', async () => {
    h.identity.mockRejectedValue(new AdminError('FORBIDDEN', 'no', 403))
    const bodies = { method: 'POST', body: '{}' }
    const rs = await Promise.all([
      DESK(new Request('https://www.tappyai.com/x')),
      DECIDE(new Request('https://www.tappyai.com/x', bodies), { params: { id: DEC } }),
      CREATE(new Request('https://www.tappyai.com/x', bodies)),
      RESOLVE(new Request('https://www.tappyai.com/x', bodies), { params: { id: APPEAL } }),
    ])
    expect(rs.map((r) => r.status)).toEqual([403, 403, 403, 403])
    expect(h.ops).toEqual([]); expect(h.permission).not.toHaveBeenCalled()
    h.identity.mockRejectedValue(new AdminError('UNAUTHORIZED', 'no', 401))
    expect((await DESK(new Request('https://www.tappyai.com/x'))).status).toBe(401)
  })

  it('every desk route reads its permission from the registry — and the page is guarded by it too', async () => {
    const { readFileSync } = await import('node:fs')
    const page = readFileSync('src/app/(app)/admin/moderation/page.tsx', 'utf8')
    expect(page).toMatch(/requirePagePermission\(PERMISSIONS\.MODERATION_QUEUE_READ\)/)
    for (const f of ['desk/route.ts', '[id]/decide/route.ts', 'appeals/route.ts', 'appeals/[id]/resolve/route.ts']) {
      const src = readFileSync(`src/app/api/admin/moderation/${f}`, 'utf8')
      expect(src, f).toMatch(/requireAdminIdentity/); expect(src, f).toMatch(/requirePermission/); expect(src, f).toMatch(/moderationAdminEnabled\(\)/)
    }
  })

  it('resolving an appeal needs the admin-level permission; a resolved appeal is 409', async () => {
    expect((await resolve({ result: 'upheld', note: NOTE })).status).toBe(200)
    expect(h.permission).toHaveBeenCalledWith(expect.anything(), PERMISSIONS.MODERATION_CONTENT_DELETE)
    h.appeal = { id: APPEAL, decision_id: DEC, status: 'reversed' }
    expect((await resolve({ result: 'upheld', note: NOTE })).status).toBe(409)
    expect((await resolve({ result: 'maybe', note: NOTE })).status).toBe(422)
    expect((await resolve({ result: 'upheld', note: 'x' })).status).toBe(422)
  })

  it('upheld: nothing is restored, nothing lifted; the person is told the decision stands', async () => {
    const r = await resolve({ result: 'upheld', note: NOTE })
    expect((await r.json()).data.status).toBe('upheld')
    expect(h.ops.filter((o) => o.op === 'insert' && o.table === 'review_comments')).toEqual([])
    expect(h.unsuspend).not.toHaveBeenCalled(); expect(h.unban).not.toHaveBeenCalled()
    expect((h.emit.mock.calls[0][0] as { body: string }).body).toContain('giữ nguyên')
  })

  it('reversed: a removed comment is restored from the snapshot; if the snapshot was purged it says so', async () => {
    let r = await resolve({ result: 'reversed', note: NOTE })
    expect((await r.json()).data.restored.content).toBe(true)
    expect(h.ops.find((o) => o.table === 'review_comments')?.value).toMatchObject({ id: 'cm1', review_id: 'rv1', user_id: SUBJECT, body: 'my comment' })
    h.ops = []; h.decision = dec({ content_snapshot: null })
    r = await resolve({ result: 'reversed', note: NOTE })
    expect((await r.json()).data.restored.content).toBe(false)
  })

  it('reversed: a post comes back (publication state); a restriction is lifted unless ANOTHER standing decision justifies it', async () => {
    h.decision = dec({ content_type: 'review', content_snapshot: null })
    await resolve({ result: 'reversed', note: NOTE })
    expect(h.ops.find((o) => o.table === 'reviews')?.value).toEqual({ publication_state: 'PUBLISHED' })

    h.ops = []; h.decision = dec({ outcome: 'restricted', restrict_days: 7, content_type: 'user', content_snapshot: null }) // created 2026-10-01 + 7 days = the suspension in h.status
    await resolve({ result: 'reversed', note: NOTE })
    expect(h.unsuspend).toHaveBeenCalledWith(expect.anything(), SUBJECT)

    h.unsuspend.mockClear(); h.ops = []; h.appeal = { id: APPEAL, decision_id: DEC, status: 'pending' }
    h.others = [{ id: 'other', restrict_days: 30, created_at: new Date().toISOString() }] // a recent, longer restriction still stands
    const r = await resolve({ result: 'reversed', note: NOTE })
    expect(h.unsuspend).not.toHaveBeenCalled()
    expect((await r.json()).data.restored.restriction_lifted).toBe(false)
  })

  it('reversed: a restriction or lock a staff member set BY HAND (not the one this decision wrote) is never lifted (review 02/10)', async () => {
    h.decision = dec({ outcome: 'restricted', restrict_days: 7, content_type: 'user', content_snapshot: null })
    h.status = { is_banned: false, ban_reason: null, is_suspended: true, suspended_until: new Date('2027-01-01T00:00:00Z').toISOString() } // a different, manual suspension
    let r = await resolve({ result: 'reversed', note: NOTE })
    expect(h.unsuspend).not.toHaveBeenCalled(); expect((await r.json()).data.restored.restriction_lifted).toBe(false)
    h.appeal = { id: APPEAL, decision_id: DEC, status: 'pending' }; h.ops = []
    h.decision = dec({ outcome: 'banned', content_type: 'user', content_snapshot: null })
    h.status = { is_banned: true, ban_reason: 'a note typed by hand', is_suspended: false, suspended_until: null }
    r = await resolve({ result: 'reversed', note: NOTE })
    expect(h.unban).not.toHaveBeenCalled(); expect((await r.json()).data.restored.ban_lifted).toBe(false)
  })

  it('reversed ban: unbanned only when no other ban stands', async () => {
    h.decision = dec({ outcome: 'banned', content_type: 'user', content_snapshot: null })
    await resolve({ result: 'reversed', note: NOTE })
    expect(h.unban).toHaveBeenCalledWith(expect.anything(), SUBJECT)
    h.unban.mockClear(); h.others = [{ id: 'other-ban', restrict_days: null, created_at: '2026-09-01T00:00:00Z' }]
    await resolve({ result: 'reversed', note: NOTE })
    expect(h.unban).not.toHaveBeenCalled()
  })

  describe('a reversed lock/restriction republishes the post ONLY on proof that this decision hid it', () => {
    const QID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const proof = (over: Record<string, unknown> = {}, prov: Record<string, unknown> = {}) => ({
      id: 'act1', queue_id: QID, created_at: '2026-10-02T00:00:00Z',
      notes: hideProvenanceNotes({ decision_id: DEC, before: 'PUBLISHED', after: 'RESTRICTED', ...prov }), ...over,
    })
    const banOnPost = (over: Record<string, unknown> = {}) => dec({ outcome: 'banned', content_type: 'review', content_id: 'rv1', queue_id: QID, content_snapshot: null, ...over })
    const postUpdates = () => h.ops.filter((o) => o.table === 'reviews' && o.op === 'update')
    beforeEach(() => { h.decision = banOnPost(); h.actions = [proof()] })

    it('success, and the post really was hidden by the reversed decision: published again (ban and restriction)', async () => {
      let r = await resolve({ result: 'reversed', note: NOTE })
      expect((await r.json()).data.restored.content).toBe(true)
      expect(postUpdates().map((o) => o.value)).toEqual([{ publication_state: 'PUBLISHED' }])
      expect(h.where).toEqual([['id', 'rv1'], ['publication_state', 'RESTRICTED']]) // conditional: only a post that is still RESTRICTED changes
      h.ops = []; h.appeal = { id: APPEAL, decision_id: DEC, status: 'pending' }
      h.decision = banOnPost({ outcome: 'restricted', restrict_days: 7 })
      r = await resolve({ result: 'reversed', note: NOTE })
      expect((await r.json()).data.restored.content).toBe(true)
      expect(postUpdates()).toHaveLength(1)
    })

    it('a legacy post (state NULL before the hide, visible) counts as visible', async () => {
      h.actions = [proof({}, { before: null })]
      expect((await (await resolve({ result: 'reversed', note: NOTE })).json()).data.restored.content).toBe(true)
    })

    it('appeal rejected: nothing is restored, the post is not touched', async () => {
      const r = await resolve({ result: 'upheld', note: NOTE })
      expect((await r.json()).data.restored.content).toBeNull()
      expect(postUpdates()).toHaveLength(0)
    })

    it('the post was already restricted before the decision (safety gate / hold: the hide started from a non-visible state): NOT restored', async () => {
      h.actions = [proof({}, { before: 'UNDER_REVIEW' })]
      expect((await (await resolve({ result: 'reversed', note: NOTE })).json()).data.restored.content).toBe(false)
      expect(postUpdates()).toHaveLength(0)
      h.actions = [proof({}, { before: 'RESTRICTED' })]
      expect((await (await resolve({ result: 'reversed', note: NOTE })).json()).data.restored.content).toBe(false)
      expect(postUpdates()).toHaveLength(0)
    })

    it('another decision on the same post still stands: NOT restored; once THAT one is reversed too, it is', async () => {
      h.contentDecisions = [{ id: 'other-decision' }]
      expect((await (await resolve({ result: 'reversed', note: NOTE })).json()).data.restored.content).toBe(false)
      expect(postUpdates()).toHaveLength(0)
      h.appeal = { id: APPEAL, decision_id: DEC, status: 'pending' }; h.wonAppeals = [{ decision_id: 'other-decision' }]
      expect((await (await resolve({ result: 'reversed', note: NOTE })).json()).data.restored.content).toBe(true)
    })

    it('a reviewer hold is still active on the post: NOT restored', async () => {
      h.holds = [{ id: 'queue-in-review' }]
      expect((await (await resolve({ result: 'reversed', note: NOTE })).json()).data.restored.content).toBe(false)
      expect(postUpdates()).toHaveLength(0)
    })

    it('ANY other hide on the post blocks the restore, whenever it was recorded (a later hold, an earlier one, a legacy hide): the time order is not trusted', async () => {
      for (const created_at of ['2026-10-03T00:00:00Z', '2026-09-01T00:00:00Z', '2026-10-02T00:00:00Z']) {
        h.ops = []; h.appeal = { id: APPEAL, decision_id: DEC, status: 'pending' }
        h.actions = [proof(), { id: 'act2', queue_id: 'other-queue', created_at, notes: 'held while I read the thread' }]
        expect((await (await resolve({ result: 'reversed', note: NOTE })).json()).data.restored.content).toBe(false)
        expect(postUpdates()).toHaveLength(0)
      }
    })

    it('a decision with SEVERAL records (it met more than one starting state): restored only if every one of them was visible before', async () => {
      h.actions = [proof(), proof({ id: 'act1b' }, { before: null })]
      expect((await (await resolve({ result: 'reversed', note: NOTE })).json()).data.restored.content).toBe(true)
      h.appeal = { id: APPEAL, decision_id: DEC, status: 'pending' }; h.ops = []
      h.actions = [proof(), proof({ id: 'act1b' }, { before: 'UNDER_REVIEW' })]
      expect((await (await resolve({ result: 'reversed', note: NOTE })).json()).data.restored.content).toBe(false)
      expect(postUpdates()).toHaveLength(0) // ops were reset before this second run
    })

    it('no trustworthy provenance: FAIL CLOSED (no record; a record of another decision; another queue item; text that is not a record; no queue link)', async () => {
      const cases: Array<() => void> = [
        () => { h.actions = [] },
        () => { h.actions = [proof({}, { decision_id: 'some-other-decision' })] },
        () => { h.actions = [proof({ queue_id: 'not-this-queue-item' })] },
        () => { h.actions = [proof({ notes: 'a reviewer wrote this by hand' })] },
        () => { h.actions = [proof({ notes: '{"tappy_hide_provenance":2,"decision_id":"' + DEC + '","before":"PUBLISHED","after":"RESTRICTED"}' })] },
        () => { h.actions = [proof({}, { after: 'PUBLISHED' })] },
        () => { h.actions = [proof()]; h.decision = banOnPost({ queue_id: null }) },
      ]
      for (const arrange of cases) {
        h.ops = []; h.appeal = { id: APPEAL, decision_id: DEC, status: 'pending' }; h.decision = banOnPost(); arrange()
        expect((await (await resolve({ result: 'reversed', note: NOTE })).json()).data.restored.content).toBe(false)
        expect(postUpdates()).toHaveLength(0)
      }
    })

    it('the post changed state before the restore (the conditional update matched nothing): not recorded as restored', async () => {
      h.restoreRows = []
      const r = await resolve({ result: 'reversed', note: NOTE })
      expect(r.status).toBe(200)
      expect((await r.json()).data.restored.content).toBe(false)
      expect(h.audit.mock.calls[0][0].metadata.restored.content).toBe(false)
    })
  })

  it('the same reviewer is RECORDED; with MODERATION_APPEAL_DIFFERENT_REVIEWER=true it is refused', async () => {
    h.decision = dec({ reviewer_id: ACTOR })
    const r = await resolve({ result: 'upheld', note: NOTE })
    expect((await r.json()).data.same_reviewer).toBe(true)
    expect(h.ops.find((o) => o.table === 'moderation_appeals' && o.op === 'update')?.value).toMatchObject({ same_reviewer: true })
    h.appeal = { id: APPEAL, decision_id: DEC, status: 'pending' }; h.ops = []
    process.env.MODERATION_APPEAL_DIFFERENT_REVIEWER = 'true'
    expect((await resolve({ result: 'upheld', note: NOTE })).status).toBe(403)
    expect(h.ops).toEqual([])
  })

  it('an email appeal is recorded for the decision subject, once', async () => {
    const call = () => CREATE(new Request('https://www.tappyai.com/x', { method: 'POST', body: JSON.stringify({ decision_id: DEC, message: 'sent from my other email address' }) }))
    expect((await call()).status).toBe(200)
    expect(h.ops.find((o) => o.table === 'moderation_appeals')?.value).toMatchObject({ decision_id: DEC, appellant_id: SUBJECT, source: 'email' })
    h.insertErr = { code: '23505' }
    expect((await call()).status).toBe(409)
  })
})
