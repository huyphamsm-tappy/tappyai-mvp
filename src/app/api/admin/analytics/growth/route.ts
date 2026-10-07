// GET /api/admin/analytics/growth?from=YYYY-MM-DD&to=YYYY-MM-DD — the G1 gate report.
//
// Same handler contract as the other analytics endpoints: RBAC → same-origin →
// rate-limit → validate → service → envelope. Reuses `analytics.users.read`
// (the report is a user-analytics read; no new permission is minted for it).
// All maths is in `computeGrowthMetrics` (pure, tested); this file has none.

import { z } from 'zod'
import { adminErrorResponse, adminError, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { vnToday } from '@/lib/config/product'
import { loadGrowthReport, resolveRange } from '@/lib/analytics/growthReportService'

export const dynamic = 'force-dynamic'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
const QuerySchema = z.object({ from: dateStr.optional(), to: dateStr.optional() }).strict()

export async function GET(req: Request) {
  try {
    const { user } = await requirePermission(req, PERMISSIONS.ANALYTICS_USERS_READ)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const rl = await distributedRateLimit(`admin:analytics:growth:${user.id}`, 30, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })

    const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!parsed.success) return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query', 422)
    if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) {
      return adminError('VALIDATION_ERROR', '`from` must not be after `to`', 422)
    }

    const range = resolveRange(parsed.data, vnToday())
    const data = await loadGrowthReport(createAdminClient(), range)
    return Response.json({ data })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
