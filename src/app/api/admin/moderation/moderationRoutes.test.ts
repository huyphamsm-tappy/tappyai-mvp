import { describe, it, expect, vi, beforeEach } from 'vitest'

// Module 09 — the ROUTE half.
//
// `moderationService.test.ts` covers the projection and the ordering. This
// covers who is refused, which permission each action asks for, and what the
// audit trail is allowed to contain.
//
// 🔑 THE ASSERTION THIS FILE EXISTS FOR: the permission depends on the ACTION.
// `12_RBAC` §3 grants moderator Dismiss and Hide and WITHHOLDS Delete. A route
// that asked for one permission regardless of `kind` would hand every reviewer
// the one power the contract keeps from them.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(),
  writeAuditLog: vi.fn(),
  auditDecision: vi.fn(),
  item: null as Record<string, unknown> | null,
  itemError: null as { message: string } | null,
  actionInsert: null as Record<string, unknown> | null,
  actionError: null as { message: string } | null,
  queueUpdate: null as Record<string, unknown> | null,
  reviewUpdate: null as Record<string, unknown> | null,
  reviewDeleted: false,
  listResult: { data: [] as unknown, error: null as { message: string } | null },
}))

const engine = vi.hoisted(() => ({
  can: () => true,
  authorize: () => ({ allowed: true, reason: 'ROLE_GRANT' }),
}))

vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, isSameOrigin: h.isSameOrigin }
})
vi.mock('@/lib/admin/permissions', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requirePermission: h.requirePermission }
})
vi.mock('@/lib/admin/permissions/engine', () => ({ permissionEngine: engine }))
vi.mock('@/lib/admin/permissions/decisionAudit', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, auditAuthorizationDecision: h.auditDecision }
})
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: h.writeAuditLog }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient() }))

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { GET as LIST } from './route'
import { POST as RESOLVE } from './[id]/resolve/route'

const ACTOR = '22222222-2222-2222-2222-222222222222'
const QUEUE_ID = '33333333-3333-3333-3333-333333333333'
const REVIEW_ID = '44444444-4444-4444-4444-444444444444'
const REASON = 'confirmed policy violation after review'

function fakeClient() {
  const table = (name: string) => {
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown) => {
            if (name === 'moderation_queue') return Promise.resolve(h.listResult).then(res)
            return Promise.resolve({ data: null, error: null }).then(res)
          }
        }
        if (prop === 'maybeSingle') {
          return async () => ({ data: h.item, error: h.itemError })
        }
        if (prop === 'insert') {
          return (v: Record<string, unknown>) => {
            h.actionInsert = v
            return { ...proxy, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: h.actionError }).then(r) }
          }
        }
        if (prop === 'update') {
          return (v: Record<string, unknown>) => {
            if (name === 'reviews') h.reviewUpdate = v
            else h.queueUpdate = v
            return { eq: () => Promise.resolve({ data: null, error: null }) }
          }
        }
        if (prop === 'delete') {
          return () => {
            h.reviewDeleted = true
            return { eq: () => Promise.resolve({ data: null, error: null }) }
          }
        }
        return () => proxy
      },
    })
    return proxy
  }
  return { from: (n: string) => table(n) }
}

const ctx = () => ({
  user: { id: ACTOR, email: 'mod@tappyai.com' },
  actor: { userId: ACTOR, isOwner: false, roles: ['moderator'], capabilities: [] },
  decision: { allowed: true, reason: 'ROLE_GRANT' },
})

const list = (qs = '') => LIST(new Request(`https://www.tappyai.com/api/admin/moderation${qs}`))
const resolve = (body: unknown, id = QUEUE_ID) =>
  RESOLVE(
    new Request(`https://www.tappyai.com/api/admin/moderation/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: { id } }
  )

beforeEach(() => {
  vi.clearAllMocks()
  h.item = { id: QUEUE_ID, status: 'pending', target_type: 'review', target_id: REVIEW_ID }
  h.itemError = null
  h.actionInsert = null
  h.actionError = null
  h.queueUpdate = null
  h.reviewUpdate = null
  h.reviewDeleted = false
  h.listResult = { data: [{ id: QUEUE_ID, type: 'review_report', status: 'pending', priority: 1 }], error: null }
  h.requirePermission.mockResolvedValue(ctx())
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 })
})

// ===========================================================================
// 🔑 The permission depends on the action — 12_RBAC §3
// ===========================================================================
describe('🔑 authorization follows the action', () => {
  it('the LIST asks for moderation.queue.read', async () => {
    await list()
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.MODERATION_QUEUE_READ)
  })

  it.each([
    ['dismiss', 'MODERATION_REPORT_DISMISS'],
    ['hide', 'MODERATION_CONTENT_HIDE'],
    ['restore', 'MODERATION_CONTENT_HIDE'],
    ['delete', 'MODERATION_CONTENT_DELETE'],
  ] as const)('%s asks for %s', async (kind, key) => {
    await resolve({ kind, reason: REASON })
    expect(h.requirePermission).toHaveBeenCalledTimes(1)
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS[key])
  })

  it('🔑 DELETE and DISMISS do not share a permission — §3 withholds delete from moderator', async () => {
    await resolve({ kind: 'dismiss', reason: REASON })
    const dismissPerm = h.requirePermission.mock.calls[0][1]
    vi.clearAllMocks()
    h.requirePermission.mockResolvedValue(ctx())
    await resolve({ kind: 'delete', reason: REASON })
    expect(h.requirePermission.mock.calls[0][1]).not.toBe(dismissPerm)
  })

  it('a refused actor changes nothing', async () => {
    h.requirePermission.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { status: 403, code: 'FORBIDDEN' })
    )
    const res = await resolve({ kind: 'delete', reason: REASON })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(h.actionInsert).toBeNull()
    expect(h.reviewDeleted).toBe(false)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('exactly ONE permission is asked for — no compound gate', async () => {
    await resolve({ kind: 'hide', reason: REASON })
    expect(h.requirePermission).toHaveBeenCalledTimes(1)
  })

  // Mutations M17 and M18 both survived every test above: one widened the
  // registry's role set, the other collapsed the PAGE's derivation. Neither is
  // reachable through the route handlers, and both hand a moderator the delete
  // power `12_RBAC` §3 withholds.
  it('🔑 §3’s role matrix for the five moderation permissions, pinned', async () => {
    const { permissionRegistry } = await import('@/lib/admin/permissions/registry')
    const roles = (id: string) => [...(permissionRegistry.get(id as never)!.defaultRoles as readonly string[])].sort()
    const MOD_PLUS = ['admin', 'moderator', 'super_admin']
    const ADMIN_PLUS = ['admin', 'super_admin']

    expect(roles('moderation.queue.read')).toEqual(MOD_PLUS)
    expect(roles('moderation.queue.assign')).toEqual(MOD_PLUS)
    expect(roles('moderation.report.dismiss')).toEqual(MOD_PLUS)
    expect(roles('moderation.content.hide')).toEqual(MOD_PLUS)
    // §3: "Moderation — Delete content | ❌ analyst | ❌ moderator | ✅ | ✅"
    expect(roles('moderation.content.delete')).toEqual(ADMIN_PLUS)
  })

  it('🔑 analyst holds none of them — §3 gives analyst ❌ on every moderation row', async () => {
    const { permissionRegistry } = await import('@/lib/admin/permissions/registry')
    for (const id of [
      'moderation.queue.read', 'moderation.queue.assign', 'moderation.report.dismiss',
      'moderation.content.hide', 'moderation.content.delete',
    ]) {
      expect(permissionRegistry.get(id as never)!.defaultRoles, id).not.toContain('analyst')
    }
  })

  it('🔑 the PAGE derives each capability from its own permission', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const page = readFileSync(
      join(__dirname, '..', '..', '..', 'admin', 'moderation', 'page.tsx'),
      'utf8'
    )
    expect(page).toMatch(/dismiss:\s*permissionEngine\.can\(\s*ctx\.actor,\s*PERMISSIONS\.MODERATION_REPORT_DISMISS\s*\)/)
    expect(page).toMatch(/hide:\s*permissionEngine\.can\(\s*ctx\.actor,\s*PERMISSIONS\.MODERATION_CONTENT_HIDE\s*\)/)
    expect(page).toMatch(/delete:\s*permissionEngine\.can\(\s*ctx\.actor,\s*PERMISSIONS\.MODERATION_CONTENT_DELETE\s*\)/)
    // The anchors are real — guards the three regexes against matching nothing.
    for (const k of ['MODERATION_REPORT_DISMISS', 'MODERATION_CONTENT_HIDE', 'MODERATION_CONTENT_DELETE']) {
      expect(page, k).toContain(k)
    }
  })

  it('the routes perform no role comparison', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const f of [['route.ts'], ['[id]', 'resolve', 'route.ts']]) {
      const raw = readFileSync(join(__dirname, ...f), 'utf8')
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
      expect(code.length, f.join('/')).toBeLessThan(raw.length)
      for (const r of ['super_admin', 'analyst', 'highestRole']) {
        expect(code, `${f.join('/')} references ${r}`).not.toContain(r)
      }
    }
  })
})

// ===========================================================================
// 🔑 ADR-026 — nothing about the reporter reaches the audit log
// ===========================================================================
describe('🔑 ADR-026 I-5 — provenance never reaches the audit log', () => {
  it('🔑 the LIST audit entry records a count and the filter — and NOTHING else', async () => {
    // `toMatchObject` allows extra keys, so mutation M03 added the whole item
    // list to the metadata and survived. The audit log is `audit.log.read`,
    // admin+ — a wider population than `moderation.queue.read` — so anything
    // added here is read by more people than may read the queue.
    await list('?status=pending')
    const entry = h.writeAuditLog.mock.calls[0][0]
    expect(entry).toMatchObject({ action: 'moderation.queue_listed' })
    expect(Object.keys(entry.metadata).sort()).toEqual(['returned', 'status'])
    expect(entry.metadata).toEqual({ returned: 1, status: 'pending' })
    expect(JSON.stringify(entry)).not.toContain('reporter_source_id')
  })

  it('🔑 the RESOLVE audit metadata carries exactly its four keys', async () => {
    await resolve({ kind: 'hide', reason: REASON })
    const entry = h.writeAuditLog.mock.calls[0][0]
    expect(Object.keys(entry.metadata).sort()).toEqual(['kind', 'notes', 'queue_id', 'reason'])
  })

  it('the RESOLVE audit entry carries the decision, never provenance', async () => {
    await resolve({ kind: 'hide', reason: REASON })
    const entry = h.writeAuditLog.mock.calls[0][0]
    expect(entry).toMatchObject({ action: 'moderation.hide_content', targetId: REVIEW_ID })
    expect(entry.metadata).toMatchObject({ kind: 'hide', reason: REASON })
    expect(JSON.stringify(entry)).not.toContain('reporter_source_id')
    expect(JSON.stringify(entry)).not.toContain('metadata:')
  })
})

// ===========================================================================
// The content effect goes through the GATE's mechanism
// ===========================================================================
describe('content actions use the Content Safety Gate’s own state', () => {
  it('🔑 hide sets publication_state RESTRICTED — not a parallel is_hidden flag', async () => {
    await resolve({ kind: 'hide', reason: REASON })
    expect(h.reviewUpdate).toEqual({ publication_state: 'RESTRICTED' })
  })

  it('restore sets PUBLISHED', async () => {
    await resolve({ kind: 'restore', reason: REASON })
    expect(h.reviewUpdate).toEqual({ publication_state: 'PUBLISHED' })
  })

  it('dismiss touches no content at all', async () => {
    await resolve({ kind: 'dismiss', reason: REASON })
    expect(h.reviewUpdate).toBeNull()
    expect(h.reviewDeleted).toBe(false)
  })

  it('🔑 a content action against a NON-review target is refused', async () => {
    // The gate owns reviews and nothing else. Hiding a music track through a
    // reviews update would silently do nothing at all.
    h.item = { id: QUEUE_ID, status: 'pending', target_type: 'music_track', target_id: REVIEW_ID }
    const res = await resolve({ kind: 'hide', reason: REASON })
    expect(res.status).toBe(422)
    expect(h.reviewUpdate).toBeNull()
  })

  it('dismiss IS allowed against a non-review target', async () => {
    h.item = { id: QUEUE_ID, status: 'pending', target_type: 'music_track', target_id: REVIEW_ID }
    expect((await resolve({ kind: 'dismiss', reason: REASON })).status).toBe(200)
  })
})

// ===========================================================================
// The queue is a worklist — one decision per item
// ===========================================================================
describe('one decision per item', () => {
  it('🔑 an already-resolved item is a 409, not a second decision', async () => {
    h.item = { id: QUEUE_ID, status: 'resolved', target_type: 'review', target_id: REVIEW_ID }
    const res = await resolve({ kind: 'dismiss', reason: REASON })
    expect(res.status).toBe(409)
    expect(h.actionInsert).toBeNull()
  })

  it('an already-dismissed item is a 409 too', async () => {
    h.item = { id: QUEUE_ID, status: 'dismissed', target_type: 'review', target_id: REVIEW_ID }
    expect((await resolve({ kind: 'hide', reason: REASON })).status).toBe(409)
  })

  it('an unknown item is a 404 and writes no action', async () => {
    h.item = null
    const res = await resolve({ kind: 'dismiss', reason: REASON })
    expect(res.status).toBe(404)
    expect(h.actionInsert).toBeNull()
  })

  it('dismiss closes as DISMISSED; a real decision closes as RESOLVED', async () => {
    await resolve({ kind: 'dismiss', reason: REASON })
    expect(h.queueUpdate).toMatchObject({ status: 'dismissed', resolved_by: ACTOR })
    h.queueUpdate = null
    await resolve({ kind: 'hide', reason: REASON })
    expect(h.queueUpdate).toMatchObject({ status: 'resolved' })
  })

  it('🔑 the decision is recorded BEFORE the queue closes', async () => {
    // If the close fails, an open item with a recorded decision is visible and
    // re-runnable. A closed item with no decision is not accountable.
    h.actionError = { message: 'insert failed' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await resolve({ kind: 'dismiss', reason: REASON })
    expect(res.status).toBe(500)
    expect(h.queueUpdate).toBeNull()
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('the action records the actor, the queue item and the reason', async () => {
    await resolve({ kind: 'delete', reason: REASON, notes: 'ticket 91' })
    expect(h.actionInsert).toMatchObject({
      queue_id: QUEUE_ID, action: 'delete_content', actor_id: ACTOR,
      target_content_id: REVIEW_ID, reason: REASON, notes: 'ticket 91',
    })
  })
})

// ===========================================================================
// Validation
// ===========================================================================
describe('validation', () => {
  it('🔑 a decision with no real reason is refused', async () => {
    // §4.5 makes `reason` NOT NULL, and a moderation decision with no recorded
    // motive is unreadable six months later.
    expect((await resolve({ kind: 'dismiss', reason: 'too short' })).status).toBe(422)
    expect(h.actionInsert).toBeNull()
  })

  it('a whitespace-only reason is still no reason', async () => {
    expect((await resolve({ kind: 'dismiss', reason: '                    ' })).status).toBe(422)
  })

  it('an unknown kind is refused rather than defaulted', async () => {
    expect((await resolve({ kind: 'ban', reason: REASON })).status).toBe(422)
    expect(h.requirePermission).not.toHaveBeenCalled()
  })

  it('an unknown body field is REJECTED, not ignored', async () => {
    expect((await resolve({ kind: 'dismiss', reason: REASON, actor_id: 'someone' })).status).toBe(422)
  })

  it('🔑 a malformed id is refused BEFORE authorization', async () => {
    const res = await resolve({ kind: 'dismiss', reason: REASON }, 'not-a-uuid')
    expect(res.status).toBe(422)
    expect(h.requirePermission).not.toHaveBeenCalled()
  })

  it('an unimplemented list filter is a 422, not an unfiltered queue', async () => {
    expect((await list('?assignedTo=me')).status).toBe(422)
  })

  it('a cross-origin request changes nothing', async () => {
    h.isSameOrigin.mockReturnValue(false)
    expect((await resolve({ kind: 'delete', reason: REASON })).status).toBe(403)
    expect(h.reviewDeleted).toBe(false)
  })

  it('a rate-limited request changes nothing', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    expect((await resolve({ kind: 'delete', reason: REASON })).status).toBe(429)
    expect(h.reviewDeleted).toBe(false)
  })
})

// ===========================================================================
// Failure is never silent
// ===========================================================================
describe('failure states', () => {
  it('🔑 an unreadable queue is a 500, not an empty one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.listResult = { data: null, error: { message: 'relation does not exist' } }
    const res = await list()
    expect(res.status).toBe(500)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('a genuinely empty queue is a 200 with no items', async () => {
    h.listResult = { data: [], error: null }
    const res = await list()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [] })
  })

  it('an unreadable item is a 500 and touches nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.itemError = { message: 'boom' }
    const res = await resolve({ kind: 'delete', reason: REASON })
    expect(res.status).toBe(500)
    expect(h.reviewDeleted).toBe(false)
  })
})
