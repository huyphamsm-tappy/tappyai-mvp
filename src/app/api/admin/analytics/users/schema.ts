import { z } from 'zod'
import type { UserAnalyticsFilter } from '@/lib/admin/analytics/userAnalyticsService'

// Query contract for GET /api/admin/analytics/users (Module 04).
// `view` selects which userAnalyticsService method the thin handler calls —
// same shape as the auth analytics endpoint, deliberately.
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

export const UserAnalyticsQuerySchema = z
  .object({
    view: z.enum(['growth', 'engagement', 'funnel', 'retention']).default('growth'),
    // VN calendar days. `daily_snapshots.snapshot_date` is already bucketed to
    // Asia/Ho_Chi_Minh by the rollup (ADR-008), so these compare like-for-like
    // and no conversion happens at this boundary.
    from: dateStr.optional(),
    to: dateStr.optional(),
  })
  // Strict: an unimplemented filter must be a 422, never silently ignored. A
  // caller passing `?platform=android` would otherwise believe the series was
  // filtered when it was not.
  .strict()

export type UserAnalyticsQuery = z.infer<typeof UserAnalyticsQuerySchema>

/** Pure: the service filter, extracted from the validated query. */
export function buildFilter(q: UserAnalyticsQuery): UserAnalyticsFilter {
  return { from: q.from, to: q.to }
}

/**
 * `from` must not be after `to`.
 *
 * An inverted range is not an empty result — it is a malformed request, and
 * returning an empty series for it would look exactly like "no data yet".
 */
export function rangeIsValid(q: UserAnalyticsQuery): boolean {
  return !(q.from && q.to && q.from > q.to)
}
