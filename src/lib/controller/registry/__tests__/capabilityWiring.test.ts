import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildAdminController, ADMIN_MODULES, homeModule } from '../adminModules'
import { securityAuditModule } from '../../modules/securityAuditModule'

// Controller V2 — PHASE 4: the FIRST real provides/requires relationship in the
// SHIPPED registry.
//
// Capability resolution has existed in ControllerCore since FOUNDATION-02, but
// until now every shipped manifest declared `dependencies: []`, so the resolver
// had never run against a real module. These tests hold that open.

describe('the shipped registry has a real provider → consumer relationship', () => {
  it('Home requires the capability the Audit module provides', () => {
    expect(securityAuditModule.capabilities).toContain('audit.read')
    expect(homeModule.dependencies).toContainEqual({ capabilityId: 'audit.read', versionRange: '^1' })
  })

  it('resolves it at build time, recording provider and consumer', () => {
    const core = buildAdminController()
    const cap = core.listCapabilities().find((c) => c.id === 'audit.read')

    expect(cap).toBeDefined()
    expect(cap?.provider).toBe(securityAuditModule.id)
    expect(cap?.consumers).toContain(homeModule.id)
  })

  it('registers even though the consumer is listed BEFORE the provider', () => {
    // ADMIN_MODULES is in navigation order: Home (order 0) precedes Audit. If
    // registration were insertion-ordered this would throw. Guarding the
    // ordering itself, so a future edit cannot make the pass accidental.
    const ids = ADMIN_MODULES.map((m) => m.id)
    expect(ids.indexOf(homeModule.id)).toBeLessThan(ids.indexOf(securityAuditModule.id))

    expect(() => buildAdminController()).not.toThrow()
  })

  it('makes the capability unreachable when the Audit module is disabled', () => {
    const core = buildAdminController()
    expect(core.bindCapability('audit.read')).toBeDefined()

    core.disable(securityAuditModule.id)

    expect(core.bindCapability('audit.read')).toBeUndefined()
  })
})

describe("the Home page's audit panel is gated on the binding, not only on the PDP", () => {
  // A source assertion, deliberately. The alternative — rendering the page —
  // would need a Supabase client, an Actor and a session, and would prove the
  // wiring only for whichever actor the fixture happened to build. What must
  // hold is structural: the page consults the kernel before it reads audit rows.
  const source = readFileSync('src/app/admin/page.tsx', 'utf8')

  it('resolves the capability through the kernel', () => {
    expect(source).toContain("core.bindCapability('audit.read')")
  })

  it('requires BOTH the PDP decision and the binding before reading', () => {
    // Asserting the conjunction itself. `toContain('canAudit')` would pass on a
    // file that had dropped the binding entirely.
    expect(source).toMatch(/const canAudit =[^\n]*permissionEngine\.can\([^\n]*&&[^\n]*auditCapability !== undefined/)
  })
})
