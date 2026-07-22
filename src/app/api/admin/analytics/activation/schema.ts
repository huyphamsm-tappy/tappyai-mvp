import { z } from 'zod'
import type { ActivationAnalyticsFilter } from '@/lib/admin/analytics/activationAnalyticsService'

// Query contract for GET /api/admin/analytics/activation (spec §8). `view`
// selects which activationAnalyticsService method the thin handler calls.
// `rule_version` is optional everywhere — omitted means "the currently active
// rule," resolved by the service via the Provider, never hardcoded here.
//
// Note: `window_days` is NOT exposed yet. activation_daily_rollup (Step 4)
// only precomputes a fixed 7-day bucket (activated_within_7d_count); a true
// arbitrary-N window would need a rollup/service change with no real consumer
// requesting it yet (SR-4) — not added speculatively. `getSummary`'s rate is
// the "activated at all" rate, not window-scoped, until that need is real.
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

export const ActivationAnalyticsQuerySchema = z.object({
  view: z.enum(['summary', 'by_source', 'by_platform', 'trend', 'rule']).default('summary'),
  from: dateStr.optional(),
  to: dateStr.optional(),
  platform: z.string().min(1).max(32).optional(),
  rule_version: z.string().min(1).max(32).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ActivationAnalyticsQuery = z.infer<typeof ActivationAnalyticsQuerySchema>

// Pure: extract the service filter from the validated query.
export function buildFilter(q: ActivationAnalyticsQuery): ActivationAnalyticsFilter {
  return { from: q.from, to: q.to, platform: q.platform, rule_version: q.rule_version }
}

// Pure: slice an array result + build the standard meta.page (API Governance §5).
export function paginate<T>(rows: T[], limit: number, offset: number): {
  items: T[]
  page: { limit: number; offset: number; total: number; hasMore: boolean }
} {
  const items = rows.slice(offset, offset + limit)
  return { items, page: { limit, offset, total: rows.length, hasMore: offset + limit < rows.length } }
}
