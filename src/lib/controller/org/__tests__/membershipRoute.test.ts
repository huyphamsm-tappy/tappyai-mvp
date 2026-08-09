import { describe, it, expect, beforeEach, vi } from 'vitest'
import { inMemoryMembershipRepository } from '../membershipRepository'
import { NO_CAPABILITIES } from '@/lib/admin/capabilities'
import type { Actor, AdminRole } from '@/lib/admin/rbac'
import type { AuditParams } from '@/lib/admin/audit'
import type { DepartmentMembership, DepartmentId, OrgRole, OrgScope } from '../types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// FOUNDATION-07D — ROUTE-LEVEL integration for /api/admin/org/memberships.
// The REAL permissionEngine decides authorization (NOT mocked). Only three
// non-authorization concerns are mocked: IDENTITY (resolveActor — there is no
// Supabase session in a unit test), the owner GATE, STORAGE (in-memory repo) and
// the feature FLAG. This exercises the full route pipeline: feature gate → PDP →
// same-origin → rate-limit → schema → membership service → audit.

const hoisted = vi.hoisted(() => ({
  resolved: null as { user: { id: string; email: string }; actor: Actor } | null,
  flagOn: true,
  isOwnerTarget: false,
  audits: [] as AuditParams[],
  repoSeed: [] as DepartmentMembership[],
}))

vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = await orig<typeof import('@/lib/admin/rbac')>()
  return { ...actual, resolveActor: vi.fn(async () => hoisted.resolved), isSameOrigin: () => true }
})
vi.mock('@/lib/admin/owner', async (orig) => {
  const actual = await orig<typeof import('@/lib/admin/owner')>()
  return { ...actual, checkOwnerGate: async () => ({ ok: true as const }), isPlatformOwner: async () => hoisted.isOwnerTarget }
})
vi.mock('@/lib/controller/org/server', async (orig) => {
  const actual = await orig<typeof import('../server')>()
  return {
    ...actual,
    orgMembershipEnabled: () => hoisted.flagOn,
    productionMembershipDeps: () => ({
      repo: inMemoryMembershipRepository(hoisted.repoSeed),
      audit: (p: AuditParams) => hoisted.audits.push(p),
    }),
  }
})

// Imported AFTER the mocks so the route binds to them.
const { POST, PATCH } = await import('@/app/api/admin/org/memberships/route')

function actor(roles: AdminRole[], opts: { isOwner?: boolean; id: string }): Actor {
  return {
    userId: opts.id, email: `${opts.id}@tappyai.com`, isOwner: opts.isOwner ?? false,
    roles, highestRole: roles.length ? roles[roles.length - 1] : null,
    capabilities: NO_CAPABILITIES, source: 'cookie', resolvedAt: 0,
  }
}
const as = (a: Actor | null) => { hoisted.resolved = a ? { user: { id: a.userId, email: a.email ?? '' }, actor: a } : null }
const member = (userId: string, d: DepartmentId, r: OrgRole, s: OrgScope): DepartmentMembership => ({ userId, departmentId: d, orgRole: r, scope: s, status: 'active' })

function post(body: unknown): Request {
  return new Request('https://tappyai.com/api/admin/org/memberships', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}
const UID = '11111111-1111-4111-8111-111111111111'
const assignBody = (over: Record<string, unknown> = {}) => ({ targetUserId: UID, targetDepartment: 'marketing', targetOrgRole: 'EMPLOYEE', targetScope: 'marketing', ...over })

beforeEach(() => { hoisted.resolved = null; hoisted.flagOn = true; hoisted.isOwnerTarget = false; hoisted.audits = []; hoisted.repoSeed = [] })

describe('feature flag', () => {
  it('OFF → 404 (endpoint does not exist)', async () => {
    hoisted.flagOn = false
    as(actor(['super_admin'], { id: 's' }))
    expect((await POST(post(assignBody()))).status).toBe(404)
  })
})

describe('authentication', () => {
  it('unauthenticated → 401', async () => {
    as(null)
    expect((await POST(post(assignBody()))).status).toBe(401)
  })
})

describe('PDP (real engine)', () => {
  it('an analyst (lacks security.membership.manage) → 403', async () => {
    as(actor(['analyst'], { id: 'a' }))
    expect((await POST(post(assignBody()))).status).toBe(403)
  })
})

describe('department authority', () => {
  it('Head of own department → 200 and the row is persisted + audited', async () => {
    hoisted.repoSeed = [member('headA', 'marketing', 'DEPARTMENT_HEAD', 'marketing')]
    as(actor(['super_admin'], { id: 'headA' }))
    const res = await POST(post(assignBody()))
    expect(res.status).toBe(200)
    expect(hoisted.audits.map((a) => a.action)).toContain('org.membership_assigned')
  })
  it('Head assigning into ANOTHER department → 403 (+ denial audited)', async () => {
    hoisted.repoSeed = [member('headA', 'marketing', 'DEPARTMENT_HEAD', 'marketing')]
    as(actor(['super_admin'], { id: 'headA' }))
    const res = await POST(post(assignBody({ targetDepartment: 'engineering', targetScope: 'engineering' })))
    expect(res.status).toBe(403)
    expect(hoisted.audits.map((a) => a.action)).toContain('org.membership.assign.denied')
  })
  it('a Manager (not Head) → 403', async () => {
    hoisted.repoSeed = [member('mgr', 'marketing', 'DEPARTMENT_MANAGER', 'marketing')]
    as(actor(['super_admin'], { id: 'mgr' }))
    expect((await POST(post(assignBody()))).status).toBe(403)
  })
  it('an Employee → 403', async () => {
    hoisted.repoSeed = [member('emp', 'marketing', 'EMPLOYEE', 'marketing')]
    as(actor(['super_admin'], { id: 'emp' }))
    expect((await POST(post(assignBody()))).status).toBe(403)
  })
  it('self-escalation → 403 (target === actor, past schema validation)', async () => {
    // Actor is UID and IS a Head of marketing; assigning to UID (self) must be
    // refused by the service's self-grant guard, not the schema.
    hoisted.repoSeed = [member(UID, 'marketing', 'DEPARTMENT_HEAD', 'marketing')]
    as(actor(['super_admin'], { id: UID }))
    expect((await POST(post(assignBody({ targetUserId: UID })))).status).toBe(403)
  })
})

describe('schema validation', () => {
  it('invalid body → 422', async () => {
    as(actor(['super_admin'], { id: 's' }))
    expect((await POST(post({ targetDepartment: 'nope' }))).status).toBe(422)
  })
})

describe('owner protection (PATCH)', () => {
  it('cannot modify the Ultimate Owner → 403', async () => {
    hoisted.isOwnerTarget = true
    hoisted.repoSeed = [member(UID, 'marketing', 'EMPLOYEE', 'marketing')]
    as(actor([], { isOwner: true, id: 'owner' }))
    const req = new Request('https://tappyai.com/api/admin/org/memberships', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUserId: UID, departmentId: 'marketing', status: 'suspended' }),
    })
    expect((await PATCH(req)).status).toBe(403)
  })
})

// ── F-10B additions ─────────────────────────────────────────────────────────
// The F-07D suite above covers flag/auth/PDP/scope/self-escalation/owner/schema.
// These close the gaps the F-10B gate audit identified, so the route is proven
// on every axis the activation runbook depends on.

describe('flag OFF is fully inert (no mutation, no audit)', () => {
  it('writes nothing and audits nothing while the flag is OFF', async () => {
    hoisted.flagOn = false
    as(actor([], { isOwner: true, id: 'owner' }))

    const res = await POST(post(assignBody()))

    expect(res.status).toBe(404)
    // The gate must short-circuit BEFORE the service — otherwise "inert" would
    // only mean "no row", not "no side effect".
    expect(hoisted.audits).toEqual([])
    expect(hoisted.repoSeed).toEqual([])
  })

  it('PATCH is equally inert while the flag is OFF', async () => {
    hoisted.flagOn = false
    hoisted.repoSeed = [member(UID, 'marketing', 'EMPLOYEE', 'marketing')]
    as(actor([], { isOwner: true, id: 'owner' }))
    const req = new Request('https://tappyai.com/api/admin/org/memberships', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUserId: UID, departmentId: 'marketing', status: 'suspended' }),
    })

    expect((await PATCH(req)).status).toBe(404)
    expect(hoisted.audits).toEqual([])
  })
})

describe('the Ultimate Owner reaches the canonical service', () => {
  it('Owner assigns the FIRST Head → 200, persisted and audited', async () => {
    // This is the exact call the F-10 activation runbook makes. Owner holds no
    // admin_roles row in production, so this also proves the PDP Owner bypass
    // is what carries the request — not a role.
    as(actor([], { isOwner: true, id: 'owner' }))

    const res = await POST(post(assignBody({ targetDepartment: 'commerce', targetOrgRole: 'DEPARTMENT_HEAD', targetScope: 'commerce' })))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toMatchObject({ userId: UID, departmentId: 'commerce', orgRole: 'DEPARTMENT_HEAD', scope: 'commerce', status: 'active' })
    expect(hoisted.audits.map((a) => a.action)).toContain('org.membership_assigned')
  })
})

describe('a Head cannot create or elevate a peer Head', () => {
  it('Head assigning DEPARTMENT_HEAD in their OWN department → 403', async () => {
    // HEAD_ASSIGNABLE is {MANAGER, EMPLOYEE}: a Head may staff their department
    // but never mint a peer, which would make the department authority plural.
    hoisted.repoSeed = [member('head', 'marketing', 'DEPARTMENT_HEAD', 'marketing')]
    as(actor(['super_admin'], { id: 'head' }))

    const res = await POST(post(assignBody({ targetOrgRole: 'DEPARTMENT_HEAD' })))

    expect(res.status).toBe(403)
    expect(hoisted.audits.some((a) => String(a.action).endsWith('.denied'))).toBe(true)
  })

  it('Head cannot grant GLOBAL scope → 403', async () => {
    hoisted.repoSeed = [member('head', 'marketing', 'DEPARTMENT_HEAD', 'marketing')]
    as(actor(['super_admin'], { id: 'head' }))

    expect((await POST(post(assignBody({ targetScope: 'GLOBAL' })))).status).toBe(403)
  })
})

describe('service failure maps to HTTP without leaking internals', () => {
  it('an unknown department is rejected before the service (schema) → 422', async () => {
    as(actor([], { isOwner: true, id: 'owner' }))
    expect((await POST(post(assignBody({ targetDepartment: 'not_a_department' })))).status).toBe(422)
  })

  it('a well-formed request for a non-existent membership → 404, not 500', async () => {
    // PATCH on a membership that does not exist: the service returns NOT_FOUND
    // and the route maps it to 404. A 500 here would mean an unmapped throw.
    hoisted.repoSeed = []
    as(actor([], { isOwner: true, id: 'owner' }))
    const req = new Request('https://tappyai.com/api/admin/org/memberships', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUserId: UID, departmentId: 'marketing', status: 'suspended' }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(404)
    const body = await res.json()
    // Uniform envelope, no stack/internal detail.
    expect(Object.keys(body)).toEqual(['error'])
  })
})

describe('the route is a thin adapter — it owns no security logic', () => {
  const SRC = readFileSync(join(process.cwd(), 'src/app/api/admin/org/memberships/route.ts'), 'utf8')
  const code = SRC.split('\n').filter((l) => {
    const t = l.trim()
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
  }).join('\n')

  it('delegates authorization to requirePermission and the membership service', () => {
    expect(code).toMatch(/requirePermission\(req,\s*PERMISSIONS\.SECURITY_MEMBERSHIP_MANAGE\)/)
    expect(code).toMatch(/assignMembership\(|setMembershipStatus\(|removeMembership\(/)
  })

  it('never re-implements identity, domain, role or scope logic', () => {
    expect(code).not.toMatch(/endsWith\(\s*['"]@?tappyai/i)   // no route-local corporate check
    expect(code).not.toMatch(/DEPARTMENT_HEAD|EMPLOYEE'/)      // no role hierarchy in the route
    expect(code).not.toMatch(/resolveActorForUser\(/)          // no independent Actor construction
    expect(code).not.toMatch(/writeAuditLog\(/)                // audit belongs to the service
    expect(code).not.toMatch(/from\('department_membership'\)/) // no direct table write
  })

  it('gates on the canonical flag helper, not its own env read', () => {
    expect(code).toMatch(/orgMembershipEnabled\(\)/)
    expect(code).not.toMatch(/process\.env\.CONTROLLER_ORG_MEMBERSHIP_ENABLED/)
  })
})
