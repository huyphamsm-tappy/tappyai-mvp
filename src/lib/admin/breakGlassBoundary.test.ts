import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Controller V2 — K-6 / B8: the break-glass surface must stay OUT of the app.
//
// The database proves the grant boundary (`owner_recovery_boundary.test.ts`:
// EXECUTE is held by nobody, including `service_role`). This file proves the
// other half — that no application code ever tries to reach it.
//
// Both are needed, and they fail differently. The grant test would still pass
// if someone added an API route calling the RPC: the call would simply 500 in
// production, and the defect would look like a bug rather than a boundary
// violation. This test fails at the moment the second authorization path is
// WRITTEN, which is when it is cheapest to remove.
//
// Same discipline as the `src/lib/admin.ts` removal guards: the surface stays
// closed rather than merely being closed today.

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|mjs)$/.test(entry)) out.push(full)
  }
  return out
}

const rel = (p: string) => p.slice(SRC.length + 1).replace(/\\/g, '/')
const ALL = walk(SRC)

/** Comment lines cannot call anything; only code counts. */
const codeLines = (src: string) =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')

describe('the application cannot reach break-glass recovery', () => {
  it.each([
    'fn_owner_recovery_arm',
    'fn_owner_recovery_execute',
    'fn_owner_recovery_cancel',
    'fn_owner_recovery_audit',
  ])('no source file references %s', (fn) => {
    const offenders = ALL.filter((p) => p !== __filename && codeLines(readFileSync(p, 'utf8')).includes(fn))
    expect(offenders.map(rel)).toEqual([])
  })

  it('no source file queries the recovery table', () => {
    const offenders = ALL.filter(
      (p) => p !== __filename && codeLines(readFileSync(p, 'utf8')).includes('platform_owner_recovery')
    )
    expect(offenders.map(rel)).toEqual([])
  })

  it('there is no admin route under a recovery/break-glass path', () => {
    // A route file is the shape a second authorization path would take.
    const routes = ALL.filter((p) => /app\/api\/.*\/(recovery|break-glass|breakglass)\//.test(rel(p)))
    expect(routes.map(rel)).toEqual([])
  })

  it('the `system` audit actor is not constructible from application code', () => {
    // D4's sentinel belongs to the SQL writer alone. If the application could
    // mint it, an ordinary admin action could be recorded as a system one,
    // which is the audit trail lying about who acted.
    const offenders = ALL.filter(
      (p) => p !== __filename && codeLines(readFileSync(p, 'utf8')).includes('break-glass@system.invalid')
    )
    expect(offenders.map(rel)).toEqual([])
  })
})
