// /api/admin/settings — READ-ONLY effective config (admin+).
//
// Phase 0 scope note: the frozen schema (04_Database_Architecture.md) defines NO
// settings table, so settings PERSISTENCE is not yet buildable. Per the Constitution
// (frozen v1.1), adding a `platform_settings` table is a Design Change that requires
// a new ADR + owner approval. Until then this endpoint returns the read-only
// effective config derived from env/constants. PUT is intentionally NOT implemented.

import { requireAdminRole, adminErrorResponse, adminError } from '@/lib/admin/rbac'
import { rateLimit } from '@/lib/security/rateLimit'

// Reads auth headers per request — always dynamic (never statically rendered).
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { user } = await requireAdminRole(req, 'admin')
    if (!rateLimit(`admin:settings:get:${user.id}`, 100, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    // Read-only effective config. No secrets. No table read.
    return Response.json({
      data: {
        reporting_timezone: 'Asia/Ho_Chi_Minh', // ADR-008
        audit_log_retention_days: Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 365),
        backoffice_enabled: process.env.BACKOFFICE_ENABLED !== 'false',
        persistence_available: false, // platform_settings table not yet designed (needs ADR)
      },
    })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
