// Controller V2 — Component 3 (RBAC): UI authorization helpers.
//
// CLIENT-SAFE. Pure functions over a plain array of permission strings. No
// imports from the identity layer at all, so a client component can use these
// without pulling `next/headers` into the browser bundle — the boundary
// `roles.ts` established in Component 2. Server guards live in `./guards`,
// which is NOT client-safe.
//
// SHAPE: these take the RESOLVED PERMISSION LIST, not an Actor. The server
// resolves permissions once in the layout and sends the list down; the client
// never re-derives authorization from roles. That keeps a single resolution
// point and avoids shipping role logic to the browser.
//
// ⚠️ UI authorization is presentation only. Hiding a control is a courtesy, not
// a security boundary — every action is independently authorized server-side by
// `requirePermission`. Never treat a `can()` result as protection.

import type { PermissionId } from './types'

/** The permission list handed to the client by a server component. */
export type PermissionSet = readonly PermissionId[]

/** May the actor perform this action? Use to show/hide/enable UI. */
export function can(permissions: PermissionSet, permission: PermissionId): boolean {
  return permissions.includes(permission)
}

// NOTE (dead-code audit D1): `canAll` / `canAny` were written and then removed.
// They had no consumer, and the registry currently gives every module the SAME
// roles for read and for write — so no screen has a viewer who cannot also act,
// and any multi-permission control would have been invented to justify the
// helper. They are four lines to restore the day a read/write split exists.

/**
 * Filter UI entries down to those the actor may use.
 *
 * The Controller's rule is that **you never see a door you cannot open**, which
 * is why this returns a filtered list rather than a disabled flag. An entry
 * whose `permissionOf` returns `undefined` has no requirement and stays
 * visible — used by placeholders for modules that do not exist yet and
 * therefore own no permission.
 */
export function filterByPermission<T>(
  permissions: PermissionSet,
  items: readonly T[],
  permissionOf: (item: T) => PermissionId | undefined
): T[] {
  return items.filter((item) => {
    const required = permissionOf(item)
    if (!required) return true
    return can(permissions, required)
  })
}
