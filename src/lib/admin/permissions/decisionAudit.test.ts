import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controller V2 — Component 4: the authorization-decision audit policy.
//
// Component 3 shipped a PDP that recorded nothing. Production proved the cost:
// the `audit_log` table was EMPTY after the Platform Owner had used the
// Controller, because only mutating handlers write rows and reads are not
// mutations. The most privileged principal left no trace at all.
//
// The rule here is a judgement call (see `shouldAudit`), and a judgement call
// that cannot be asserted is just an opinion in a comment. These tests pin it.

const h = vi.hoisted(() => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/admin/audit', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, writeAuditLog: h.writeAuditLog }
})

import {
  shouldAudit,
  auditActorRole,
  auditAuthorizationDecision,
  throttleDecision,
  resetDecisionAuditThrottle,
  ACTION_ACCESS_DENIED,
  ACTION_OWNER_OVERRIDE,
} from './decisionAudit'
import { PERMISSIONS } from './registry'
import type { Actor } from '@/lib/admin/rbac'
import type { Decision } from './types'

const actor = (over: Partial<Actor> = {}): Actor => ({
  userId: 'u-1',
  email: 'a@b.c',
  isOwner: false,
  roles: ['admin'],
  highestRole: 'admin',
  capabilities: [],
  source: 'cookie',
  resolvedAt: 0,
  ...over,
})

const deny = (permission: string, reason: Decision['reason'] = 'NO_GRANT'): Decision =>
  ({ allowed: false, reason, permission } as Decision)
const allowOwner = (permission: string): Decision =>
  ({ allowed: true, reason: 'OWNER_BYPASS', permission } as Decision)
const allowRole = (permission: string): Decision =>
  ({ allowed: true, reason: 'ROLE_GRANT', permission } as Decision)

beforeEach(() => {
  vi.clearAllMocks()
  resetDecisionAuditThrottle()
})

describe('shouldAudit — denials', () => {
  it.each(['NO_GRANT', 'UNKNOWN_PERMISSION', 'UNAUTHENTICATED', 'CAPABILITY_UNAVAILABLE'] as const)(
    'audits a %s denial',
    (reason) => {
      expect(shouldAudit(deny(PERMISSIONS.AUDIT_LOG_READ, reason))).toBe(true)
    }
  )

  it('audits a denial even on a read permission', () => {
    // The read exemption applies to Owner ALLOWs, never to refusals. A refused
    // read is exactly the shape of a probe.
    expect(shouldAudit(deny(PERMISSIONS.DASHBOARD_HOME_VIEW))).toBe(true)
  })

  it('audits a denial for a permission that is not in the registry', () => {
    expect(shouldAudit(deny('not.a.real.permission'))).toBe(true)
  })
})

describe('shouldAudit — Owner bypass', () => {
  it('audits an Owner bypass on a destructive permission', () => {
    expect(shouldAudit(allowOwner(PERMISSIONS.COMMERCE_DEALS_DELETE))).toBe(true)
  })

  it('audits an Owner bypass on a security permission', () => {
    expect(shouldAudit(allowOwner(PERMISSIONS.SECURITY_ROLES_GRANT))).toBe(true)
  })

  it('audits an Owner bypass on a write permission', () => {
    expect(shouldAudit(allowOwner(PERMISSIONS.COMMERCE_DEALS_CREATE))).toBe(true)
  })

  it('does NOT audit an Owner bypass on a read — the documented volume rule', () => {
    // One Owner browsing produces ~10 authorize() calls per page load. Recording
    // each would bury the handful that matter. Deliberate; see AUDIT_OWNER_READS.
    expect(shouldAudit(allowOwner(PERMISSIONS.DASHBOARD_HOME_VIEW))).toBe(false)
    expect(shouldAudit(allowOwner(PERMISSIONS.AUDIT_LOG_READ))).toBe(false)
  })

  it('audits an Owner bypass on an UNKNOWN permission', () => {
    // The Owner is allowed even for permissions the registry does not declare.
    // That is the one case where bypass grants something nothing else could, so
    // it must never fall through the read exemption.
    expect(shouldAudit(allowOwner('not.a.real.permission'))).toBe(true)
  })
})

describe('shouldAudit — ordinary grants', () => {
  it('does NOT audit a ROLE_GRANT allow', () => {
    // The mutation handler downstream audits its own effect with before/after
    // state; auditing the permission check too would double-count every action.
    expect(shouldAudit(allowRole(PERMISSIONS.COMMERCE_DEALS_DELETE))).toBe(false)
    expect(shouldAudit(allowRole(PERMISSIONS.SECURITY_ROLES_GRANT))).toBe(false)
  })
})

describe('auditActorRole — the principal must not be invented', () => {
  it("records 'owner' for the Platform Owner, never a role", () => {
    expect(auditActorRole(actor({ isOwner: true, highestRole: 'super_admin' }))).toBe('owner')
  })

  it("records 'owner' even when the Owner holds NO role", () => {
    // The P-4 defect: `highestRole ?? 'admin'` logged a role the Owner does not
    // hold. An audit trail that invents authority is worse than an incomplete one.
    expect(auditActorRole(actor({ isOwner: true, roles: [], highestRole: null }))).toBe('owner')
  })

  it('records the actual role for a non-Owner', () => {
    expect(auditActorRole(actor({ highestRole: 'analyst' }))).toBe('analyst')
  })

  it("records 'none' for a denied actor holding no role", () => {
    expect(auditActorRole(actor({ roles: [], highestRole: null }))).toBe('none')
  })
})

describe('auditAuthorizationDecision — the emitted row', () => {
  it('writes a denial row naming the permission, reason and surface', () => {
    auditAuthorizationDecision({
      actor: actor({ highestRole: 'analyst' }),
      decision: { allowed: false, reason: 'NO_GRANT', permission: PERMISSIONS.AUDIT_LOG_READ, detail: 'held by roles: admin, super_admin' },
      surface: 'api',
    })

    expect(h.writeAuditLog).toHaveBeenCalledTimes(1)
    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ACTION_ACCESS_DENIED,
        actorRole: 'analyst',
        targetType: 'permission',
        targetId: PERMISSIONS.AUDIT_LOG_READ,
        metadata: expect.objectContaining({
          surface: 'api',
          reason: 'NO_GRANT',
          detail: 'held by roles: admin, super_admin',
          module: 'audit',
          category: 'read',
          is_platform_owner: false,
        }),
      })
    )
  })

  it('writes an owner-override row for a non-read bypass', () => {
    auditAuthorizationDecision({
      actor: actor({ isOwner: true, roles: [], highestRole: null }),
      decision: allowOwner(PERMISSIONS.COMMERCE_DEALS_DELETE),
      surface: 'api',
    })

    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ACTION_OWNER_OVERRIDE,
        actorRole: 'owner',
        targetId: PERMISSIONS.COMMERCE_DEALS_DELETE,
        metadata: expect.objectContaining({
          reason: 'OWNER_BYPASS',
          category: 'destructive',
          risk_level: 'high',
          is_platform_owner: true,
        }),
      })
    )
  })

  it('writes nothing when the policy says not to', () => {
    auditAuthorizationDecision({
      actor: actor({ isOwner: true }),
      decision: allowOwner(PERMISSIONS.DASHBOARD_HOME_VIEW),
      surface: 'page',
    })
    auditAuthorizationDecision({
      actor: actor(),
      decision: allowRole(PERMISSIONS.COMMERCE_DEALS_READ),
      surface: 'api',
    })

    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('carries the surface so a row says which gate refused', () => {
    auditAuthorizationDecision({ actor: actor(), decision: deny(PERMISSIONS.SECURITY_ROLES_READ), surface: 'page' })

    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ surface: 'page' }) })
    )
  })

  it('omits `detail` on an allow — there is nothing to explain', () => {
    auditAuthorizationDecision({
      actor: actor({ isOwner: true }),
      decision: allowOwner(PERMISSIONS.SECURITY_ROLES_GRANT),
      surface: 'api',
    })

    const meta = h.writeAuditLog.mock.calls[0][0].metadata
    expect(meta).not.toHaveProperty('detail')
  })
})


describe('throttle — the audit log must not be floodable', () => {
  // THE ATTACK Component 4 opened: auditing denials puts a database write on a
  // path any authenticated user can drive, and `rateLimit()` runs INSIDE each
  // handler — i.e. after `requirePermission` has already thrown. Without this
  // throttle, any logged-in user can inflate `audit_log` without limit.

  it('REGRESSION: a hammering caller produces ONE row, not one per request', () => {
    const denied = { actor: actor({ userId: 'attacker', roles: [], highestRole: null }), decision: deny(PERMISSIONS.SECURITY_ROLES_GRANT), surface: 'api' as const }

    for (let i = 0; i < 500; i++) auditAuthorizationDecision(denied)

    expect(h.writeAuditLog).toHaveBeenCalledTimes(1)
  })

  it('the suppressed count survives even though the rows do not', () => {
    expect(throttleDecision('k', 0)).toBe(0)
    for (let i = 0; i < 9; i++) expect(throttleDecision('k', 1_000)).toBeNull()

    // Window elapsed: the next write carries what was collapsed into it.
    expect(throttleDecision('k', 60_001)).toBe(9)
  })

  it('a different actor is throttled independently', () => {
    const d = deny(PERMISSIONS.AUDIT_LOG_READ)
    auditAuthorizationDecision({ actor: actor({ userId: 'a' }), decision: d, surface: 'api' })
    auditAuthorizationDecision({ actor: actor({ userId: 'b' }), decision: d, surface: 'api' })
    auditAuthorizationDecision({ actor: actor({ userId: 'a' }), decision: d, surface: 'api' })

    expect(h.writeAuditLog).toHaveBeenCalledTimes(2)
  })

  it('a different permission or reason is throttled independently', () => {
    const a = actor({ userId: 'u' })
    auditAuthorizationDecision({ actor: a, decision: deny(PERMISSIONS.AUDIT_LOG_READ), surface: 'api' })
    auditAuthorizationDecision({ actor: a, decision: deny(PERMISSIONS.SECURITY_ROLES_READ), surface: 'api' })
    auditAuthorizationDecision({ actor: a, decision: deny(PERMISSIONS.AUDIT_LOG_READ, 'UNKNOWN_PERMISSION'), surface: 'api' })
    auditAuthorizationDecision({ actor: a, decision: deny(PERMISSIONS.AUDIT_LOG_READ), surface: 'page' })

    expect(h.writeAuditLog).toHaveBeenCalledTimes(4)
  })

  it('writes again once the window elapses', () => {
    expect(throttleDecision('x', 0)).toBe(0)
    expect(throttleDecision('x', 59_999)).toBeNull()
    expect(throttleDecision('x', 60_001)).toBe(1)
  })

  it('REGRESSION: owner.override is NOT throttled — each bypass is a real action', () => {
    // The adversarial review caught this. Throttling exists to stop an attacker
    // flooding DENIALS; only the Owner can produce an override, so it is not an
    // attacker-reachable path, and each row is a distinct privileged action.
    // `deals/upload` writes no audit row of its own, so the override is the ONLY
    // record that the upload happened — collapsing five into one loses it.
    const owner = actor({ isOwner: true, roles: [], highestRole: null })
    for (let i = 0; i < 5; i++) {
      auditAuthorizationDecision({ actor: owner, decision: allowOwner(PERMISSIONS.COMMERCE_DEALS_UPLOAD_MEDIA), surface: 'api' })
    }

    expect(h.writeAuditLog).toHaveBeenCalledTimes(5)
  })

  it('an override row never claims suppressed_since_last', () => {
    const owner = actor({ isOwner: true })
    auditAuthorizationDecision({ actor: owner, decision: allowOwner(PERMISSIONS.COMMERCE_DEALS_DELETE), surface: 'api' })

    expect(h.writeAuditLog.mock.calls[0][0].metadata).not.toHaveProperty('suppressed_since_last')
  })

  it('denials are still throttled while overrides are not', () => {
    const owner = actor({ userId: 'o', isOwner: true })
    const other = actor({ userId: 'x', roles: [], highestRole: null })
    for (let i = 0; i < 3; i++) {
      auditAuthorizationDecision({ actor: owner, decision: allowOwner(PERMISSIONS.SECURITY_ROLES_GRANT), surface: 'api' })
      auditAuthorizationDecision({ actor: other, decision: deny(PERMISSIONS.SECURITY_ROLES_GRANT), surface: 'api' })
    }

    // 3 overrides + 1 collapsed denial
    expect(h.writeAuditLog).toHaveBeenCalledTimes(4)
  })

  it('key-variation cannot grow memory without bound', () => {
    // An attacker who varies the key defeats collapsing but must not defeat the
    // memory bound. Every call still writes, so no signal is lost.
    for (let i = 0; i < 6_000; i++) expect(throttleDecision('vary-' + i, 0)).not.toBeNull()
  })
})
