// Work packages with a brief (11/11, after Anthropic's account of its multi-agent research system: a vague task makes workers repeat each other's searches, so every task carries an objective,
// an output format, guidance on sources and a boundary; and after the 11/11 trend report, where sections repeated the same store counts). Pure and deterministic. Behind RESEARCH_PACKAGES
// (deepResearchState.ts), off by default, locked in production. A plan step IS a package here; the plan call writes the four parts, this file holds what the code does with them:
//   briefText()       - the brief as the reader of that step is given it (and the search's focus);
//   dedupePackages()  - a package that asks what an earlier one asks is merged into it (its new queries folded in): the repeat is read once, nothing it would have searched is lost.

import type { ResearchPlan, StepBrief } from './deepResearch'
import { fold } from './researchSignals'

/** Jaccard overlap above which two packages are the same: of their objectives (their titles when there is no brief), or of their queries. */
export const PACKAGE_OVERLAP = { text: 0.6, queries: 0.7 } as const
/** A package keeps at most this many queries after another one's are folded in. */
export const MAX_PACKAGE_QUERIES = 4

const tokensOf = (s: string): Set<string> => new Set(fold(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2))
function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

/** The output ceiling of the plain plan call when Claude leads (Advanced): a Sonnet plan of 8 to 10 steps comes close to the 3500 the Luna plan call is given, and one plan was cut off at exactly 3500 (11/11). */
export const PLAN_CLAUDE_MAX_TOKENS = 6000
/** The output ceiling of the package plan call: four parts on every step make it far longer than the plain plan's 3500 tokens, which cut it off in the first live run (11/11). */
export const PLAN_PACKAGES_MAX_TOKENS = 9000
/** The package plan is asked first when `packages` is on; if that call fails (cut off, unreadable, refused) the plain plan is asked once, so the flag can never cost the report. A plain failure is the caller's. */
export async function planWithFallback<T>(packages: boolean, ask: (packages: boolean) => Promise<T>): Promise<T> {
  if (!packages) return ask(false)
  try { return await ask(true) } catch { return ask(false) }
}

/** The brief as text for the model that reads this step's sources; empty when the step has none. Pure. */
export function briefText(b: StepBrief | undefined): string {
  if (!b || !b.objective) return ''
  return [`Objective: ${b.objective}`, b.output && `Output: ${b.output}`, b.sources && `Sources: ${b.sources}`, b.boundary && `Boundary: ${b.boundary}`].filter(Boolean).join('\n')
}

export interface MergedPackage { kept: number; dropped: number }

/**
 * Packages that repeat an earlier one are merged into it: the later one is dropped and the queries the earlier does not have are folded in (up to MAX_PACKAGE_QUERIES). Order is kept, the first
 * package of a group stays, and the plan's other fields are untouched. Nothing is merged when no two overlap (the same plan comes back). `kept` / `dropped` are 1-based positions in the input. Pure.
 */
export function dedupePackages(plan: ResearchPlan): { plan: ResearchPlan; merged: MergedPackage[] } {
  type Kept = { step: ResearchPlan['steps'][number]; text: Set<string>; queries: Set<string>; at: number }
  const kept: Kept[] = []
  const merged: MergedPackage[] = []
  plan.steps.forEach((step, j) => {
    const text = tokensOf(step.brief?.objective || step.title)
    const queries = tokensOf(step.queries.join(' '))
    const same = kept.find(k => jaccard(k.text, text) >= PACKAGE_OVERLAP.text || jaccard(k.queries, queries) >= PACKAGE_OVERLAP.queries)
    if (!same) { kept.push({ step, text, queries, at: j + 1 }); return }
    const have = new Set(same.step.queries.map(q => q.toLowerCase()))
    const extra = step.queries.filter(q => !have.has(q.toLowerCase()))
    same.step = { ...same.step, queries: [...same.step.queries, ...extra].slice(0, MAX_PACKAGE_QUERIES) }
    merged.push({ kept: same.at, dropped: j + 1 })
  })
  if (!merged.length) return { plan, merged }
  return { plan: { ...plan, steps: kept.map(k => k.step) }, merged }
}
