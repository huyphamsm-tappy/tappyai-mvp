import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controller V2 — Component 11: the ROUTE half of session security.
//
// The database is the authority: fn_session_revoke and fn_session_revoke_all
// refuse an Owner target themselves, and supabase/tests/c11_session_security
// proves that against a real PostgreSQL. These tests cover the half that lives
// here — that the handler refuses BEFORE mutating, that a denial is audited,
// and that the outcomes the SQL reports become the right HTTP answers.
//
// Contract §5.1.1 requires protection in both places. A test that only checked
// the SQL would leave the handler free to drift.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(() => ({ ok: true, retryAfter: 0 })),
  rpc: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, isSameOrigin: h.isSameOrigin }
})
vi.mock('@/lib/admin/permissions', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requirePermission: h.requirePermission }
})
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: h.writeAuditLog }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: h.rpc }) }))

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { DELETE } from './[sessionId]/route'
import { POST as FORCE_LOGOUT } from './force-logout/route'
import { GET } from './route'

const ADMIN_ID = '22222222-2222-2222-2222-222222222222'
const SUBJECT = '33333333-3333-3333-3333-333333333333'
const OWNER_ID = '11111111-1111-1111-1111-111111111111'
const SESSION = '44444444-4444-4444-4444-444444444444'

const ctx = () => ({
  user: { id: ADMIN_ID, email: 'admin@tappyai.com' },
  actor: { userId: ADMIN_ID, isOwner: false, roles: ['super_admin'], highestRole: 'super_admin' },
  decision: { allowed: true },
})

/** Route the mocked rpc() by function name, so each test states only what it cares about. */
function rpcPlan(plan: Record<string, unknown>) {
  h.rpc.mockImplementation((fn: string) => {
    if (!(fn in plan)) throw new Error(`unexpected rpc: ${fn}`)
    const value = plan[fn]
    return Promise.resolve(value as { data: unknown; error: unknown })
  })
}

const del = (id = SESSION) =>
  DELETE(new Request(`https://www.tappyai.com/api/admin/security/sessions/${id}`, { method: 'DELETE' }), {
    params: { sessionId: id },
  })

const force = (body: unknown) =>
  FORCE_LOGOUT(new Request('https://www.tappyai.com/api/admin/security/sessions/force-logout', {
    method: 'POST',
    body: JSON.stringify(body),
  }))

beforeEach(() => {
  vi.clearAllMocks()
  h.requirePermission.mockResolvedValue(ctx())
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 })
})

describe('C11 route — revoke one session', () => {
  it('refuses an Owner target with 403 and never calls the revoke function', async () => {
    rpcPlan({
      fn_session_subject: { data: OWNER_ID, error: null },
      fn_is_platform_owner: { data: true, error: null },
    })

    const res = await del()
    expect(res.status).toBe(403)
    // The point of the handler-side check: the mutation is never attempted.
    expect(h.rpc.mock.calls.map((c) => c[0])).not.toContain('fn_session_revoke')
  })

  it('audits the refusal — a denied attempt is the security-relevant fact', async () => {
    rpcPlan({
      fn_session_subject: { data: OWNER_ID, error: null },
      fn_is_platform_owner: { data: true, error: null },
    })

    await del()
    expect(h.writeAuditLog).toHaveBeenCalledTimes(1)
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'session.revoke_denied',
      targetId: OWNER_ID,
      metadata: expect.objectContaining({ reason: 'owner_protected' }),
    })
  })

  it('revokes a normal subject and audits the outcome', async () => {
    rpcPlan({
      fn_session_subject: { data: SUBJECT, error: null },
      fn_is_platform_owner: { data: false, error: null },
      fn_session_revoke: { data: [{ revoked: 1, reason: 'ok' }], error: null },
    })

    const res = await del()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { revoked: 1 } })
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({ action: 'session.revoked', targetId: SUBJECT })
  })

  it('returns 404 when the session does not resolve to a subject', async () => {
    rpcPlan({ fn_session_subject: { data: null, error: null } })
    const res = await del()
    expect(res.status).toBe(404)
    expect(h.rpc.mock.calls.map((c) => c[0])).not.toContain('fn_session_revoke')
  })

  it('honours a not_found verdict from the function itself', async () => {
    rpcPlan({
      fn_session_subject: { data: SUBJECT, error: null },
      fn_is_platform_owner: { data: false, error: null },
      fn_session_revoke: { data: [{ revoked: 0, reason: 'not_found' }], error: null },
    })
    expect((await del()).status).toBe(404)
  })

  it('rejects a non-UUID session id before touching the database', async () => {
    rpcPlan({})
    const res = await del('not-a-uuid')
    expect(res.status).toBe(422)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('refuses a cross-origin request', async () => {
    h.isSameOrigin.mockReturnValue(false)
    rpcPlan({})
    expect((await del()).status).toBe(403)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('rate limits with Retry-After', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    rpcPlan({})
    const res = await del()
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
  })

  it('never leaks the database error text', async () => {
    rpcPlan({
      fn_session_subject: { data: SUBJECT, error: null },
      fn_is_platform_owner: { data: false, error: null },
      fn_session_revoke: { data: null, error: { message: 'permission denied for schema auth' } },
    })
    const res = await del()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('schema auth')
  })
})

// Owner Decision A (2026-08-21) lets `users.account.ban` perform the session
// revocation that a ban is defined to include. These three assertions are the
// other half of that decision: the ban permission buys nothing HERE. Direct,
// arbitrary revocation stays on `security.sessions.revoke`, and this route is
// the only way to reach it from outside a ban.
describe('C11 routes — the ban permission opens no door here', () => {
  it('🔑 forced logout still demands security.sessions.revoke, and only that', async () => {
    await force({ userId: SUBJECT, reason: 'routine check' })
    expect(h.requirePermission).toHaveBeenCalledTimes(1)
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.SECURITY_SESSIONS_REVOKE)
  })

  it('🔑 no C11 route mentions the ban permission', async () => {
    // A route that accepted `users.account.ban` as an alternative would turn
    // "a ban may end sessions" into "a banner may end anyone's sessions".
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const f of [
      ['force-logout', 'route.ts'],
      ['[sessionId]', 'route.ts'],
      ['route.ts'],
    ]) {
      const src = readFileSync(join(__dirname, ...f), 'utf8')
      expect(src, f.join('/')).not.toContain('USERS_BAN')
      expect(src, f.join('/')).not.toContain('users.account.ban')
    }
  })

  it('the revocation helper carries no authorization of its own', async () => {
    // It is shared with the ban route, so a permission check inside it would
    // be a second authorization path — evaluated in a place neither caller
    // audits.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'lib', 'admin', 'sessions', 'revokeSessions.ts'),
      'utf8'
    )
    for (const forbidden of ['requirePermission', 'permissionEngine', 'PERMISSIONS', 'isOwner', 'roles']) {
      expect(src, `helper references ${forbidden}`).not.toContain(forbidden)
    }
  })
})

describe('C11 route — forced logout, when the revocation itself fails', () => {
  it('🔑 an RPC error is a 500, not a successful revocation of zero sessions', async () => {
    // Without the explicit error branch the failure falls through to the
    // success path and answers 200 `{revoked: 0}` — "nobody was signed in"
    // rather than "we could not tell".
    rpcPlan({
      fn_is_platform_owner: { data: false, error: null },
      fn_session_revoke_all: { data: null, error: { message: 'gotrue unreachable' } },
    })
    const res = await force({ userId: SUBJECT, reason: 'suspected compromise' })
    expect(res.status).toBe(500)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('🔑 the SQL function’s Owner refusal is honoured even if the pre-check disagreed', async () => {
    // §5.1.1 puts Owner protection in two independent places. The handler check
    // runs first, so the second one is only ever reached when the two disagree
    // — which is exactly the case it exists for, and the only case that can
    // test it.
    rpcPlan({
      fn_is_platform_owner: { data: false, error: null },
      fn_session_revoke_all: { data: [{ revoked: 0, reason: 'owner_protected' }], error: null },
    })
    const res = await force({ userId: SUBJECT, reason: 'racing the owner check' })
    expect(res.status).toBe(403)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('C11 route — forced logout', () => {
  it('refuses an Owner target, audits it, and never revokes', async () => {
    rpcPlan({ fn_is_platform_owner: { data: true, error: null } })
    const res = await force({ userId: OWNER_ID, reason: 'suspected compromise' })
    expect(res.status).toBe(403)
    expect(h.rpc.mock.calls.map((c) => c[0])).not.toContain('fn_session_revoke_all')
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({ action: 'session.revoke_denied' })
  })

  it('ends every session and records the stated reason', async () => {
    rpcPlan({
      fn_is_platform_owner: { data: false, error: null },
      fn_session_revoke_all: { data: [{ revoked: 3, reason: 'ok' }], error: null },
    })
    const res = await force({ userId: SUBJECT, reason: 'laptop stolen' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { revoked: 3 } })
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'session.force_logout',
      targetId: SUBJECT,
      metadata: expect.objectContaining({ revoked: 3, reason: 'laptop stolen' }),
    })
  })

  it('requires a reason — an unexplained forced logout is not accepted', async () => {
    rpcPlan({})
    expect((await force({ userId: SUBJECT })).status).toBe(422)
    expect((await force({ userId: SUBJECT, reason: '  ' })).status).toBe(422)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('reports an unknown or anonymous subject identically, as 404', async () => {
    rpcPlan({
      fn_is_platform_owner: { data: false, error: null },
      fn_session_revoke_all: { data: [{ revoked: 0, reason: 'not_found' }], error: null },
    })
    expect((await force({ userId: SUBJECT, reason: 'routine' })).status).toBe(404)
  })

  it('succeeds with zero when the subject simply had no sessions', async () => {
    rpcPlan({
      fn_is_platform_owner: { data: false, error: null },
      fn_session_revoke_all: { data: [{ revoked: 0, reason: 'ok' }], error: null },
    })
    const res = await force({ userId: SUBJECT, reason: 'routine' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { revoked: 0 } })
  })
})

describe('C11 route — inventory', () => {
  const list = (qs: string) =>
    GET(new Request(`https://www.tappyai.com/api/admin/security/sessions?${qs}`))

  it('returns what the function returned, and audits the read', async () => {
    const row = {
      id: SESSION, user_id: SUBJECT, state: 'active', created_at: '2026-08-14T00:00:00Z',
      last_refreshed_at: '2026-08-14T01:00:00Z', expires_at: null, aal: 'aal1', client_class: 'web',
    }
    rpcPlan({ fn_session_inventory: { data: [row], error: null } })

    const res = await list(`userId=${SUBJECT}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [row] })
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({ action: 'session.listed', targetId: SUBJECT })
  })

  it('rejects a missing or malformed userId', async () => {
    rpcPlan({})
    expect((await list('')).status).toBe(422)
    expect((await list('userId=nope')).status).toBe(422)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('refuses a page larger than the contracted cap', async () => {
    rpcPlan({})
    expect((await list(`userId=${SUBJECT}&limit=500`)).status).toBe(422)
    expect(h.rpc).not.toHaveBeenCalled()
  })
})
