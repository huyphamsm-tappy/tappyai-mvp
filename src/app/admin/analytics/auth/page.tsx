import { requirePageRole } from '@/lib/admin/page-guard'
import { AuthAnalyticsDashboard } from '@/components/admin/analytics/AuthAnalyticsDashboard'

// Authentication Analytics — analyst+ (12_RBAC.md). Data comes only from
// /api/admin/analytics/auth (no direct DB from the UI).
export default async function AuthAnalyticsPage() {
  await requirePageRole('analyst')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Authentication Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Acquisition &amp; login metrics — Stage 1 of the analytics funnel. Filter by date, platform, method, app version, country, and language.
        </p>
      </div>
      <AuthAnalyticsDashboard />
    </div>
  )
}
