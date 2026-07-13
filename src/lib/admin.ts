// @deprecated — TEMPORARY COMPATIBILITY LAYER ONLY (Back Office Phase 0, ADR-003).
//
// `ADMIN_IDS` / `isAdmin()` are superseded by the RBAC system (`admin_roles` table +
// `requireAdminRole()` in `@/lib/admin/rbac`). Per owner decision (2026-07-13):
//   - This gate is DEPRECATED and kept only so pre-existing references keep working
//     during the RBAC transition.
//   - NO NEW CODE may depend on this. All new authorization MUST use RBAC.
//   - Scheduled for removal after RBAC is fully live and admins are seeded
//     (see docs/backoffice/23_Implementation_Roadmap.md — "Post-RBAC cleanup task").

export const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean)

/** @deprecated Use `requireAdminRole()` from `@/lib/admin/rbac` instead. */
export function isAdmin(userId?: string) {
  return !!userId && ADMIN_IDS.includes(userId)
}
