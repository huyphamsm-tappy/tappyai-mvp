// TVI store adapter (R13 §8): the three write paths of 20261120_tvi_core.sql, typed, and (14/11/2026) one read. Server only (service role). It never throws: a failure is a result the caller can log.
// Capture (write, TVI_CAPTURE) and the read of stored place facts (TVI_READ, readPlaces.ts) are wired in the place tool, both flagged off by default.

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

export type AttachEvidenceResult =
  | { ok: true; outcome: 'attached' | 'already_attached'; evidenceId: string }
  | { ok: false; reason: 'invalid_input' | 'store_error' }

/**
 * Attaches evidence to one fact version: a REFERENCE and a hash only (no text is stored; see storage_permission). The source is found or created by its domain; the same evidence
 * again is `already_attached`.
 */
export async function attachEvidence(
  input: {
    versionId: string
    sourceType: 'GOVERNMENT' | 'OFFICIAL_BUSINESS' | 'NEWS' | 'PROVIDER_API' | 'KOL' | 'COMMUNITY' | 'UGC' | 'OTHER'
    domain: string
    publisher?: string | null
    reference?: string | null
    contentHash?: string | null
    retrievedAt: Date
    policyVersion: string
    relation?: 'SUPPORTS' | 'REFUTES' | 'QUALIFIES' | 'CONTEXT_ONLY'
    evaluator?: string
  },
  db: Rpc = createAdminClient(),
): Promise<AttachEvidenceResult> {
  const retrieved = iso(input.retrievedAt)
  if (!retrieved || !input.domain.trim() || !input.policyVersion.trim()) return { ok: false, reason: 'invalid_input' }
  try {
    const { data, error } = await db.rpc('tvi_attach_evidence', {
      p_version_id: input.versionId,
      p_source_type: input.sourceType,
      p_domain: input.domain,
      p_publisher: input.publisher ?? null,
      p_reference: input.reference ?? null,
      p_content_hash: input.contentHash ?? null,
      p_retrieved_at: retrieved,
      p_policy_version: input.policyVersion,
      p_relation: input.relation ?? 'SUPPORTS',
      p_evaluator: input.evaluator ?? 'capture.v1',
    })
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row || typeof row.evidence_id !== 'string') return { ok: false, reason: 'store_error' }
    return { ok: true, outcome: row.outcome === 'attached' ? 'attached' : 'already_attached', evidenceId: row.evidence_id }
  } catch {
    return { ok: false, reason: 'store_error' }
  }
}

/** One stored fact as the chat may read it: the CURRENT version of a fact whose lifecycle status is ACTIVE or CANDIDATE (never rejected, expired or superseded). */
export interface StoredFact {
  entityKey: string
  factType: string
  subjectKey: string
  value: unknown
  valueUnit: string | null
  retrievedAt: string
  validUntil: string | null
  status: 'ACTIVE' | 'CANDIDATE'
  verification: string
}

/** The most entity keys one read asks for: a bound on the read one search can cause. */
export const READ_MAX_ENTITIES = 12

/**
 * Reads the current facts of the given entities (service role; the tables have no other reader). Never throws: any failure is an empty list, so the chat goes on exactly as it
 * would without the store. Only ACTIVE and CANDIDATE facts come back, and only while their validity has not ended.
 */
export async function readFacts(entityKeys: readonly string[], db: Pick<SupabaseClient, 'from'> = createAdminClient(), opts: { marketId?: string; now?: Date } = {}): Promise<StoredFact[]> {
  const keys = [...new Set(entityKeys.map(k => k.trim()).filter(Boolean))].slice(0, READ_MAX_ENTITIES)
  if (keys.length === 0) return []
  try {
    const { data, error } = await db
      .from('knowledge_entities')
      // `knowledge_fact_state` has TWO foreign keys to `knowledge_facts` (fact_id and superseded_by_fact_id): without the hint the database refuses the embed as ambiguous (found with the live check, readLive.test.ts)
      .select('entity_key, knowledge_facts(fact_type, subject_key, knowledge_fact_state!knowledge_fact_state_fact_id_fkey(status, verification_status, current:knowledge_fact_versions!current_version_id(value, value_unit, retrieved_at, valid_until)))')
      .eq('market_id', opts.marketId ?? 'VN')
      .in('entity_key', keys)
    if (error || !Array.isArray(data)) return []
    const nowMs = (opts.now ?? new Date()).getTime()
    const out: StoredFact[] = []
    for (const e of data as Array<Record<string, unknown>>) {
      const facts = Array.isArray(e.knowledge_facts) ? e.knowledge_facts as Array<Record<string, unknown>> : []
      for (const f of facts) {
        const st = Array.isArray(f.knowledge_fact_state) ? f.knowledge_fact_state[0] : f.knowledge_fact_state
        const state = st && typeof st === 'object' ? st as Record<string, unknown> : null
        const cur = state && typeof state.current === 'object' && state.current ? state.current as Record<string, unknown> : null
        if (!state || !cur || (state.status !== 'ACTIVE' && state.status !== 'CANDIDATE')) continue
        const until = typeof cur.valid_until === 'string' ? cur.valid_until : null
        if (until && Date.parse(until) <= nowMs) continue
        if (typeof e.entity_key !== 'string' || typeof f.fact_type !== 'string' || typeof cur.retrieved_at !== 'string') continue
        out.push({ entityKey: e.entity_key, factType: f.fact_type, subjectKey: typeof f.subject_key === 'string' ? f.subject_key : '', value: cur.value, valueUnit: typeof cur.value_unit === 'string' ? cur.value_unit : null, retrievedAt: cur.retrieved_at, validUntil: until, status: state.status, verification: typeof state.verification_status === 'string' ? state.verification_status : 'UNVERIFIED' })
      }
    }
    return out
  } catch {
    return []
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
