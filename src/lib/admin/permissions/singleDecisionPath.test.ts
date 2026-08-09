import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Controller V2 — Component 4: THE PDP IS THE ONLY DECISION SOURCE.
//
// Component 3 migrated every call site to the permission engine. Component 4's
// job is to make that irreversible: an authorization decision made anywhere
// else is a defect, not a style preference.
//
// These assertions read the SOURCE TREE rather than exercising behaviour. That
// is deliberate — behaviour tests prove the paths that exist are correct, and
// cannot see a new path someone adds tomorrow. This file fails the moment a
// second way to authorize appears.

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

/** Comment lines cannot authorize anything; only code counts. */
const codeLines = (src: string) =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')

describe('every API handler decides through the PDP', () => {
  const routes = ALL.filter((p) => rel(p).startsWith('app/api/admin/') && rel(p).endsWith('/route.ts'))

  it('finds the admin API surface', () => {
    expect(routes.length).toBeGreaterThanOrEqual(9)
  })

  it.each(routes.map((p) => [rel(p), p]))('%s gates only on requirePermission', (_name, path) => {
    const code = codeLines(read(path as string))
    const handlers = code.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? []
    const guards = code.match(/requirePermission\(req/g) ?? []

    // One guard per exported handler. Fewer means a handler is ungated.
    expect(guards.length).toBe(handlers.length)
  })

  it('no admin route imports a role-rank helper', () => {
    const offenders = routes.filter((p) => /\b(hasRole|ROLE_RANK)\b/.test(codeLines(read(p))))
    expect(offenders.map(rel)).toEqual([])
  })
})

describe('every admin page decides through the PDP', () => {
  const pages = ALL.filter((p) => rel(p).startsWith('app/admin/') && rel(p).endsWith('/page.tsx'))
  const root = ALL.filter((p) => rel(p) === 'app/admin/page.tsx')

  it('finds the admin page surface', () => {
    expect(pages.length + root.length).toBeGreaterThanOrEqual(8)
  })

  it.each([...pages, ...root].map((p) => [rel(p), p]))('%s calls requirePagePermission', (_name, path) => {
    expect(codeLines(read(path as string))).toMatch(/requirePagePermission\(PERMISSIONS\./)
  })

  it('the /admin layout resolves the Actor but makes no rank comparison', () => {
    const layout = codeLines(read(join(SRC, 'app/admin/layout.tsx')))
    // FOUNDATION-10C: the layout now goes through `resolveActorForPage`, the
    // page-surface wrapper that runs the corporate-identity boundary and turns
    // its denial into a redirect. It still resolves the FULL Actor — that is
    // what this assertion has always protected.
    //
    // ⚠️ Matches the CALL, not the import. The previous form (`/resolveActorForUser/`)
    // was satisfied by the import statement alone, so swapping the call for a
    // different resolver left this test green — found by mutation M-C7. An
    // assertion that a symbol is *mentioned* proves nothing about what runs.
    expect(layout).toMatch(/await resolveActorForPage\(/)
    expect(layout).not.toMatch(/\bhasRole\(/)
    expect(layout).not.toMatch(/\bROLE_RANK\b/)
  })
})

describe('the retired authorization paths stay retired', () => {
  it.each(['requireAdminRole', 'resolveAdminRole', 'AdminContext'])(
    '%s is not defined anywhere',
    (symbol) => {
      const defs = ALL.filter((p) =>
        new RegExp(`export (async function|function|interface) ${symbol}\\b`).test(read(p))
      )
      expect(defs.map(rel)).toEqual([])
    }
  )

  it('page-guard.ts is gone', () => {
    expect(ALL.map(rel)).not.toContain('lib/admin/page-guard.ts')
  })

  it('no file calls a deleted guard', () => {
    const callers = ALL.filter((p) => /\b(requireAdminRole|resolveAdminRole|requirePageRole)\s*\(/.test(codeLines(read(p))))
    expect(callers.map(rel)).toEqual([])
  })
})

describe('role rank survives only outside authorization', () => {
  // ROLE_RANK is not forbidden — it orders a display badge, gates disabled nav
  // placeholders whose modules do not exist yet, and powers the compatibility
  // lock. It must never decide access. This pins the exact allowed set, so a
  // new consumer has to justify itself here.
  const ALLOWED = new Set([
    'lib/admin/roles.ts', // the definition
    'lib/admin/rbac.ts', // highestRole(), a display/ordering concern
    'lib/admin/permissions/roleMap.ts', // maps roles to permissions; makes no decision
    'components/admin/layout/nav.ts', // disabled placeholders, documented as NOT authorization
  ])

  it('nothing outside the allow-list references ROLE_RANK or hasRole', () => {
    const users = ALL.filter((p) => /\b(ROLE_RANK|hasRole)\b/.test(codeLines(read(p)))).map(rel)
    expect(users.filter((f) => !ALLOWED.has(f))).toEqual([])
  })

  it('the permission engine itself never consults rank', () => {
    for (const f of ['engine.ts', 'resolver.ts', 'cache.ts', 'guards.ts', 'client.ts']) {
      const code = codeLines(read(join(SRC, 'lib/admin/permissions', f)))
      expect(code, f).not.toMatch(/\bROLE_RANK\b/)
      expect(code, f).not.toMatch(/\bhasRole\(/)
    }
  })
})

describe('the client/server boundary the PDP depends on', () => {
  it('no client component imports a server-only permissions module', () => {
    const clients = ALL.filter((p) => /^['"]use client['"]/m.test(read(p)))
    const offenders = clients.filter((p) =>
      /from '@\/lib\/admin\/(permissions'|permissions\/guards|permissions\/decisionAudit|rbac')/.test(read(p))
    )
    expect(offenders.map(rel)).toEqual([])
  })

  it('the audit writer is never pulled into the pure engine', () => {
    // decisionAudit reaches the service-role client. If engine.ts imported it,
    // the PDP would stop being client-safe and the whole layering would rot.
    for (const f of ['engine.ts', 'registry.ts', 'resolver.ts', 'roleMap.ts', 'cache.ts', 'client.ts', 'types.ts']) {
      expect(read(join(SRC, 'lib/admin/permissions', f)), f).not.toMatch(/from '\.\/decisionAudit'/)
    }
  })
})
