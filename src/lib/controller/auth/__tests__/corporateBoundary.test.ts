import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// FOUNDATION-10C — THE BOUNDARY IS SINGULAR AND UNBYPASSABLE.
//
// `corporateIdentity.test.ts` proves the policy decides correctly.
// `rbac.test.ts` proves the API identity path enforces it.
// Neither can see a NEW surface someone adds tomorrow that resolves an identity
// its own way. These assertions read the SOURCE TREE — the same instrument
// Component 4 used in `singleDecisionPath.test.ts`, for the same reason: a
// behaviour test proves the paths that exist are correct and is blind to a path
// that does not exist yet.

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const rel = (p: string) => p.slice(SRC.length + 1).replace(/\\/g, '/')
const ALL = walk(SRC)
const read = (p: string) => readFileSync(p, 'utf8')

/** Comment lines enforce nothing; only code counts. */
const codeLines = (src: string) =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')

describe('exactly one corporate identity authority', () => {
  it('only corporateIdentity.ts defines the corporate domain', () => {
    const definers = ALL.filter((p) => /['"`]tappyai\.com['"`]/.test(codeLines(read(p)))).map(rel)
    expect(definers).toEqual(['lib/controller/auth/corporateIdentity.ts'])
  })

  it('only rbac.ts consumes the decision', () => {
    // A second consumer would be a second place the boundary is interpreted,
    // and therefore a second place it can be interpreted differently. The
    // definition site itself is excluded — `export function checkCorporateIdentity(`
    // matches a call-shaped regex but is the authority, not a consumer.
    const POLICY = 'lib/controller/auth/corporateIdentity.ts'
    const consumers = ALL.filter(
      (p) => rel(p) !== POLICY && /\bcheckCorporateIdentity\s*\(/.test(codeLines(read(p)))
    ).map(rel)
    expect(consumers).toEqual(['lib/admin/rbac.ts'])
  })

  it('nobody hand-rolls a domain check', () => {
    const offenders = ALL.filter((p) =>
      /\.endsWith\(\s*['"`]@?[a-z0-9.-]*tappyai/i.test(codeLines(read(p)))
    ).map(rel)
    expect(offenders).toEqual([])
  })
})

describe('the boundary sits at the single Actor construction site', () => {
  const rbac = codeLines(read(join(SRC, 'lib/admin/rbac.ts')))

  it('resolveActorForUser takes the verified user object, not a loose email', () => {
    // THE security property of the signature: a caller has no email parameter
    // to forge. It can only pass an object it got from `auth.getUser()`.
    expect(rbac).toMatch(/export async function resolveActorForUser\(\s*user:/)
    expect(rbac).not.toMatch(/resolveActorForUser\(\s*userId: string,\s*email:/)
  })

  it('the corporate check runs before the principal is resolved', () => {
    const check = rbac.indexOf('checkCorporateIdentity(')
    const principal = rbac.indexOf('await resolvePrincipal(')
    expect(check).toBeGreaterThan(-1)
    expect(principal).toBeGreaterThan(-1)
    // Ordering is the owner-specified chain: verified corporate identity → Actor
    // → PDP. A denial must cost no role lookup and must never produce a principal.
    expect(check).toBeLessThan(principal)
  })

  it('a denial is a fail-closed throw, not a boolean the caller may ignore', () => {
    expect(rbac).toMatch(/if \(!identity\.ok\)[\s\S]{0,200}throw new AdminError\('FORBIDDEN'/)
  })
})

describe('no surface resolves an identity around the boundary', () => {
  // Every server-side path into the Controller must obtain its principal through
  // resolveActorForUser / resolveActor / resolveActorForPage. Anything under
  // app/admin or app/api/admin that calls auth.getUser() and then builds its own
  // notion of "who this is" would be a bypass.
  const controllerSurfaces = ALL.filter(
    (p) => rel(p).startsWith('app/admin/') || rel(p).startsWith('app/api/admin/')
  )

  it('finds the Controller surface', () => {
    expect(controllerSurfaces.length).toBeGreaterThanOrEqual(15)
  })

  it.each(controllerSurfaces.map((p) => [rel(p), p]))(
    '%s never reads an email off the request',
    (_name, path) => {
      const code = codeLines(read(path as string))
      // A request-supplied email is the forged-identity attack. No Controller
      // surface has any reason to read one.
      expect(code).not.toMatch(/headers\.get\(\s*['"][^'"]*email/i)
      expect(code).not.toMatch(/body[.\s]*\.?\s*email\b/)
    }
  )

  it('only the three trusted guards construct an Actor', () => {
    const builders = ALL.filter((p) =>
      /\bresolveActorFor(User|Page)\s*\(/.test(codeLines(read(p)))
    ).map(rel)
    expect(builders.sort()).toEqual(
      [
        'app/admin/layout.tsx',
        'lib/admin/permissions/guards.ts',
        'lib/admin/rbac.ts',
      ].sort()
    )
  })

  it('PAGE surfaces resolve through resolveActorForPage, so a denial redirects', () => {
    // `resolveActorForUser` signals denial by THROWING — correct for an API
    // handler, which maps AdminError to a 403 envelope, but in a server
    // component an uncaught AdminError becomes a 500 error page instead of a
    // redirect. Still fail-closed (no access is granted either way), but a
    // degraded failure mode, so the page surfaces are pinned to the wrapper.
    //
    // ⚠️ Asserts the CALL, not the import. Mutation M-C7 swapped the call and
    // stayed GREEN against an assertion that only required the symbol to appear
    // — the import line satisfied it. An inert guard manufactures confidence.
    const layout = codeLines(read(join(SRC, 'app/admin/layout.tsx')))
    expect(layout).toMatch(/await resolveActorForPage\(/)
    expect(layout).not.toMatch(/await resolveActorForUser\(/)

    const guards = codeLines(read(join(SRC, 'lib/admin/permissions/guards.ts')))
    // requirePagePermission is the other page surface; inside guards.ts the
    // wrapper itself is the one legitimate caller of resolveActorForUser.
    expect(guards).toMatch(/const actor = await resolveActorForPage\(user\)/)
  })
})

describe('the boundary does not become a second authorization authority', () => {
  const policy = codeLines(read(join(SRC, 'lib/controller/auth/corporateIdentity.ts')))

  it('the policy module reads no role, membership, department or permission', () => {
    for (const forbidden of [
      /\badmin_roles\b/,
      /\bisPlatformOwner\b/,
      /\bpermissionEngine\b/,
      /\bpermissionCache\b/,
      /\bdepartment\b/i,
      /\bmembership\b/i,
      /\bPERMISSIONS\b/,
    ]) {
      expect(policy, String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('the policy module imports nothing but a type', () => {
    const imports = policy.match(/^import .*$/gm) ?? []
    expect(imports).toEqual(["import type { User } from '@supabase/supabase-js'"])
  })

  it('there is still exactly one PDP and one audit writer', () => {
    // The boundary must not have introduced a parallel decision or a second
    // durable trace. A corporate denial happens before an Actor exists, so it
    // cannot be — and is not — written through the authorization audit path.
    const engines = ALL.filter((p) => /export const permissionEngine\b/.test(read(p))).map(rel)
    expect(engines).toEqual(['lib/admin/permissions/engine.ts'])

    const writers = ALL.filter((p) => /export (async )?function writeAuditLog\b/.test(read(p))).map(rel)
    expect(writers).toEqual(['lib/admin/audit.ts'])

    expect(policy).not.toMatch(/writeAuditLog|auditAuthorizationDecision/)
  })
})
