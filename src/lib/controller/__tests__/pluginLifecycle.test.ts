import { describe, it, expect, beforeEach } from 'vitest'
import { ControllerCore } from '../core'
import type { AuditSink, ControllerAuditEntry, HubDescriptor, ModuleManifest } from '../types'

// Controller V2 — Component 6, the lifecycle steps the contract names but the
// registry did not yet implement: `ready`, `deregister`, and permission-collision
// validation (FOUNDATION-01 §5; architecture §5 validate step).
//
// Deliberately narrow. Registration, manifest validation, dependency resolution,
// duplicate id, route collision, capability rejection, enable/disable, failure
// isolation and audit are already proven in controllerCore.e2e.test.ts and are NOT
// repeated here.

const hub: HubDescriptor = {
  id: 'test.hub', name: 'Test', version: '1.0.0', owner: 'test',
  navigationGroup: 'g', navigationOrder: 0, lifecycle: 'stable',
}

function manifest(id: string, over: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    id, name: id, version: '1.0.0', owner: 'test', hub: hub.id,
    capabilities: [], permissions: [], dependencies: [],
    routes: [`/admin/_test/${id}`],
    navigation: { label: `nav.${id}`, icon: 'X', order: 0 },
    lifecycle: 'stable', status: 'enabled', compatibility: { controller: '^1' },
    ...over,
  }
}

let core: ControllerCore
let audits: ControllerAuditEntry[]

beforeEach(() => {
  audits = []
  const audit: AuditSink = { record: (e) => { audits.push(e) } }
  core = new ControllerCore({ controllerVersion: '1.0.0', audit })
  expect(core.registerHub(hub).ok).toBe(true)
})

// ── Permission collision ─────────────────────────────────────────────────────
describe('C6 — permission ownership is exclusive across modules', () => {
  it('rejects a second module declaring a permission another module already owns', () => {
    expect(core.register(manifest('a', { permissions: ['commerce.deals.read'] })).ok).toBe(true)

    const clash = core.register(manifest('b', { permissions: ['commerce.deals.read'] }))
    expect(clash.ok).toBe(false)
    if (clash.ok) throw new Error('unreachable')
    expect(clash.errors.join(' ')).toContain('commerce.deals.read')
    expect(clash.errors.join(' ')).toContain('"a"') // names the owner, deterministically
  })

  it('registers NOTHING on collision — no partial load', () => {
    core.register(manifest('a', { permissions: ['x.y.z'] }))
    core.register(manifest('b', { permissions: ['x.y.z'] }))

    expect(core.getModule('b')).toBeUndefined()
    expect(core.discover().map((m) => m.manifest.id)).toEqual(['a'])
  })

  it('a module repeating a permission inside its OWN manifest is not a collision', () => {
    // `permissions` is a declaration list, not a set. Repetition is redundant,
    // not a conflict — only a SECOND module claiming the same permission is.
    const r = core.register(manifest('solo', { permissions: ['a.b.c', 'a.b.c'] }))
    expect(r.ok).toBe(true)
    expect(core.getModule('solo')).toBeDefined()
  })

  it('a repeated declaration is reported once, not once per repetition', () => {
    // The check dedupes the incoming manifest before comparing. Without that,
    // a manifest listing the same permission three times would emit the same
    // collision error three times and the caller could not count real conflicts.
    core.register(manifest('owner', { permissions: ['dup.perm'] }))

    const r = core.register(manifest('claimer', { permissions: ['dup.perm', 'dup.perm', 'dup.perm'] }))
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.errors.filter((e) => e.includes('dup.perm'))).toHaveLength(1)
  })

  it('a permission freed by deregistration can be claimed again', () => {
    expect(core.register(manifest('first', { permissions: ['p.q.r'] })).ok).toBe(true)
    expect(core.register(manifest('second', { permissions: ['p.q.r'] })).ok).toBe(false)

    expect(core.deregister('first').ok).toBe(true)
    expect(core.register(manifest('second', { permissions: ['p.q.r'] })).ok).toBe(true)
  })

  it('the real admin registry has no cross-module permission collision', async () => {
    // The production registry must survive the new rule. If a future module
    // duplicates a permission, buildAdminController throws and this fails.
    const { buildAdminController } = await import('../registry/adminModules')
    expect(() => buildAdminController()).not.toThrow()
  })
})

// ── ready ────────────────────────────────────────────────────────────────────
describe('C6 — `ready` is derived: enabled && available', () => {
  it('a freshly registered enabled module is ready', () => {
    core.register(manifest('m'))
    expect(core.isReady('m')).toBe(true)
  })

  it('disabling removes readiness; re-enabling restores it', () => {
    core.register(manifest('m'))
    core.disable('m')
    expect(core.isReady('m')).toBe(false)
    core.enable('m')
    expect(core.isReady('m')).toBe(true)
  })

  it('a module registered as disabled is NOT ready', () => {
    core.register(manifest('m', { status: 'disabled' }))
    expect(core.isReady('m')).toBe(false)
  })

  it('a runtime failure makes an enabled module not ready', () => {
    core.register(manifest('m'))
    expect(core.isReady('m')).toBe(true)

    core.runIsolated('m', () => { throw new Error('boom') })

    expect(core.isReady('m')).toBe(false)
    // Still enabled — readiness is lost through `available`, not through status.
    expect(core.getModule('m')?.status).toBe('enabled')
    expect(core.getModule('m')?.available).toBe(false)
  })

  it('re-enabling does NOT clear a runtime failure', () => {
    // enable() only touches status. A module that threw stays unavailable, so
    // "ready" cannot be restored by toggling the switch.
    core.register(manifest('m'))
    core.runIsolated('m', () => { throw new Error('boom') })
    core.enable('m')
    expect(core.isReady('m')).toBe(false)
  })

  it('an unregistered module is not ready', () => {
    expect(core.isReady('never-registered')).toBe(false)
  })

  it('accessibility implies readiness for every registry state', () => {
    // isModuleAccessible = ready AND the PDP allows it. Whenever it says yes,
    // readiness must hold; this pins the two to one predicate.
    core.register(manifest('m')) // no visibilityPermission ⇒ PDP not consulted
    for (const mutate of [() => {}, () => core.disable('m'), () => core.enable('m'),
                          () => core.runIsolated('m', () => { throw new Error('x') })]) {
      mutate()
      if (core.isModuleAccessible('m', null)) expect(core.isReady('m')).toBe(true)
    }
    expect(core.isModuleAccessible('m', null)).toBe(false) // ended unavailable
  })
})

// ── deregister ───────────────────────────────────────────────────────────────
describe('C6 — deregister', () => {
  it('removes the module and releases its route and capability', () => {
    core.register(manifest('provider', { capabilities: ['cap.one'], routes: ['/admin/_test/shared'] }))
    // Shape updated in Phase 4 to the FOUNDATION-01 §4 capability record.
    expect(core.bindCapability('cap.one')).toMatchObject({ id: 'cap.one', provider: 'provider', version: '1.0.0' })

    expect(core.deregister('provider')).toEqual({ ok: true })

    expect(core.getModule('provider')).toBeUndefined()
    expect(core.discover()).toEqual([])
    expect(core.bindCapability('cap.one')).toBeUndefined()
    // The route is free because ownership is derived from registered modules.
    expect(core.register(manifest('other', { routes: ['/admin/_test/shared'] })).ok).toBe(true)
  })

  it('is audited', () => {
    core.register(manifest('m'))
    audits.length = 0
    core.deregister('m')
    expect(audits.map((a) => a.action)).toContain('controller.module.deregistered')
    expect(audits.find((a) => a.action === 'controller.module.deregistered')?.targetId).toBe('m')
  })

  it('rejects an unregistered module', () => {
    const r = core.deregister('ghost')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.errors.join(' ')).toContain('not registered')
  })

  it('is BLOCKED by a module dependency, naming the dependent', () => {
    core.register(manifest('base'))
    core.register(manifest('consumer', { dependencies: [{ moduleId: 'base', versionRange: '^1' }] }))

    const r = core.deregister('base')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.errors.join(' ')).toContain('consumer')
  })

  it('is BLOCKED by a capability dependency, not only a direct module dependency', () => {
    core.register(manifest('provider', { capabilities: ['cap.x'] }))
    core.register(manifest('consumer', { dependencies: [{ capabilityId: 'cap.x', versionRange: '^1' }] }))

    const r = core.deregister('provider')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.errors.join(' ')).toContain('consumer')
  })

  it('a rejected deregistration leaves the registry byte-for-byte unchanged', () => {
    core.register(manifest('base', { capabilities: ['cap.k'] }))
    core.register(manifest('consumer', { dependencies: [{ capabilityId: 'cap.k', versionRange: '^1' }] }))
    const before = core.discover().map((m) => `${m.manifest.id}:${m.status}:${m.available}`).sort()

    expect(core.deregister('base').ok).toBe(false)

    expect(core.discover().map((m) => `${m.manifest.id}:${m.status}:${m.available}`).sort()).toEqual(before)
    // Shape updated in Phase 4 to the FOUNDATION-01 §4 capability record. The
    // assertion is unchanged in force: the binding still points at `base`, at
    // the same version, and `consumer` is still recorded against it.
    expect(core.bindCapability('cap.k')).toMatchObject({
      id: 'cap.k', provider: 'base', version: '1.0.0', consumers: ['consumer'],
    })
    expect(audits.some((a) => a.action === 'controller.module.deregistered')).toBe(false)
  })

  it('does NOT cascade: the dependent is untouched by the refusal', () => {
    core.register(manifest('base'))
    core.register(manifest('consumer', { dependencies: [{ moduleId: 'base', versionRange: '^1' }] }))

    core.deregister('base')

    expect(core.isReady('consumer')).toBe(true)
    expect(core.getModule('consumer')?.status).toBe('enabled')
  })

  it('a DISABLED dependent still blocks removal', () => {
    // A dependency that is merely switched off is still declared. Removing its
    // target would orphan it — exactly what registration refuses to allow.
    core.register(manifest('base'))
    core.register(manifest('consumer', { dependencies: [{ moduleId: 'base', versionRange: '^1' }] }))
    core.disable('consumer')

    expect(core.deregister('base').ok).toBe(false)
  })

  it('succeeds once the dependent itself is deregistered', () => {
    core.register(manifest('base'))
    core.register(manifest('consumer', { dependencies: [{ moduleId: 'base', versionRange: '^1' }] }))

    expect(core.deregister('base').ok).toBe(false)
    expect(core.deregister('consumer').ok).toBe(true)
    expect(core.deregister('base').ok).toBe(true)
    expect(core.discover()).toEqual([])
  })

  it('names every dependent, in deterministic order', () => {
    core.register(manifest('base'))
    for (const id of ['zeta', 'alpha', 'mid']) {
      core.register(manifest(id, { dependencies: [{ moduleId: 'base', versionRange: '^1' }] }))
    }

    const r = core.deregister('base')
    if (r.ok) throw new Error('unreachable')
    expect(r.errors[0]).toContain('alpha, mid, zeta')
  })
})
