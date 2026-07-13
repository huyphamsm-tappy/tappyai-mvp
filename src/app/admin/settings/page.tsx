import { requirePageRole } from '@/lib/admin/page-guard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// Settings — Phase 0 SHELL (read-only). Settings PERSISTENCE requires a
// `platform_settings` table that is NOT in the frozen schema (04). Adding it is a
// Design Change needing a new ADR (Constitution §8). Until then this shows the
// read-only effective config; editing is intentionally not available.
export default async function SettingsPage() {
  await requirePageRole('admin')

  const settings: { label: string; value: string; note?: string }[] = [
    { label: 'Reporting timezone', value: 'Asia/Ho_Chi_Minh (UTC+7)', note: 'ADR-008' },
    { label: 'Audit log retention (days)', value: String(process.env.AUDIT_LOG_RETENTION_DAYS ?? 365) },
    { label: 'Back office enabled', value: process.env.BACKOFFICE_ENABLED !== 'false' ? 'Yes' : 'No' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Read-only effective configuration (Phase 0 shell).</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Effective configuration</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {settings.map((s) => (
            <div key={s.label} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <div className="text-sm text-muted-foreground">{s.label}</div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{s.value}</span>
                {s.note && <Badge variant="muted">{s.note}</Badge>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          ✏️ Editable settings require a <code>platform_settings</code> table, which is not part of the
          frozen Architecture v1.1 schema. Adding it is a Design Change that needs a new ADR + owner
          approval before implementation.
        </CardContent>
      </Card>
    </div>
  )
}
