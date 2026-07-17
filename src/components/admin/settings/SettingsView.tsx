'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n/useTranslation'

export function SettingsView({ auditRetentionDays, backofficeEnabled }: {
  auditRetentionDays: string
  backofficeEnabled: boolean
}) {
  const { t } = useTranslation()

  const settings = [
    { label: t('admin.settings.reportingTimezone'), value: 'Asia/Ho_Chi_Minh (UTC+7)', note: 'ADR-008' },
    { label: t('admin.settings.auditRetention'), value: auditRetentionDays },
    { label: t('admin.settings.backofficeEnabled'), value: backofficeEnabled ? t('admin.settings.yes') : t('admin.settings.no') },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('admin.settings.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.settings.subtitle')}</p>
      </div>

      <Card>
        <CardHeader><CardTitle>{t('admin.settings.effectiveConfig')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {settings.map((s) => (
            <div key={s.label} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <div className="text-sm text-muted-foreground">{s.label}</div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{s.value}</span>
                {s.note && <Badge variant="muted">{s.note}</Badge>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          {t('admin.settings.editableNotice')}
        </CardContent>
      </Card>
    </div>
  )
}
