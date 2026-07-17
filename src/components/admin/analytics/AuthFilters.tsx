'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { AuthAnalyticsFilter } from '@/lib/admin/analytics/authAnalyticsService'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Presentational filter bar (date range + platform + method + app_version +
// country + language). Controlled via props so any consumer owns the state.
const FIELDS: { key: keyof AuthAnalyticsFilter; labelKey: string; type?: string; placeholder?: string }[] = [
  { key: 'from', labelKey: 'admin.auth.filter.from', type: 'date' },
  { key: 'to', labelKey: 'admin.auth.filter.to', type: 'date' },
  { key: 'platform', labelKey: 'admin.auth.filter.platform', placeholder: 'web / android / ios' },
  { key: 'method', labelKey: 'admin.auth.filter.method', placeholder: 'google / zalo / …' },
  { key: 'app_version', labelKey: 'admin.auth.filter.appVersion', placeholder: '1.2.0' },
  { key: 'country', labelKey: 'admin.auth.filter.country', placeholder: 'VN' },
  { key: 'language', labelKey: 'admin.auth.filter.language', placeholder: 'vi' },
]

export function AuthFilters({ value, onChange, onReset }: {
  value: AuthAnalyticsFilter
  onChange: (next: AuthAnalyticsFilter) => void
  onReset?: () => void
}) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
        {FIELDS.map((f) => (
          <div key={String(f.key)} className="flex flex-col gap-1">
            <label htmlFor={`f-${String(f.key)}`} className="text-xs text-muted-foreground">{t(f.labelKey)}</label>
            <Input
              id={`f-${String(f.key)}`}
              type={f.type ?? 'text'}
              placeholder={f.placeholder}
              value={value[f.key] ?? ''}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value || undefined })}
              className="w-36"
            />
          </div>
        ))}
        {onReset && <Button variant="outline" size="sm" onClick={onReset}>{t('admin.common.reset')}</Button>}
      </CardContent>
    </Card>
  )
}
