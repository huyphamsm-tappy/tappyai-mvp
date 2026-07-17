// GET /api/admin/analytics/activation — thin wrapper over activationAnalyticsService.
// Contains NO SQL / aggregation / KPI / rule-evaluation logic (all in the
// service, SR-4). One reusable endpoint for Dashboard, Reports, Export,
// Notifications, Founder + Investor dashboards. Handler contract: RBAC ->
// same-origin -> rate-limit -> validate -> service -> uniform {data,meta}
// envelope — identical to /api/admin/analytics/auth (21_Coding_Standards §2).

import { requireAdminRole, adminErrorResponse, adminError, isSameOrigin } from '@/lib/admin/rbac'
import { rateLimit } from '@/lib/security/rateLimit'
import { activationAnalyticsService } from '@/lib/admin/analytics/activationAnalyticsService'
import { ActivationAnalyticsQuerySchema, buildFilter, paginate } from './schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { user } = await requireAdminRole(req, 'analyst')
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:analytics:activation:${user.id}`, 100, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const url = new URL(req.url)
    const parsed = ActivationAnalyticsQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query', 422)
    }
    const q = parsed.data
    const filter = buildFilter(q)

    if (q.view === 'summary') {
      return Response.json({ data: await activationAnalyticsService.getSummary(filter) })
    }
    if (q.view === 'rule') {
      // Singular — not a list (no listAllRules, §2.4a). Resolves the specific
      // rule_version if given, otherwise the currently active rule.
      const rule = q.rule_version
        ? activationAnalyticsService.getRuleById(q.rule_version)
        : activationAnalyticsService.getActiveRule()
      if (!rule) return adminError('NOT_FOUND', 'No matching activation rule', 404)
      return Response.json({ data: rule })
    }

    const rows: unknown[] =
      q.view === 'by_source' ? await activationAnalyticsService.getBySource(filter)
      : q.view === 'by_platform' ? await activationAnalyticsService.getByPlatform(filter)
      : await activationAnalyticsService.getDailyTrend(filter)

    const { items, page } = paginate(rows, q.limit, q.offset)
    return Response.json({ data: items, meta: { page } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
