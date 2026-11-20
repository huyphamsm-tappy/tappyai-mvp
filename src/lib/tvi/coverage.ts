// TVI coverage report (phase A): how full the store is, how much of it is verified, how fresh. Read-only and pure apart from the loader. Counts only: no value of any fact is read out.

import type { SupabaseClient } from '@supabase/supabase-js'
import { freshnessOf } from './factTypes'

export interface CoverageRow {
  factType: string
  status: string
  verification: string
  retrievedAt: string
}

export interface CoverageSummary {
  entities: number
  facts: number
  byType: Record<string, number>
  byStatus: Record<string, number>
  byVerification: Record<string, number>
  /** ACTIVE facts as a share of all facts (0 when there are none). */
  activeShare: number
  /** Over the facts still in use (CANDIDATE or ACTIVE): FRESH / STALE by the type's policy. */
  freshness: Record<string, number>
  staleByType: Record<string, number>
}

const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1 }

/** Pure. */
export function summarizeCoverage(rows: readonly CoverageRow[], entities: number, now: Date = new Date()): CoverageSummary {
  const s: CoverageSummary = { entities, facts: rows.length, byType: {}, byStatus: {}, byVerification: {}, activeShare: 0, freshness: {}, staleByType: {} }
  let active = 0
  for (const r of rows) {
    bump(s.byType, r.factType)
    bump(s.byStatus, r.status)
    bump(s.byVerification, r.verification)
    if (r.status === 'ACTIVE') active++
    if (r.status === 'ACTIVE' || r.status === 'CANDIDATE') {
      const f = freshnessOf(r.factType, r.retrievedAt, now)
      bump(s.freshness, f)
      if (f === 'STALE') bump(s.staleByType, r.factType)
    }
  }
  s.activeShare = rows.length === 0 ? 0 : active / rows.length
  return s
}

const PAGE = 1000

/** Reads every fact's status and its current version's read date, page by page (PostgREST caps a page). Never throws: a failure is an empty report. */
export async function loadCoverageRows(db: Pick<SupabaseClient, 'from'>): Promise<{ entities: number; rows: CoverageRow[] }> {
  try {
    const head = await db.from('knowledge_entities').select('id', { count: 'exact', head: true })
    const entities = typeof head.count === 'number' ? head.count : 0
    const rows: CoverageRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from('knowledge_facts')
        .select('id, fact_type, knowledge_fact_state!knowledge_fact_state_fact_id_fkey(status, verification_status, current:knowledge_fact_versions!current_version_id(retrieved_at))')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error || !Array.isArray(data)) return { entities: 0, rows: [] }
      for (const f of data as Array<Record<string, unknown>>) {
        const st = Array.isArray(f.knowledge_fact_state) ? f.knowledge_fact_state[0] : f.knowledge_fact_state
        const state = st && typeof st === 'object' ? st as Record<string, unknown> : null
        const cur = state && typeof state.current === 'object' && state.current ? state.current as Record<string, unknown> : null
        if (!state || !cur || typeof f.fact_type !== 'string' || typeof state.status !== 'string' || typeof cur.retrieved_at !== 'string') continue
        rows.push({ factType: f.fact_type, status: state.status, verification: typeof state.verification_status === 'string' ? state.verification_status : 'UNVERIFIED', retrievedAt: cur.retrieved_at })
      }
      if (data.length < PAGE) break
    }
    return { entities, rows }
  } catch {
    return { entities: 0, rows: [] }
  }
}
