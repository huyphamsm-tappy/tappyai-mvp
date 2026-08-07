// Controller V2 — Component 4: auditing the authorization decision.
//
// SERVER ONLY — writes through `writeAuditLog`, which reaches the service-role
// Supabase client. It must never be imported by `engine.ts` or `client.ts`;
// those stay client-safe, and the PDP stays pure. Auditing is an ENFORCEMENT
// concern, so it lives beside the guards (the PEP), not inside the engine.
//
// WHY THIS EXISTS
//
// 01_CONTROLLER_V2_ARCHITECTURE.md §Owner powers: "The Owner bypasses the PDP
// by constitutional rule — and every bypass writes an `owner_override` audit
// row. Unaudited power is the thing that makes an audit log worthless."
//
// Component 3 shipped the PDP with no auditing at all: `writeAuditLog` appeared
// nowhere under `permissions/`, and denials went to `console.warn`. Production
// bore this out — the `audit_log` table was EMPTY after the Owner had used the
// Controller, because only mutating handlers write rows and the Owner had only
// read. The most privileged principal on the platform left no trace.

import type { Actor } from '@/lib/admin/rbac'
import { writeAuditLog, type AuditActorRole } from '@/lib/admin/audit'
import { permissionRegistry } from './registry'
import type { Decision, PermissionId } from './types'

/** Audit action for an authorization denial, at any layer. */
export const ACTION_ACCESS_DENIED = 'rbac.access_denied'

/**
 * Audit action for the Platform Owner exercising bypass.
 *
 * The architecture names this `owner_override`. The dotted form matches the
 * vocabulary already in the table (`rbac.role_granted`, `owner.super_admin_granted`)
 * and nothing greps for the literal, so consistency won. Recorded here so the
 * deviation is deliberate and findable rather than a silent rename.
 */
export const ACTION_OWNER_OVERRIDE = 'owner.override'

/** Where the decision was made — an audit row should say which gate refused. */
export type DecisionSurface = 'api' | 'page'

/**
 * Should this decision produce an audit row?
 *
 * Exported for tests: the volume rule below is a judgement call, and a
 * judgement call that cannot be asserted is just an opinion in a comment.
 *
 *   - **Every denial** is audited. Denials are rare, always security-relevant,
 *     and their absence is what makes an incident unreconstructable.
 *   - **Owner bypass is audited for anything that is not a read.** The registry
 *     already classifies every permission by `category`; write, destructive and
 *     security categories are power actually being exercised.
 *   - **Owner bypass on a read is NOT audited.** This is the one deliberate
 *     departure from "every bypass". A single Owner browsing the Controller
 *     produces on the order of ten `authorize()` calls per page load; recording
 *     each would add hundreds of thousands of rows a year and bury the handful
 *     that matter. An audit log nobody can read is its own kind of worthless.
 *     Flip `AUDIT_OWNER_READS` to restore literal compliance.
 *   - **An ordinary role-granted ALLOW is NOT audited.** The mutation handler
 *     downstream audits its own effect, with before/after state; auditing the
 *     permission check as well would double-count every action.
 */
export const AUDIT_OWNER_READS: boolean = false

export function shouldAudit(decision: Decision): boolean {
  if (!decision.allowed) return true
  if (decision.reason !== 'OWNER_BYPASS') return false
  if (AUDIT_OWNER_READS) return true
  return permissionRegistry.get(decision.permission)?.category !== 'read'
}

/**
 * The principal to record.
 *
 * `'owner'` rather than a role, because the Owner is not a role and may hold
 * none — see `AuditActorRole`.
 */
export function auditActorRole(actor: Pick<Actor, 'isOwner' | 'highestRole'>): AuditActorRole {
  if (actor.isOwner) return 'owner'
  return actor.highestRole ?? 'none'
}

/**
 * How long an identical decision is collapsed into one row.
 *
 * ⚠️ THIS EXISTS BECAUSE COMPONENT 4 OPENED AN ATTACK. Auditing denials put a
 * database write on a path any authenticated user can drive: `rateLimit()` runs
 * INSIDE each handler, i.e. *after* `requirePermission` returns, so a caller who
 * is denied throws before reaching it and nothing throttles the write. Any
 * logged-in user could hammer `/api/admin/*` and inflate `audit_log` without
 * limit — drowning real signal in noise, which is an attack on the audit log
 * itself rather than merely on storage.
 *
 * Collapsing is not dropping: the next row that does get written carries
 * `suppressed_since_last`, so the count survives even though the rows do not.
 */
// Not exported: its only use is the default parameter below. An exported
// constant nobody imports is surface without a consumer.
const DECISION_AUDIT_WINDOW_MS = 60_000

/** Bounds memory if an attacker varies the key to defeat the throttle. */
const THROTTLE_MAX_KEYS = 5_000

interface ThrottleEntry {
  expiresAt: number
  suppressed: number
}
const throttle = new Map<string, ThrottleEntry>()

/**
 * Returns how many identical decisions were suppressed since the last written
 * row, or `null` when this one should be suppressed too.
 *
 * Exported for tests: a throttle that cannot be asserted is a place for a bug
 * to hide, and this one guards an audit trail.
 */
export function throttleDecision(
  key: string,
  now: number = Date.now(),
  windowMs: number = DECISION_AUDIT_WINDOW_MS
): number | null {
  const entry = throttle.get(key)

  if (entry && entry.expiresAt > now) {
    entry.suppressed++
    return null
  }

  if (throttle.size >= THROTTLE_MAX_KEYS) {
    for (const [k, v] of throttle) if (v.expiresAt <= now) throttle.delete(k)
    // Still full ⇒ every key is live, so this is a deliberate key-variation
    // attack. Drop the oldest rather than growing without bound; the write
    // still happens, so nothing is lost from the log.
    if (throttle.size >= THROTTLE_MAX_KEYS) {
      const oldest = throttle.keys().next().value
      if (oldest !== undefined) throttle.delete(oldest)
    }
  }

  throttle.set(key, { expiresAt: now + windowMs, suppressed: 0 })
  return entry?.suppressed ?? 0
}

/** Test seam — the throttle is module state, and stale state makes flaky tests. */
export function resetDecisionAuditThrottle(): void {
  throttle.clear()
}

/**
 * Record an authorization decision, if the policy above says it is worth
 * recording. Fire-and-forget, like every other audit write: a failed audit
 * insert must never turn an allowed request into an error.
 */
export function auditAuthorizationDecision(params: {
  actor: Actor
  decision: Decision
  surface: DecisionSurface
  req?: Request
}): void {
  const { actor, decision, surface, req } = params
  if (!shouldAudit(decision)) return

  // THROTTLE DENIALS ONLY.
  //
  // The flood vector is refusals: any authenticated user can drive them, and a
  // repeated refusal carries no new information — one row plus a count says
  // everything ten thousand rows would.
  //
  // An `owner.override` is the opposite. Only the Platform Owner can produce
  // one, so it is not an attacker-reachable path, and each row corresponds to a
  // distinct privileged action. Collapsing them would break the 1:1
  // correspondence the architecture asks for — and for `deals/upload`, which
  // writes no audit row of its own, the override IS the only record that the
  // action happened. The adversarial review caught this: five uploads in a
  // minute would have left one row.
  const suppressed = decision.allowed
    ? 0
    : throttleDecision(`${actor.userId}|${decision.permission}|${decision.reason}|${surface}`)
  if (suppressed === null) return

  const definition = permissionRegistry.get(decision.permission)

  writeAuditLog({
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: auditActorRole(actor),
    action: decision.allowed ? ACTION_OWNER_OVERRIDE : ACTION_ACCESS_DENIED,
    targetType: 'permission',
    targetId: decision.permission as PermissionId,
    metadata: {
      surface,
      reason: decision.reason,
      // `detail` explains WHY a denial happened (unknown permission vs no
      // grant vs missing capability). Reconstructing an incident without it
      // means guessing.
      ...(decision.allowed ? {} : { detail: decision.detail ?? null }),
      module: definition?.module ?? null,
      category: definition?.category ?? null,
      risk_level: definition?.riskLevel ?? null,
      is_platform_owner: actor.isOwner,
      // Non-zero means identical decisions were collapsed into this row. A
      // spike here is the signal that something is hammering a denied route.
      ...(suppressed > 0 ? { suppressed_since_last: suppressed } : {}),
    },
    req,
  })
}
