import { z } from 'zod'
import type { AuthAnalyticsFilter } from '@/lib/admin/analytics/authAnalyticsService'

// Query contract for GET /api/admin/analytics/auth (05_API_Architecture / spec §5).
// `view` selects which authAnalyticsService method the thin handler calls.
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

export const AuthAnalyticsQuerySchema = z.object({
  view: z.enum(['summary', 'provider', 'platform', 'trend', 'acquisition']).default('summary'),
  dimension: z.enum(['method', 'platform', 'app_version', 'country', 'language', 'source']).default('method'),
  from: dateStr.optional(),
  to: dateStr.optional(),
  platform: z.string().min(1).max(32).optional(),
  method: z.string().min(1).max(32).optional(),
  app_version: z.string().min(1).max(64).optional(),
  country: z.string().min(1).max(8).optional(),
  language: z.string().min(1).max(16).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export type AuthAnalyticsQuery = z.infer<typeof AuthAnalyticsQuerySchema>

// Pure: extract the service filter from the validated query.
export function buildFilter(q: AuthAnalyticsQuery): AuthAnalyticsFilter {
  return {
    from: q.from,
    to: q.to,
    platform: q.platform,
    method: q.method,
    app_version: q.app_version,
    country: q.country,
    language: q.language,
  }
}

// Pure: slice an array result + build the standard meta.page (API Governance §5).
export function paginate<T>(rows: T[], limit: number, offset: number): {
  items: T[]
  page: { limit: number; offset: number; total: number; hasMore: boolean }
} {
  const items = rows.slice(offset, offset + limit)
  return { items, page: { limit, offset, total: rows.length, hasMore: offset + limit < rows.length } }
}
