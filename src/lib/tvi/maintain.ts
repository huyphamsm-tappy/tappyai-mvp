// TVI maintenance (R13 §8.5-8.6, phase A). A background pass that applies the evidence gate to what the store already holds:
//   · a pending CANDIDATE with enough evidence becomes ACTIVE (PARTIALLY_VERIFIED or VERIFIED);
//   · an ACTIVE fact whose stated validity has ended becomes EXPIRED.
// "Stale" (older than the type's policy) is NOT a stored status (R13 §8.3): it is computed from the read date, so it is reported (coverage.ts) and never written here.
// A dispute (authoritative evidence that refutes) is counted and left alone: the store has no transition for it yet, and a person decides.
//
// It changes no answer by itself: it only moves facts the store already has. OFF unless TVI_MAINTAIN=1, and locked off in a production runtime until the owner lists the name in
// CONSULT_PRODUCTION_ALLOW. It never throws; it logs counts only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { lockedInProduction } from '@/lib/config/consultFlags'
import { promotionFor, type EvidenceInput, type SourceType } from './evidenceGate'
import { promoteFact, retireFact, type PromoteResult, type RetireResult } from './tviStore'

type Env = Record<string, string | undefined>
type Db = Pick<SupabaseClient, 'from'>

export const TVI_MAINTAIN_FLAG = 'TVI_MAINTAIN'
/** Pure. ON only for the exact value "1", and never in a production runtime unless the owner lists the name in CONSULT_PRODUCTION_ALLOW. */
export const tviMaintainOn = (env: Env = process.env): boolean => env[TVI_MAINTAIN_FLAG] === '1' && !lockedInProduction(env, TVI_MAINTAIN_FLAG)

/** The most facts one run looks at: a bound on the work (and the writes) of one pass. */
export const MAINTAIN_MAX_BATCH = 200
export const MAINTAIN_ACTOR = 'tvi.maintain'

export interface PendingFact {
  factId: string
  /** The version that would become ACTIVE: the current version of a new fact, or the waiting candidate of an active one. */
  versionId: string
  rowVersion: number
  factType: string
  retrievedAt: string
  validUntil: string | null
  status: 'CANDIDATE' | 'ACTIVE'
  evidence: EvidenceInput[]
}

export type MaintenanceDecision =
  | { kind: 'promote'; verification: 'VERIFIED' | 'PARTIALLY_VERIFIED'; reason: string }
  | { kind: 'dispute' | 'hold'; reason: string }

/** What the gate says about one pending fact. Pure. The pending version is judged as a CANDIDATE whatever the state's status says. */
export function decideMaintenance(p: PendingFact, now: Date = new Date()): MaintenanceDecision {
  const g = promotionFor({ factType: p.factType, retrievedAt: p.retrievedAt, validUntil: p.validUntil, status: 'CANDIDATE', evidence: p.evidence }, now)
  if (g.action === 'promote') return { kind: 'promote', verification: g.verification, reason: g.reason }
  return { kind: g.action, reason: g.reason }
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {})
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const rows = (data: unknown): Array<Record<string, unknown>> => (Array.isArray(data) ? data.map(rec) : [])

/**
 * Reads up to `limit` pending facts with their evidence, in flat queries (no embedded joins, so no ambiguous foreign key). Never throws: a failure is an empty list.
 * Pending = a fact whose only version is a CANDIDATE, plus an ACTIVE fact that has a newer candidate waiting.
 */
export async function loadPending(db: Db, limit: number = MAINTAIN_MAX_BATCH): Promise<PendingFact[]> {
  const n = Math.max(1, Math.min(limit, MAINTAIN_MAX_BATCH))
  try {
    const cands = rows((await db.from('knowledge_fact_state').select('fact_id, current_version_id, candidate_version_id, status, row_version').eq('status', 'CANDIDATE').order('status_updated_at', { ascending: true }).limit(n)).data)
    const waiting = rows((await db.from('knowledge_fact_state').select('fact_id, current_version_id, candidate_version_id, status, row_version').eq('status', 'ACTIVE').not('candidate_version_id', 'is', null).order('status_updated_at', { ascending: true }).limit(n)).data)
    const base = [
      ...cands.map(s => ({ factId: str(s.fact_id), versionId: str(s.current_version_id), rowVersion: Number(s.row_version), status: 'CANDIDATE' as const })),
      ...waiting.map(s => ({ factId: str(s.fact_id), versionId: str(s.candidate_version_id), rowVersion: Number(s.row_version), status: 'ACTIVE' as const })),
    ].filter((s): s is { factId: string; versionId: string; rowVersion: number; status: 'CANDIDATE' | 'ACTIVE' } => !!s.factId && !!s.versionId && Number.isFinite(s.rowVersion)).slice(0, n)
    if (base.length === 0) return []

    const versionIds = base.map(b => b.versionId)
    const factIds = base.map(b => b.factId)
    const versions = rows((await db.from('knowledge_fact_versions').select('id, fact_id, retrieved_at, valid_until').in('id', versionIds)).data)
    const facts = rows((await db.from('knowledge_facts').select('id, fact_type').in('id', factIds)).data)
    const links = rows((await db.from('knowledge_fact_evidence').select('fact_version_id, evidence_id, relation, status').in('fact_version_id', versionIds)).data)
    const evidenceIds = [...new Set(links.map(l => str(l.evidence_id)).filter((x): x is string => !!x))]
    const evidence = evidenceIds.length ? rows((await db.from('knowledge_evidence').select('id, source_id').in('id', evidenceIds)).data) : []
    const sourceIds = [...new Set(evidence.map(e => str(e.source_id)).filter((x): x is string => !!x))]
    const sources = sourceIds.length ? rows((await db.from('knowledge_sources').select('id, source_type, canonical_domain').in('id', sourceIds)).data) : []

    const versionById = new Map(versions.map(v => [str(v.id), v]))
    const typeByFact = new Map(facts.map(f => [str(f.id), str(f.fact_type)]))
    const sourceOfEvidence = new Map(evidence.map(e => [str(e.id), str(e.source_id)]))
    const sourceById = new Map(sources.map(s => [str(s.id), s]))

    const out: PendingFact[] = []
    for (const b of base) {
      const v = versionById.get(b.versionId)
      const factType = typeByFact.get(b.factId)
      const retrievedAt = v ? str(v.retrieved_at) : null
      if (!v || !factType || !retrievedAt) continue
      const ev: EvidenceInput[] = []
      for (const l of links) {
        if (str(l.fact_version_id) !== b.versionId) continue
        const src = sourceById.get(sourceOfEvidence.get(str(l.evidence_id)) ?? null)
        const relation = str(l.relation)
        if (!src || !relation) continue
        ev.push({ relation: relation as EvidenceInput['relation'], sourceType: (str(src.source_type) ?? 'OTHER') as SourceType, sourceDomain: str(src.canonical_domain), active: l.status === 'ACTIVE' })
      }
      out.push({ factId: b.factId, versionId: b.versionId, rowVersion: b.rowVersion, factType, retrievedAt, validUntil: str(v.valid_until), status: b.status, evidence: ev })
    }
    return out
  } catch {
    return []
  }
}

/** ACTIVE facts whose current version states a validity that has ended. Never throws. */
export async function loadExpiredActive(db: Db, now: Date = new Date(), limit: number = MAINTAIN_MAX_BATCH): Promise<Array<{ factId: string; rowVersion: number }>> {
  const n = Math.max(1, Math.min(limit, MAINTAIN_MAX_BATCH))
  try {
    const ended = rows((await db.from('knowledge_fact_versions').select('id, fact_id, valid_until').lt('valid_until', now.toISOString()).limit(n * 5)).data)
    const ids = ended.map(v => str(v.id)).filter((x): x is string => !!x)
    if (ids.length === 0) return []
    const states = rows((await db.from('knowledge_fact_state').select('fact_id, current_version_id, status, row_version').eq('status', 'ACTIVE').in('current_version_id', ids).limit(n)).data)
    return states.map(s => ({ factId: str(s.fact_id) ?? '', rowVersion: Number(s.row_version) })).filter(s => s.factId && Number.isFinite(s.rowVersion))
  } catch {
    return []
  }
}

export interface MaintainCounts { examined: number; promoted: number; held: number; disputed: number; expired: number; conflicts: number; failed: number }

export interface MaintainDeps {
  loadPending: () => Promise<PendingFact[]>
  loadExpired: () => Promise<Array<{ factId: string; rowVersion: number }>>
  promote: typeof promoteFact
  retire: typeof retireFact
}

/** One pass. Never throws; returns (and logs) counts only. The store's compare-and-set protects against two passes running at once: the loser counts a conflict. */
export async function maintainTvi(deps: MaintainDeps, opts: { now?: Date } = {}): Promise<MaintainCounts> {
  const c: MaintainCounts = { examined: 0, promoted: 0, held: 0, disputed: 0, expired: 0, conflicts: 0, failed: 0 }
  const now = opts.now ?? new Date()
  try {
    for (const p of await deps.loadPending()) {
      c.examined++
      const d = decideMaintenance(p, now)
      if (d.kind !== 'promote') {
        if (d.kind === 'dispute') c.disputed++
        else c.held++
        continue
      }
      const r: PromoteResult = await deps.promote({ factId: p.factId, versionId: p.versionId, expectedRowVersion: p.rowVersion, verification: d.verification, reason: d.reason, actorType: 'SYSTEM', actor: MAINTAIN_ACTOR })
      if (r.ok) c.promoted++
      else if (r.reason === 'conflict') c.conflicts++
      else c.failed++
    }
    for (const e of await deps.loadExpired()) {
      const r: RetireResult = await deps.retire({ factId: e.factId, expectedRowVersion: e.rowVersion, to: 'EXPIRED', reason: 'validity_ended', actorType: 'SYSTEM', actor: MAINTAIN_ACTOR })
      if (r.ok) c.expired++
      else if (r.reason === 'conflict') c.conflicts++
      else c.failed++
    }
  } catch {
    c.failed++
  }
  console.log(JSON.stringify({ type: 'tappyai_tvi_maintain', ...c }))
  return c
}

/** The real pass against the store (service role). */
export async function runTviMaintenance(db: Db & Pick<SupabaseClient, 'rpc'>, now: Date = new Date()): Promise<MaintainCounts> {
  return maintainTvi({
    loadPending: () => loadPending(db),
    loadExpired: () => loadExpiredActive(db, now),
    promote: i => promoteFact(i, db),
    retire: i => retireFact(i, db),
  }, { now })
}
