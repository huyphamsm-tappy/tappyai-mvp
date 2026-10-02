import { requirePagePermission } from '@/lib/admin/permissions'
import { PERMISSIONS } from '@/lib/admin/permissions'
import { RolesManager } from '@/components/admin/rbac/RolesManager'

// Role management — super_admin only (12_RBAC.md §5). Layout gates *any* admin;
// this page enforces the stricter minimum. API handlers enforce independently.
export default async function RbacPage() {
  await requirePagePermission(PERMISSIONS.SECURITY_ROLES_READ)
  return <RolesManager />
}
