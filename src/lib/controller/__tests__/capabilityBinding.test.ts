import { describe, it, expect, beforeEach } from 'vitest'
import { ControllerCore } from '../core'
import type { Actor } from '@/lib/admin/rbac'
import type { AuditSink, ControllerAuditEntry, HubDescriptor, ModuleManifest } from '../types'

// Controller V2 — PHASE 4: capability/service binding + hub permission scope.
//
// Everything here is required by a FROZEN contract clause, quoted at the
// describe() it proves. Nothing is inferred:
//
//   FOUNDATION_01_CONTRACTS.md §1  bindCapability / resolveDependencies / disabled ⇒ unreachable
//   FOUNDATION_01_CONTRACTS.md §2  a Hub owns a permissionScope and governs its modules
//   FOUNDATION_01_CONTRACTS.md §4  the capability record shape
//   FOUNDATION_01_CONTRACTS.md §8  incompatible dependency ⇒ fail-closed, AUDITED
//
// Registration, manifest validation, duplicate id, route collision, enable/disable
// and failure isolation are proven in controllerCore.e2e.test.ts and pluginLifecycle
// .test.ts and are NOT repeated.

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

function actor(over: Partial<Actor> = {}): Actor {
  return {
    userId: 'u1', email: 'a@tappyai.com', isOwner: false, roles: [],
    highestRole: null, capabilities: [], source: 'cookie', resolvedAt: 0,
    ...over,
  } as Actor
}

let core: ControllerCore
let audits: ControllerAuditEntry[]

beforeEach(() => {
  audits = []
  const audit: AuditSink = { record: (e) => { audits.push(e) } }
  core = new ControllerCore({ controllerVersion: '1.0.0', audit })
  expect(core.registerHub(hub).ok).toBe(true)
})

// ── §1 — "disabled ⇒ route + nav + capability unreachable" ───────────────────
describe('§1 — a capability is unreachable while its provider is not ready', () => {
  it('binds a capability whose provider is registered and enabled', () => {
    expect(core.register(manifest('p', { capabilities: ['audit.read'] })).ok).toBe(true)

    const bound = core.bindCapability('audit.read')
    expect(bound?.provider).toBe('p')
    expect(bound?.version).toBe('1.0.0')
  })

  it('refuses to bind once the providing module is DISABLED', () => {
    expect(core.register(manifest('p', { capabilities: ['audit.read'] })).ok).toBe(true)
    expect(core.bindCapability('audit.read')).toBeDefined()

    core.disable('p')

    // The whole point of the clause: a switched-off module must not keep
    // serving other modules through the side door.
    expect(core.bindCapability('audit.read')).toBeUndefined()
  })

  it('refuses to bind once the providing module has been ISOLATED by a failure', () => {
    expect(core.register(manifest('p', { capabilities: ['audit.read'] })).ok).toBe(true)

    core.runIsolated('p', () => { throw new Error('boom') })

    expect(core.isReady('p')).toBe(false)
    expect(core.bindCapability('audit.read')).toBeUndefined()
  })

  it('binds again after the provider is re-enabled', () => {
    expect(core.register(manifest('p', { capabilities: ['audit.read'] })).ok).toBe(true)
    core.disable('p')
    core.enable('p')

    expect(core.bindCapability('audit.read')?.provider).toBe('p')
  })

  it('returns undefined for a capability nobody provides', () => {
    expect(core.bindCapability('nope.missing')).toBeUndefined()
  })
})

// ── §4 — the capability record ───────────────────────────────────────────────
describe('§4 — capability record shape: {id, version, owner, permissions, dependencies, provider, consumers}', () => {
  it('derives every field from the providing manifest', () => {
    expect(core.register(manifest('p', {
      owner: 'platform',
      version: '2.3.4',
      capabilities: ['audit.read'],
      permissions: ['audit.log.read'],
    })).ok).toBe(true)

    const [cap] = core.listCapabilities()
    expect(cap).toMatchObject({
      id: 'audit.read',
      version: '2.3.4',
      owner: 'platform',
      provider: 'p',
      permissions: ['audit.log.read'],
      dependencies: [],
      consumers: [],
    })
  })

  it('records consumers — the modules that declared the capability as a dependency', () => {
    expect(core.register(manifest('p', { capabilities: ['audit.read'] })).ok).toBe(true)
    expect(core.register(manifest('c', {
      dependencies: [{ capabilityId: 'audit.read', versionRange: '^1' }],
    })).ok).toBe(true)

    expect(core.listCapabilities()[0].consumers).toEqual(['c'])
  })

  it('drops a consumer from the record when that consumer is deregistered', () => {
    expect(core.register(manifest('p', { capabilities: ['audit.read'] })).ok).toBe(true)
    expect(core.register(manifest('c', {
      dependencies: [{ capabilityId: 'audit.read', versionRange: '^1' }],
    })).ok).toBe(true)

    expect(core.deregister('c').ok).toBe(true)
    expect(core.listCapabilities()[0].consumers).toEqual([])
  })

  it('rejects a second module providing a capability another module already provides', () => {
    expect(core.register(manifest('p1', { capabilities: ['audit.read'] })).ok).toBe(true)

    const dup = core.register(manifest('p2', { capabilities: ['audit.read'] }))
    expect(dup.ok).toBe(false)
    if (dup.ok) throw new Error('unreachable')
    expect(dup.errors.join(' ')).toContain('audit.read')
    // Fail-closed: the first provider is untouched.
    expect(core.bindCapability('audit.read')?.provider).toBe('p1')
  })
})

// ── §8 — "fails to load (fail-closed), audited, surfaced as unavailable" ─────
describe('§8 — a failed registration is AUDITED, not silent', () => {
  it('audits an unsatisfied capability dependency', () => {
    const r = core.register(manifest('c', {
      dependencies: [{ capabilityId: 'absent.cap', versionRange: '^1' }],
    }))
    expect(r.ok).toBe(false)

    const failure = audits.find((a) => a.action === 'controller.module.registration_failed')
    expect(failure).toBeDefined()
    expect(failure?.targetId).toBe('c')
    expect(JSON.stringify(failure?.detail)).toContain('absent.cap')
  })

  it('audits a semver-incompatible capability dependency', () => {
    expect(core.register(manifest('p', { version: '1.0.0', capabilities: ['audit.read'] })).ok).toBe(true)

    const r = core.register(manifest('c', {
      dependencies: [{ capabilityId: 'audit.read', versionRange: '^2' }],
    }))
    expect(r.ok).toBe(false)

    const failure = audits.find((a) => a.action === 'controller.module.registration_failed')
    expect(JSON.stringify(failure?.detail)).toContain('^2')
    // Nothing partially loaded.
    expect(core.getModule('c')).toBeUndefined()
  })

  it('audits an invalid manifest, which never had an id to key on', () => {
    const r = core.register({ id: '', hub: hub.id })
    expect(r.ok).toBe(false)

    expect(audits.some((a) => a.action === 'controller.module.registration_failed')).toBe(true)
  })
})

// ── §1 — "resolveDependencies() — topological" ───────────────────────────────
describe('§1 — registerAll resolves dependencies topologically, not by insertion order', () => {
  it('registers a consumer listed BEFORE its provider', () => {
    // Declaration order is deliberately wrong. Insertion-order resolution fails
    // this; topological resolution does not.
    const r = core.registerAll([
      manifest('c', { dependencies: [{ capabilityId: 'audit.read', versionRange: '^1' }] }),
      manifest('p', { capabilities: ['audit.read'] }),
    ])

    expect(r.ok).toBe(true)
    expect(core.getModule('c')).toBeDefined()
    expect(core.listCapabilities()[0].consumers).toEqual(['c'])
  })

  it('resolves a module-id dependency declared out of order', () => {
    const r = core.registerAll([
      manifest('b', { dependencies: [{ moduleId: 'a', versionRange: '^1' }] }),
      manifest('a'),
    ])
    expect(r.ok).toBe(true)
  })

  it('rejects a dependency cycle by naming it, and registers NOTHING', () => {
    const r = core.registerAll([
      manifest('x', { capabilities: ['cx'], dependencies: [{ capabilityId: 'cy', versionRange: '^1' }] }),
      manifest('y', { capabilities: ['cy'], dependencies: [{ capabilityId: 'cx', versionRange: '^1' }] }),
    ])

    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.errors.join(' ')).toMatch(/cycle/i)
    expect(core.discover()).toHaveLength(0)
  })

  it('registers nothing at all when one manifest in the batch is invalid', () => {
    const r = core.registerAll([manifest('good'), manifest('')])

    expect(r.ok).toBe(false)
    expect(core.discover()).toHaveLength(0)
  })

  it('ROLLS BACK modules already registered when a LATER one is refused', () => {
    // Distinct from the case above, and the distinction is the whole point:
    // there, validation rejects the batch before a single module is written, so
    // the rollback path never runs. Here every manifest is valid and the batch
    // has no cycle, so `first` IS written — and then `second` is refused for an
    // unregistered hub. Without rollback, `first` would survive as a partial
    // load of a batch that failed.
    const r = core.registerAll([
      manifest('first', { capabilities: ['cap.rollback'] }),
      manifest('second', { hub: 'hub.that.does.not.exist' }),
    ])

    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.errors.join(' ')).toContain('hub.that.does.not.exist')

    expect(core.discover()).toHaveLength(0)
    expect(core.getModule('first')).toBeUndefined()
    // The capability the rolled-back module provided must not linger either.
    expect(core.listCapabilities()).toHaveLength(0)
  })
})

// ── §2 — "a Hub owns a permission scope and governs its modules" ─────────────
describe('§2 — hub permissionScope gates every module in the hub', () => {
  const scopedHub: HubDescriptor = {
    id: 'scoped.hub', name: 'Scoped', version: '1.0.0', owner: 'test',
    permissionScope: 'audit.log.read',
    navigationGroup: 'g2', navigationOrder: 1, lifecycle: 'stable',
  }

  beforeEach(() => {
    expect(core.registerHub(scopedHub).ok).toBe(true)
    expect(core.register(manifest('m', { hub: scopedHub.id, routes: ['/admin/_test/scoped'] })).ok).toBe(true)
  })

  it('denies an actor who does not satisfy the hub scope, even with no module-level permission required', () => {
    // The module itself declares NO visibilityPermission, so without hub
    // enforcement this actor would be allowed.
    expect(core.isModuleAccessible('m', actor({ roles: [] }))).toBe(false)
  })

  it('allows an actor who satisfies the hub scope', () => {
    expect(core.isModuleAccessible('m', actor({ roles: ['admin'] }))).toBe(true)
  })

  it('allows the Owner — the constitutional bypass is not weakened', () => {
    expect(core.isModuleAccessible('m', actor({ isOwner: true }))).toBe(true)
  })

  it('leaves hubs WITHOUT a permissionScope unaffected', () => {
    expect(core.register(manifest('free', { routes: ['/admin/_test/free'] })).ok).toBe(true)
    expect(core.isModuleAccessible('free', actor({ roles: [] }))).toBe(true)
  })

  it('still denies a disabled module to an actor who satisfies the hub scope', () => {
    core.disable('m')
    expect(core.isModuleAccessible('m', actor({ roles: ['admin'] }))).toBe(false)
  })
})
