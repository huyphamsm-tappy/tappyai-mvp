'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { AuthAnalyticsFilter } from '@/lib/admin/analytics/authAnalyticsService'

// Presentational filter bar (date range + platform + method + app_version +
// country + language). Controlled via props so any consumer owns the state.
const FIELDS: { key: keyof AuthAnalyticsFilter; label: string; type?: string; placeholder?: string }[] = [
  { key: 'from', label: 'From', type: 'date' },
  { key: 'to', label: 'To', type: 'date' },
  { key: 'platform', label: 'Platform', placeholder: 'web / android / ios' },
  { key: 'method', label: 'Method', placeholder: 'google / zalo / …' },
  { key: 'app_version', label: 'App version', placeholder: '1.2.0' },
  { key: 'country', label: 'Country', placeholder: 'VN' },
  { key: 'language', label: 'Language', placeholder: 'vi' },
]

export function AuthFilters({ value, onChange, onReset }: {
  value: AuthAnalyticsFilter
  onChange: (next: AuthAnalyticsFilter) => void
  onReset?: () => void
}) {
  return (
    <Card>
      <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
        {FIELDS.map((f) => (
          <div key={String(f.key)} className="flex flex-col gap-1">
            <label htmlFor={`f-${String(f.key)}`} className="text-xs text-muted-foreground">{f.label}</label>
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
        {onReset && <Button variant="outline" size="sm" onClick={onReset}>Reset</Button>}
      </CardContent>
    </Card>
  )
}
