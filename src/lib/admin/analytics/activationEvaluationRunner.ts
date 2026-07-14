// Activation Analytics — Step 4 (the real caller). Ties the Step 2 Engine +
// Provider and the Step 3 dimension writer together for one user. This is the
// ONLY orchestration point — no duplicated evaluation/upsert logic elsewhere.
// Reused by the cron (below) and directly unit-testable without any DB.

import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateActivationRule, type DomainEvent } from '@/lib/admin/analytics/activationRuleEngine'
import { inCodeActivationRuleProvider, type ActivationRuleProvider } from '@/lib/admin/analytics/activationRuleProvider'
import { activationInputFromResult, upsertActivation } from '@/lib/admin/analytics/activationDimensionWriter'

export interface RawUserEventRow {
  event_type: string
  metadata?: Record<string, unknown> | null
  session_id?: string | null
  client_timestamp?: string | null
}

// Pure: adapt a raw user_events row to the Engine's minimal DomainEvent shape.
export function toDomainEvent(row: RawUserEventRow): DomainEvent {
  return {
    event_type: row.event_type,
    properties: row.metadata ?? {},
    session_id: row.session_id ?? null,
    client_timestamp: row.client_timestamp ?? '',
  }
}

// Evaluate the active rule for one user's already-fetched events and persist
// only if it activates (first-write-wins, Step 3). No-op (not an error) when
// there is no active rule or the user hasn't activated yet.
export async function evaluateAndUpsertActivation(
  userId: string,
  events: RawUserEventRow[],
  client: SupabaseClient,
  provider: ActivationRuleProvider = inCodeActivationRuleProvider,
): Promise<{ activated: boolean; error: unknown }> {
  const rule = provider.getActiveRule()
  if (!rule) return { activated: false, error: null }

  const result = evaluateActivationRule(rule, events.map(toDomainEvent))
  const input = activationInputFromResult(userId, result)
  if (!input) return { activated: false, error: null }

  const { error } = await upsertActivation(input, client)
  return { activated: !error, error }
}
