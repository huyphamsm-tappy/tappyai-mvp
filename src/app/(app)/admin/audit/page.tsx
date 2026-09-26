import { requirePagePermission } from '@/lib/admin/permissions'
import { PERMISSIONS } from '@/lib/admin/permissions'
import { AuditViewer } from '@/components/admin/audit/AuditViewer'

// Audit log viewer — admin+ (13_Audit_Log.md §6). Read-only; the log is immutable.
export default async function AuditPage() {
  await requirePagePermission(PERMISSIONS.AUDIT_LOG_READ)
  return <AuditViewer />
}
