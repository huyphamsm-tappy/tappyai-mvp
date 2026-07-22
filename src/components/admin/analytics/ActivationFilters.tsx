'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ActivationAnalyticsFilter } from '@/lib/admin/analytics/activationAnalyticsService'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Presentational filter bar (date range + platform + rule_version). Controlled
// via props, same pattern as AuthFilters. `rule_version` is optional and
// inert until more than one rule version has ever existed (spec §9).
const FIELDS: { key: keyof ActivationAnalyticsFilter; labelKey: string; type?: string; placeholder?: string }[] = [
  { key: 'from', labelKey: 'admin.activation.filter.from', type: 'date' },
  { key: 'to', labelKey: 'admin.activation.filter.to', type: 'date' },
  { key: 'platform', labelKey: 'admin.activation.filter.platform', placeholder: 'web / android / ios' },
  { key: 'rule_version', labelKey: 'admin.activation.filter.ruleVersion', placeholder: 'v1' },
]

export function ActivationFilters({ value, onChange, onReset }: {
  value: ActivationAnalyticsFilter
  onChange: (next: ActivationAnalyticsFilter) => void
  onReset?: () => void
}) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
        {FIELDS.map((f) => (
          <div key={String(f.key)} className="flex flex-col gap-1">
            <label htmlFor={`af-${String(f.key)}`} className="text-xs text-muted-foreground">{t(f.labelKey)}</label>
            <Input
              id={`af-${String(f.key)}`}
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
