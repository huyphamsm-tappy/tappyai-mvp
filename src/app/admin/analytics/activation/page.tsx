import { requirePagePermission } from '@/lib/admin/permissions'
import { PERMISSIONS } from '@/lib/admin/permissions'
import { ActivationAnalyticsDashboard } from '@/components/admin/analytics/ActivationAnalyticsDashboard'

// Activation Analytics — analyst+ (12_RBAC.md). Data comes only from
// /api/admin/analytics/activation (no direct DB from the UI).
export default async function ActivationAnalyticsPage() {
  await requirePagePermission(PERMISSIONS.ANALYTICS_ACTIVATION_READ)
  return <ActivationAnalyticsDashboard />
}
