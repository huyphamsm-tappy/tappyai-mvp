import { describe, it, expect, beforeEach } from 'vitest'
import { ControllerCore } from '../core'
import { deriveAlerts, ALERT_SEVERITY_ORDER } from '../alerts'
import type { Actor } from '@/lib/admin/rbac'
import type { HubDescriptor, ModuleManifest } from '../types'

// Controller V2 — Phase 7 / B5, the ALERT WELL.
//
// 01_ARCH §8 defines it in five words: "what needs attention now". The Home
// already carried the slot for it — AttentionPanel renders a NotConnected
// placeholder labelled `admin.home.nc.alerts` — because until Phase 4 there was
// nothing real to put in it.
//
// There is now. The kernel knows which modules were isolated by a runtime
// failure, which are switched off, and which declare a capability that cannot
// bind. Those are facts the Controller already holds; this DERIVES alerts from
// them. It creates no second monitoring system, no table, no event stream, and
// invents no alert that is not a registry fact.

const hub: HubDescriptor = {
  id: 'test.hub', name: 'Test', version: '1.0.0', owner: 'test',
  navigationGroup: 'g', navigationOrder: 0, lifecycle: 'stable',
}

function manifest(id: string, over: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    id, name: id, version: '1.0.0', owner: 'test', hub: hub.id,
    capabilities: [], permissions: [], dependencies: [], routes: [`/admin/_t/${id}`],
    navigation: { label: `nav.${id}`, order: 0 },
    lifecycle: 'stable', status: 'enabled', compatibility: { controller: '^1' },
    ...over,
  }
}

function actor(over: Partial<Actor> = {}): Actor {
  return {
    userId: 'u1', email: 'a@tappyai.com', isOwner: false, roles: ['admin'],
    highestRole: 'admin', capabilities: [], source: 'cookie', resolvedAt: 0,
    ...over,
  } as Actor
}

let core: ControllerCore

beforeEach(() => {
  core = new ControllerCore({ controllerVersion: '1.0.0' })
  expect(core.registerHub(hub).ok).toBe(true)
})

describe('a healthy registry raises nothing', () => {
  it('returns no alerts when every module is enabled and available', () => {
    expect(core.register(manifest('a')).ok).toBe(true)
    expect(core.register(manifest('b')).ok).toBe(true)

    expect(deriveAlerts(core, actor())).toEqual([])
  })

  it('returns no alerts for an empty registry', () => {
    expect(deriveAlerts(core, actor())).toEqual([])
  })
})

describe('the alerts are registry FACTS, never invented', () => {
  it('reports a module isolated by a runtime failure as an ERROR', () => {
    expect(core.register(manifest('broken')).ok).toBe(true)
    core.runIsolated('broken', () => { throw new Error('boom') })

    const alerts = deriveAlerts(core, actor())

    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ severity: 'error', kind: 'module_unavailable', moduleId: 'broken' })
  })

  it('reports a deliberately disabled module as INFO, not an error', () => {
    // Switching a module off is an operator decision, not a fault. Rendering it
    // red would train operators to ignore red.
    expect(core.register(manifest('off')).ok).toBe(true)
    core.disable('off')

    expect(deriveAlerts(core, actor())[0]).toMatchObject({ severity: 'info', kind: 'module_disabled' })
  })

  it('reports a dependency whose capability cannot bind as a WARNING', () => {
    expect(core.register(manifest('provider', { capabilities: ['cap.x'] })).ok).toBe(true)
    expect(core.register(manifest('consumer', {
      dependencies: [{ capabilityId: 'cap.x', versionRange: '^1' }],
    })).ok).toBe(true)

    // Disabling the provider makes the capability unreachable (FOUNDATION-01 §1),
    // which degrades the consumer without disabling it.
    core.disable('provider')

    const alerts = deriveAlerts(core, actor())
    const consumerAlert = alerts.find((a) => a.moduleId === 'consumer')

    expect(consumerAlert).toMatchObject({ severity: 'warning', kind: 'capability_unresolved' })
    expect(consumerAlert?.detail).toBe('cap.x')
  })

  it('carries the module NAME, never an internal object', () => {
    expect(core.register(manifest('m', { name: 'Audit Log' })).ok).toBe(true)
    core.disable('m')

    expect(deriveAlerts(core, actor())[0].moduleName).toBe('Audit Log')
  })

  it('raises at most ONE alert per module — the most severe', () => {
    // A disabled module that also cannot resolve a capability is one problem to
    // an operator, not two rows to scroll past.
    expect(core.register(manifest('p', { capabilities: ['cap.y'] })).ok).toBe(true)
    expect(core.register(manifest('m', {
      dependencies: [{ capabilityId: 'cap.y', versionRange: '^1' }],
    })).ok).toBe(true)
    core.disable('p')
    core.disable('m')

    const forM = deriveAlerts(core, actor()).filter((a) => a.moduleId === 'm')

    expect(forM).toHaveLength(1)
  })
})

describe('ordering is deterministic', () => {
  it('sorts by severity, most severe first', () => {
    expect(core.register(manifest('c-info')).ok).toBe(true)
    expect(core.register(manifest('a-error')).ok).toBe(true)
    expect(core.register(manifest('p', { capabilities: ['cap.z'] })).ok).toBe(true)
    expect(core.register(manifest('b-warn', {
      dependencies: [{ capabilityId: 'cap.z', versionRange: '^1' }],
    })).ok).toBe(true)

    core.disable('c-info')
    core.runIsolated('a-error', () => { throw new Error('x') })
    core.disable('p')

    const severities = deriveAlerts(core, actor())
      .filter((a) => a.moduleId !== 'p')
      .map((a) => a.severity)

    expect(severities).toEqual(['error', 'warning', 'info'])
  })

  it('breaks ties by module id, so the same state always renders the same list', () => {
    for (const id of ['zeta', 'alpha', 'mid']) {
      expect(core.register(manifest(id)).ok).toBe(true)
      core.disable(id)
    }

    const ids = deriveAlerts(core, actor()).map((a) => a.moduleId)

    expect(ids).toEqual(['alpha', 'mid', 'zeta'])
    expect(ids).toEqual([...ids].sort())
  })

  it('exposes the severity order it sorts by, rather than hiding it in a comparator', () => {
    expect(ALERT_SEVERITY_ORDER).toEqual(['error', 'warning', 'info'])
  })
})

describe('the permission boundary is the existing one, not a new one', () => {
  const scopedHub: HubDescriptor = {
    id: 'scoped.hub', name: 'Scoped', version: '1.0.0', owner: 'test',
    permissionScope: 'audit.log.read',
    navigationGroup: 'g2', navigationOrder: 1, lifecycle: 'stable',
  }

  beforeEach(() => {
    expect(core.registerHub(scopedHub).ok).toBe(true)
  })

  it('hides an alert about a module the actor may not see', () => {
    expect(core.register(manifest('secret', {
      hub: scopedHub.id, routes: ['/admin/_t/secret'],
      navigation: { label: 'nav.secret', order: 0, visibilityPermission: 'security.roles.read' },
    })).ok).toBe(true)
    core.disable('secret')

    // `analyst` holds neither audit.log.read nor security.roles.read.
    expect(deriveAlerts(core, actor({ roles: ['analyst'] }))).toEqual([])
  })

  it('shows it to an actor who holds the permission', () => {
    expect(core.register(manifest('visible', {
      hub: scopedHub.id, routes: ['/admin/_t/visible'],
      navigation: { label: 'nav.visible', order: 0, visibilityPermission: 'audit.log.read' },
    })).ok).toBe(true)
    core.disable('visible')

    expect(deriveAlerts(core, actor({ roles: ['admin'] }))).toHaveLength(1)
  })

  it('shows it to the Owner, whose bypass is constitutional', () => {
    expect(core.register(manifest('owned', {
      hub: scopedHub.id, routes: ['/admin/_t/owned'],
      navigation: { label: 'nav.owned', order: 0, visibilityPermission: 'security.roles.read' },
    })).ok).toBe(true)
    core.disable('owned')

    expect(deriveAlerts(core, actor({ isOwner: true, roles: [] }))).toHaveLength(1)
  })

  it('enforces the HUB scope too, not only the module permission', () => {
    // A module with no visibilityPermission inside a scoped hub is still gated —
    // the Phase 4 rule. An alert must not be the way around it.
    expect(core.register(manifest('nofilter', { hub: scopedHub.id, routes: ['/admin/_t/nofilter'] })).ok).toBe(true)
    core.disable('nofilter')

    expect(deriveAlerts(core, actor({ roles: ['analyst'] }))).toEqual([])
    expect(deriveAlerts(core, actor({ roles: ['admin'] }))).toHaveLength(1)
  })

  it('raises nothing at all for a null actor', () => {
    expect(core.register(manifest('any')).ok).toBe(true)
    core.disable('any')

    expect(deriveAlerts(core, null)).toEqual([])
  })
})

describe('nothing sensitive can reach an alert', () => {
  it('carries only ids, a name, a severity and a kind', () => {
    expect(core.register(manifest('m', { name: 'Deals' })).ok).toBe(true)
    core.runIsolated('m', () => { throw new Error('connection to postgres://user:pw@host failed') })

    const [alert] = deriveAlerts(core, actor())

    // The failure MESSAGE is deliberately not carried: runIsolated already
    // audits it, and an operator-facing well is not the place for a driver error
    // that may quote a connection string.
    expect(Object.keys(alert).sort()).toEqual(['detail', 'id', 'kind', 'moduleId', 'moduleName', 'severity'])
    expect(JSON.stringify(alert)).not.toContain('postgres')
    expect(JSON.stringify(alert)).not.toContain('connection')
  })

  it('gives every alert a stable id derived from the module and kind', () => {
    expect(core.register(manifest('m')).ok).toBe(true)
    core.disable('m')

    const first = deriveAlerts(core, actor())[0].id
    const second = deriveAlerts(core, actor())[0].id

    expect(first).toBe(second)
    expect(first).toBe('module_disabled:m')
  })
})
