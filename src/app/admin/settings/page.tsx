import { requirePagePermission } from '@/lib/admin/permissions'
import { PERMISSIONS } from '@/lib/admin/permissions'
import { SettingsView } from '@/components/admin/settings/SettingsView'
import { envNumber, envBoolean } from '@/lib/config/env'

// Settings — Phase 0 SHELL (read-only). Settings PERSISTENCE requires a
// `platform_settings` table that is NOT in the frozen schema (04). Adding it is a
// Design Change needing a new ADR (Constitution §8). Until then this shows the
// read-only effective config; editing is intentionally not available.
export default async function SettingsPage() {
  await requirePagePermission(PERMISSIONS.SETTINGS_CONFIG_READ)

  return (
    <SettingsView
      auditRetentionDays={String(envNumber('AUDIT_LOG_RETENTION_DAYS', 365))}
      backofficeEnabled={envBoolean('BACKOFFICE_ENABLED', true)}
    />
  )
}
