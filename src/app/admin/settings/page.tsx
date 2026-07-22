import { requirePageRole } from '@/lib/admin/page-guard'
import { SettingsView } from '@/components/admin/settings/SettingsView'

// Settings — Phase 0 SHELL (read-only). Settings PERSISTENCE requires a
// `platform_settings` table that is NOT in the frozen schema (04). Adding it is a
// Design Change needing a new ADR (Constitution §8). Until then this shows the
// read-only effective config; editing is intentionally not available.
export default async function SettingsPage() {
  await requirePageRole('admin')

  return (
    <SettingsView
      auditRetentionDays={String(process.env.AUDIT_LOG_RETENTION_DAYS ?? 365)}
      backofficeEnabled={process.env.BACKOFFICE_ENABLED !== 'false'}
    />
  )
}
