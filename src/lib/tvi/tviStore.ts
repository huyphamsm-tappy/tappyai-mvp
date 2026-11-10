// TVI store adapter (R13 §8): the three write paths of 20261120_tvi_core.sql, typed. Server only (service role). It never throws: a failure is a result the caller can log.
// Nothing in the chat calls this yet; a later, flagged slice wires capture (write) and read-before-search.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { contentHashOf } from './contentHash'
import { policyFor } from './factTypes'

type Rpc = Pick<SupabaseClient, 'rpc'>

export type StageOutcome = 'created' | 'staged' | 'unchanged'

export interface StageFactInput {
  entityType: string
  entityKey: string
  canonicalName: string
  city?: string | null
  factType: string
  subjectKey?: string
  value: unknown
  valueUnit?: string | null
  observedAt: Date
  retrievedAt: Date
  publishedAt?: Date | null
  validFrom?: Date | null
  validUntil?: Date | null
  marketId?: string
  /** Who staged it (a pipeline name); never a person's identity. */
  actor?: string
}

export type StageResult =
  | { ok: true; outcome: StageOutcome; factId: string; versionId: string; versionNumber: number }
  | { ok: false; reason: 'unknown_fact_type' | 'invalid_input' | 'store_error' }

const iso = (d: Date | null | undefined) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null)

/** Stages one fact version (always a CANDIDATE). The same content again is `unchanged` and writes nothing. */
export async function stageFact(input: StageFactInput, db: Rpc = createAdminClient()): Promise<StageResult> {
  const policy = policyFor(input.factType)
  if (!policy) return { ok: false, reason: 'unknown_fact_type' }
  const observed = iso(input.observedAt)
  const retrieved = iso(input.retrievedAt)
  if (!observed || !retrieved || !input.entityKey.trim() || !input.canonicalName.trim() || input.value === undefined) return { ok: false, reason: 'invalid_input' }
  try {
    const { data, error } = await db.rpc('tvi_stage_fact', {
      p_market: input.marketId ?? 'VN',
      p_entity_type: input.entityType,
      p_entity_key: input.entityKey,
      p_canonical_name: input.canonicalName,
      p_city: input.city ?? null,
      p_fact_type: input.factType,
      p_subject_key: input.subjectKey ?? '',
      p_value: input.value,
      p_value_unit: input.valueUnit ?? null,
      p_observed_at: observed,
      p_retrieved_at: retrieved,
      p_published_at: iso(input.publishedAt),
      p_valid_from: iso(input.validFrom),
      p_valid_until: iso(input.validUntil),
      p_policy: policy.policyId,
      p_content_hash: contentHashOf({ factType: input.factType, subjectKey: input.subjectKey, value: input.value, valueUnit: input.valueUnit }),
      p_actor: input.actor ?? 'ingestion',
    })
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row || typeof row.fact_id !== 'string') return { ok: false, reason: 'store_error' }
    return { ok: true, outcome: row.outcome as StageOutcome, factId: row.fact_id, versionId: row.version_id, versionNumber: Number(row.version_number) }
  } catch {
    return { ok: false, reason: 'store_error' }
  }
}

export type PromoteResult =
  | { ok: true; outcome: 'promoted'; rowVersion: number }
  | { ok: false; reason: 'conflict' | 'not_pending' | 'store_error' | 'invalid_input'; rowVersion?: number }

/** Promotes a pending version to ACTIVE. `expectedRowVersion` is the state's row_version the caller read: a changed state is a `conflict`, never a silent overwrite. */
export async function promoteFact(
  input: { factId: string; versionId: string; expectedRowVersion: number; verification: 'PARTIALLY_VERIFIED' | 'VERIFIED'; reason: string; actorType: 'VERIFIER' | 'ADMIN' | 'SYSTEM' | 'INGESTION_PIPELINE'; actor?: string; evidenceIds?: string[] },
  db: Rpc = createAdminClient(),
): Promise<PromoteResult> {
  if (!input.reason.trim()) return { ok: false, reason: 'invalid_input' }
  try {
    const { data, error } = await db.rpc('tvi_promote_fact', {
      p_fact_id: input.factId,
      p_version_id: input.versionId,
      p_expected_row_version: input.expectedRowVersion,
      p_verification: input.verification,
      p_reason: input.reason,
      p_actor_type: input.actorType,
      p_actor: input.actor ?? null,
      p_evidence_ids: input.evidenceIds ?? null,
    })
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) return { ok: false, reason: 'store_error' }
    if (row.outcome === 'promoted') return { ok: true, outcome: 'promoted', rowVersion: Number(row.row_version) }
    if (row.outcome === 'conflict' || row.outcome === 'not_pending') return { ok: false, reason: row.outcome, rowVersion: Number(row.row_version) }
    return { ok: false, reason: 'store_error' }
  } catch {
    return { ok: false, reason: 'store_error' }
  }
}

export type RetireResult =
  | { ok: true; outcome: 'retired'; rowVersion: number }
  | { ok: false; reason: 'conflict' | 'not_current' | 'store_error' | 'invalid_input'; rowVersion?: number }

/** Retires the current version as EXPIRED or REJECTED (compare-and-set). */
export async function retireFact(
  input: { factId: string; expectedRowVersion: number; to: 'EXPIRED' | 'REJECTED'; reason: string; actorType: 'VERIFIER' | 'ADMIN' | 'SYSTEM' | 'INGESTION_PIPELINE'; actor?: string },
  db: Rpc = createAdminClient(),
): Promise<RetireResult> {
  if (!input.reason.trim()) return { ok: false, reason: 'invalid_input' }
  try {
    const { data, error } = await db.rpc('tvi_retire_fact', {
      p_fact_id: input.factId,
      p_expected_row_version: input.expectedRowVersion,
      p_to_status: input.to,
      p_reason: input.reason,
      p_actor_type: input.actorType,
      p_actor: input.actor ?? null,
    })
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) return { ok: false, reason: 'store_error' }
    if (row.outcome === 'retired') return { ok: true, outcome: 'retired', rowVersion: Number(row.row_version) }
    if (row.outcome === 'conflict' || row.outcome === 'not_current') return { ok: false, reason: row.outcome, rowVersion: Number(row.row_version) }
    return { ok: false, reason: 'store_error' }
  } catch {
    return { ok: false, reason: 'store_error' }
  }
}
