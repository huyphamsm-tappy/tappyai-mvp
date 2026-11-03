// ── 03/11 · Research Brain V2, first slice: research state, stop rules and report validation, all deterministic (no model call here) ───────────
//
// Design: docs/handoff/deep-research-20261103/THIET-KE-RESEARCH-BRAIN-V2-20261103.md (in the g1-growth tree). Behind DEEP_RESEARCH_V2, OFF unless exactly "1" and locked in a
// production runtime (the same rule as every consult flag). OFF is the one-pass Deep Research, byte for byte.
//   - several gap rounds inside the one request, each decided by decideNext (rounds, time, diminishing returns, coverage);
//   - after the report is written, the parts of the question no heading names are answered in an appended section (one repair, never more).

import type { Finding, ResearchPlan } from './deepResearch'
import { lockedInProduction } from '@/lib/config/consultFlags'

type Env = Record<string, string | undefined>

export const DEEP_RESEARCH_V2_FLAG = 'DEEP_RESEARCH_V2'
/** Pure. ON only for the exact value "1", and never in a production runtime unless the owner lists the name in CONSULT_PRODUCTION_ALLOW. */
export const deepResearchV2On = (env: Env = process.env): boolean => env[DEEP_RESEARCH_V2_FLAG] === '1' && !lockedInProduction(env, DEEP_RESEARCH_V2_FLAG)

/** The V2 budgets of one request (the request's own ceiling stays DEEP_RESEARCH_LIMITS.runDeadlineMs). */
export const V2_LIMITS = {
  /** the research phase may run longer than the one-pass 120 s: the writer still has what is left of the 270 s */
  researchDeadlineMs: 150_000,
  /** gap rounds in all (one-pass: 1) */
  maxGapRounds: 3,
  /** a round that kept fewer new findings than this is not worth another */
  minNewFindings: 8,
  /** a step with fewer findings than this is thin */
  thinFindings: 4,
  /** time a further gap round needs at least */
  minMsLeftForRound: 35_000,
  /** time the appended section needs at least (the writer is done; the sources block and the pictures follow) */
  repairMinMsLeft: 45_000,
  maxRepairParts: 2,
  repairFindingsPerPart: 25,
} as const

/**
 * How many terms a title shares with each step's title. A term is a word of 5+ letters or two neighbouring words. Pure.
 * (Moved here from deepResearch.ts so the state helpers and the run share it without importing each other.)
 */
export function termScores(title: string, steps: ReadonlyArray<{ title: string }>): number[] {
  const words = (s: string) => {
    const w = s.toLowerCase().split(/[^\p{L}\d]+/u).filter(Boolean)
    return new Set([...w.filter(x => x.length >= 5), ...w.slice(1).map((x, i) => `${w[i]} ${x}`)])
  }
  const mine = words(title)
  return steps.map(s => [...words(s.title)].filter(w => mine.has(w)).length)
}

export type CoverageStatus = 'covered' | 'thin' | 'empty'
export interface StepCoverage { step: number; title: string; findings: number; figures: number; sources: number; status: CoverageStatus }

/** What each plan step brought, by count: empty (nothing), thin (fewer than thinFindings), covered. Follow-ups count for the step they complete. Pure. */
export function stepCoverage(plan: ResearchPlan, findings: readonly Finding[]): StepCoverage[] {
  return plan.steps.map((s, k) => {
    if (s.completes) return null
    const mine = findings.filter(f => f.step === k + 1 || plan.steps[f.step - 1]?.completes === k + 1)
    const n = mine.length
    return { step: k + 1, title: s.title, findings: n, figures: mine.filter(f => f.figure).length, sources: new Set(mine.map(f => f.source)).size, status: (n === 0 ? 'empty' : n < V2_LIMITS.thinFindings ? 'thin' : 'covered') as CoverageStatus }
  }).filter((x): x is StepCoverage => !!x)
}

export type NextReason = 'research' | 'covered' | 'rounds' | 'time' | 'diminishing'
export interface NextAction { next: 'research' | 'synthesize'; reason: NextReason }

/**
 * Whether another gap round is worth running, checked in this order: time left, rounds used, diminishing returns (the last round kept too few
 * new findings), coverage (no step empty or thin after the first round). `round` = gap rounds already run (>= 1 here: the first one always runs). Pure.
 */
export function decideNext(s: { round: number; newFindings: number; msLeft: number; coverage: readonly StepCoverage[] }): NextAction {
  if (s.msLeft < V2_LIMITS.minMsLeftForRound) return { next: 'synthesize', reason: 'time' }
  if (s.round >= V2_LIMITS.maxGapRounds) return { next: 'synthesize', reason: 'rounds' }
  if (s.newFindings < V2_LIMITS.minNewFindings) return { next: 'synthesize', reason: 'diminishing' }
  if (!s.coverage.some(c => c.status !== 'covered')) return { next: 'synthesize', reason: 'covered' }
  return { next: 'research', reason: 'research' }
}

/**
 * The parts of the question that no heading of the report names (a part is named when a heading shares a term with it, see termScores).
 * Structural coverage only: a heading that names a part does not prove the section answers it. Pure.
 */
export function missingParts(parts: readonly string[], headings: readonly string[]): string[] {
  const hs = headings.map(title => ({ title }))
  return parts.filter(p => !hs.length || Math.max(0, ...termScores(p, hs)) < 1)
}

/** The findings that speak most to one part: those sharing the most terms with it (figures first among equals), at most `n`; none sharing a term are left out. Pure. */
export function findingsForPart(part: string, findings: readonly Finding[], n: number): Finding[] {
  const scores = termScores(part, findings.map(f => ({ title: f.text })))
  return findings.map((f, i) => ({ f, s: scores[i] ?? 0 })).filter(x => x.s >= 1)
    .sort((a, b) => b.s - a.s || Number(!!b.f.figure) - Number(!!a.f.figure)).slice(0, n).map(x => x.f)
}
