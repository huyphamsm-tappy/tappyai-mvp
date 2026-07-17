import { requirePageRole } from '@/lib/admin/page-guard'
import { AuthAnalyticsDashboard } from '@/components/admin/analytics/AuthAnalyticsDashboard'

// Authentication Analytics — analyst+ (12_RBAC.md). Data comes only from
// /api/admin/analytics/auth (no direct DB from the UI).
export default async function AuthAnalyticsPage() {
  await requirePageRole('analyst')
  return <AuthAnalyticsDashboard />
}
