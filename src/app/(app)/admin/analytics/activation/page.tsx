import { requirePagePermission } from '@/lib/admin/permissions'
import { PERMISSIONS } from '@/lib/admin/permissions'
import { ActivationAnalyticsDashboard } from '@/components/admin/analytics/ActivationAnalyticsDashboard'
import { GuardedSurface } from '@/components/admin/layout/GuardedSurface'

// Activation Analytics — analyst+ (12_RBAC.md). Data comes only from
// /api/admin/analytics/activation (no direct DB from the UI).
export default async function ActivationAnalyticsPage() {
  await requirePagePermission(PERMISSIONS.ANALYTICS_ACTIVATION_READ)
  return (
    // Guarded read: this data comes from an /api/admin route that carries the
    // same-origin guard, so on a non-canonical origin it is refused. Say so
    // rather than rendering an empty panel.
    <GuardedSurface><ActivationAnalyticsDashboard /></GuardedSurface>
  )
}
