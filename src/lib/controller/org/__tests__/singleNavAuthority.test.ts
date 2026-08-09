import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// FOUNDATION-08 — the Controller has exactly ONE navigation authority: the
// registry-derived `deriveNavigation` (refined, not replaced, by
// `filterNavByDepartment`). A static `NAV[]` or a second nav builder is the
// architecture regression this repo removed in F-03 and must never return. This
// source-level guard fails RED if either reappears (mutation M6).

const ROOT = process.cwd()
function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const full = join(dir, e)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full)
  }
  return out
}
const SRC = walk(join(ROOT, 'src'))

describe('single navigation authority', () => {
  it('no static NAV[] authority exists anywhere in src', () => {
    const offenders = SRC.filter((f) => /export\s+const\s+NAV\b/.test(readFileSync(f, 'utf8')))
    expect(offenders, `static NAV[] reintroduced in: ${offenders.join(', ')}`).toEqual([])
  })

  it('no legacy visibleNavItems() navigation builder exists', () => {
    const offenders = SRC.filter((f) => /function\s+visibleNavItems\b/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('deriveNavigation is the one and only navigation builder', () => {
    const defs = SRC.filter((f) => /export\s+function\s+deriveNavigation\b/.test(readFileSync(f, 'utf8')))
    expect(defs).toHaveLength(1)
    expect(defs[0].replace(/\\/g, '/')).toContain('src/lib/controller/navigationProvider.ts')
  })

  it('filterNavByDepartment is a FILTER over NavGroups, not a second builder (takes groups in)', () => {
    const nav = readFileSync(join(ROOT, 'src/lib/controller/org/navDepartment.ts'), 'utf8')
    expect(nav).toMatch(/export function filterNavByDepartment\(\s*groups: readonly NavGroup\[\]/)
    // It must not CONSTRUCT navigation — no call to the builder or the registry
    // (a prose mention in a comment is fine; a call/import is not).
    expect(nav).not.toMatch(/deriveNavigation\s*\(/)
    expect(nav).not.toMatch(/import[^\n]*deriveNavigation/)
    expect(nav).not.toMatch(/buildAdminController\s*\(/)
  })

  it('the live shell composes exactly one authority then the department filter', () => {
    const layout = readFileSync(join(ROOT, 'src/app/admin/layout.tsx'), 'utf8')
    expect(layout).toContain('resolveAdminNavigation(actor)')
    expect(layout).toContain('filterNavByDepartment')
    expect(layout).not.toMatch(/export\s+const\s+NAV\b/)
  })
})
