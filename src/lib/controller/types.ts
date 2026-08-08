// Controller V2 — Kernel contracts (FOUNDATION-02).
//
// These are the runtime types for the contracts frozen in
// docs/controller-v2/FOUNDATION_01_CONTRACTS.md. The kernel CONSUMES the
// existing security services (PDP, RBAC, audit) — it never re-implements them.
// This file is pure (no server imports) so it is safe on client and server and
// in tests.

import type { Actor } from '@/lib/admin/rbac'
import type { Decision, PermissionId } from '@/lib/admin/permissions/types'

export type Lifecycle = 'experimental' | 'beta' | 'stable' | 'deprecated'
export type ModuleStatus = 'enabled' | 'disabled'
export type SecurityClass = 'public' | 'internal' | 'security'

/** Navigation contribution of a module (rendered by the Navigation Provider). */
export interface ModuleNavigation {
  /** i18n key, never a literal string. */
  label: string
  icon?: string
  /** Deterministic ordering within the hub group. */
  order: number
  /** If set, the entry is shown only when the actor is authorized for it. */
  visibilityPermission?: PermissionId
}

/** A dependency on another module or a capability, with a semver range. */
export interface ModuleDependency {
  moduleId?: string
  capabilityId?: string
  versionRange: string
}

/** Optional module configuration schema (defaults + security-locked keys). */
export interface ModuleConfigSchema {
  defaults?: Record<string, unknown>
  /** Keys that user/role preferences may NEVER override (security). */
  securityKeys?: readonly string[]
}

/** The canonical Module Manifest (FOUNDATION-01 §3). */
export interface ModuleManifest {
  id: string
  name: string
  version: string
  owner: string
  hub: string
  capabilities: readonly string[]
  permissions: readonly PermissionId[]
  dependencies: readonly ModuleDependency[]
  routes: readonly string[]
  navigation: ModuleNavigation
  lifecycle: Lifecycle
  status: ModuleStatus
  // optional
  description?: string
  configuration?: ModuleConfigSchema
  events?: { produces?: readonly string[]; consumes?: readonly string[] }
  featureFlags?: readonly string[]
  compatibility?: { controller?: string }
}

/** A Hub — a first-class governance/composition unit (FOUNDATION-01 §2). */
export interface HubDescriptor {
  id: string
  name: string
  version: string
  owner: string
  permissionScope?: PermissionId
  /** i18n key for the nav group heading. */
  navigationGroup: string
  navigationOrder: number
  lifecycle: Lifecycle
  dependencies?: readonly ModuleDependency[]
}

export type RegistrationResult = { ok: true } | { ok: false; errors: readonly string[] }

/** A controller event (FOUNDATION-01 §6 — fields FROZEN, delivery OPEN for C8). */
export interface ControllerEvent {
  id: string
  type: string
  version: string
  producer: string
  actor: string | null
  timestamp: number
  correlationId: string
  securityClass: SecurityClass
  payload?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface EventSink {
  emit(event: ControllerEvent): void
}

/** What the kernel hands the audit layer. Mapped to the real writeAuditLog by an adapter. */
export interface ControllerAuditEntry {
  action: string
  actor: Actor | null
  targetType: string
  targetId: string
  detail?: Record<string, unknown>
}

export interface AuditSink {
  record(entry: ControllerAuditEntry): void
}

/** The kernel's only authorization primitive — the existing PDP, injected. */
export type AuthorizeFn = (actor: Actor | null, permission: PermissionId, now?: number) => Decision

/** Runtime view of a registered module. */
export interface RegisteredModule {
  manifest: ModuleManifest
  /** Runtime lifecycle state; starts from manifest.status, changed by enable/disable. */
  status: ModuleStatus
  /** false when a module failed at runtime and was isolated. */
  available: boolean
}
