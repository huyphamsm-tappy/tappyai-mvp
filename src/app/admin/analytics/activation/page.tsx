import { requirePageRole } from '@/lib/admin/page-guard'
import { ActivationAnalyticsDashboard } from '@/components/admin/analytics/ActivationAnalyticsDashboard'

// Activation Analytics — analyst+ (12_RBAC.md). Data comes only from
// /api/admin/analytics/activation (no direct DB from the UI).
export default async function ActivationAnalyticsPage() {
  await requirePageRole('analyst')
  return <ActivationAnalyticsDashboard />
}
