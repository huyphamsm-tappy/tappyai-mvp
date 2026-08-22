// Module 08 — per-FIELD visibility on the admin user surface.
//
// Two fields on this surface are readable by the roles that reach the route but
// not by all of them, and both boundaries land on `admin`+:
//
//   * `email`     — `10_User_Management.md` §6's masking policy.
//   * `ban_reason` — Owner Decision A, 2026-08-20 (ADR-023) sub-decision (a).
//
// §6 states its rule as a role table (`analyst`/`moderator` masked, `admin`+
// full) and adds: "This is enforced in the API query layer, not just UI."
//
// Both are implemented as PERMISSIONS rather than role comparisons. A role
// comparison in a handler would be a second authorization decision path, which
// Component 4 exists to prevent (`singleDecisionPath.test.ts`), and it would
// silently disagree with the registry the day someone grants a custom role. The
// PDP stays the only place that answers "may this actor see that".
//
// They are checked with `permissionEngine.can`, not `requirePermission`:
// lacking one must HIDE a field, never deny the request. A moderator who cannot
// see emails still has to be able to open the user list.
//
// TWO PERMISSIONS, NOT ONE. An address is user PII; a ban reason is an internal
// moderation note whose `33_Privacy_Data_Governance.md` §3 classification is
// still an open Owner decision. Collapsing them into one gate would mean that
// answer could not move one field without moving the other.

import { permissionEngine } from '@/lib/admin/permissions/engine'
import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import type { Actor } from '@/lib/admin/rbac'

/**
 * Mask an address to §6's shape: first character, three asterisks, domain.
 *
 * The masking is FIXED-WIDTH on purpose. Repeating the local part's real length
 * (`hu***@`) would leak it, and length plus domain is enough to narrow a guess
 * — the whole point of masking is that an analyst cannot reconstruct the
 * address. `h***@gmail.com` is §6's own example and it does not encode length.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  // Not an address shape we recognise. Reveal nothing rather than guess where
  // the boundary is — a malformed value is exactly when a naive split leaks.
  if (at <= 0 || at === email.length - 1) return '***'
  return `${email[0]}***${email.slice(at)}`
}

/** True when this actor may see unmasked addresses. */
export function canReadFullEmail(actor: Actor): boolean {
  return permissionEngine.can(actor, PERMISSIONS.USERS_EMAIL_READ_FULL)
}

/**
 * The address as this actor is allowed to see it.
 *
 * `null` in, `null` out: a user with no address on file must not be reported as
 * `***`, which would claim an address exists.
 */
export function emailFor(actor: Actor, email: string | null | undefined): string | null {
  if (!email) return null
  return canReadFullEmail(actor) ? email : maskEmail(email)
}

/** True when this actor may read the internal ban reason. */
export function canReadBanReason(actor: Actor): boolean {
  return permissionEngine.can(actor, PERMISSIONS.USERS_BAN_REASON_READ)
}

/**
 * The ban reason as this actor is allowed to see it, and whether anything was
 * hidden.
 *
 * `withheld` is false when there is no note to withhold. The distinction
 * matters: an account can be banned with no reason recorded, and reporting that
 * as "hidden" would invent a note the moderator would then go looking for.
 *
 * Unlike an email there is no masked form — half a moderation note is not a
 * safer note, it is a misleading one. The field is present or absent.
 */
export function banReasonFor(
  actor: Actor,
  banReason: string | null | undefined
): { value: string | null; withheld: boolean } {
  if (!banReason) return { value: null, withheld: false }
  return canReadBanReason(actor)
    ? { value: banReason, withheld: false }
    : { value: null, withheld: true }
}
