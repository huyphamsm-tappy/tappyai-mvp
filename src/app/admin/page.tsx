'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Home Dashboard — Phase 0 STUB. Real KPIs (DAU/MAU/revenue/AI cost) arrive in
// Phase 1 from daily_snapshots (01_Master_Architecture / 26_Founder_Dashboard).
// No analytics tables are queried here yet (Performance §3.1: dashboards read
// pre-computed snapshots, which do not exist until Phase 1).
export default function AdminHomePage() {
  const { t } = useTranslation()

  const placeholders = [
    { labelKey: 'admin.dashboard.kpi.dau', noteKey: 'admin.dashboard.phase1' },
    { labelKey: 'admin.dashboard.kpi.mau', noteKey: 'admin.dashboard.phase1' },
    { labelKey: 'admin.dashboard.kpi.mrr', noteKey: 'admin.dashboard.phase3' },
    { labelKey: 'admin.dashboard.kpi.aiCost', noteKey: 'admin.dashboard.phase3' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.dashboard.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {placeholders.map((k) => (
          <Card key={k.labelKey}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t(k.labelKey)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground/50">—</div>
              <Badge variant="muted" className="mt-2">{t(k.noteKey)}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.dashboard.foundationStatus')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>{t('admin.dashboard.foundation.rbac')}</p>
          <p>{t('admin.dashboard.foundation.audit')}</p>
          <p>{t('admin.dashboard.foundation.shell')}</p>
          <p>{t('admin.dashboard.foundation.pending')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
