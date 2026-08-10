import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { authorizeDepartmentResource } from '../authorization'
import { NO_CAPABILITIES } from '@/lib/admin/capabilities'
import type { Actor } from '@/lib/admin/rbac'
import type { AdminRole } from '@/lib/admin/roles'
import type { DepartmentId, DepartmentMembership, OrgRole, OrgScope } from '../types'

// THE AUTHORIZATION CONTRACT: department membership is NOT an input to resource
// authorization.
//
// `/api/admin/*` routes authorize through `requirePermission`, whose decision step
// is `permissionEngine.authorize(actor, permission)` (guards.ts). That engine
// receives an `Actor`, and an `Actor` has no membership field — so the API answer
// is a function of the actor's ROLE alone.
//
// A separate gate, `authorizeDepartmentResource`, *can* see memberships and does
// narrow by department — but it has no runtime caller, so it does not participate
// in what the API decides today.
//
// ⚠️ This file documents the ABSENCE of department resource isolation. Do not
// read it as proof of the opposite. If someone wires the scope gate into the
// routes, the last test here fails on purpose: the contract has changed and the
// documentation must change with it.

const ACTOR_ID = '00000000-0000-4000-8000-0000000000b1'

const AI_DATA: DepartmentId = 'ai_data'
const COMMERCE: DepartmentId = 'commerce'

/** ai_data owns this; `analyst` holds it. */
const P_AI_READ = 'analytics.auth.read'
/** commerce owns these; `analyst` holds neither (admin+ only). */
const P_COMMERCE_READ = 'commerce.deals.read'
const P_COMMERCE_WRITE = 'commerce.deals.update'
const P_COMMERCE_DELETE = 'commerce.deals.delete'

function actor(roles: AdminRole[]): Actor {
  return {
    userId: ACTOR_ID,
    email: 'staff@tappyai.com',
    isOwner: false,
    roles,
    highestRole: roles.length ? roles[roles.length - 1] : null,
    capabilities: NO_CAPABILITIES,
    source: 'cookie',
    resolvedAt: 0,
  }
}

const membership = (departmentId: DepartmentId, orgRole: OrgRole = 'DEPARTMENT_HEAD'): DepartmentMembership =>
  ({ userId: ACTOR_ID, departmentId, orgRole, scope: departmentId as OrgScope, status: 'active' })

/** The decision an /api/admin/* route actually reaches. */
const apiDecision = (a: Actor, p: string) => permissionEngine.authorize(a, p as never)

// ── 1. Membership cannot even be expressed as a PDP input ────────────────────
describe('membership is not expressible as an input to the PDP', () => {
  it('Actor carries no membership, department, scope or org field', () => {
    const keys = Object.keys(actor(['analyst'])).sort()
    expect(keys).toEqual([
      'capabilities', 'email', 'highestRole', 'isOwner', 'resolvedAt', 'roles', 'source', 'userId',
    ])
    expect(keys.some((k) => /member|depart|scope|org/i.test(k))).toBe(false)
  })

  it('authorize takes (actor, permission, now) — there is no membership parameter', () => {
    expect(permissionEngine.authorize.length).toBeLessThanOrEqual(3)
  })

  // Note deliberately NOT written as "same actor with vs without membership":
  // that comparison is unfalsifiable, because no such pair can be constructed.
  // The impossibility above IS the invariant.
})

// ── 2. The API answer is a function of role alone ────────────────────────────
describe('the API decision changes with role, and only with role', () => {
  it('`analyst` reaches the analytics read it holds', () => {
    expect(apiDecision(actor(['analyst']), P_AI_READ).allowed).toBe(true)
  })

  it('`analyst` is denied commerce read and commerce delete', () => {
    expect(apiDecision(actor(['analyst']), P_COMMERCE_READ).allowed).toBe(false)
    expect(apiDecision(actor(['analyst']), P_COMMERCE_DELETE).allowed).toBe(false)
  })

  it('promoting the SAME actor to `admin` flips commerce delete to ALLOW', () => {
    // The only thing that changed is the role — and the answer changed with it.
    expect(apiDecision(actor(['analyst']), P_COMMERCE_DELETE).allowed).toBe(false)
    expect(apiDecision(actor(['admin']), P_COMMERCE_DELETE).allowed).toBe(true)
  })
})

// ── 3. The real differential: the scope gate CAN see membership; the PDP cannot ──
describe('the scope gate distinguishes membership; the API path does not', () => {
  const admin = actor(['admin']) // admin so the PDP passes and SCOPE is what is under test
  const resource = { ownerDepartment: AI_DATA, permission: P_AI_READ as never }

  it('the gate answers DIFFERENTLY with and without the membership', () => {
    const withMembership = authorizeDepartmentResource(admin, [membership(AI_DATA)], resource)
    const withoutMembership = authorizeDepartmentResource(admin, [], resource)

    expect(withMembership.allowed).toBe(true)
    expect(withoutMembership).toMatchObject({ allowed: false, reason: 'NO_MEMBERSHIP' })
    // Falsifiable: if the gate ever stopped consulting memberships these would match.
    expect(withMembership.allowed).not.toBe(withoutMembership.allowed)
  })

  // The converse — that the API path cannot distinguish those two situations — is
  // already established twice: structurally by the Actor field list and the
  // `authorize` arity above, and contrastively by the commerce WRITE case below,
  // where the gate denies and the API path allows the very same call. A separate
  // single-call assertion would add no falsifiable coverage.

  it('a commerce WRITE is scope-denied by the gate while the API path allows it', () => {
    const gate = authorizeDepartmentResource(admin, [membership(AI_DATA)], {
      ownerDepartment: COMMERCE, permission: P_COMMERCE_WRITE as never,
    })
    expect(gate).toMatchObject({ allowed: false, reason: 'SCOPE_DENIED' })
    expect(apiDecision(admin, P_COMMERCE_WRITE).allowed).toBe(true)
  })

  it('a placeholder department confers nothing even through the gate', () => {
    const gate = authorizeDepartmentResource(admin, [membership('finance')], resource)
    expect(gate.allowed).toBe(false)
  })

  it('the gate denies before scope when the PDP already refused', () => {
    const analyst = actor(['analyst'])
    const gate = authorizeDepartmentResource(analyst, [membership(AI_DATA)], {
      ownerDepartment: COMMERCE, permission: P_COMMERCE_READ as never,
    })
    // PERMISSION_DENIED, not SCOPE_DENIED — the PDP is consulted first.
    expect(gate).toMatchObject({ allowed: false, reason: 'PERMISSION_DENIED' })
  })
})

// ── 4. The tripwire: the scope gate has no runtime caller ────────────────────
describe('authorizeDepartmentResource is not wired into any runtime path', () => {
  const SRC = join(process.cwd(), 'src')

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : walk(full)
      return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
    })
  }

  it('the scan is not vacuous — it reads the real source tree', () => {
    // A guard that silently scans nothing passes forever. This project has
    // shipped exactly that before, so prove the walker sees real files and that
    // its matcher fires on a file that genuinely contains the call.
    const files = walk(SRC)
    expect(files.length).toBeGreaterThan(200)
    const definition = readFileSync(join(SRC, 'lib/controller/org/authorization.ts'), 'utf8')
    expect(/\bauthorizeDepartmentResource\s*\(/.test(definition)).toBe(true)
  })

  it('has no call site outside its own definition and the barrel re-export', () => {
    const callers = walk(SRC).filter((file) => {
      if (file.endsWith(join('org', 'authorization.ts'))) return false // the definition
      if (file.endsWith(join('org', 'index.ts'))) return false          // the barrel re-export
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      return /\bauthorizeDepartmentResource\s*\(/.test(code)
    })

    // If this fails, the department scope gate has been wired into a runtime path.
    // That is a legitimate change — but it changes the authorization contract, so
    // update the F-10 documentation (which currently states that API authorization
    // is role/PDP-based) in the same change.
    expect(callers, `unexpected call sites: ${callers.join(', ')}`).toEqual([])
  })
})
