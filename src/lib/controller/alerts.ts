// Controller V2 — Phase 7 / B5: the ALERT WELL (01_ARCH §8, "what needs
// attention now").
//
// This DERIVES alerts from facts the kernel already holds. It is not a second
// monitoring system: no table, no event stream, no polling, no new
// authorization. Every alert corresponds to a registry state the Controller can
// point at, and a state the Controller cannot point at produces no alert.
//
// Pure: given a core and an actor it returns the same list every time.

import type { Actor } from '@/lib/admin/rbac'
import type { ControllerCore } from './core'

/** Most severe first. Exported so the ordering is a stated rule, not a comparator's secret. */
export const ALERT_SEVERITY_ORDER = ['error', 'warning', 'info'] as const
export type AlertSeverity = (typeof ALERT_SEVERITY_ORDER)[number]

/**
 * What the Controller can currently be wrong about.
 *
 * `module_unavailable` is an ERROR: `runIsolated` marked the module broken after
 * it threw, so a surface an operator expects is gone without anyone choosing it.
 *
 * `capability_unresolved` is a WARNING: the module still runs, but a capability
 * it declared a dependency on cannot bind, so part of it is degraded.
 *
 * `module_disabled` is INFO: someone switched it off. Painting a deliberate
 * operator decision red is how operators learn to ignore red.
 */
export type AlertKind = 'module_unavailable' | 'capability_unresolved' | 'module_disabled'

const SEVERITY_OF: Record<AlertKind, AlertSeverity> = {
  module_unavailable: 'error',
  capability_unresolved: 'warning',
  module_disabled: 'info',
}

export interface ControllerAlert {
  /** Stable across renders: `<kind>:<moduleId>`. */
  id: string
  kind: AlertKind
  severity: AlertSeverity
  moduleId: string
  /** The manifest's human name, so the well reads as a place rather than an id. */
  moduleName: string
  /** Kind-specific context. The capability id for `capability_unresolved`; empty otherwise. */
  detail: string
}

/**
 * The alerts this actor may see, most severe first.
 *
 * PERMISSION: `isModulePermitted` — the same hub scope + module visibility the
 * navigation uses, minus the readiness check. Readiness must NOT gate this: a
 * broken or disabled module is never `ready`, so gating on it would hide exactly
 * the alerts this exists to raise. Nothing new is authorized; an actor who
 * cannot see a module still cannot learn it exists.
 *
 * ONE alert per module, the most severe. A disabled module that also cannot
 * resolve a capability is one problem to an operator, not two rows.
 *
 * Deliberately absent: the failure MESSAGE from `runIsolated`. That is already
 * audited, and a driver error can quote a connection string — an operator-facing
 * well is not where that should surface.
 */
export function deriveAlerts(core: ControllerCore, actor: Actor | null, now?: number): ControllerAlert[] {
  // Fail closed on no principal. A module in a hub with no scope and no
  // visibilityPermission is permitted to everyone, which is correct for
  // navigation inside an already-guarded Controller — but "everyone" must not
  // include an unauthenticated caller. No actor, no operational detail.
  if (!actor) return []

  const alerts: ControllerAlert[] = []

  for (const mod of core.discover()) {
    const { id, name } = mod.manifest
    if (!core.isModulePermitted(id, actor, now)) continue

    const kind = classify(core, mod)
    if (!kind) continue

    alerts.push({
      id: `${kind.kind}:${id}`,
      kind: kind.kind,
      severity: SEVERITY_OF[kind.kind],
      moduleId: id,
      moduleName: name,
      detail: kind.detail,
    })
  }

  // Severity first, then module id — so the same registry state always renders
  // the same list, in the same order, for the same actor.
  const rank = (s: AlertSeverity) => ALERT_SEVERITY_ORDER.indexOf(s)
  return alerts.sort((a, b) => rank(a.severity) - rank(b.severity) || a.moduleId.localeCompare(b.moduleId))
}

/** The single most severe thing wrong with one module, or nothing. */
function classify(
  core: ControllerCore,
  mod: ReturnType<ControllerCore['discover']>[number]
): { kind: AlertKind; detail: string } | null {
  // Checked in severity order, so the first match is the most severe.
  if (mod.status === 'enabled' && !mod.available) {
    return { kind: 'module_unavailable', detail: '' }
  }

  for (const dep of mod.manifest.dependencies) {
    if (dep.capabilityId && !core.bindCapability(dep.capabilityId)) {
      return { kind: 'capability_unresolved', detail: dep.capabilityId }
    }
  }

  if (mod.status === 'disabled') return { kind: 'module_disabled', detail: '' }

  return null
}
