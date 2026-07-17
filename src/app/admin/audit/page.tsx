import { requirePageRole } from '@/lib/admin/page-guard'
import { AuditViewer } from '@/components/admin/audit/AuditViewer'

// Audit log viewer — admin+ (13_Audit_Log.md §6). Read-only; the log is immutable.
export default async function AuditPage() {
  await requirePageRole('admin')
  return <AuditViewer />
}
