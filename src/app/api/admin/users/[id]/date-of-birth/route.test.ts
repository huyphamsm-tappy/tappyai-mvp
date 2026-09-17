/**
 * Module 08 — POST /api/admin/users/[id]/date-of-birth.
 *
 * The DATABASE half of this path already has a suite: 13 tests in
 * `supabase/tests/user_demographics_boundary.test.ts` cover the audit written
 * in-transaction, the refusal-writes-nothing rule and the full
 * lockout-and-rescue scenario. None of that is repeated here.
 *
 * This file covers the half the database cannot see: who reaches the RPC at
 * all, and what the response is allowed to say. The route IS the authority on
 * the first question — `admin_set_user_date_of_birth()` is `service_role`-only
 * and asks no questions about the caller's role, because by the time it runs
 * the credential has already been decided.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AdminError } from '@/lib/admin/rbac'

const h = vi.hoisted(() => ({
  granted: true,
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })),
  writeAuditLog: vi.fn(),
  writeAuditLogAwaited: vi.fn(async () => true),
  /** Every RPC the route makes, in order, as [name, args]. */
  rpcCalls: [] as Array<[string, Record<string, unknown>]>,
  /** Every `.from(table).select(cols)` the route makes. */
  selects: [] as Array<[string, unknown]>,
  ownerFlag: { data: false as unknown, error: null as { message: string } | null },
  profileRow: { data: { id: '' } as unknown, error: null as { message: string } | null },
  correction: { data: 'corrected' as unknown, error: null as { message: string } | null },
}))

vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, isSameOrigin: h.isSameOrigin }
})
vi.mock('@/lib/admin/permissions', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    requirePermission: async () => {
      if (!h.granted) throw new AdminError('FORBIDDEN', 'Permission denied', 403)
      return {
        user: { id: ACTOR, email: 'owner@tappyai.com' },
        actor: { userId: ACTOR, isOwner: false, roles: ['super_admin'] },
      }
    },
  }
})
vi.mock('@/lib/admin/permissions/decisionAudit', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, auditActorRole: () => 'super_admin' }
})
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))
vi.mock('@/lib/admin/audit', () => ({
  writeAuditLog: h.writeAuditLog,
  writeAuditLogAwaited: h.writeAuditLogAwaited,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      h.rpcCalls.push([name, args])
      if (name === 'fn_is_platform_owner') return Promise.resolve(h.ownerFlag)
      if (name === 'admin_set_user_date_of_birth') return Promise.resolve(h.correction)
      return Promise.resolve({ data: null, error: null })
    },
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: (cols: unknown) => {
          h.selects.push([table, cols])
          return chain
        },
        eq: () => chain,
        maybeSingle: () => Promise.resolve(h.profileRow),
      }
      return chain
    },
  }),
}))

import { POST } from './route'

// The REAL registry and the REAL engine, for the permission-boundary block at
// the end of this file. Neither `./registry` nor `./engine` is mocked above —
// the `@/lib/admin/permissions` barrel is mocked only to replace
// `requirePermission`, and it spreads the rest through — so these resolve
// against the shipped catalogue and the shipped resolver.
import {
  permissionRegistry,
  PERMISSIONS as REAL_PERMISSIONS,
} from '@/lib/admin/permissions/registry'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import type { Actor } from '@/lib/admin/rbac'
import type { AdminRole } from '@/lib/admin/roles'

const ACTOR = '22222222-2222-2222-2222-222222222222'
const SUBJECT = '33333333-3333-3333-3333-333333333333'
const REASON = 'support ticket 4181, user supplied a passport scan at signup'
const DOB = '1994-03-17'

const post = async (body: unknown, targetId = SUBJECT) => {
  const req = new Request(`http://localhost/api/admin/users/${targetId}/date-of-birth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await POST(req, { params: { id: targetId } })
  const text = await res.text()
  return { status: res.status, text, body: text ? JSON.parse(text) : null }
}

const rpcNames = () => h.rpcCalls.map(([n]) => n)
const corrections = () => h.rpcCalls.filter(([n]) => n === 'admin_set_user_date_of_birth')

beforeEach(() => {
  h.granted = true
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 })
  h.writeAuditLog.mockClear()
  h.writeAuditLogAwaited.mockClear()
  h.rpcCalls = []
  h.selects = []
  h.ownerFlag = { data: false, error: null }
  h.profileRow = { data: { id: SUBJECT }, error: null }
  h.correction = { data: 'corrected', error: null }
})

describe('authorization', () => {
  it('without the permission: 403, and the correction RPC is never reached', async () => {
    h.granted = false
    const { status } = await post({ date_of_birth: DOB, reason: REASON })
    expect(status).toBe(403)
    expect(corrections()).toHaveLength(0)
    // Not even the target lookup runs — authorization is answered first.
    expect(h.rpcCalls).toHaveLength(0)
  })

  it('with the permission: 200, and exactly ONE correction RPC', async () => {
    const { status, body } = await post({ date_of_birth: DOB, reason: REASON })
    expect(status).toBe(200)
    expect(body.data).toEqual({ id: SUBJECT, corrected: true })
    expect(corrections()).toHaveLength(1)
  })

  it('passes the authenticated actor to the RPC, never anything from the body', async () => {
    await post({ date_of_birth: DOB, reason: REASON })
    const [, args] = corrections()[0]
    expect(args.p_actor_id).toBe(ACTOR)
    expect(args.p_user_id).toBe(SUBJECT)
    expect(args.p_reason).toBe(REASON)
  })

  it('a cross-origin request is refused before any RPC', async () => {
    h.isSameOrigin.mockReturnValue(false)
    const { status } = await post({ date_of_birth: DOB, reason: REASON })
    expect(status).toBe(403)
    expect(h.rpcCalls).toHaveLength(0)
  })

  it('a rate-limited request is refused before any RPC', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    const { status } = await post({ date_of_birth: DOB, reason: REASON })
    expect(status).toBe(429)
    expect(h.rpcCalls).toHaveLength(0)
  })
})

describe('validation — refused before anything is written', () => {
  it('a reason under twenty characters is a 422', async () => {
    const { status } = await post({ date_of_birth: DOB, reason: 'wrong year' })
    expect(status).toBe(422)
    expect(corrections()).toHaveLength(0)
  })

  it('a future date is a 422', async () => {
    const { status } = await post({ date_of_birth: '2099-01-01', reason: REASON })
    expect(status).toBe(422)
    expect(corrections()).toHaveLength(0)
  })

  it('a date that does not exist is a 422, not silently rolled forward', async () => {
    // `new Date('2005-02-30')` would quietly become 2 March.
    const { status } = await post({ date_of_birth: '2005-02-30', reason: REASON })
    expect(status).toBe(422)
    expect(corrections()).toHaveLength(0)
  })

  it('a timestamp is refused rather than truncated to a date', async () => {
    const { status } = await post({ date_of_birth: '1994-03-17T00:00:00Z', reason: REASON })
    expect(status).toBe(422)
    expect(corrections()).toHaveLength(0)
  })

  it('an unknown field is refused — the schema is strict', async () => {
    const { status } = await post({ date_of_birth: DOB, reason: REASON, notify_user: true })
    expect(status).toBe(422)
    expect(corrections()).toHaveLength(0)
  })
})

describe('target guards', () => {
  it('an admin cannot correct their OWN date of birth', async () => {
    const { status } = await post({ date_of_birth: DOB, reason: REASON }, ACTOR)
    expect(status).toBe(403)
    expect(corrections()).toHaveLength(0)
  })

  it('the Platform Owner cannot be targeted', async () => {
    h.ownerFlag = { data: true, error: null }
    const { status } = await post({ date_of_birth: DOB, reason: REASON })
    expect(status).toBe(403)
    expect(corrections()).toHaveLength(0)
  })

  it('a FAILED owner check is a 500 and writes nothing — it fails closed', async () => {
    // Degrading to "not the Owner" would turn a database blip into permission
    // to rewrite the Owner's date of birth.
    h.ownerFlag = { data: null, error: { message: 'platform_owner unreachable' } }
    const { status } = await post({ date_of_birth: DOB, reason: REASON })
    expect(status).toBe(500)
    expect(corrections()).toHaveLength(0)
  })

  it('a target with no profile row is a 404', async () => {
    h.profileRow = { data: null, error: null }
    const { status } = await post({ date_of_birth: DOB, reason: REASON })
    expect(status).toBe(404)
    expect(corrections()).toHaveLength(0)
  })

  it('a non-UUID id is a 422', async () => {
    const { status } = await post({ date_of_birth: DOB, reason: REASON }, 'not-a-uuid')
    expect(status).toBe(422)
    expect(h.rpcCalls).toHaveLength(0)
  })
})

describe('the database status vocabulary is mapped, not assumed', () => {
  it.each([
    ['user_not_found', 404],
    ['invalid_date', 422],
    ['reason_too_short', 422],
    // The actor comes from the authenticated context, so this is our defect,
    // never the caller's input.
    ['invalid_actor', 500],
  ])('%s becomes %i', async (statusValue, expected) => {
    h.correction = { data: statusValue, error: null }
    const { status } = await post({ date_of_birth: DOB, reason: REASON })
    expect(status).toBe(expected)
  })

  it('an unrecognised status is a 500, never a success', async () => {
    h.correction = { data: 'something_new', error: null }
    const { status } = await post({ date_of_birth: DOB, reason: REASON })
    expect(status).toBe(500)
  })

  it('an RPC error is a 500', async () => {
    h.correction = { data: null, error: { message: 'connection reset' } }
    const { status } = await post({ date_of_birth: DOB, reason: REASON })
    expect(status).toBe(500)
  })
})

describe('the date of birth never leaves the route', () => {
  it('no response body contains the date — success or failure', async () => {
    // The FIELD NAME may appear: a 422 that will not say which field it
    // rejected is a worse API and leaks nothing. What must never appear is a
    // VALUE, so this asserts that no calendar-date-shaped string is present at
    // all — stricter than checking for the one date this test happens to send.
    for (const value of ['corrected', 'user_not_found', 'invalid_date', 'reason_too_short'] as const) {
      h.correction = { data: value, error: null }
      const { text } = await post({ date_of_birth: DOB, reason: REASON })
      expect(text, value).not.toContain(DOB)
      expect(text, value).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })

  it('the reason is not echoed back either', async () => {
    // It is an internal justification naming a support ticket, not something to
    // hand back to whatever called the API.
    const { text } = await post({ date_of_birth: DOB, reason: REASON })
    expect(text).not.toContain(REASON)
  })

  it('the route never SELECTs the current date of birth', async () => {
    await post({ date_of_birth: DOB, reason: REASON })
    // The only table read is the target-existence check.
    for (const [, cols] of h.selects) {
      expect(String(cols)).not.toContain('date_of_birth')
    }
  })

  it('reads no demographic status of its own', async () => {
    await post({ date_of_birth: DOB, reason: REASON })
    expect(rpcNames()).not.toContain('user_age_status')
    expect(rpcNames()).not.toContain('set_user_date_of_birth')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The audit is written by the SQL function, in the same transaction as the
// change. A second write here would produce two entries for one event, and the
// second would survive a transaction that rolled back.
// ─────────────────────────────────────────────────────────────────────────────

describe('the route does not audit — the database does', () => {
  it('writes no audit entry of its own on success', async () => {
    await post({ date_of_birth: DOB, reason: REASON })
    expect(h.writeAuditLog).not.toHaveBeenCalled()
    expect(h.writeAuditLogAwaited).not.toHaveBeenCalled()
  })

  it('the Owner-protected DENIAL still audits — that is a different event', async () => {
    // `guardMutationTarget` records refused attempts. Suppressing that would
    // hide exactly the attempt worth seeing.
    h.ownerFlag = { data: true, error: null }
    await post({ date_of_birth: DOB, reason: REASON })
    expect(h.writeAuditLog).toHaveBeenCalledTimes(1)
  })

  it('the source calls neither audit helper', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/api/admin/users/[id]/date-of-birth/route.ts'),
      'utf8'
    )
    // Matched on the CALL, not the bare name: the file's comment explains at
    // length why it does not audit, and comparing against prose would fail for
    // the wrong reason.
    expect(src).not.toMatch(/writeAuditLog\s*\(/)
    expect(src).not.toMatch(/writeAuditLogAwaited\s*\(/)
  })

  it('the source authorizes BEFORE it creates a privileged client', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/api/admin/users/[id]/date-of-birth/route.ts'),
      'utf8'
    )
    const authorize = src.indexOf('requirePermission(req, PERMISSIONS.USERS_DOB_CORRECT)')
    const privileged = src.indexOf('createAdminClient()')
    expect(authorize).toBeGreaterThan(-1)
    expect(privileged).toBeGreaterThan(authorize)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE OWNER-APPROVED PERMISSION BOUNDARY: `super_admin` ALONE.
//
// Owner decision, 2026-09-09. This block exists because nothing else in the
// suite would notice if that moved. `engine.test.ts` asserts only that every
// permission declares at least one default role and that none names `owner`;
// neither would fail if `admin` were added here. Granting the most restricted
// authority in this module to a second role would have been a silent, green
// change to the most consequential decision it carries.
//
// Resolved through the REAL registry and the REAL engine — not a copied
// literal, and not a mock. It therefore fails for any route the grant could
// take: an edited `defaultRoles`, a role-map change, a revived rank ladder.
// ─────────────────────────────────────────────────────────────────────────────

const roleActor = (role: AdminRole): Actor => ({
  // A distinct id per role: the resolver caches per (user, roles, version), and
  // one shared id would serve the first role's answer to all four.
  userId: `u-${role}`,
  email: `${role}@tappyai.com`,
  isOwner: false,
  roles: [role],
  highestRole: role,
  capabilities: [],
  source: 'cookie',
  resolvedAt: Date.now(),
})

describe('users.date_of_birth.correct is granted to super_admin and nobody else', () => {
  it('is declared exactly once, with the approved shape', () => {
    const matches = permissionRegistry.all.filter((p) => p.id === 'users.date_of_birth.correct')
    expect(matches).toHaveLength(1)

    const d = matches[0]
    expect(d.module).toBe('users')
    expect(d.capability).toBe('users.manage')
    expect(d.category).toBe('write')
    expect(d.riskLevel).toBe('critical')
    // Exact equality, deliberately not `toContain('super_admin')`: that would
    // still pass for `['admin', 'super_admin']`, which is the precise change
    // this assertion exists to catch.
    expect(d.defaultRoles).toEqual(['super_admin'])
  })

  it('the exported constant and the catalogue agree', () => {
    expect(REAL_PERMISSIONS.USERS_DOB_CORRECT).toBe('users.date_of_birth.correct')
    expect(permissionRegistry.has(REAL_PERMISSIONS.USERS_DOB_CORRECT)).toBe(true)
  })

  it.each([
    ['super_admin', true],
    ['admin', false],
    ['moderator', false],
    ['analyst', false],
  ] as const)('%s → allowed: %s', (role, allowed) => {
    expect(permissionEngine.can(roleActor(role), REAL_PERMISSIONS.USERS_DOB_CORRECT)).toBe(allowed)
  })

  it("admin's denial is NO_GRANT — the table above is not passing vacuously", () => {
    // An unknown or typo'd permission id also denies, and would deny for EVERY
    // role, making the four rows above green while proving nothing. This pins
    // the denial to "declared, and deliberately not granted".
    const denied = permissionEngine.authorize(
      roleActor('admin'),
      REAL_PERMISSIONS.USERS_DOB_CORRECT
    )
    expect(denied.allowed).toBe(false)
    expect(denied.reason).toBe('NO_GRANT')

    const allowed = permissionEngine.authorize(
      roleActor('super_admin'),
      REAL_PERMISSIONS.USERS_DOB_CORRECT
    )
    expect(allowed.allowed).toBe(true)
    expect(allowed.reason).toBe('ROLE_GRANT')
  })
})
