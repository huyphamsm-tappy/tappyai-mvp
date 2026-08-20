// Module 08 — the email masking policy of `10_User_Management.md` §6.
//
// §6 states the rule as a role table (`analyst`/`moderator` masked, `admin`+
// full) and adds: "This is enforced in the API query layer, not just UI."
//
// It is implemented here as a PERMISSION rather than a role comparison. A role
// comparison in a handler would be a second authorization decision path, which
// Component 4 exists to prevent (`singleDecisionPath.test.ts`), and it would
// silently disagree with the registry the day someone grants a custom role.
// `users.email.read_full` carries the same edges §6 describes, and the PDP
// stays the only place that answers "may this actor see that".
//
// It is checked with `permissionEngine.can`, not `requirePermission`: lacking
// it must MASK the address, never deny the request. A moderator who cannot see
// emails still has to be able to open the user list.

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
