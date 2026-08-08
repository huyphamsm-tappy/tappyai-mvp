import { describe, it, expect, beforeEach } from 'vitest'
import { ControllerCore } from '../core'
import { deriveNavigation } from '../navigationProvider'
import { securityHub, securityAuditModule } from '../modules/securityAuditModule'
import type { AuditSink, ControllerAuditEntry, EventSink, ControllerEvent, ModuleManifest } from '../types'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { NO_CAPABILITIES } from '@/lib/admin/capabilities'
import type { Actor, AdminRole } from '@/lib/admin/rbac'

// ─────────────────────────────────────────────────────────────────────────────
// FOUNDATION-02 E2E. Uses the REAL Permission Engine (permissionEngine) as the
// Core's authorize delegate — every authorization assertion below flows through
// the actual production PDP (registry + resolver + roleMap + cache), not a mock.
// Audit + events are captured through the kernel's real sink interfaces (the
// same wiring production uses via auditAdapter.ts), so lifecycle/security
// transitions are observed without touching the production database.
// ─────────────────────────────────────────────────────────────────────────────

function actor(roles: AdminRole[], opts: { isOwner?: boolean; id?: string } = {}): Actor {
  return {
    userId: opts.id ?? `u-${roles.join('-') || 'none'}`,
    email: 'x@example.com',
    isOwner: opts.isOwner ?? false,
    roles,
    highestRole: roles.length ? roles[roles.length - 1] : null,
    capabilities: NO_CAPABILITIES,
    source: 'cookie',
    resolvedAt: 0,
  }
}

const OWNER = actor([], { isOwner: true, id: 'owner' })
const ADMIN = actor(['admin'], { id: 'admin' })     // audit.log.read defaultRoles: ['admin','super_admin']
const ANALYST = actor(['analyst'], { id: 'analyst' }) // does NOT hold audit.log.read

// Test-only fixture manifests (clearly not production modules).
const consumerOk: ModuleManifest = {
  id: 'test.consumer.ok', name: 'C', version: '1.0.0', owner: 'test', hub: securityHub.id,
  capabilities: [], permissions: [], dependencies: [{ capabilityId: 'audit.read', versionRange: '^1' }],
  routes: ['/admin/_test/consumer-ok'], navigation: { label: 'x', order: 99 }, lifecycle: 'experimental', status: 'enabled',
}
const consumerBadVersion: ModuleManifest = { ...consumerOk, id: 'test.consumer.badver', routes: ['/admin/_test/badver'], dependencies: [{ capabilityId: 'audit.read', versionRange: '^2' }] }
const consumerMissingCap: ModuleManifest = { ...consumerOk, id: 'test.consumer.miss', routes: ['/admin/_test/miss'], dependencies: [{ capabilityId: 'nope.absent', versionRange: '^1' }] }
const incompatibleController: ModuleManifest = { ...consumerOk, id: 'test.consumer.incompat', routes: ['/admin/_test/incompat'], dependencies: [], compatibility: { controller: '^2' } }
const moduleDepOk: ModuleManifest = { ...consumerOk, id: 'test.consumer.moddep', routes: ['/admin/_test/moddep'], dependencies: [{ moduleId: securityAuditModule.id, versionRange: '^1' }] }

let core: ControllerCore
let auditLog: ControllerAuditEntry[]
let events: ControllerEvent[]

beforeEach(() => {
  auditLog = []
  events = []
  const audit: AuditSink = { record: (e) => auditLog.push(e) }
  const eventSink: EventSink = { emit: (e) => events.push(e) }
  core = new ControllerCore({ controllerVersion: '1.0.0', audit, events: eventSink })
  expect(core.registerHub(securityHub).ok).toBe(true)
  expect(core.register(securityAuditModule).ok).toBe(true)
})

describe('E2E — framework wiring', () => {
  it('1+2. hub and module register; module is discoverable from the registry', () => {
    expect(core.getHub(securityHub.id)).toBeDefined()
    const ids = core.discover().map((m) => m.manifest.id)
    expect(ids).toContain(securityAuditModule.id)
  })

  it('3. invalid manifest fails validation and registers NOTHING (fail-closed)', () => {
    const before = core.discover().length
    const bad = core.register({ id: 'bad', hub: securityHub.id }) // missing most fields + bad version
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThan(0)
    expect(core.discover().length).toBe(before) // nothing partially loaded
    expect(core.getModule('bad')).toBeUndefined()
  })

  it('4. dependency + version resolution (capability + module deps)', () => {
    expect(core.register(consumerOk).ok).toBe(true)                 // audit.read ^1 satisfied
    expect(core.register(moduleDepOk).ok).toBe(true)                // module dep ^1 satisfied
    const badver = core.register(consumerBadVersion)
    expect(badver.ok).toBe(false)                                   // audit.read is v1, ^2 not satisfied
    const miss = core.register(consumerMissingCap)
    expect(miss.ok).toBe(false)                                     // capability not provided
    const incompat = core.register(incompatibleController)
    expect(incompat.ok).toBe(false)                                 // controller 1.0.0 !~ ^2
  })

  it('5+7. authorized access via the REAL PDP: admin=ROLE_GRANT, owner=OWNER_BYPASS', () => {
    const asAdmin = core.authorize(ADMIN, PERMISSIONS.AUDIT_LOG_READ)
    expect(asAdmin.allowed).toBe(true)
    expect(asAdmin.reason).toBe('ROLE_GRANT')
    const asOwner = core.authorize(OWNER, PERMISSIONS.AUDIT_LOG_READ)
    expect(asOwner.allowed).toBe(true)
    expect(asOwner.reason).toBe('OWNER_BYPASS')
  })

  it('6. unauthorized denied: null=UNAUTHENTICATED, analyst=NO_GRANT', () => {
    expect(core.authorize(null, PERMISSIONS.AUDIT_LOG_READ)).toMatchObject({ allowed: false, reason: 'UNAUTHENTICATED' })
    expect(core.authorize(ANALYST, PERMISSIONS.AUDIT_LOG_READ)).toMatchObject({ allowed: false, reason: 'NO_GRANT' })
  })

  it('8. navigation is generated from the registry and is permission-aware', () => {
    const adminNav = deriveNavigation(core, ADMIN)
    const routes = adminNav.flatMap((g) => g.items.map((i) => i.route))
    expect(routes).toContain('/admin/audit')
    // analyst is not authorized for audit.log.read → entry absent
    const analystNav = deriveNavigation(core, ANALYST)
    expect(analystNav.flatMap((g) => g.items.map((i) => i.route))).not.toContain('/admin/audit')
    // unauthenticated → absent
    expect(deriveNavigation(core, null).flatMap((g) => g.items.map((i) => i.route))).not.toContain('/admin/audit')
  })

  it('9. disabled module is inaccessible and disappears from navigation', () => {
    expect(core.isModuleAccessible(securityAuditModule.id, ADMIN)).toBe(true)
    core.disable(securityAuditModule.id)
    expect(core.isModuleAccessible(securityAuditModule.id, ADMIN)).toBe(false)
    expect(deriveNavigation(core, ADMIN).flatMap((g) => g.items.map((i) => i.route))).not.toContain('/admin/audit')
    // re-enable restores it
    core.enable(securityAuditModule.id)
    expect(core.isModuleAccessible(securityAuditModule.id, ADMIN)).toBe(true)
  })

  it('10. a failing module is isolated and does not crash the Controller', () => {
    const res = core.runIsolated(securityAuditModule.id, () => {
      throw new Error('boom')
    })
    expect(res.ok).toBe(false)
    // module marked unavailable; still no crash; Core keeps working
    expect(core.isModuleAccessible(securityAuditModule.id, ADMIN)).toBe(false)
    expect(core.registerHub({ ...securityHub, id: 'tappy.hub.other', navigationOrder: 20 }).ok).toBe(true)
    expect(auditLog.some((a) => a.action === 'controller.module.failure')).toBe(true)
  })

  it('11. audit records lifecycle/security transitions', () => {
    const actions = auditLog.map((a) => a.action)
    expect(actions).toContain('controller.hub.registered')
    expect(actions).toContain('controller.module.registered')
    core.disable(securityAuditModule.id)
    expect(auditLog.map((a) => a.action)).toContain('controller.module.disabled')
    expect(events.length).toBeGreaterThan(0)
  })

  it('12. single decision path: Core.authorize delegates to the existing PDP (no second engine)', () => {
    for (const a of [OWNER, ADMIN, ANALYST, null]) {
      expect(core.authorize(a, PERMISSIONS.AUDIT_LOG_READ)).toEqual(
        permissionEngine.authorize(a, PERMISSIONS.AUDIT_LOG_READ)
      )
    }
  })
})

describe('Adversarial — falsification attempts (STEP 14)', () => {
  it('unknown permission fails closed through the PDP', () => {
    expect(core.authorize(ADMIN, 'totally.unknown.permission')).toMatchObject({ allowed: false, reason: 'UNKNOWN_PERMISSION' })
  })
  it('direct-route reasoning: a disabled module is gated regardless of navigation', () => {
    core.disable(securityAuditModule.id)
    // even though a route string exists, accessibility (the guard) is false
    expect(core.isModuleAccessible(securityAuditModule.id, OWNER)).toBe(false)
  })
  it('duplicate route registration is rejected', () => {
    const dup: ModuleManifest = { ...consumerOk, id: 'test.dup', dependencies: [], routes: ['/admin/audit'] }
    expect(core.register(dup).ok).toBe(false)
  })
  it('duplicate module id is rejected', () => {
    expect(core.register(securityAuditModule).ok).toBe(false)
  })
})
