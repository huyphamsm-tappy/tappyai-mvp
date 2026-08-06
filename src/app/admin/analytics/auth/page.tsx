import { requirePagePermission } from '@/lib/admin/permissions'
import { PERMISSIONS } from '@/lib/admin/permissions'
import { AuthAnalyticsDashboard } from '@/components/admin/analytics/AuthAnalyticsDashboard'

// Authentication Analytics — analyst+ (12_RBAC.md). Data comes only from
// /api/admin/analytics/auth (no direct DB from the UI).
export default async function AuthAnalyticsPage() {
  await requirePagePermission(PERMISSIONS.ANALYTICS_AUTH_READ)
  return <AuthAnalyticsDashboard />
}
