import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The moderation desk's routes (owner 01/10): flag off = 404; the permission follows the outcome; a report is never a verdict;
// the ledger is written once; the right effect happens through the existing helpers; the person is told; a reporter is never named.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireAdminIdentity: vi.fn(),
  guard: vi.fn(),
  suspendUser: vi.fn(),
  banUser: vi.fn(),
  unsuspendUser: vi.fn(),
  unbanUser: vi.fn(),
  revoke: vi.fn(),
  emit: vi.fn(),
  audit: vi.fn(),
  target: null as Record<string, unknown> | null,
  strikes: [] as unknown[],
  queueItem: null as Record<string, unknown> | null,
  ledgerError: null as null | { code: string },
  ops: [] as Array<{ table: string; op: string; value?: unknown }>,
  prevDecision: { id: 'dec-prev' } as { id: string } | null,
  decision: null as Record<string, unknown> | null,
  appeal: null as Record<string, unknown> | null,
  ledgerInserted: false,
  siblings: [] as Array<{ id: string }>,
  siblingError: null as null | { message: string },
}))

vi.mock('@/lib/admin/rbac', async (orig) => ({ ...((await orig()) as Record<string, unknown>), isSameOrigin: () => true }))
vi.mock('@/lib/admin/permissions', async (orig) => ({ ...((await orig()) as Record<string, unknown>), requirePermission: h.requirePermission, requireAdminIdentity: h.requireAdminIdentity }))
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: async () => ({ ok: true }) }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: h.audit }))
vi.mock('@/lib/admin/users/identity', () => ({ guardMutationTarget: h.guard }))
vi.mock('@/lib/admin/users/accountStatusAdmin', () => ({ suspendUser: h.suspendUser, banUser: h.banUser, unsuspendUser: h.unsuspendUser, unbanUser: h.unbanUser, suspensionExpiry: (hours: number) => `in-${hours}h` }))
vi.mock('@/lib/admin/sessions/revokeSessions', () => ({ revokeAllSessions: h.revoke, revocationSucceeded: () => true }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: h.emit }))
vi.mock('@/lib/safety/moderationDecisions', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  resolveTarget: async () => h.target,
  activeStrikes: async () => h.strikes,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      const chain = () => b
      b.select = chain; b.eq = chain; b.in = chain; b.neq = chain; b.filter = chain; b.order = chain; b.limit = chain
      b.maybeSingle = async () => {
        if (table === 'moderation_queue') return { data: h.queueItem, error: null }
        if (table === 'moderation_decisions') return { data: h.ledgerInserted ? { id: 'dec-new' } : h.decision ?? h.prevDecision, error: null }
        if (table === 'moderation_appeals') return { data: h.appeal, error: null }
        return { data: null, error: null }
      }
      b.insert = (value: unknown) => {
        h.ops.push({ table, op: 'insert', value })
        const done = { data: null, error: table === 'moderation_decisions' ? h.ledgerError : null }
        if (table === 'moderation_decisions' && !h.ledgerError) h.ledgerInserted = true
        return Object.assign(Promise.resolve(done), { select: () => ({ maybeSingle: async () => ({ data: h.ledgerError ? null : { id: 'dec-new' }, error: h.ledgerError }) }) })
      }
      b.update = (value: unknown) => {
        h.ops.push({ table, op: 'update', value })
        // item update: .eq(id) awaited; sibling update: .eq().eq().in().neq().select() awaited (the deduplication, returns the closed ids)
        const c = Object.assign(Promise.resolve({ data: null, error: null }), {} as Record<string, unknown>)
        const self = () => c
        c.eq = self; c.in = self; c.neq = self
        c.select = () => Promise.resolve({ data: h.siblings, error: h.siblingError })
        return c
      }
      b.delete = () => { h.ops.push({ table, op: 'delete' }); return { eq: () => Promise.resolve({ data: null, error: null }) } }
      return b
    },
  }),
}))

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { POST as DECIDE } from './[id]/decide/route'
import { POST as LEGACY_RESOLVE } from './[id]/resolve/route'
import { GET as DESK } from './desk/route'
import { POST as APPEAL_CREATE } from './appeals/route'
import { POST as APPEAL_RESOLVE } from './appeals/[id]/resolve/route'

const hh = h
const ACTOR = '22222222-2222-4222-8222-222222222222'
const QID = '33333333-3333-4333-8333-333333333333'
const SUBJECT = '44444444-4444-4444-8444-444444444444'
const TARGET = '55555555-5555-4555-8555-555555555555'
const REASON = 'Confirmed after reading the thread'

const decide = (body: unknown) => DECIDE(new Request(`https://www.tappyai.com/api/admin/moderation/${QID}/decide`, { method: 'POST', body: JSON.stringify(body) }), { params: { id: QID } })
const target = (over: Record<string, unknown> = {}) => ({ kind: 'comment', subjectId: SUBJECT, feature: 'comment', exists: true, context: { summary: 'x', body: 'bad words', reviewId: 'rv1', createdAt: '2026-10-01T00:00:00Z', parentCommentId: null }, ...over })

describe('moderation desk routes', () => {
  const prev = process.env.MODERATION_ADMIN_ENABLED
  beforeEach(() => {
    process.env.MODERATION_ADMIN_ENABLED = 'true'
    for (const f of [h.requirePermission, h.requireAdminIdentity, h.guard, h.suspendUser, h.banUser, h.unsuspendUser, h.unbanUser, h.revoke, h.emit, h.audit]) f.mockReset()
    h.requireAdminIdentity.mockResolvedValue({ user: { id: ACTOR, email: 'mod@tappyai.com' }, actor: { userId: ACTOR, isOwner: false, roles: ['admin'], capabilities: [] } })
    h.requirePermission.mockResolvedValue({})
    h.guard.mockResolvedValue(null)
    h.revoke.mockResolvedValue({ revoked: 2 })
    h.emit.mockResolvedValue({ id: 'n1' })
    h.target = target(); h.strikes = []; h.ledgerError = null; h.ops = []; h.decision = null; h.appeal = null; hh.ledgerInserted = false; h.siblings = []; h.siblingError = null
    h.queueItem = { id: QID, status: 'pending', target_type: 'comment', target_id: TARGET }
  })
  afterEach(() => { if (prev === undefined) delete process.env.MODERATION_ADMIN_ENABLED; else process.env.MODERATION_ADMIN_ENABLED = prev })

  const ledger = () => h.ops.find((o) => o.table === 'moderation_decisions' && o.op === 'insert')?.value as Record<string, unknown> | undefined
  const queueUpdate = () => h.ops.find((o) => o.table === 'moderation_queue' && o.op === 'update')?.value as Record<string, unknown> | undefined

  it('flag OFF (the default): every desk route answers 404 with an empty body and touches nothing', async () => {
    delete process.env.MODERATION_ADMIN_ENABLED
    const r1 = await decide({ outcome: 'no_violation', reason: REASON })
    const r2 = await DESK(new Request('https://www.tappyai.com/api/admin/moderation/desk'))
    const r3 = await APPEAL_CREATE(new Request('https://www.tappyai.com/x', { method: 'POST', body: '{}' }))
    const r4 = await APPEAL_RESOLVE(new Request('https://www.tappyai.com/x', { method: 'POST', body: '{}' }), { params: { id: QID } })
    for (const r of [r1, r2, r3, r4]) { expect(r.status).toBe(404); expect(await r.text()).toBe('') }
    expect(h.requireAdminIdentity).not.toHaveBeenCalled()
    expect(h.ops).toEqual([])
  })

  it('the permission follows the outcome — a moderator keeps dismiss/hide, suspend/ban/delete stay separate', async () => {
    const asked = async (body: Record<string, unknown>, tgt = target()) => {
      h.requirePermission.mockClear(); h.target = tgt; h.ops = []; hh.ledgerInserted = false
      await decide({ reason: REASON, ...body })
      return h.requirePermission.mock.calls.map((c) => c[1]).filter((p) => p !== PERMISSIONS.MODERATION_QUEUE_READ)
    }
    expect(await asked({ outcome: 'no_violation' })).toEqual([PERMISSIONS.MODERATION_REPORT_DISMISS])
    expect(await asked({ outcome: 'warning', rule_group: 'spam' })).toEqual([PERMISSIONS.MODERATION_CONTENT_HIDE])
    expect(await asked({ outcome: 'remove_comment', rule_group: 'harassment' })).toEqual([PERMISSIONS.MODERATION_CONTENT_DELETE]) // a comment is deleted
    expect(await asked({ outcome: 'remove_post', rule_group: 'harassment' }, target({ kind: 'review', feature: 'post' }))).toEqual([PERMISSIONS.MODERATION_CONTENT_HIDE]) // a post is only hidden
    expect(await asked({ outcome: 'restrict', rule_group: 'spam', restrict_days: 7 })).toEqual([PERMISSIONS.USERS_SUSPEND])
    expect(await asked({ outcome: 'ban', rule_group: 'child_safety' })).toEqual([PERMISSIONS.USERS_BAN])
  })

  it('no violation: closes the item as dismissed, writes NO ledger row, sanctions and notifies nobody', async () => {
    const r = await decide({ outcome: 'no_violation', reason: REASON })
    expect(r.status).toBe(200)
    expect(ledger()).toBeUndefined()
    expect(queueUpdate()).toMatchObject({ status: 'dismissed' })
    expect(h.suspendUser).not.toHaveBeenCalled(); expect(h.banUser).not.toHaveBeenCalled(); expect(h.emit).not.toHaveBeenCalled()
  })

  it('hold hides a POST only, keeps the item open (in_review), no ledger row, no notice', async () => {
    h.target = target({ kind: 'review', feature: 'post' }); h.queueItem = { ...(h.queueItem as object), target_type: 'review' }
    const r = await decide({ outcome: 'hold', reason: REASON })
    expect(r.status).toBe(200)
    expect(h.ops.find((o) => o.table === 'reviews')?.value).toEqual({ publication_state: 'RESTRICTED' })
    expect(queueUpdate()).toMatchObject({ status: 'in_review' })
    expect(ledger()).toBeUndefined(); expect(h.emit).not.toHaveBeenCalled()
    h.target = target() // a comment cannot be held
    expect((await decide({ outcome: 'hold', reason: REASON })).status).toBe(422)
  })

  it('a warning is on the ledger with NO strike and no effect on the account; the person is notified (rule, penalty, appeal) without the reporter or the text', async () => {
    const r = await decide({ outcome: 'warning', rule_group: 'spam', reason: REASON })
    expect(r.status).toBe(200)
    expect(ledger()).toMatchObject({ outcome: 'warning', strike: false, strike_expires_at: null, rule_group: 'spam', feature: 'comment', subject_user_id: SUBJECT, reviewer_id: ACTOR })
    expect(h.suspendUser).not.toHaveBeenCalled(); expect(h.banUser).not.toHaveBeenCalled()
    const note = h.emit.mock.calls[0][0] as { userId: string; body: string; title: string }
    expect(note.userId).toBe(SUBJECT)
    expect(note.body).toContain('Spam'); expect(note.body).toContain('support@tappyai.com'); expect(note.body).not.toContain('bad words'); expect(note.body).not.toContain(REASON)
  })

  it('remove a comment: snapshot kept for an appeal, the comment deleted, a strike that expires', async () => {
    expect((await decide({ outcome: 'remove_post', rule_group: 'harassment', reason: REASON })).status).toBe(422) // the kind must match the target
    expect(ledger()).toBeUndefined()
    const r = await decide({ outcome: 'remove_comment', rule_group: 'harassment', reason: REASON })
    expect(r.status).toBe(200)
    expect(ledger()).toMatchObject({ outcome: 'content_removed', strike: true, content_type: 'comment', severity: 2 })
    expect((ledger() as { strike_expires_at: string | null }).strike_expires_at).toBeTruthy()
    expect((ledger() as { content_snapshot: { body: string } }).content_snapshot.body).toBe('bad words')
    expect(h.ops.some((o) => o.table === 'review_comments' && o.op === 'delete')).toBe(true)
  })

  it('restrict: days required, goes through suspendUser (the existing path) and the target guard', async () => {
    expect((await decide({ outcome: 'restrict', rule_group: 'spam', reason: REASON })).status).toBe(422)
    const r = await decide({ outcome: 'restrict', rule_group: 'spam', restrict_days: 7, reason: REASON })
    expect(r.status).toBe(200)
    expect(h.guard).toHaveBeenCalled()
    expect(h.suspendUser).toHaveBeenCalledWith(expect.anything(), SUBJECT, 'in-168h')
    expect(ledger()).toMatchObject({ outcome: 'restricted', restrict_days: 7, strike: true })
  })

  it('ban: refused below severity 3 unless the strike threshold is reached; at severity 3 it bans and revokes sessions', async () => {
    expect((await decide({ outcome: 'ban', rule_group: 'harassment', reason: REASON })).status).toBe(422)
    expect(h.banUser).not.toHaveBeenCalled(); expect(ledger()).toBeUndefined()
    const r = await decide({ outcome: 'ban', rule_group: 'harassment', severity: 3, reason: REASON })
    expect(r.status).toBe(200)
    expect(h.banUser).toHaveBeenCalled(); expect(h.revoke).toHaveBeenCalledWith(expect.anything(), SUBJECT)
    expect(ledger()).toMatchObject({ outcome: 'banned', severity: 3, strike_expires_at: null })
    // threshold route: 4 active strikes → the 5th may ban at severity 2
    h.ops = []; hh.ledgerInserted = false; h.banUser.mockClear()
    h.strikes = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, rule_group: 'spam', feature: 'comment', severity: 1, strike_expires_at: null }))
    expect((await decide({ outcome: 'ban', rule_group: 'harassment', reason: REASON })).status).toBe(200)
  })

  it('the rule caps the penalty: spam can never be a ban, impersonation never above severity 2', async () => {
    expect((await decide({ outcome: 'ban', rule_group: 'spam', severity: 3, reason: REASON })).status).toBe(422)
    expect((await decide({ outcome: 'warning', rule_group: 'impersonation', severity: 3, reason: REASON })).status).toBe(422)
    expect(h.banUser).not.toHaveBeenCalled(); expect(ledger()).toBeUndefined()
  })

  it('a penalty needs a rule group and a real target; a missing target cannot be sanctioned', async () => {
    expect((await decide({ outcome: 'warning', reason: REASON })).status).toBe(422)
    h.target = target({ exists: false, subjectId: null })
    expect((await decide({ outcome: 'warning', rule_group: 'spam', reason: REASON })).status).toBe(422)
    expect(h.emit).not.toHaveBeenCalled()
  })

  it('a retry after a half-finished attempt reuses the ledger row (23505) — no second strike, the effect still happens', async () => {
    h.ledgerError = { code: '23505' }
    const r = await decide({ outcome: 'restrict', rule_group: 'spam', restrict_days: 3, reason: REASON })
    expect(r.status).toBe(200)
    expect((await r.json()).data.decision_id).toBe('dec-prev')
    expect(h.suspendUser).toHaveBeenCalled()
  })

  it('an item that is already resolved is refused (409); the body is validated (reason too short = 422)', async () => {
    h.queueItem = { ...(h.queueItem as object), status: 'resolved' }
    expect((await decide({ outcome: 'no_violation', reason: REASON })).status).toBe(409)
    h.queueItem = { id: QID, status: 'pending', target_type: 'comment', target_id: TARGET }
    expect((await decide({ outcome: 'no_violation', reason: 'short' })).status).toBe(422)
    expect((await decide({ outcome: 'delete_everything', reason: REASON })).status).toBe(422)
  })

  it('with the desk on, the old resolve route refuses content actions (they must reach the ledger) but still dismisses', async () => {
    const legacy = (kind: string) => LEGACY_RESOLVE(new Request('https://www.tappyai.com/x', { method: 'POST', body: JSON.stringify({ kind, reason: REASON }) }), { params: { id: QID } })
    expect((await legacy('hide')).status).toBe(409)
    expect((await legacy('delete')).status).toBe(409)
    expect(h.ops).toEqual([])
    h.queueItem = { id: QID, status: 'pending', target_type: 'review', target_id: TARGET }
    expect((await legacy('dismiss')).status).toBe(200)
  })

  it('deduplication: a real decision closes the other open reports on the SAME target, with the evidence in their resolution', async () => {
    h.siblings = [{ id: 's1' }, { id: 's2' }]
    const r = await decide({ outcome: 'warning', rule_group: 'spam', reason: REASON })
    expect(r.status).toBe(200)
    const updates = h.ops.filter((o) => o.table === 'moderation_queue' && o.op === 'update').map((o) => o.value as Record<string, unknown>)
    expect(updates).toHaveLength(2)                                   // the item, then its siblings
    expect(updates[1]).toMatchObject({ status: 'resolved', resolved_by: ACTOR })
    expect(String(updates[1].resolution)).toContain(QID)               // evidence: which decision covered them
    expect(String(updates[1].resolution)).toContain(REASON)
    const entry = h.audit.mock.calls[0][0] as { metadata: Record<string, unknown> }
    expect(entry.metadata.siblings_closed).toBe(2)
  })

  it('a dismissal or a hold never closes the other reports', async () => {
    h.siblings = [{ id: 's1' }]
    await decide({ outcome: 'no_violation', reason: REASON })
    expect(h.ops.filter((o) => o.table === 'moderation_queue' && o.op === 'update')).toHaveLength(1)
    h.ops = []; hh.ledgerInserted = false
    h.target = target({ kind: 'review', feature: 'post' }); h.queueItem = { ...(h.queueItem as object), target_type: 'review' }   // a hold hides a POST only
    expect((await decide({ outcome: 'hold', reason: REASON })).status).toBe(200)
    expect(h.ops.filter((o) => o.table === 'moderation_queue' && o.op === 'update')).toHaveLength(1)
  })

  it('a failure closing the siblings never undoes the decision', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.siblingError = { message: 'db down' }
    const r = await decide({ outcome: 'warning', rule_group: 'spam', reason: REASON })
    expect(r.status).toBe(200)
    expect(((h.audit.mock.calls[0][0]) as { metadata: Record<string, unknown> }).metadata.siblings_closed).toBe(0)
    err.mockRestore()
  })

  it('the audit entry names the decision and the rule — never the reported text or the reporter', async () => {
    await decide({ outcome: 'warning', rule_group: 'spam', reason: REASON })
    const entry = h.audit.mock.calls[0][0] as { action: string; metadata: Record<string, unknown> }
    expect(entry.action).toBe('moderation.warn')
    expect(JSON.stringify(entry)).not.toContain('bad words')
    expect(Object.keys(entry.metadata)).not.toContain('reported_by')
  })
})
