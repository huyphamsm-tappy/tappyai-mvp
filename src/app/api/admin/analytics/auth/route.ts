// GET /api/admin/analytics/auth — thin wrapper over authAnalyticsService.
// Contains NO SQL / aggregation / KPI logic (all in the service, SR-4). One
// reusable endpoint for Dashboard, Reports, Export, Notifications, Founder +
// Investor dashboards. Handler contract: RBAC -> same-origin -> rate-limit ->
// validate -> service -> uniform {data,meta} envelope (21_Coding_Standards §2).

import { requireAdminRole, adminErrorResponse, adminError, isSameOrigin } from '@/lib/admin/rbac'
import { rateLimit } from '@/lib/security/rateLimit'
import { authAnalyticsService } from '@/lib/admin/analytics/authAnalyticsService'
import { AuthAnalyticsQuerySchema, buildFilter, paginate } from './schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { user } = await requireAdminRole(req, 'analyst')
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:analytics:auth:${user.id}`, 100, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const url = new URL(req.url)
    const parsed = AuthAnalyticsQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query', 422)
    }
    const q = parsed.data
    const filter = buildFilter(q)

    // Thin dispatch to the single service. Summary is a scalar; the rest are lists
    // (paginated with the standard meta.page).
    if (q.view === 'summary') {
      return Response.json({ data: await authAnalyticsService.getSummary(filter) })
    }

    const rows: unknown[] =
      q.view === 'provider' ? await authAnalyticsService.getByProvider(filter)
      : q.view === 'platform' ? await authAnalyticsService.getByPlatform(filter)
      : q.view === 'trend' ? await authAnalyticsService.getDailyTrend(filter)
      : await authAnalyticsService.getAcquisitionBreakdown(filter, q.dimension)

    const { items, page } = paginate(rows, q.limit, q.offset)
    return Response.json({ data: items, meta: { page } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
