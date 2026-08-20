import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ADMIN_HUBS, ADMIN_MODULES, buildAdminController } from '../adminModules'
import { userHub, userManagementModule } from '../../modules/userManagementModule'
import { deriveNavigation } from '../../navigationProvider'
import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import type { Actor } from '@/lib/admin/rbac'

// Controller V2 — Module 08 User Management, Controller integration.
//
// Module 08's BACKEND shipped in three merges (#117 schema, #118 consumer
// enforcement, #119 Admin Users API) and is production-live. It was invisible
// to the Controller: no hub, no manifest, no nav, no page. This registers it.
//
// Nothing here re-implements the backend. The manifest DESCRIBES the shipped
// API and page, exactly as FOUNDATION-03 did for the other seven modules.
//
// The authorization boundary is untouched: every permission already exists
// (registry version 2026-08-20.2, ADR-023), and the page performs no
// authorization of its own — `requirePagePermission` and the API routes do.
//
// ⚠️ NO i18n ASSERTIONS HERE. This file lives under `src/lib/controller/`, and
// Architecture Guard rule §1.4 forbids the Controller importing the consumer
// app — a kernel test that cannot compile without `@/lib/i18n/admin` is a
// kernel that cannot be extracted. The guard caught exactly that on the first
// run, as it did for the Command Palette in Phase 7. Translation coverage for
// this hub and module is asserted in `hubGrouping.test.tsx`, which is UI-layer
// and may import it.

function actor(over: Partial<Actor> = {}): Actor {
  return {
    userId: 'u1', email: 'a@tappyai.com', isOwner: false, roles: [],
    highestRole: null, capabilities: [], source: 'cookie', resolvedAt: 0,
    ...over,
  } as Actor
}

describe('the User Hub is registered', () => {
  it('exists in ADMIN_HUBS under the taxonomy id', () => {
    // 12_HUB_TAXONOMY.md §1 fixes the id. It is not this module's to choose.
    expect(userHub.id).toBe('tappy.hub.user')
    expect(ADMIN_HUBS.map((h) => h.id)).toContain('tappy.hub.user')
  })

  it('slots between Founder and Analytics without renumbering any existing hub', () => {
    // Taxonomy §1 orders User second, after Founder. Existing hubs keep their
    // orders (0/10/20/30/40) so no other hub's navigation position changes.
    const byId = Object.fromEntries(ADMIN_HUBS.map((h) => [h.id, h.navigationOrder]))
    expect(byId['tappy.hub.founder']).toBe(0)
    expect(byId['tappy.hub.user']).toBeGreaterThan(byId['tappy.hub.founder'])
    expect(byId['tappy.hub.user']).toBeLessThan(byId['tappy.hub.analytics'])
    expect(byId['tappy.hub.analytics']).toBe(10)
    expect(byId['tappy.hub.security']).toBe(20)
    expect(byId['tappy.hub.commerce']).toBe(30)
    expect(byId['tappy.hub.configuration']).toBe(40)
  })

  it('declares a permissionScope, as the Security Hub does', () => {
    // FOUNDATION-01 §2: "a Hub owns a permission scope". Currently a no-op for
    // this hub — its single module requires the same permission — exactly as
    // measured for tappy.hub.security in Phase 4. It becomes load-bearing when
    // Moderation and CRM join the hub.
    expect(userHub.permissionScope).toBe(PERMISSIONS.USERS_LIST_READ)
  })

})

describe('the Module 08 manifest', () => {
  it('is registered and belongs to the User Hub', () => {
    expect(ADMIN_MODULES.map((m) => m.id)).toContain(userManagementModule.id)
    expect(userManagementModule.hub).toBe('tappy.hub.user')
  })

  it('points at the shipped route and the shipped permission — it invents neither', () => {
    expect(userManagementModule.routes).toEqual(['/admin/users'])
    expect(userManagementModule.permissions).toEqual([PERMISSIONS.USERS_LIST_READ])
    expect(userManagementModule.navigation.visibilityPermission).toBe(PERMISSIONS.USERS_LIST_READ)
  })

  it('owns NO tables — Module 08 reaches account_status through its API, not a manifest claim', () => {
    // ADR-024 made ownership expressible. Declaring it here would be a second
    // question (does the module own a consumer-adjacent table?) smuggled into a
    // UI change. `data` stays absent until that is decided deliberately.
    expect(userManagementModule.data).toBeUndefined()
  })


  it('the real registry still builds', () => {
    expect(() => buildAdminController()).not.toThrow()
  })
})

describe('"you never see a door you cannot open" — 01_ARCH §8', () => {
  it('EVERY registered module route has an actual page on disk', () => {
    // The reason Module 08 could not be closed by registering a manifest alone.
    // A nav entry pointing at a route that does not exist is a door onto
    // nothing. Asserted across the whole registry, not just the new module, so
    // it holds for every module added after this one.
    const missing = ADMIN_MODULES.flatMap((m) =>
      m.routes
        .filter((route) => !existsSync(join(process.cwd(), 'src/app', route, 'page.tsx')))
        .map((route) => `${m.id} → ${route}`)
    )
    expect(missing).toEqual([])
  })

  it('the module icon resolves to a real icon, not the unknown-name fallback', async () => {
    const { navIcon } = await import('@/components/admin/layout/navIcons')
    const { HelpCircle } = await import('lucide-react')
    expect(navIcon(userManagementModule.navigation.icon)).not.toBe(HelpCircle)
  })
})

describe('navigation is PDP-filtered — no role comparison anywhere', () => {
  const core = buildAdminController()

  it('a moderator sees the User group', () => {
    const nav = deriveNavigation(core, actor({ roles: ['moderator'], highestRole: 'moderator' }))
    const group = nav.find((g) => g.hubId === 'tappy.hub.user')
    expect(group?.items.map((i) => i.route)).toContain('/admin/users')
  })

  it('an analyst does NOT — they hold no users permission', () => {
    const nav = deriveNavigation(core, actor({ roles: ['analyst'], highestRole: 'analyst' }))
    expect(nav.find((g) => g.hubId === 'tappy.hub.user')).toBeUndefined()
  })

  it('an actor with no role at all sees nothing of it', () => {
    const nav = deriveNavigation(core, actor({ roles: [] }))
    expect(nav.find((g) => g.hubId === 'tappy.hub.user')).toBeUndefined()
  })

  it('an admin sees it', () => {
    const nav = deriveNavigation(core, actor({ roles: ['admin'], highestRole: 'admin' }))
    expect(nav.find((g) => g.hubId === 'tappy.hub.user')?.items).toHaveLength(1)
  })
})
