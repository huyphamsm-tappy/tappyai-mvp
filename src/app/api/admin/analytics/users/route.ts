// GET /api/admin/analytics/users — thin wrapper over userAnalyticsService.
//
// Contains NO SQL, aggregation or KPI maths (all in the service, SR-4). Handler
// contract: RBAC → same-origin → rate-limit → validate → service → uniform
// envelope (21_Coding_Standards §2), matching the auth analytics endpoint.
//
// Sources are already-rolled-up tables — `daily_snapshots` and `subscriptions`.
// No raw event is read here or anywhere downstream: `01_ARCH` §8 requires
// dashboards to read pre-computed rollups, never live aggregate queries.

import { adminErrorResponse, adminError, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { userAnalyticsService } from '@/lib/admin/analytics/userAnalyticsService'
import { UserAnalyticsQuerySchema, buildFilter, rangeIsValid } from './schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { user } = await requirePermission(req, PERMISSIONS.ANALYTICS_USERS_READ)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const rl = await distributedRateLimit(`admin:analytics:users:${user.id}`, 100, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const url = new URL(req.url)
    const parsed = UserAnalyticsQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query', 422)
    }
    const q = parsed.data

    // Rejected rather than answered with an empty series: an inverted range is
    // a malformed request, and an empty answer would be indistinguishable from
    // "the pipeline has not run".
    if (!rangeIsValid(q)) {
      return adminError('VALIDATION_ERROR', '`from` must not be after `to`', 422)
    }

    const supabase = createAdminClient()
    const filter = buildFilter(q)

    const data =
      q.view === 'engagement' ? await userAnalyticsService.getEngagement(supabase, filter)
      : q.view === 'funnel' ? await userAnalyticsService.getFunnel(supabase, filter)
      : await userAnalyticsService.getGrowth(supabase, filter)

    return Response.json({ data })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
