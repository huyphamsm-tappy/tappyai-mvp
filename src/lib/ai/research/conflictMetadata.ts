// Structured conflicts and bounded repair (R13 §9.3, §9.4). Pure.
//   structuredConflicts() — a disagreement between sources is DATA (kind, figure, each source and value), never detected by looking for a word like "however" in the prose; the client decides
//                           how to word it for the person's locale ("the data is not agreed", "two sources record different values", "needs verification").
//   nextRepairAction()    — repair is bounded (rounds and time), the verifier re-runs from the start after every repair, rewording does not legitimise a claim, and what still fails is dropped
//                           or the answer is partial / insufficient, never presented as verified.

import type { Finding } from './deepResearch'
import { FIGURE_CONFLICT_GAP } from './deepResearch'
import type { ClaimCheck } from './claimVerifier'

export type ConflictKind = 'SOURCES_DIFFER'
/** what the client may say; the locale wording lives in the client */
export type ConflictDisplay = 'DATA_NOT_AGREED' | 'TWO_SOURCES_DIFFER' | 'NEEDS_VERIFICATION'

export interface ConflictRecord {
  kind: ConflictKind
  series: string
  label: string
  unit: string
  values: Array<{ value: number; source: number }>
  low: number
  high: number
  /** (high - low) / |high| */
  relativeGap: number
  display: ConflictDisplay
}

/**
 * Same series, label and unit read from at least two different sources with values further apart than rounding (FIGURE_CONFLICT_GAP). Two sources that differ read
 * TWO_SOURCES_DIFFER; three or more, DATA_NOT_AGREED; a gap above half of the larger value, NEEDS_VERIFICATION (too far apart to present as a range). Pure and deterministic.
 */
export function structuredConflicts(findings: readonly Finding[]): ConflictRecord[] {
  const key = (f: NonNullable<Finding['figure']>) => `${f.series.trim().toLowerCase()}|${f.label.trim().toLowerCase()}|${f.unit.trim().toLowerCase()}`
  const groups = new Map<string, Finding[]>()
  for (const f of findings) {
    if (!f.figure || !Number.isFinite(f.figure.value)) continue
    const k = key(f.figure)
    groups.set(k, [...(groups.get(k) ?? []), f])
  }
  const out: ConflictRecord[] = []
  for (const group of groups.values()) {
    const sources = new Set(group.map(f => f.source))
    const values = group.map(f => f.figure!.value)
    const low = Math.min(...values), high = Math.max(...values)
    if (sources.size < 2 || high - low <= Math.abs(high) * FIGURE_CONFLICT_GAP) continue
    const relativeGap = Math.abs(high) === 0 ? 0 : (high - low) / Math.abs(high)
    const first = group[0].figure!
    const seen = new Set<string>()
    const distinct = group.filter(f => { const s = `${f.source}|${f.figure!.value}`; if (seen.has(s)) return false; seen.add(s); return true }).map(f => ({ value: f.figure!.value, source: f.source }))
    out.push({
      kind: 'SOURCES_DIFFER', series: first.series, label: first.label, unit: first.unit, values: distinct, low, high, relativeGap: Math.round(relativeGap * 1e4) / 1e4,
      display: relativeGap > 0.5 ? 'NEEDS_VERIFICATION' : sources.size >= 3 ? 'DATA_NOT_AGREED' : 'TWO_SOURCES_DIFFER',
    })
  }
  return out
}

// ── bounded repair ────────────────────────────────────────────────────────────────────────────────────────────────────

export const REPAIR_BOUNDS = { STANDARD: { maxRounds: 1, minMsLeft: 12_000 }, ADVANCED: { maxRounds: 2, minMsLeft: 20_000 } } as const

export type RepairAction =
  | { action: 'done'; reason: 'nothing_flagged' }
  | { action: 'repair'; claims: number[] }
  | { action: 'drop'; claims: number[]; reason: 'round_limit' | 'time_limit' }

/**
 * After a verification: nothing flagged is done; otherwise repair while a round and the time remain; once either is gone the claims that still fail are dropped (the caller removes them or
 * answers partially / "not enough evidence"). `round` counts repairs already made. A claim is never kept because it was reworded: after each repair the verifier runs again from the start and
 * this is called again with ITS result. `source_unreadable` is not a failure (the verifier could not judge it) and is never repaired or dropped. Pure.
 */
export function nextRepairAction(i: { tier: keyof typeof REPAIR_BOUNDS; round: number; msLeft: number; flagged: readonly ClaimCheck[] }): RepairAction {
  const failing = i.flagged.filter(f => f.status !== 'source_unreadable').map(f => f.sentence)
  if (failing.length === 0) return { action: 'done', reason: 'nothing_flagged' }
  const b = REPAIR_BOUNDS[i.tier]
  if (i.round >= b.maxRounds) return { action: 'drop', claims: failing, reason: 'round_limit' }
  if (i.msLeft < b.minMsLeft) return { action: 'drop', claims: failing, reason: 'time_limit' }
  return { action: 'repair', claims: failing }
}
