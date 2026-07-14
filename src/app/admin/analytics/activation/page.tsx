import { requirePageRole } from '@/lib/admin/page-guard'
import { ActivationAnalyticsDashboard } from '@/components/admin/analytics/ActivationAnalyticsDashboard'

// Activation Analytics — analyst+ (12_RBAC.md). Data comes only from
// /api/admin/analytics/activation (no direct DB from the UI).
export default async function ActivationAnalyticsPage() {
  await requirePageRole('analyst')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activation Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Stage 2 of the analytics funnel — whether new signups reach the Activation Rule&apos;s Aha Moment. Filter by date, platform, and rule version.
        </p>
      </div>
      <ActivationAnalyticsDashboard />
    </div>
  )
}
