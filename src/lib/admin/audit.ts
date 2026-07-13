// TappyAI Back Office — Audit Log writer (Architecture v1.1: 13_Audit_Log.md, ADR-007).
//
// Every administrative mutation MUST call writeAuditLog AFTER the operation
// succeeds. Writes are NON-BLOCKING: never await in the critical path, never fail
// the operation if the audit insert fails (13_Audit_Log.md §5). The audit_log
// table is INSERT-only (RLS deny-by-default + no update/delete path anywhere).

import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp } from '@/lib/security/rateLimit'
import type { AdminRole } from '@/lib/admin/rbac'

export interface AuditParams {
  actorId: string
  actorEmail: string
  actorRole: AdminRole
  action: string
  targetType?: string
  targetId?: string
  beforeState?: Record<string, unknown>
  afterState?: Record<string, unknown>
  metadata?: Record<string, unknown>
  req?: Request
}

/**
 * Write one audit entry. Fire-and-forget: callers do NOT await this in the
 * response path — call it, then return the response. Errors are logged, never thrown.
 */
export function writeAuditLog(params: AuditParams): void {
  const ip = params.req ? clientIp(params.req) : null
  const userAgent = params.req?.headers.get('user-agent') ?? null

  // Intentionally not awaited by the caller. We swallow all errors so a failed
  // audit insert can never break the underlying admin action (safety net, not a gate).
  void (async () => {
    try {
      const supabase = createAdminClient()
      const { error } = await supabase.from('audit_log').insert({
        actor_id: params.actorId,
        actor_email: params.actorEmail,
        actor_role: params.actorRole,
        action: params.action,
        target_type: params.targetType ?? null,
        target_id: params.targetId ?? null,
        before_state: params.beforeState ?? null,
        after_state: params.afterState ?? null,
        metadata: params.metadata ?? null,
        ip_address: ip === 'unknown' ? null : ip,
        user_agent: userAgent,
      })
      if (error) console.error('[admin][audit] insert failed:', error.message)
    } catch (err) {
      console.error('[admin][audit] write failed:', err)
    }
  })()
}
