import { describe, it, expect } from 'vitest'
import { buildAdminController, ADMIN_HUBS, ADMIN_MODULES, homeModule } from '../adminModules'

// Controller V2 — PHASE 8, first unit: the Founder Hub gets its architected id.
//
// AUTHORITY — 12_HUB_TAXONOMY.md §3, merged under Owner Decision G:
//
//   tappy.hub.dashboard → "RENAME to tappy.hub.founder. It is the Founder Hub
//   under a placeholder name; module 01 is a Founder module."
//
// §3 also warned this was "a migration with a real cutover, not a string edit",
// because a hub id lives in a module's manifest AND in the audit trail. HALF OF
// THAT IS FALSE, and it was measured on production rather than assumed:
//
//   audit_log rows with action LIKE 'controller.%'   -> 0
//   audit_log rows with target_id LIKE 'tappy.hub%'  -> 0
//   tables module_registry / platform_settings       -> do not exist
//
// Every buildAdminController() call site uses the default NOOP audit sink, so
// `controller.hub.registered` has never been written. The manifest half is real
// but is code only. There is no data migration here.
//
// SCOPE: the HUB id changes. The MODULE id does NOT — 01_ARCH §2.1 declares a
// module id "globally unique, immutable", and nothing authorizes changing one.
// The resulting cosmetic mismatch is recorded rather than fixed by breaking a
// rule no source lets us break.

describe('the Founder Hub is registered under its architected id', () => {
  it('registers tappy.hub.founder', () => {
    expect(ADMIN_HUBS.map((h) => h.id)).toContain('tappy.hub.founder')
  })

  it('no longer registers the placeholder id', () => {
    expect(ADMIN_HUBS.map((h) => h.id)).not.toContain('tappy.hub.dashboard')
  })

  it('names itself Founder, matching 01_ARCH §2.2', () => {
    expect(ADMIN_HUBS.find((h) => h.id === 'tappy.hub.founder')?.name).toBe('Founder')
  })

  it('keeps its navigation position — a rename, not a reordering', () => {
    expect(ADMIN_HUBS.find((h) => h.id === 'tappy.hub.founder')?.navigationOrder).toBe(0)
  })
})

describe('the Home module follows the hub without changing its own id', () => {
  it('belongs to the Founder hub', () => {
    expect(homeModule.hub).toBe('tappy.hub.founder')
  })

  it('keeps the module id it was registered with — 01_ARCH §2.1: immutable', () => {
    // Renaming it would be convenient and is authorized by nothing. The mismatch
    // between this id and its hub is a recorded consequence, not an oversight.
    expect(homeModule.id).toBe('tappy.hub.dashboard.home')
  })

  it('still serves /admin with the same permission', () => {
    expect(homeModule.routes).toEqual(['/admin'])
    expect(homeModule.permissions).toEqual(['dashboard.home.view'])
  })

  it('still declares its real dependency on audit.read', () => {
    expect(homeModule.dependencies).toContainEqual({ capabilityId: 'audit.read', versionRange: '^1' })
  })
})

describe('the registry still builds, and nothing else moved', () => {
  it('registers every hub and module without error', () => {
    expect(() => buildAdminController()).not.toThrow()
  })

  it('keeps the same hub and module counts', () => {
    const core = buildAdminController()

    expect(core.listHubs()).toHaveLength(5)
    expect(core.discover()).toHaveLength(ADMIN_MODULES.length)
  })

  it('resolves the audit.read capability exactly as before', () => {
    const core = buildAdminController()

    expect(core.listCapabilities().find((c) => c.id === 'audit.read')?.consumers).toContain(homeModule.id)
  })

  it('leaves every other hub id untouched', () => {
    expect(ADMIN_HUBS.map((h) => h.id).sort()).toEqual([
      'tappy.hub.analytics',
      'tappy.hub.commerce',
      'tappy.hub.configuration',
      'tappy.hub.founder',
      'tappy.hub.security',
    ])
  })
})

describe('the hub carries a translated nav group', () => {
  it('uses a Founder key, not the placeholder one', () => {
    expect(ADMIN_HUBS.find((h) => h.id === 'tappy.hub.founder')?.navigationGroup).toBe('admin.nav.group.founder')
  })

  it('is translated in both locales, and the two differ', async () => {
    const { vi, en } = await import('@/lib/i18n/admin')

    expect(vi['admin.nav.group.founder']).toBeTruthy()
    expect(en['admin.nav.group.founder']).toBeTruthy()
    expect(vi['admin.nav.group.founder']).not.toBe(en['admin.nav.group.founder'])
  })
})
