// Controller V2 — B5, Denial UX (01_CONTROLLER_V2_ARCHITECTURE.md §8).
//
//   "A 403 explains which permission is missing and who can grant it.
//    A dead end is a support ticket."
//
// MEASURED before this module existed: four structurally different denials —
// Owner Gate failure, non-corporate identity, no admin role, and a PDP denial —
// all landed on /reviews or /admin with no signal at all. Every one of them had
// a precise reason in hand and discarded it, which is why a production incident
// and a correctly-working permission check were indistinguishable from outside.
//
// THIS MODULE DECIDES WORDING, NEVER ACCESS. It is pure: no request, no session,
// no database. Authorization stays exactly where it was, server-side in
// `guards.ts` and the PDP. Nothing here can admit anyone.

import { permissionRegistry } from './permissions/registry'
import type { PermissionDefinition, PermissionId } from './permissions/types'

/**
 * The causes a denied user may be told about — a CLOSED set.
 *
 * Deliberately coarser than the internal reasons. `checkOwnerGate` distinguishes
 * `ENV_SET_BUT_NO_OWNER` from `ENV_MISMATCH`, and the corporate boundary
 * distinguishes six sub-reasons; those describe the deployment's own
 * configuration and its owner record, so they collapse here. What the visitor
 * gets told is what concerns the visitor.
 */
export const DENIAL_REASONS = [
  /** Verified identity, but not a corporate one. About the visitor's own account. */
  'not_corporate',
  /** Corporate identity with no administrative role at all. */
  'no_admin_role',
  /** Authenticated admin, but the PDP refused this specific permission. */
  'missing_permission',
  /** The Owner Gate failed. Deliberately says nothing about which half. */
  'controller_unavailable',
] as const

export type DenialReason = (typeof DENIAL_REASONS)[number]
/** What an unrecognised or absent reason renders as. */
export type DisplayReason = DenialReason | 'unknown'

/** The page every denial lands on. Outside /admin, so a denial cannot loop. */
export const DENIAL_ROUTE = '/access-denied'

/** Only this reason is ABOUT a permission; the others must not carry one. */
const PERMISSION_BEARING: DenialReason = 'missing_permission'

/**
 * Where a guard should send a denied visitor.
 *
 * Never under `/admin`: `guards.test.ts` pins that as a regression, because
 * every /admin page carries its own guard and a denial redirected into the
 * Controller re-runs the same failing check forever.
 */
export function denialPath(reason: DenialReason, permission?: PermissionId): string {
  const query = new URLSearchParams({ reason })
  if (permission && reason === PERMISSION_BEARING) query.set('permission', permission)
  // URLSearchParams encodes a space as '+'; the page reads it back through the
  // same API, but %20 is what a URL-encoded path segment is expected to show.
  return `${DENIAL_ROUTE}?${query.toString().replace(/\+/g, '%20')}`
}

export interface Denial {
  reason: DisplayReason
  /** Present only when the reason is about a permission the registry declares. */
  permission?: PermissionDefinition
}

/** Next hands repeated query parameters back as an array. */
type Param = string | string[] | undefined

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Read a denial out of the query string.
 *
 * The query string is USER-CONTROLLED. Anyone can visit
 * `/access-denied?reason=…&permission=…`, so nothing here may be trusted and
 * nothing here grants anything — the worst a forged value can achieve is
 * being shown a message.
 *
 * Both fields are validated against closed sets rather than sanitised: the
 * reason must be one of `DENIAL_REASONS`, and the permission must be one the
 * registry actually declares. An unknown permission is dropped rather than
 * echoed, so attacker-supplied text can never render as if it were a real
 * permission name.
 */
export function parseDenial(params: Record<string, Param>): Denial {
  const rawReason = first(params.reason)
  const reason: DisplayReason = DENIAL_REASONS.includes(rawReason as DenialReason)
    ? (rawReason as DenialReason)
    : 'unknown'

  if (reason !== PERMISSION_BEARING) return { reason }

  const rawPermission = first(params.permission)
  const permission = rawPermission ? permissionRegistry.get(rawPermission as PermissionId) : undefined
  return permission ? { reason, permission } : { reason }
}
