import { requirePageRole } from '@/lib/admin/page-guard'
import { AuditViewer } from '@/components/admin/audit/AuditViewer'

// Audit log viewer — admin+ (13_Audit_Log.md §6). Read-only; the log is immutable.
export default async function AuditPage() {
  await requirePageRole('admin')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Immutable record of every administrative action.</p>
      </div>
      <AuditViewer />
    </div>
  )
}
