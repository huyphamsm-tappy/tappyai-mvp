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
  CapabilityRecord,
  ControllerEvent,
  EventSink,
  HubDescriptor,
  ModuleDependency,
  ModuleManifest,
  RegisteredModule,
  SecurityClass,
} from './types'

/** Internal, mutable form of CapabilityRecord — `consumers` grows as modules register. */
type CapabilityEntry = Omit<CapabilityRecord, 'consumers'> & { consumers: Set<string> }

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
  /** capabilityId -> the capability record (FOUNDATION-01 §4). */
  private readonly capabilities = new Map<string, CapabilityEntry>()
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
  /**
   * Audit + emit a refused registration.
   *
   * FOUNDATION-01 §8 requires an incompatible dependency to fail "closed,
   * AUDITED, surfaced as unavailable". Returning errors to the caller is not
   * auditing them: a registry that refuses a module in silence leaves no record
   * that the module was ever meant to exist, which is exactly the state that
   * made the C6 status wrong in both directions before its contract was written.
   *
   * `moduleId` may be unknown — an invalid manifest can fail before it has an
   * id — so the target falls back to a marker rather than an empty string.
   */
  private auditRegistrationFailure(moduleId: string | undefined, errors: readonly string[]): void {
    const targetId = moduleId && moduleId.trim() !== '' ? moduleId : '(invalid manifest)'
    this.audit.record({
      action: 'controller.module.registration_failed',
      actor: null,
      targetType: 'module',
      targetId,
      detail: { errors: [...errors] },
    })
    this.emit('controller.module.registration_failed', 'security', null, { moduleId: targetId, errors: [...errors] })
  }

  register(input: unknown): { ok: true } | { ok: false; errors: string[] } {
    const v = validateManifest(input)
    if (!v.ok || !v.manifest) {
      const attemptedId = typeof input === 'object' && input !== null ? (input as { id?: unknown }).id : undefined
      this.auditRegistrationFailure(typeof attemptedId === 'string' ? attemptedId : undefined, v.errors)
      return { ok: false, errors: v.errors }
    }
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

    // Permission ownership is exclusive across modules (architecture §5 lists
    // "permission collisions" as a validate step). Two modules declaring the same
    // permission would make the nav's visibility source ambiguous and let a
    // permission grant widen a second module's surface silently.
    //
    // A module repeating a permission inside its OWN manifest is not a collision —
    // `permissions` is a declaration list, not a set — so the check dedupes first.
    for (const permission of new Set(manifest.permissions)) {
      for (const other of this.modules.values()) {
        if (other.manifest.permissions.includes(permission)) {
          errors.push(`permission "${permission}" already declared by module "${other.manifest.id}"`)
        }
      }
    }

    // A capability has exactly ONE provider (FOUNDATION-01 §4: `provider(moduleId)`,
    // singular). Silently overwriting the binding — which is what a bare
    // `capabilities.set` did — would repoint every consumer at a different
    // implementation purely by registration order.
    for (const capabilityId of new Set(manifest.capabilities)) {
      const existing = this.capabilities.get(capabilityId)
      if (existing) {
        errors.push(`capability "${capabilityId}" is already provided by module "${existing.provider}"`)
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

    if (errors.length > 0) {
      this.auditRegistrationFailure(manifest.id, errors)
      return { ok: false, errors } // nothing registered — no partial load
    }

    this.modules.set(manifest.id, { manifest, status: manifest.status, available: true })
    for (const capId of manifest.capabilities) {
      this.capabilities.set(capId, {
        id: capId,
        version: manifest.version,
        owner: manifest.owner,
        provider: manifest.id,
        permissions: manifest.permissions,
        dependencies: manifest.dependencies,
        consumers: new Set<string>(),
      })
    }
    // This module is a consumer of every capability it declared a dependency on.
    for (const dep of manifest.dependencies) {
      if (dep.capabilityId) this.capabilities.get(dep.capabilityId)?.consumers.add(manifest.id)
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

  /**
   * Register a batch of manifests in DEPENDENCY order rather than the order the
   * caller happened to list them.
   *
   * FOUNDATION-01 §1 requires `resolveDependencies()` to be **topological**.
   * `register()` alone is not: it resolves each dependency against what is
   * already in the registry, so a consumer listed before its provider fails
   * even though the batch is perfectly satisfiable. That made registration
   * order a hidden contract, and a module author would discover it only by
   * getting the order wrong.
   *
   * ALL-OR-NOTHING. If any manifest is invalid, any cycle exists, or any single
   * registration is refused, the registry is restored to exactly its prior state
   * — the same "no partial load" rule `register()` applies to one module,
   * applied to the batch.
   */
  registerAll(inputs: readonly unknown[]): { ok: true } | { ok: false; errors: string[] } {
    const manifests: ModuleManifest[] = []
    const errors: string[] = []

    for (const input of inputs) {
      const v = validateManifest(input)
      if (!v.ok || !v.manifest) errors.push(...v.errors)
      else manifests.push(v.manifest)
    }
    if (errors.length > 0) return { ok: false, errors }

    const ordered = this.topologicalOrder(manifests)
    if (!ordered.ok) return { ok: false, errors: ordered.errors }

    const snapshot = this.snapshot()
    for (const manifest of ordered.manifests) {
      const r = this.register(manifest)
      if (!r.ok) {
        this.restore(snapshot)
        return { ok: false, errors: r.errors }
      }
    }
    return { ok: true }
  }

  /**
   * Kahn's algorithm over the batch. An edge runs provider → consumer, and only
   * for dependencies satisfied *within this batch*: a dependency already met by
   * a registered module imposes no ordering constraint here.
   */
  private topologicalOrder(
    manifests: readonly ModuleManifest[]
  ): { ok: true; manifests: ModuleManifest[] } | { ok: false; errors: string[] } {
    const byId = new Map(manifests.map((m) => [m.id, m]))
    const providerOf = new Map<string, string>()
    for (const m of manifests) {
      for (const capabilityId of m.capabilities) providerOf.set(capabilityId, m.id)
    }

    const indegree = new Map<string, number>(manifests.map((m) => [m.id, 0]))
    const dependents = new Map<string, string[]>(manifests.map((m) => [m.id, []]))

    const prerequisite = (dep: ModuleDependency): string | undefined => {
      if (dep.moduleId) return byId.has(dep.moduleId) ? dep.moduleId : undefined
      if (dep.capabilityId) return providerOf.get(dep.capabilityId)
      return undefined
    }

    for (const m of manifests) {
      // A module depending on itself is a cycle of length one; dedupe so a
      // repeated dependency does not inflate the indegree past what edges exist.
      const prereqs = new Set<string>()
      for (const dep of m.dependencies) {
        const from = prerequisite(dep)
        if (from !== undefined) prereqs.add(from)
      }
      for (const from of prereqs) {
        dependents.get(from)!.push(m.id)
        indegree.set(m.id, indegree.get(m.id)! + 1)
      }
    }

    // Ties broken by id so the order — and therefore any error message — is
    // deterministic across runs.
    const ready = manifests.filter((m) => indegree.get(m.id) === 0).map((m) => m.id).sort()
    const out: ModuleManifest[] = []
    while (ready.length > 0) {
      const id = ready.shift()!
      out.push(byId.get(id)!)
      for (const next of dependents.get(id)!) {
        const remaining = indegree.get(next)! - 1
        indegree.set(next, remaining)
        if (remaining === 0) {
          ready.push(next)
          ready.sort()
        }
      }
    }

    if (out.length !== manifests.length) {
      const stuck = manifests.filter((m) => !out.includes(m)).map((m) => m.id).sort()
      return { ok: false, errors: [`dependency cycle among: ${stuck.join(', ')}`] }
    }
    return { ok: true, manifests: out }
  }

  private snapshot(): { hubs: Map<string, HubDescriptor>; modules: Map<string, RegisteredModule>; capabilities: Map<string, CapabilityEntry> } {
    return {
      hubs: new Map(this.hubs),
      // Copy each RegisteredModule: status/available are mutated in place.
      modules: new Map([...this.modules].map(([k, v]) => [k, { ...v }])),
      capabilities: new Map([...this.capabilities].map(([k, v]) => [k, { ...v, consumers: new Set(v.consumers) }])),
    }
  }

  private restore(s: ReturnType<ControllerCore['snapshot']>): void {
    this.hubs.clear()
    for (const [k, v] of s.hubs) this.hubs.set(k, v)
    this.modules.clear()
    for (const [k, v] of s.modules) this.modules.set(k, v)
    this.capabilities.clear()
    for (const [k, v] of s.capabilities) this.capabilities.set(k, v)
  }

  discover(): RegisteredModule[] {
    return [...this.modules.values()]
  }

  getModule(id: string): RegisteredModule | undefined {
    return this.modules.get(id)
  }

  /**
   * Resolve a capability to its provider — or refuse.
   *
   * FOUNDATION-01 §1: "disabled ⇒ route + nav + **capability** unreachable."
   * A module that is switched off, or that has been isolated after throwing,
   * must stop serving other modules through the capability layer too. Otherwise
   * disabling a module closes its front door and leaves the side door open,
   * and `isolateFailure` would contain a crash while still handing callers a
   * binding into the broken module.
   *
   * Returns `undefined` for "no provider" and for "provider not ready" alike:
   * the caller's correct behaviour is identical — fail closed — and a caller
   * that could tell the two apart would be tempted to treat one as recoverable.
   */
  bindCapability(capabilityId: string): CapabilityRecord | undefined {
    const entry = this.capabilities.get(capabilityId)
    if (!entry || !this.isReady(entry.provider)) return undefined
    return this.toCapabilityRecord(entry)
  }

  private toCapabilityRecord(entry: CapabilityEntry): CapabilityRecord {
    return { ...entry, consumers: [...entry.consumers].sort() }
  }

  /**
   * Every registered capability, ready or not, sorted by id.
   *
   * Deliberately NOT filtered by readiness: this is the registry's inventory,
   * used for governance and diagnostics ("who provides this, and who consumes
   * it?"). `bindCapability` is the authorization-shaped call and it is the one
   * that refuses.
   */
  listCapabilities(): CapabilityRecord[] {
    return [...this.capabilities.values()]
      .map((e) => this.toCapabilityRecord(e))
      .sort((a, b) => a.id.localeCompare(b.id))
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

  /**
   * `ready` from the lifecycle contract (FOUNDATION-01 §5:
   * register → validate → enable → ready → disable → deregister).
   *
   * It is a DERIVED condition, not a third `ModuleStatus`: a module is ready when
   * it is registered, enabled, and has not been marked unavailable by a runtime
   * failure. `available` has exactly one writer — `runIsolated` sets it false when
   * a module throws — so "ready" means "enabled and not currently broken".
   *
   * This is the same predicate `isModuleAccessible` applies before consulting the
   * PDP; that method now calls this one so the two cannot drift apart.
   */
  isReady(moduleId: string): boolean {
    const mod = this.modules.get(moduleId)
    return !!mod && mod.available && mod.status === 'enabled'
  }

  /**
   * Modules that depend on `moduleId`, directly or through a capability it
   * provides. Sorted, so the rejection message is deterministic.
   *
   * Disabled dependents count: a dependency that is merely switched off is still
   * a declared dependency, and removing its target would leave it dangling — the
   * orphan state this registry refuses to create.
   */
  private dependentsOf(moduleId: string): string[] {
    const mod = this.modules.get(moduleId)
    if (!mod) return []
    const provided = new Set(mod.manifest.capabilities)
    const dependents: string[] = []
    for (const other of this.modules.values()) {
      if (other.manifest.id === moduleId) continue
      const dependsOnIt = other.manifest.dependencies.some(
        (dep) => dep.moduleId === moduleId || (dep.capabilityId !== undefined && provided.has(dep.capabilityId))
      )
      if (dependsOnIt) dependents.push(other.manifest.id)
    }
    return dependents.sort()
  }

  /**
   * Remove a module from the registry — the final lifecycle step.
   *
   * Fail-closed and non-cascading: if any registered module depends on this one,
   * nothing is removed and the dependents are named. Cascading would disable
   * modules the caller never asked about; orphaning would leave a dependency
   * pointing at nothing, which registration itself refuses to allow.
   *
   * On success the module's capability bindings are released, and its routes
   * become free because route ownership is derived by scanning registered modules
   * rather than stored separately. No routing architecture is introduced here.
   */
  deregister(moduleId: string): { ok: true } | { ok: false; errors: string[] } {
    const mod = this.modules.get(moduleId)
    if (!mod) return { ok: false, errors: [`module "${moduleId}" not registered`] }

    const dependents = this.dependentsOf(moduleId)
    if (dependents.length > 0) {
      // Registry untouched.
      return { ok: false, errors: [`module "${moduleId}" is required by: ${dependents.join(', ')}`] }
    }

    this.modules.delete(moduleId)
    for (const capabilityId of mod.manifest.capabilities) {
      // Only release a binding this module actually owns.
      if (this.capabilities.get(capabilityId)?.provider === moduleId) this.capabilities.delete(capabilityId)
    }
    // Drop it from every capability it consumed, so `consumers` stays a fact
    // about registered modules rather than a growing history.
    for (const entry of this.capabilities.values()) entry.consumers.delete(moduleId)

    this.audit.record({
      action: 'controller.module.deregistered',
      actor: null,
      targetType: 'module',
      targetId: moduleId,
      detail: { hub: mod.manifest.hub, version: mod.manifest.version },
    })
    this.emit('controller.module.deregistered', 'security', null, { moduleId })
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
    return this.isReady(moduleId) && this.isModulePermitted(moduleId, actor, now)
  }

  /**
   * The PERMISSION half of `isModuleAccessible`, without the readiness half.
   *
   * Split out because the Alert Well needs exactly this: an alert about a module
   * that is disabled or has failed must still respect who may know the module
   * exists, but gating it on readiness would hide every alert it is meant to
   * raise — a broken module is never `ready` by definition.
   *
   * Hub scope first (FOUNDATION-01 §2: a Hub "contains and GOVERNS modules, owns
   * a permission scope"). A hub that declares a scope gates every module inside
   * it, including modules that declare no visibilityPermission of their own —
   * otherwise "governs" would mean nothing and the field would be decoration.
   * Hubs without a scope are unaffected.
   *
   * Owner is unaffected either way: the PDP answers OWNER_BYPASS before it reads
   * the permission, so this adds no new way to lock the Owner out.
   */
  isModulePermitted(moduleId: string, actor: Actor | null, now?: number): boolean {
    const mod = this.modules.get(moduleId)
    if (!mod) return false

    const hubScope = this.hubs.get(mod.manifest.hub)?.permissionScope
    if (hubScope && !this.authorize(actor, hubScope, now).allowed) return false

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
