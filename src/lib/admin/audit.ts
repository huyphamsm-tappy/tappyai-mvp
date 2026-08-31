// TappyAI Back Office — Audit Log writer (Architecture v1.1: 13_Audit_Log.md, ADR-007).
//
// Every administrative mutation MUST call writeAuditLog AFTER the operation
// succeeds. Writes are NON-BLOCKING: never await in the critical path, never fail
// the operation if the audit insert fails (13_Audit_Log.md §5). The audit_log
// table is INSERT-only (RLS deny-by-default + no update/delete path anywhere).

import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp } from '@/lib/security/rateLimit'
import type { AdminRole } from '@/lib/admin/rbac'

/**
 * Who the audit log records as the acting principal.
 *
 * Component 4 widened this from `AdminRole`. The Platform Owner is NOT a role —
 * they reach a handler by OWNER_BYPASS and may hold no `admin_roles` row at all,
 * so the previous `actor.highestRole ?? 'admin'` fallback recorded a role they
 * did not have. An audit trail that invents the actor's authority is worse than
 * one that is merely incomplete.
 *
 * `'none'` exists for denied actors who hold no role — a denial is exactly the
 * case worth recording, so it needs a truthful value rather than a fabricated one.
 *
 * No migration: `audit_log.actor_role` is `TEXT NOT NULL`, never an enum.
 */
export type AuditActorRole = AdminRole | 'owner' | 'none'

export interface AuditParams {
  actorId: string
  actorEmail: string
  actorRole: AuditActorRole
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
  // Intentionally not awaited by the caller. We swallow all errors so a failed
  // audit insert can never break the underlying admin action (safety net, not a gate).
  //
  // 🔑 THE BODY MOVED, THE BEHAVIOUR DID NOT. Every existing caller still gets
  // exactly what it got before: a synchronous `void` return, a write that
  // happens in the background, and errors that are logged and swallowed. The
  // work was extracted only so that ONE caller — the retired legacy broadcast
  // route — can await it; see `writeAuditLogAwaited` below for why that matters.
  void writeAuditLogAwaited(params)
}

/**
 * The same audit write, awaitable, and reporting whether it landed.
 *
 * 🚨 WHY THIS EXISTS — A MEASURED SERVERLESS DEFECT, NOT A PREFERENCE.
 * `writeAuditLog` is fire-and-forget, which is right for an admin action: the
 * action already happened, and a failed audit must not fail it. But on Vercel a
 * serverless instance can be frozen as soon as the response is returned, and
 * un-awaited work is then simply discarded.
 *
 * MEASURED on production 2026-08-31: of four hits on the retired
 * `/api/notifications/broadcast`, the first — the one that landed on a cold
 * instance — produced **no audit row**; the three that followed, on a warm one,
 * all recorded. For an endpoint whose retirement evidence IS the audit trail,
 * that is fatal: a rare real caller is precisely the request most likely to
 * arrive cold, so the recorder was weakest exactly where the evidence had to be
 * strongest.
 *
 * Resolves `true` when the row was written, `false` when it was not. It never
 * throws, so a caller can await it without the audit becoming a gate on the
 * response — the retirement route awaits this and returns 410 either way, but
 * can no longer report a hit as recorded when it was not.
 */
export async function writeAuditLogAwaited(params: AuditParams): Promise<boolean> {
  const ip = params.req ? clientIp(params.req) : null
  const userAgent = params.req?.headers.get('user-agent') ?? null

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
    if (error) {
      console.error('[admin][audit] insert failed:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[admin][audit] write failed:', err)
    return false
  }
}
