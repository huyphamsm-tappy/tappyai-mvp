import { describe, it, expect, vi } from 'vitest'
import { listDepartmentRoster } from '../membershipService'
import { inMemoryMembershipRepository } from '../membershipRepository'
import { orgMembershipEnabled } from '../featureGate'
import { orgMembershipModule } from '../../modules/orgMembershipModule'
import { ADMIN_MODULES } from '../../registry/adminModules'
import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import type { Actor } from '@/lib/admin/rbac'
import type { DepartmentMembership } from '../types'

// Controller V2 — the department membership ROSTER, the read half of F-10.
//
// FOUNDATION-10B shipped the membership API with POST/PATCH/DELETE and no GET,
// and said why: "listMemberships exists in the service but is deliberately not
// exposed: F-10 does not require it, and adding CRUD 'for completeness' would
// widen the surface without a consumer."
//
// Owner Decision D6 (2026-08-22) authorized `/admin/org/memberships` — so there
// is now a consumer, and it is the ONLY reason this read exists. The surface is
// READ-ONLY by that same decision: assignment, suspension and removal stay in
// the API behind `security.membership.manage`, because destructive UAT is not
// authorized and a control that cannot be verified should not ship.
//
// NOTHING HERE CHANGES THE AUTHORIZATION MODEL. `security.membership.read` has
// existed since F-07D with `defaultRoles: ['super_admin']`. It was defined and
// never used. This is the surface that uses it.

const OWNER: Actor = { userId: 'owner-1', roles: ['super_admin'], isOwner: true } as Actor
const READER: Actor = { userId: 'reader-1', roles: ['super_admin'], isOwner: false } as Actor
const NOBODY: Actor = { userId: 'nobody-1', roles: ['analyst'], isOwner: false } as Actor

const member = (userId: string, departmentId: string, status: 'active' | 'suspended' = 'active'): DepartmentMembership =>
  ({ userId, departmentId, orgRole: 'DEPARTMENT_HEAD', scope: departmentId, status }) as DepartmentMembership

/** The canonical PDP, narrowed to the one permission under test. */
const pdp = (granted: boolean) => () => ({ allowed: granted, reason: granted ? 'ROLE_GRANT' : 'NO_GRANT' }) as never

describe('D6 · the roster read', () => {
  it('returns every ACTIVE membership across departments', async () => {
    const repo = inMemoryMembershipRepository([
      member('u1', 'ai_data'),
      member('u2', 'commerce'),
    ])
    const r = await listDepartmentRoster(OWNER, { repo, authorize: pdp(true), audit: vi.fn() })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.memberships.map((m) => m.userId).sort()).toEqual(['u1', 'u2'])
  })

  it('EXCLUDES suspended memberships', async () => {
    // A suspended membership grants nothing — `resolveActorMemberships` filters
    // to active, and a roster that showed them as members would contradict the
    // navigation the same rows produce.
    const repo = inMemoryMembershipRepository([member('u1', 'ai_data'), member('u2', 'commerce', 'suspended')])
    const r = await listDepartmentRoster(OWNER, { repo, authorize: pdp(true), audit: vi.fn() })
    expect(r.ok && r.memberships.map((m) => m.userId)).toEqual(['u1'])
  })

  it('refuses an unauthenticated caller', async () => {
    const r = await listDepartmentRoster(null, { repo: inMemoryMembershipRepository(), authorize: pdp(true), audit: vi.fn() })
    expect(r).toEqual({ ok: false, reason: 'UNAUTHENTICATED' })
  })

  it('refuses a caller the canonical PDP denies', async () => {
    const r = await listDepartmentRoster(NOBODY, { repo: inMemoryMembershipRepository([member('u1', 'ai_data')]), authorize: pdp(false), audit: vi.fn() })
    expect(r).toEqual({ ok: false, reason: 'PERMISSION_DENIED' })
  })

  it('asks the PDP for security.membership.read and nothing else', async () => {
    // Not `.manage`: reading who belongs to a department must not require the
    // critical-risk permission that CHANGES it. And not a role comparison —
    // there is no role check anywhere in this path.
    const asked: string[] = []
    await listDepartmentRoster(READER, {
      repo: inMemoryMembershipRepository(),
      authorize: ((_a: unknown, p: string) => { asked.push(p); return { allowed: true, reason: 'ROLE_GRANT' } }) as never,
      audit: vi.fn(),
    })
    expect(asked).toEqual([PERMISSIONS.SECURITY_MEMBERSHIP_READ])
  })

  it('reads NOTHING from the repository when the PDP denies', async () => {
    // Fail closed before the query, not after it. A denial that still ran the
    // read would leak through timing and would put org data in a log line.
    let touched = false
    const repo = { ...inMemoryMembershipRepository(), listAllActive: async () => { touched = true; return [] } }
    await listDepartmentRoster(NOBODY, { repo, authorize: pdp(false), audit: vi.fn() })
    expect(touched).toBe(false)
  })
})

describe('D6 · the roster read is AUDITED', () => {
  it('audits a successful read', async () => {
    // Who belongs to which department is org structure. C11 audits
    // `session.listed`, Module 08 audits `user.notes_listed` and Module 09
    // audits `moderation.queue_listed` for the same reason.
    const audit = vi.fn()
    await listDepartmentRoster(OWNER, { repo: inMemoryMembershipRepository([member('u1', 'ai_data')]), authorize: pdp(true), audit })
    expect(audit).toHaveBeenCalledTimes(1)
    expect(audit.mock.calls[0][0].action).toBe('org.membership_listed')
  })

  it('records a COUNT, never the rows', async () => {
    // The audit log is `audit.log.read` — admin+, a wider population than
    // `security.membership.read`, which is super_admin only. Copying the roster
    // into it would hand the org chart to everyone who can read the audit trail.
    const audit = vi.fn()
    await listDepartmentRoster(OWNER, { repo: inMemoryMembershipRepository([member('u1', 'ai_data'), member('u2', 'commerce')]), authorize: pdp(true), audit })
    const meta = JSON.stringify(audit.mock.calls[0][0].metadata ?? {})
    expect(meta).toContain('2')
    expect(meta).not.toContain('u1')
    expect(meta).not.toContain('ai_data')
  })

  it('audits a denial', async () => {
    const audit = vi.fn()
    await listDepartmentRoster(NOBODY, { repo: inMemoryMembershipRepository(), authorize: pdp(false), audit })
    expect(audit).toHaveBeenCalledTimes(1)
    expect(audit.mock.calls[0][0].action).toBe('org.membership_listed.denied')
  })
})

describe('D6 · the repository port', () => {
  it('in-memory listAllActive returns active rows only, across users', async () => {
    const repo = inMemoryMembershipRepository([
      member('u1', 'ai_data'),
      member('u1', 'commerce', 'suspended'),
      member('u2', 'commerce'),
    ])
    const all = await repo.listAllActive()
    expect(all.map((m) => `${m.userId}:${m.departmentId}`).sort()).toEqual(['u1:ai_data', 'u2:commerce'])
  })
})

describe('D6 · the feature gate is a PURE predicate', () => {
  const ORIGINAL = process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED

  it('reads the F-10 flag with the same strictness as before', () => {
    process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED = 'true'
    expect(orgMembershipEnabled()).toBe(true)
    process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED = 'TRUE'
    expect(orgMembershipEnabled()).toBe(false)
    delete process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED
    expect(orgMembershipEnabled()).toBe(false)
    if (ORIGINAL === undefined) delete process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED
    else process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED = ORIGINAL
  })

  it('the server seam still exports it, so existing importers are unaffected', async () => {
    const server = await import('../server')
    expect(server.orgMembershipEnabled).toBe(orgMembershipEnabled)
  })
})

describe('D6 · the module manifest', () => {
  it('is registered in ADMIN_MODULES', () => {
    expect(ADMIN_MODULES.map((m) => m.id)).toContain(orgMembershipModule.id)
  })

  it('lives in the Security hub, which is what its permission id already said', () => {
    // `01_ARCH` §4.1 types a permission as `hub.module.action`, and this one has
    // been `security.membership.read` since F-07D. The hub was never an open
    // question — the permission id had already answered it.
    expect(orgMembershipModule.hub).toBe('tappy.hub.security')
    expect(orgMembershipModule.id).toBe('tappy.hub.security.membership')
  })

  it('declares only the READ permission', () => {
    // C6 §5 makes permission ownership exclusive across modules. Declaring
    // `.manage` here would claim it for this module and refuse any future
    // module that legitimately needs it — and this surface does not use it.
    expect(orgMembershipModule.permissions).toEqual([PERMISSIONS.SECURITY_MEMBERSHIP_READ])
    expect(orgMembershipModule.navigation.visibilityPermission).toBe(PERMISSIONS.SECURITY_MEMBERSHIP_READ)
  })

  it('owns no tables', () => {
    // ADR-024: absence means the module owns no tables. `department_membership`
    // is FOUNDATION-06 infrastructure, not this module's property.
    expect(orgMembershipModule.data).toBeUndefined()
  })

  it('routes to the surface Decision D6 authorized', () => {
    expect(orgMembershipModule.routes).toEqual(['/admin/org/memberships'])
  })

  it('its status follows the F-10 flag, so the nav has no door onto a 404', () => {
    // `01_ARCH` §8: "you never see a door you cannot open". While F-10 is off
    // the API returns 404, so the entry must not be navigable — and the kernel
    // already models this: `isReady` requires status === 'enabled', and
    // `isModuleAccessible` (what the navigation provider consults) requires
    // readiness. No new mechanism, just the one that exists.
    const expected = orgMembershipEnabled() ? 'enabled' : 'disabled'
    expect(orgMembershipModule.status).toBe(expected)
  })
})
