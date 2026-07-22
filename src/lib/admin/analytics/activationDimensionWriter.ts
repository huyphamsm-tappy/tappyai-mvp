// Activation Analytics — Step 3 (user_acquisition correlation, spec §5). The
// single reusable writer for activation state on the existing user_acquisition
// dimension (SR-1 — no new identity table). Mirrors userAcquisitionService.ts's
// shape exactly: pure mapper + thin, lazily-imported RPC caller.
//
// NOT wired into any cron/API/event pipeline yet (later step). This module is
// only called directly (e.g. from tests) until a real caller exists — SR-4:
// build the writer once the Engine can produce a result, wire it once a real
// scheduled/triggered caller exists.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RuleEvaluationResult } from '@/lib/admin/analytics/activationRuleEngine'

export interface ActivationUpsertInput {
  user_id: string
  activated_at: string
  activation_rule_version: string
}

// Pure: an evaluation only produces a dimension write when it actually
// activated — a non-activating evaluation (§2.9) has nothing to persist here.
export function activationInputFromResult(userId: string, result: RuleEvaluationResult): ActivationUpsertInput | null {
  if (!result.activation_result) return null
  const timestamps = Object.values(result.matched_signals)
  if (timestamps.length === 0) return null
  // activated_at = the moment the LAST required signal arrived (i.e. the
  // combinator became satisfied), not the evaluation time itself.
  const activated_at = timestamps.reduce((latest, t) => (t > latest ? t : latest), timestamps[0])
  return { user_id: userId, activated_at, activation_rule_version: result.activation_rule_version }
}

export function toRpcParams(input: ActivationUpsertInput): Record<string, unknown> {
  return {
    p_user_id: input.user_id,
    p_activated_at: input.activated_at,
    p_activation_rule_version: input.activation_rule_version,
  }
}

// Idempotent, first-write-wins upsert via the single DB merge function
// (fn_upsert_activation, 20260714_activation_dimension.sql). Admin client
// imported lazily so the pure functions above stay dependency-free/unit-testable.
export async function upsertActivation(
  input: ActivationUpsertInput,
  client?: SupabaseClient
): Promise<{ error: unknown }> {
  const c = client ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const { error } = await c.rpc('fn_upsert_activation', toRpcParams(input))
  if (error) console.error('[activationDimension] upsert failed:', (error as { message?: string })?.message)
  return { error }
}
