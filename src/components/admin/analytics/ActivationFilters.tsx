'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ActivationAnalyticsFilter } from '@/lib/admin/analytics/activationAnalyticsService'

// Presentational filter bar (date range + platform + rule_version). Controlled
// via props, same pattern as AuthFilters. `rule_version` is optional and
// inert until more than one rule version has ever existed (spec §9).
const FIELDS: { key: keyof ActivationAnalyticsFilter; label: string; type?: string; placeholder?: string }[] = [
  { key: 'from', label: 'From', type: 'date' },
  { key: 'to', label: 'To', type: 'date' },
  { key: 'platform', label: 'Platform', placeholder: 'web / android / ios' },
  { key: 'rule_version', label: 'Rule version', placeholder: 'v1' },
]

export function ActivationFilters({ value, onChange, onReset }: {
  value: ActivationAnalyticsFilter
  onChange: (next: ActivationAnalyticsFilter) => void
  onReset?: () => void
}) {
  return (
    <Card>
      <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
        {FIELDS.map((f) => (
          <div key={String(f.key)} className="flex flex-col gap-1">
            <label htmlFor={`af-${String(f.key)}`} className="text-xs text-muted-foreground">{f.label}</label>
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
        {onReset && <Button variant="outline" size="sm" onClick={onReset}>Reset</Button>}
      </CardContent>
    </Card>
  )
}
