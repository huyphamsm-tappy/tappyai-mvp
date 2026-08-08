// Controller V2 — Controller Core kernel (FOUNDATION-02).
//
// The orchestration layer. It CONSUMES the existing Permission Engine (C3/C4)
// for every authorization decision and an injected audit sink for lifecycle
// records — it does NOT contain a second PDP, RBAC path, or audit path.
//
// Everything is fail-closed: an invalid manifest, missing hub, unsatisfied
// dependency, or version mismatch registers NOTHING and returns errors. A module
// that throws at runtime is isolated (marked unavailable), never allowed to
// crash the Controller.
//
// This module is pure (no server imports): the default authorize is the pure
// permission engine; audit/event default to no-op sinks, and production wires
// the real writeAuditLog adapter (see auditAdapter.ts).

import { permissionEngine } from '@/lib/admin/permissions/engine'
import type { Actor } from '@/lib/admin/rbac'
import type { Decision, PermissionId } from '@/lib/admin/permissions/types'
import { satisfies } from './version'
import { validateManifest } from './manifest'
import type {
  AuditSink,
  AuthorizeFn,
  ControllerEvent,
  EventSink,
  HubDescriptor,
  ModuleManifest,
  RegisteredModule,
  SecurityClass,
} from './types'

const NOOP_AUDIT: AuditSink = { record: () => {} }
const NOOP_EVENTS: EventSink = { emit: () => {} }

export interface ControllerCoreOptions {
  controllerVersion?: string
  authorize?: AuthorizeFn
  audit?: AuditSink
  events?: EventSink
  /** Injected clock for deterministic events in tests. */
  now?: () => number
}

export class ControllerCore {
  readonly version: string
  private readonly authorizeFn: AuthorizeFn
  private readonly audit: AuditSink
  private readonly events: EventSink
  private readonly clock: () => number

  private readonly hubs = new Map<string, HubDescriptor>()
  private readonly modules = new Map<string, RegisteredModule>()
  /** capabilityId -> providing module id + version. */
  private readonly capabilities = new Map<string, { moduleId: string; version: string }>()
  private eventSeq = 0

  constructor(opts: ControllerCoreOptions = {}) {
    this.version = opts.controllerVersion ?? '1.0.0'
    this.authorizeFn = opts.authorize ?? ((actor, permission, now) => permissionEngine.authorize(actor, permission, now))
    this.audit = opts.audit ?? NOOP_AUDIT
    this.events = opts.events ?? NOOP_EVENTS
    this.clock = opts.now ?? (() => Date.now())
  }

  // ── Hubs ──────────────────────────────────────────────────────────────────
  registerHub(hub: HubDescriptor): { ok: true } | { ok: false; errors: string[] } {
    if (!hub || typeof hub.id !== 'string' || hub.id.trim() === '') {
      return { ok: false, errors: ['hub.id: required non-empty string'] }
    }
    if (this.hubs.has(hub.id)) {
      return { ok: false, errors: [`hub "${hub.id}" already registered`] }
    }
    this.hubs.set(hub.id, hub)
    this.audit.record({ action: 'controller.hub.registered', actor: null, targetType: 'hub', targetId: hub.id })
    this.emit('controller.hub.registered', 'security', null, { hubId: hub.id })
    return { ok: true }
  }

  getHub(id: string): HubDescriptor | undefined {
    return this.hubs.get(id)
  }

  listHubs(): HubDescriptor[] {
    return [...this.hubs.values()].sort((a, b) => a.navigationOrder - b.navigationOrder || a.id.localeCompare(b.id))
  }

  // ── Modules ─────────────────────────────────────────────────────────────��─
  register(input: unknown): { ok: true } | { ok: false; errors: string[] } {
    const v = validateManifest(input)
    if (!v.ok || !v.manifest) return { ok: false, errors: v.errors }
    const manifest = v.manifest
    const errors: string[] = []

    if (this.modules.has(manifest.id)) errors.push(`module "${manifest.id}" already registered`)
    if (!this.hubs.has(manifest.hub)) errors.push(`hub "${manifest.hub}" is not registered`)

    // Controller version compatibility.
    if (manifest.compatibility?.controller && !satisfies(this.version, manifest.compatibility.controller)) {
      errors.push(`controller ${this.version} does not satisfy required ${manifest.compatibility.controller}`)
    }

    // Route uniqueness across all registered modules.
    for (const route of manifest.routes) {
      for (const other of this.modules.values()) {
        if (other.manifest.routes.includes(route)) {
          errors.push(`route "${route}" already owned by module "${other.manifest.id}"`)
        }
      }
    }

    // Dependency + version resolution (fail-closed).
    for (const dep of manifest.dependencies) {
      if (dep.moduleId) {
        const target = this.modules.get(dep.moduleId)
        if (!target) errors.push(`dependency module "${dep.moduleId}" is not registered`)
        else if (!satisfies(target.manifest.version, dep.versionRange)) {
          errors.push(`module "${dep.moduleId}" v${target.manifest.version} does not satisfy ${dep.versionRange}`)
        }
      } else if (dep.capabilityId) {
        const cap = this.capabilities.get(dep.capabilityId)
        if (!cap) errors.push(`capability "${dep.capabilityId}" is not provided by any registered module`)
        else if (!satisfies(cap.version, dep.versionRange)) {
          errors.push(`capability "${dep.capabilityId}" v${cap.version} does not satisfy ${dep.versionRange}`)
        }
      }
    }

    if (errors.length > 0) return { ok: false, errors } // nothing registered — no partial load

    this.modules.set(manifest.id, { manifest, status: manifest.status, available: true })
    for (const capId of manifest.capabilities) {
      this.capabilities.set(capId, { moduleId: manifest.id, version: manifest.version })
    }
    this.audit.record({
      action: 'controller.module.registered',
      actor: null,
      targetType: 'module',
      targetId: manifest.id,
      detail: { hub: manifest.hub, version: manifest.version },
    })
    this.emit('controller.module.registered', 'security', null, { moduleId: manifest.id })
    return { ok: true }
  }

  discover(): RegisteredModule[] {
    return [...this.modules.values()]
  }

  getModule(id: string): RegisteredModule | undefined {
    return this.modules.get(id)
  }

  bindCapability(capabilityId: string): { moduleId: string; version: string } | undefined {
    return this.capabilities.get(capabilityId)
  }

  enable(moduleId: string): { ok: boolean; error?: string } {
    const mod = this.modules.get(moduleId)
    if (!mod) return { ok: false, error: `module "${moduleId}" not registered` }
    mod.status = 'enabled'
    this.audit.record({ action: 'controller.module.enabled', actor: null, targetType: 'module', targetId: moduleId })
    this.emit('controller.module.enabled', 'security', null, { moduleId })
    return { ok: true }
  }

  disable(moduleId: string): { ok: boolean; error?: string } {
    const mod = this.modules.get(moduleId)
    if (!mod) return { ok: false, error: `module "${moduleId}" not registered` }
    mod.status = 'disabled'
    this.audit.record({ action: 'controller.module.disabled', actor: null, targetType: 'module', targetId: moduleId })
    this.emit('controller.module.disabled', 'security', null, { moduleId })
    return { ok: true }
  }

  // ── Authorization — delegates to the existing PDP, no second engine ─────────
  authorize(actor: Actor | null, permission: PermissionId, now?: number): Decision {
    return this.authorizeFn(actor, permission, now)
  }

  /**
   * Is this module reachable by this actor RIGHT NOW? Combines runtime state with
   * the PDP. A disabled/unavailable module is inaccessible to everyone; a module
   * with a visibilityPermission requires the PDP to allow it.
   */
  isModuleAccessible(moduleId: string, actor: Actor | null, now?: number): boolean {
    const mod = this.modules.get(moduleId)
    if (!mod || !mod.available || mod.status !== 'enabled') return false
    const perm = mod.manifest.navigation.visibilityPermission
    if (!perm) return true
    return this.authorize(actor, perm, now).allowed
  }

  // ── Failure isolation ───────────────────────────────────────────────────────
  /**
   * Run a module operation so a throwing module is captured, marked unavailable,
   * audited, and does NOT propagate. Returns the result or a failure marker.
   */
  runIsolated<T>(moduleId: string, fn: () => T): { ok: true; value: T } | { ok: false; error: string } {
    const mod = this.modules.get(moduleId)
    if (!mod) return { ok: false, error: `module "${moduleId}" not registered` }
    try {
      return { ok: true, value: fn() }
    } catch (err) {
      mod.available = false
      const message = err instanceof Error ? err.message : String(err)
      this.audit.record({
        action: 'controller.module.failure',
        actor: null,
        targetType: 'module',
        targetId: moduleId,
        detail: { message },
      })
      this.emit('controller.module.failure', 'security', null, { moduleId, message })
      return { ok: false, error: message }
    }
  }

  // ── Events (fields FROZEN; delivery deferred to C8 via the sink) ────────────
  private emit(type: string, securityClass: SecurityClass, actor: string | null, payload?: Record<string, unknown>): void {
    const event: ControllerEvent = {
      id: `evt-${++this.eventSeq}`,
      type,
      version: '1.0.0',
      producer: 'controller.core',
      actor,
      timestamp: this.clock(),
      correlationId: `ctrl-${this.eventSeq}`,
      securityClass,
      payload,
    }
    this.events.emit(event)
  }
}
