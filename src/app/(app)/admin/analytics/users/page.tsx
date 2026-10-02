import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { UserAnalyticsDashboard } from '@/components/admin/analytics/UserAnalyticsDashboard'
import { GuardedSurface } from '@/components/admin/layout/GuardedSurface'

// Module 04 User Analytics — growth, engagement, subscription funnel.
//
// Third surface of Module 04, alongside `/admin/analytics/auth` (how users sign
// in) and `/admin/analytics/activation` (whether they activate). Data comes
// only from `/api/admin/analytics/users`; no direct DB access from the UI, and
// no aggregation outside `userAnalyticsService`.
export default async function UserAnalyticsPage() {
  await requirePagePermission(PERMISSIONS.ANALYTICS_USERS_READ)
  return (
    // Guarded read: this data comes from an /api/admin route that carries the
    // same-origin guard, so on a non-canonical origin it is refused. Say so
    // rather than rendering an empty panel.
    <GuardedSurface><UserAnalyticsDashboard /></GuardedSurface>
  )
}
