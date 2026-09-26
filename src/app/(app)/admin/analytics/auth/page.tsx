import { requirePagePermission } from '@/lib/admin/permissions'
import { PERMISSIONS } from '@/lib/admin/permissions'
import { AuthAnalyticsDashboard } from '@/components/admin/analytics/AuthAnalyticsDashboard'
import { GuardedSurface } from '@/components/admin/layout/GuardedSurface'

// Authentication Analytics — analyst+ (12_RBAC.md). Data comes only from
// /api/admin/analytics/auth (no direct DB from the UI).
export default async function AuthAnalyticsPage() {
  await requirePagePermission(PERMISSIONS.ANALYTICS_AUTH_READ)
  return (
    // Guarded read: this data comes from an /api/admin route that carries the
    // same-origin guard, so on a non-canonical origin it is refused. Say so
    // rather than rendering an empty panel.
    <GuardedSurface><AuthAnalyticsDashboard /></GuardedSurface>
  )
}
