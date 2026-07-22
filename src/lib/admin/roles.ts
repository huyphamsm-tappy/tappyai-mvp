// Client-safe RBAC primitives — pure, NO server imports. Safe to import from
// client components (e.g. AdminShell). Server-only logic (DB reads, requireAdminRole)
// lives in ./rbac which builds on these. Keeping these separate prevents client
// bundles from pulling in next/headers via the server client.

export type AdminRole = 'analyst' | 'moderator' | 'admin' | 'super_admin'

// Role hierarchy — higher number inherits all lower permissions (12_RBAC.md §2).
export const ROLE_RANK: Record<AdminRole, number> = {
  analyst: 1,
  moderator: 2,
  admin: 3,
  super_admin: 4,
}

export function hasRole(userRole: AdminRole, required: AdminRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[required]
}
