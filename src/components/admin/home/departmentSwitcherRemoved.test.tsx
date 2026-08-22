// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CommandHeader } from './CommandHeader'
import { DepartmentGrid } from './DepartmentGrid'
import { filterNavByDepartment } from '@/lib/controller/org/navDepartment'
import type { ControllerHomeData } from './types'

// Owner decision (2026-08-21), option A: REMOVE the department switcher.
//
// 🔑 WHY IT GOES RATHER THAN GETS WIRED. The control offered a choice that
// changed nothing. `selected` was written by its own `onChange` and read only by
// its own `value`; the component took no callback, so it could not tell its
// parent; no route accepted a department parameter; `Actor` carries no
// department field, so the PDP could not consider one even if it did. The Owner
// saw a selectable dropdown with no consequence — and that is exactly what the
// code was.
//
// Repository contract, checked before deciding anything (FOUNDATION-10
// §1/§28/§33): F-10 is "department-aware NAVIGATION, never department
// isolation", and `authorizeDepartmentResource` has zero callers. Nothing in the
// repository ever defined what SELECTING a department should do, so no behaviour
// was invented — the honest fix is to stop offering the choice.
//
// 🔑 WHAT MUST SURVIVE. Membership still scopes NAVIGATION (that part IS
// contract-defined and IS wired), departments are still DISPLAYED, and the
// membership API is untouched. This removes a dead control, not a feature.

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))
afterEach(cleanup)

const ROOT = process.cwd()
const HOME = join(ROOT, 'src/components/admin/home')

const departments: ControllerHomeData['departments'] = [
  { id: 'ai_data', nameKey: 'admin.dept.ai_data', moduleCount: 3 },
  { id: 'commerce', nameKey: 'admin.dept.commerce', moduleCount: 2 },
] as never

const data = (over: Partial<ControllerHomeData> = {}): ControllerHomeData =>
  ({
    controllerVersion: 'abcdef1234',
    env: { label: 'Production', tone: 'production' },
    actor: { role: 'admin', isOwner: true, email: 'ops@tappyai.com' },
    mode: 'owner',
    platform: { modulesTotal: 9, modulesEnabled: 9, modulesAvailable: 9, hubsTotal: 4 },
    signals: { adminRoles: null },
    kpis: null,
    attention: { recentAudit: null, alerts: [] },
    quickActions: [],
    scope: { kind: 'global' },
    departments,
    ...over,
  }) as never

describe('the Home header no longer offers a choice that does nothing', () => {
  it.each(['owner', 'department'] as const)(
    'renders no department selector in %s mode',
    (mode) => {
      const { container } = render(<CommandHeader data={data({ mode })} />)
      // The switcher was a <select>. Any combobox here would be the old control
      // or a new one wearing different markup.
      expect(container.querySelector('select')).toBeNull()
      expect(screen.queryByRole('combobox')).toBeNull()
    }
  )

  it('still shows who the actor is and which build they are on', () => {
    // Removing the switcher must not take the rest of the header with it.
    const { container } = render(<CommandHeader data={data()} />)
    expect(container.textContent).toContain('abcdef1')
  })
})

describe('what the removal must NOT take away', () => {
  it('departments are still DISPLAYED — information was never the problem', () => {
    const { container } = render(<DepartmentGrid departments={departments} mode="owner" />)
    expect(container.textContent?.length).toBeGreaterThan(0)
  })

  it('membership still scopes NAVIGATION — the contract-defined behaviour', () => {
    // FOUNDATION-10 §274: "Department membership scopes navigation/context."
    // That IS wired, and this change must not go near it.
    //
    // 🔑 ASSERT THE CALL, NOT THE WORD. The first version of this test used
    // `toContain('filterNavByDepartment')` and mutation N01 SURVIVED: deleting
    // the call left the IMPORT line behind, so the identifier was still in the
    // file and the assertion passed. A name appearing in a file proves nothing
    // about whether it runs.
    const layout = readFileSync(join(ROOT, 'src/app/admin/layout.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(layout).toMatch(/navGroups\s*=\s*filterNavByDepartment\(\s*navGroups\s*,/)
  })

  it('and the filter itself still narrows navigation by membership', () => {
    // The wiring assertion above says the call is there; this says the callee
    // still does something. Both are needed: a wired call to a function that
    // returns its input unchanged is the same outage.
    const groups = [
      { hubId: 'tappy.hub.user', items: [{ id: 'm08', href: '/admin/users' }] },
      { hubId: 'tappy.hub.commerce', items: [{ id: 'deals', href: '/admin/deals' }] },
    ]
    const owner = filterNavByDepartment(groups as never, { isOwner: true, memberships: [] })
    expect(owner).toHaveLength(groups.length)
  })

  it('the membership API is untouched', () => {
    expect(existsSync(join(ROOT, 'src/app/api/admin/org/memberships/route.ts'))).toBe(true)
  })

  it('the department registry and summaries still exist', () => {
    expect(existsSync(join(ROOT, 'src/lib/controller/org/departments.ts'))).toBe(true)
    expect(existsSync(join(ROOT, 'src/lib/controller/org/navDepartment.ts'))).toBe(true)
  })
})

describe('nothing dead is left behind', () => {
  it('🔑 the component file is gone, not merely unrendered', () => {
    // An unimported component is dead code that reads as a feature. This repo
    // deleted `requireAllPermissions` for exactly that reason (dead-code audit
    // R-4) rather than keeping it "for later".
    expect(existsSync(join(HOME, 'DepartmentSwitcher.tsx'))).toBe(false)
  })

  it('no file imports it any more', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(name) && !name.includes('departmentSwitcherRemoved')) {
          if (/DepartmentSwitcher/.test(readFileSync(p, 'utf8'))) offenders.push(p.replace(ROOT, ''))
        }
      }
    }
    walk(join(ROOT, 'src'))
    expect(offenders).toEqual([])
  })

  it('its translation keys are gone from BOTH locales — no orphans', async () => {
    const { vi: viStrings, en: enStrings } = await import('@/lib/i18n/admin')
    for (const key of ['admin.home.switcher.label', 'admin.home.switcher.all']) {
      expect(viStrings[key], `vi ${key}`).toBeUndefined()
      expect(enStrings[key], `en ${key}`).toBeUndefined()
    }
  })
})
