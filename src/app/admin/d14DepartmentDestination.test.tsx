// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'
import { DEPARTMENTS } from '@/lib/controller/org/departments'
import { DepartmentGrid } from '@/components/admin/home/DepartmentGrid'

// Controller V2.4 — THE DEPARTMENT DESTINATION CONTRACT (Owner decision,
// 2026-08-29). RED tests: the implementation does not exist yet.
//
// THE CONTRACT, restated so a future reader does not have to reconstruct it:
//
//   Login → Workspace Chooser → /admin?dept=<id> → the department's scoped
//   Home → the user picks a function from there.
//
//   · the chooser NEVER jumps straight into a module
//   · `DepartmentCard` stays display-only (the V2.1 decision stands)
//   · a department's functions are its REGISTRY-OWNED modules, intersected with
//     what the PDP actually grants this actor — never one without the other
//   · a department with no modules is still selectable, and says so
//   · selection is presentation; it grants nothing
//
// 🔑 THE PDP, THE REGISTRY AND THE NAVIGATION ARE REAL HERE. Only the I/O edges
// are mocked (Supabase, KPIs, the membership seam). If `deriveNavigation` or
// `permissionEngine` were stubbed, these tests would be asserting against my
// fixtures instead of against the product, and a green result would mean
// nothing. That distinction is the whole reason this file exists: the resolver
// and the chooser each had passing unit tests while the feature was broken.

const ControllerHome = vi.fn(() => null)
vi.mock('@/components/admin/home/ControllerHome', () => ({ ControllerHome }))

const actorBase = { userId: 'u1', email: 'someone@tappyai.com', highestRole: 'analyst' }
let currentActor: { userId: string; email: string; highestRole: string; roles: string[]; isOwner: boolean }

vi.mock('@/lib/admin/permissions', async () => {
  // The REAL permission ids — only the guard is short-circuited, because
  // authorization has its own suites and this file is about destinations.
  const real = await vi.importActual<typeof import('@/lib/admin/permissions')>('@/lib/admin/permissions')
  return { ...real, requirePagePermission: vi.fn(async () => ({ actor: currentActor })) }
})

// Supabase is never reached for department data; this only satisfies the
// PDP-gated signal branches if the actor happens to be authorized for them.
const chain = {
  select: () => ({
    eq: () => ({ maybeSingle: async () => ({ data: null }) }),
    order: () => ({ limit: async () => ({ data: [], error: null }) }),
  }),
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => chain }) }))
vi.mock('@/lib/admin/analytics/homeSnapshotService', () => ({ fetchHomeKpis: async () => ({ status: 'empty' }) }))

let context: {
  isOwner: boolean
  scope: { isGlobal: boolean; departmentIds: string[] }
  memberships: Array<{ userId: string; departmentId: string; orgRole: string; scope: string; status: string }>
  allowedModules: string[]
}
vi.mock('@/lib/controller/org/server', () => ({ resolveDepartmentContext: async () => context }))

const membership = (departmentId: string, status: 'active' | 'suspended' = 'active') => ({
  userId: 'u1', departmentId, orgRole: 'member', scope: departmentId, status,
})

const setActor = (opts: { role?: string; isOwner?: boolean; memberships?: ReturnType<typeof membership>[] }) => {
  const memberships = opts.memberships ?? []
  currentActor = {
    ...actorBase,
    highestRole: opts.role ?? 'analyst',
    roles: opts.isOwner ? [] : [opts.role ?? 'analyst'],
    isOwner: opts.isOwner ?? false,
  }
  context = {
    isOwner: opts.isOwner ?? false,
    scope: { isGlobal: opts.isOwner ?? false, departmentIds: memberships.filter((m) => m.status === 'active').map((m) => m.departmentId) },
    memberships,
    allowedModules: [],
  }
}

const visitAdmin = async (dept?: string): Promise<ReactElement> => {
  const { default: AdminHomePage } = await import('./page')
  return (await AdminHomePage({ searchParams: dept === undefined ? {} : { dept } })) as ReactElement
}

/**
 * Every route the Home OFFERS the user as an actionable function.
 *
 * Deliberately implementation-agnostic: it unions every array on `data` whose
 * entries carry a `route`. Today that is `quickActions`; a future
 * `departmentModules` field would be picked up without editing this test. The
 * contract is "the Home offers these functions", not "the Home has this field".
 */
const offeredRoutes = (el: ReactElement): string[] => {
  const data = (el.props as { data?: Record<string, unknown> }).data ?? {}
  const out = new Set<string>()
  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue
    for (const item of value) {
      const r = (item as { route?: unknown })?.route
      if (typeof r === 'string') out.add(r)
    }
  }
  return [...out]
}

/** moduleId -> owning department, straight from the registry. */
const ROUTE_OWNER = new Map<string, string>()
const DEPT_ROUTES = new Map<string, string[]>()

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  cleanup()
  setActor({})
  if (ROUTE_OWNER.size === 0) {
    const { buildAdminController } = await import('@/lib/controller/registry/adminModules')
    const modules = buildAdminController().discover()
    // ⚠️ TWO shape traps here, both of which produced a SILENT empty map:
    //   1. `discover()` returns RegisteredModule = { manifest, status, available },
    //      so the id and routes live under `.manifest`, not on the item.
    //   2. the manifest field is `routes: string[]` (see `mod()` in
    //      adminModules.ts), never `route`.
    // Either mistake emptied ROUTE_OWNER and made every `toEqual([])` below pass
    // VACUOUSLY. `requireRegistry` now makes that impossible to miss.
    // No inline shape annotation: `discover()` is typed `RegisteredModule[]`
    // already, so restating the shape here only creates a second, weaker copy
    // that can disagree with the real one — which is what it did (`routes?`
    // optional vs required, caught by tsc).
    const routeOf = new Map(modules.map((m) => [m.manifest.id, m.manifest.routes[0] ?? '']))
    for (const [id, d] of Object.entries(DEPARTMENTS)) {
      const routes = d.modules.map((m) => routeOf.get(m) ?? '').filter(Boolean)
      DEPT_ROUTES.set(id, routes)
      for (const r of routes) ROUTE_OWNER.set(r, id)
    }
  }
})

/**
 * ⚠️ VACUOUS-PASS GUARD. Several assertions below are `toEqual([])`. If the
 * registry lookup ever returns nothing, `departmentOwnedOffered` returns [] for
 * every input and those tests go green while proving nothing — which is exactly
 * what happened on the first run of this file.
 */
const requireRegistry = () => {
  expect(ROUTE_OWNER.size, 'registry lookup is empty — assertions would be vacuous').toBeGreaterThan(0)
  expect(DEPT_ROUTES.get('ai_data') ?? [], 'ai_data owns no routes — assertions would be vacuous').toHaveLength(3)
}

/** Of the routes offered, only those a department OWNS. Neutral ones are fine. */
const departmentOwnedOffered = (el: ReactElement): string[] => {
  requireRegistry()
  return offeredRoutes(el).filter((r) => ROUTE_OWNER.has(r))
}

// ── A. CHOOSER ─────────────────────────────────────────────────────────────
describe('A · the chooser sends you to the department Home, never into a module', () => {
  const visitChooser = async () => {
    setActor({ memberships: [membership('ai_data'), membership('marketing')] })
    return visitAdmin()
  }

  it('ai_data links to exactly /admin?dept=ai_data', async () => {
    const { container } = render(await visitChooser())
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/admin?dept=ai_data')
  })

  it('marketing links to exactly /admin?dept=marketing', async () => {
    const { container } = render(await visitChooser())
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/admin?dept=marketing')
  })

  it('🔑 no chooser link jumps straight into a module route', async () => {
    const { container } = render(await visitChooser())
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')
    for (const href of hrefs) {
      expect(href, `chooser jumps into a module: ${href}`).toMatch(/^\/admin\?dept=[a-z_]+$/)
    }
  })
})

// ── B. AI/DATA DEPARTMENT HOME ─────────────────────────────────────────────
describe('B · the AI/Data Home offers its three established functions', () => {
  const AI_DATA_ROUTES = ['/admin/analytics', '/admin/analytics/auth', '/admin/analytics/activation']

  it('🔑 offers Analytics, Auth and Activation — the real registry routes', async () => {
    setActor({ role: 'analyst', memberships: [membership('ai_data')] })
    const offered = offeredRoutes(await visitAdmin('ai_data'))

    for (const route of AI_DATA_ROUTES) {
      expect(offered, `AI/Data Home does not offer ${route}`).toContain(route)
    }
  })

  it('🔑 offers NO other department’s functions', async () => {
    // The registry is the source of truth for the route set; nothing is hard-coded
    // here beyond the department id itself.
    setActor({ role: 'analyst', memberships: [membership('ai_data')] })
    const owned = departmentOwnedOffered(await visitAdmin('ai_data'))
    const expected = DEPT_ROUTES.get('ai_data') ?? []

    expect([...owned].sort(), 'the scoped Home leaks another department’s functions').toEqual([...expected].sort())
  })

  it('the offered routes match the module registry exactly, not a hand-written list', async () => {
    requireRegistry()
    expect([...(DEPT_ROUTES.get('ai_data') ?? [])].sort()).toEqual([...AI_DATA_ROUTES].sort())
  })
})

// ── C. MARKETING ───────────────────────────────────────────────────────────
describe('C · marketing is selectable and honest about having no modules', () => {
  it('is selectable — an active membership is enough', async () => {
    setActor({ memberships: [membership('marketing')] })
    const el = await visitAdmin('marketing')
    expect(el.type).toBe(ControllerHome)
  })

  it('🔑 offers exactly its own five functions to an authorized member', async () => {
    // SUPERSEDED 2026-08-29. This test used to assert marketing offered NOTHING,
    // which was correct while `marketing.modules` was [] and inventing modules
    // was forbidden. The Owner has since defined and frozen the five module
    // groups, so the contract is now "exactly its own five, and no other
    // department's" — the same invariant, against a different registry.
    setActor({ role: 'admin', memberships: [membership('marketing')] })
    const owned = departmentOwnedOffered(await visitAdmin('marketing'))

    expect([...owned].sort(), 'marketing was not offered exactly its own functions').toEqual(
      [...(DEPT_ROUTES.get('marketing') ?? [])].sort()
    )
    expect(owned, 'marketing leaked an AI/Data function').not.toContain('/admin/analytics')
    expect(owned, 'marketing leaked a Commerce function').not.toContain('/admin/deals')
  })

  it('🔑 an analyst member is offered ONLY marketing analytics — ownership INTERSECTED with the PDP', async () => {
    // `marketing.analytics.read` reaches analyst; the four CRUD reads stop at
    // admin. So the same department offers a different set to a different role,
    // which is exactly what "ownership AND authorization" has to mean.
    setActor({ role: 'analyst', memberships: [membership('marketing')] })
    const owned = departmentOwnedOffered(await visitAdmin('marketing'))

    expect(owned).toEqual(['/admin/marketing/analytics'])
  })

  it('owns exactly the five approved module groups — no sixth', async () => {
    expect([...DEPARTMENTS.marketing.modules].sort()).toEqual([
      'tappy.hub.marketing.analytics',
      'tappy.hub.marketing.audience',
      'tappy.hub.marketing.campaigns',
      'tappy.hub.marketing.content',
      'tappy.hub.marketing.promotions',
    ])
    expect(DEPARTMENTS.marketing.ownedPermissions).toHaveLength(15)
  })
})

// ── D. PLACEHOLDER DEPARTMENT ──────────────────────────────────────────────
describe('D · a placeholder department behaves the same way', () => {
  it('is selectable for an active member', async () => {
    setActor({ memberships: [membership('engineering')] })
    expect((await visitAdmin('engineering')).type).toBe(ControllerHome)
  })

  it('🔑 offers no department function and invents no route', async () => {
    // Placeholder departments are where the approved empty state still applies —
    // marketing left this population on 2026-08-29, engineering did not.
    setActor({ memberships: [membership('engineering')] })
    const owned = departmentOwnedOffered(await visitAdmin('engineering'))

    expect(owned, 'a placeholder department was given functions').toEqual([])
    expect(DEPARTMENTS.engineering.modules).toEqual([])
  })
})

// ── E. DEPARTMENT CARD STAYS DISPLAY-ONLY ──────────────────────────────────
describe('E · DepartmentCard is not navigation', () => {
  // Complements the existing isolated DepartmentCard test by asserting it at the
  // GRID level, which is how the scoped Home actually renders it.
  it('the scoped Home’s department grid contains no link or click affordance', () => {
    const { container } = render(
      <DepartmentGrid
        departments={[{ id: 'ai_data', nameKey: 'admin.dept.aiData', status: 'defined', moduleCount: 3, inScope: true }] as never}
        mode={'department' as never}
      />
    )
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('[role="button"]')).toBeNull()
    expect(container.querySelector('[role="link"]')).toBeNull()
    expect(container.querySelector('[href]')).toBeNull()
  })
})

// ── F. AUTHORIZATION ───────────────────────────────────────────────────────
describe('F · department selection never grants authorization', () => {
  it('🔑 the commerce edge case — a member the PDP refuses is offered nothing', async () => {
    // `commerce.deals.read` is admin/super_admin only, so an `analyst` member of
    // commerce must NOT be offered /admin/deals. Availability is department
    // modules INTERSECTED with real PDP grants — never one without the other,
    // and never a redirect into a route that would predictably deny.
    setActor({ role: 'analyst', memberships: [membership('commerce')] })
    const offered = offeredRoutes(await visitAdmin('commerce'))

    expect(offered, 'offered a route the PDP will refuse').not.toContain('/admin/deals')
    expect(departmentOwnedOffered(await visitAdmin('commerce'))).toEqual([])
  })

  it('an authorized member IS offered the same department’s function', async () => {
    // The mirror of the case above: same department, sufficient role.
    setActor({ role: 'admin', memberships: [membership('commerce')] })
    const offered = offeredRoutes(await visitAdmin('commerce'))

    expect(offered, 'an authorized commerce member was not offered Deals').toContain('/admin/deals')
  })

  it('?dept= alters no actor, role, scope or mode field', async () => {
    setActor({ memberships: [membership('ai_data'), membership('marketing')] })
    const a = (await visitAdmin('ai_data')).props as { data: Record<string, unknown> }
    const b = (await visitAdmin('marketing')).props as { data: Record<string, unknown> }

    expect(b.data.actor).toEqual(a.data.actor)
    expect(b.data.mode).toEqual(a.data.mode)
    expect(b.data.scope).toEqual(a.data.scope)
  })

  it('hostile / unowned / suspended dept stays fail-closed', async () => {
    setActor({ memberships: [membership('ai_data'), membership('marketing')] })
    for (const bad of ['commerce', '../../etc/passwd', '<script>', 'AI_DATA']) {
      expect((await visitAdmin(bad)).type, `accepted ${bad}`).not.toBe(ControllerHome)
    }

    // A suspended membership is not a workspace: asking for it must leave the
    // actor with their remaining ACTIVE department, and nothing else. Sorted on
    // both sides because ordering is a navigation concern, not part of this
    // contract.
    setActor({ memberships: [membership('ai_data'), membership('marketing', 'suspended')] })
    const el = await visitAdmin('marketing')
    expect([...departmentOwnedOffered(el)].sort()).toEqual([...(DEPT_ROUTES.get('ai_data') ?? [])].sort())
  })
})

// ── G. URL SEMANTICS ───────────────────────────────────────────────────────
describe('G · ?dept= remains the only carrier', () => {
  it('neither the entry page nor the chooser persists department state', async () => {
    const { readFileSync } = await import('node:fs')
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // Paths from cwd, not `import.meta.url`: under jsdom the module URL is not a
    // file: URL and `new URL(...)` throws "The URL must be of scheme file".
    const sources = {
      'admin/page.tsx': strip(readFileSync('src/app/admin/page.tsx', 'utf8')),
      'WorkspaceChooser.tsx': strip(readFileSync('src/components/controller/WorkspaceChooser.tsx', 'utf8')),
    }
    for (const [name, code] of Object.entries(sources)) {
      for (const forbidden of ['cookies(', 'document.cookie', 'localStorage', 'sessionStorage', 'active_department', 'headers(']) {
        expect(code, `${name} persists department state via ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})
