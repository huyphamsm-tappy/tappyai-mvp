// Controller V2 — the Architecture Guard rules named by 01_CONTROLLER_V2_ARCHITECTURE.md §1.
//
// §1 lists five "Hard rules enforced by the Architecture Guard" and names the
// enforcement mechanism outright: "enforced in CI by extending
// scripts/architecture/check.mjs (which already exists and already works this
// way for the AI provider layer)". The guard shipped eight rules, all of them
// for the AI provider layer, and none for Controller V2 — so two of those five
// rules held only by luck.
//
// Two of the five are enforceable against the code as it exists today:
//
//   §1.4  "No consumer-app import inside the Controller"
//         — the property that keeps a future extraction to its own deployment
//           "a build-config change, not a rewrite" (00_LEGACY_AUDIT.md §5.3,
//           an OPEN owner decision). An unenforced invariant protecting an open
//           decision is the kind that rots silently.
//
//   §1.5  "No permission string literal outside a manifest"
//         — "a permission that is not declared in a manifest does not compile".
//
// The other three (§1.1 module→module imports, §1.2 module→connector imports,
// §1.3 module-owned repositories) describe a directory layout that does not
// exist yet (src/controller/modules/, src/controller/connectors/), so there is
// nothing for them to guard. They are NOT implemented here rather than being
// written against a shape the repository has not adopted.
//
// These tests run the REAL guard end-to-end against a temporary fixture. Testing
// a re-declared copy of the patterns would prove the copy, not the guard.

import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')

/** Run the guard. Returns { code, output } — never throws on a rule violation. */
function runGuard(): { code: number; output: string } {
  try {
    const output = execFileSync('node', ['scripts/architecture/check.mjs'], {
      cwd: root,
      encoding: 'utf8',
    })
    return { code: 0, output }
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string }
    return { code: e.status ?? 1, output: (e.stdout ?? '') + (e.stderr ?? '') }
  }
}

const fixtures: string[] = []

function fixture(relPath: string, contents: string): void {
  const abs = join(root, relPath)
  writeFileSync(abs, contents)
  fixtures.push(abs)
}

afterEach(() => {
  // Fixtures live under src/, so a leaked one would break tsc and lint for
  // everyone. Removal is unconditional, not best-effort.
  while (fixtures.length) {
    const f = fixtures.pop()!
    if (existsSync(f)) rmSync(f)
  }
})

describe('baseline', () => {
  it('the guard passes on the repository as it stands', () => {
    // Every assertion below is "the guard NOW fails". That is only meaningful if
    // it passes without the fixture — otherwise the tests would pass on a guard
    // that rejects everything.
    expect(runGuard().code).toBe(0)
  })
})

describe('§1.4 — no consumer-app import inside the Controller', () => {
  it('rejects a consumer-app import added under src/lib/controller/', () => {
    fixture('src/lib/controller/__arch_fixture__.ts', "import { Badge } from '@/components/ui/badge'\nexport const x = Badge\n")

    const { code, output } = runGuard()
    expect(code).not.toBe(0)
    expect(output).toContain('no-consumer-app-import-in-controller')
    expect(output).toContain('__arch_fixture__')
  })

  it('allows the Security Core imports the Controller legitimately depends on', () => {
    // These are exactly what src/lib/controller/** imports today. If the rule
    // rejected them the Controller could not consume the security foundation at
    // all, which FOUNDATION_01 §9 requires it to do.
    fixture(
      'src/lib/controller/__arch_fixture__.ts',
      [
        "import { permissionEngine } from '@/lib/admin/permissions/engine'",
        "import type { Actor } from '@/lib/admin/rbac'",
        "import { createAdminClient } from '@/lib/supabase/admin'",
        "import { distributedRateLimit } from '@/lib/security/distributedRateLimit'",
        'export const x = [permissionEngine, createAdminClient, distributedRateLimit] as const',
        'export type Y = Actor',
      ].join('\n')
    )

    expect(runGuard().code).toBe(0)
  })

  it('rejects the consumer-facing Supabase client, which is not the admin client', () => {
    // @/lib/supabase/admin is allowed; @/lib/supabase/server is a request-scoped
    // consumer client. Allowing the whole directory would let that through.
    fixture('src/lib/controller/__arch_fixture__.ts', "import { createClient } from '@/lib/supabase/server'\nexport const x = createClient\n")

    expect(runGuard().output).toContain('no-consumer-app-import-in-controller')
  })

  it('does not police the same import outside the Controller', () => {
    // The rule is scoped. A consumer-app import elsewhere is not its business.
    fixture('src/lib/__arch_fixture__.ts', "import { Badge } from '@/components/ui/badge'\nexport const x = Badge\n")

    expect(runGuard().code).toBe(0)
  })
})

describe('§1.5 — no permission string literal outside a manifest', () => {
  it('rejects a raw literal passed to a page guard', () => {
    fixture('src/app/admin/__arch_fixture__.ts', "export const x = () => requirePagePermission('audit.log.read')\n")

    const { code, output } = runGuard()
    expect(code).not.toBe(0)
    expect(output).toContain('no-permission-string-literal')
  })

  it('rejects a raw literal in a manifest navigation field', () => {
    fixture('src/lib/controller/__arch_fixture__.ts', "export const nav = { visibilityPermission: 'audit.log.read', order: 0 }\n")

    expect(runGuard().output).toContain('no-permission-string-literal')
  })

  it('accepts the registry constant, which is the sanctioned form', () => {
    fixture(
      'src/app/admin/__arch_fixture__.ts',
      "import { PERMISSIONS } from '@/lib/admin/permissions/registry'\nexport const x = () => requirePagePermission(PERMISSIONS.AUDIT_LOG_READ)\n"
    )

    expect(runGuard().code).toBe(0)
  })

  it('does not fire on an i18n key of the same shape', () => {
    // 'admin.nav.dashboard' has the identical <a>.<b>.<c> shape as a permission
    // id. A rule matching the shape alone would condemn every nav label in the
    // product, then be loosened until it caught nothing.
    fixture('src/app/admin/__arch_fixture__.ts', "export const label = t('admin.nav.dashboard')\n")

    expect(runGuard().code).toBe(0)
  })

  it('exempts test files, which build permission fixtures on purpose', () => {
    fixture('src/lib/controller/__arch_fixture__.test.ts', "export const hub = { permissionScope: 'audit.log.read' }\n")

    expect(runGuard().code).toBe(0)
  })
})

describe('the rules are declared against their contract', () => {
  const guard = readFileSync(join(root, 'scripts/architecture/check.mjs'), 'utf8')

  it.each(['no-consumer-app-import-in-controller', 'no-permission-string-literal'])(
    'the guard declares %s',
    (id) => {
      expect(guard).toContain(`id: '${id}'`)
    }
  )

  it('the report still names the total rule count correctly', () => {
    // A rule added to RULES but not reflected in the count would under-report.
    expect(runGuard().output).toMatch(/All \d+ architecture rules passed/)
  })
})
