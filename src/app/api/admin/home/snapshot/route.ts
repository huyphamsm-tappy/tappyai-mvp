// GET /api/admin/home/snapshot — Module 01's KPI block as data.
//
// Handler contract: RBAC → rate-limit → operation → uniform envelope
// (21_Coding_Standards.md §2). A read performs no mutation, so it carries no
// origin check and writes no audit row; the PDP audits its own denials.
//
// ONE IMPLEMENTATION, TWO ENTRY POINTS. `/admin` server-renders the same block
// through `fetchHomeKpis` for first paint — M01 requires "server-rendered KPI
// cards (no loading flicker)". This route exists so the numbers are refreshable
// and independently testable, and it calls the SAME service. No aggregation,
// no thresholds and no derivation live here; duplicating any of them is how the
// page and the API start disagreeing about what DAU means.
//
// PERMISSION. `dashboard.home.view`, the same gate as the page. The six metrics
// are user-activity aggregates, which `12_RBAC.md` §3 places under User
// Analytics — granted to all four roles — and they contain no PII and no
// revenue. Inventing a permission for data every admin may already see would be
// privilege theatre.

import { adminError, adminErrorResponse } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { fetchHomeKpis } from '@/lib/admin/analytics/homeSnapshotService'
import { vnToday } from '@/lib/config/product'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { user } = await requirePermission(req, PERMISSIONS.DASHBOARD_HOME_VIEW)

    const rl = await distributedRateLimit(`admin:home:snapshot:${user.id}`, 100, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const data = await fetchHomeKpis(createAdminClient(), vnToday())
    return Response.json({ data })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
