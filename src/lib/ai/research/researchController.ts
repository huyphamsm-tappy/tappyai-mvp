// Research Controller (R13 §4.2, "Research Admission and Deterministic Research Controller"). Pure application logic, NOT a model: it never invents findings and never changes the
// user's scope. This slice holds the three rules that must be right before any tier runs:
//   validateTaskGraph()  — is the proposed set of work packages allowed for the admitted tier, and does it still cover every dimension the user asked for?
//   decideGap()          — a ResearchGapRequest is a proposal, not an authorisation: approve, partially approve or deny it (R13 research-gap contract and its invariants).
//   reportStatusOf()     — COMPLETE / PARTIAL / INCOMPLETE / BLOCKED / FAILED, so an unfinished report says so instead of looking finished.
// Policy numbers are INITIAL DEFAULTS (R13 asks for benchmarks before design freeze), versioned in CONTROLLER_POLICY_VERSION. Not wired into the chat route yet.

import { fold } from './researchSignals'
import { STANDARD_BOUNDS, type ResearchTier } from './researchAdmission'

export const CONTROLLER_POLICY_VERSION = 'research-controller.v1'

/** Advanced bounds are the Controller's, applied to Sonnet's proposed graph. */
export const ADVANCED_BOUNDS = { maxWorkPackages: 8, maxGapRounds: 3 } as const

/**
 * What one Advanced run is held to by the engine (runDeepResearch's `bounds`): the plan's own cap plus the parts steps, 3 queries a step, up to ADVANCED_BOUNDS.maxGapRounds gap rounds
 * (each stopped early by the V2 rules: time, diminishing returns, coverage) of up to 4 follow-up steps, and the report checked against the parts of the question and repaired.
 * Dependent stages are served by those sequential gap rounds (a later round's questions come from what the earlier ones found); the engine runs the steps of one round in parallel.
 */
export const ADVANCED_RUN_BOUNDS = { maxSteps: 13, queriesPerStep: 3, gapRounds: ADVANCED_BOUNDS.maxGapRounds, followUpSteps: 4, repairParts: true } as const

export interface WorkPackage {
  id: string
  title: string
  /** the user-required dimension this package serves, in the user's words */
  dimension: string
  dependsOn: readonly string[]
  /** a failed critical package makes the report INCOMPLETE */
  critical: boolean
  acceptance: readonly string[]
}

export type GraphIssue =
  | 'NO_PACKAGES'
  | 'TOO_MANY_PACKAGES'
  | 'DUPLICATE_ID'
  | 'UNKNOWN_DEPENDENCY'
  | 'DEPENDENCY_CYCLE'
  | 'DEPENDENCIES_NOT_ALLOWED_FOR_STANDARD'
  | 'MISSING_ACCEPTANCE_CRITERIA'
  | 'REQUIRED_DIMENSION_UNCOVERED'

export interface GraphValidation { ok: boolean; issues: GraphIssue[]; /** required dimensions no package serves */ uncovered: string[] }

const same = (a: string, b: string) => fold(a) === fold(b)

function hasCycle(packages: readonly WorkPackage[]): boolean {
  const indeg = new Map<string, number>(packages.map(p => [p.id, 0]))
  for (const p of packages) for (const d of p.dependsOn) if (indeg.has(d)) indeg.set(p.id, (indeg.get(p.id) ?? 0) + 1)
  const queue = [...indeg].filter(([, n]) => n === 0).map(([id]) => id)
  let seen = 0
  while (queue.length) {
    const id = queue.shift() as string
    seen++
    for (const p of packages) if (p.dependsOn.includes(id)) { const n = (indeg.get(p.id) ?? 0) - 1; indeg.set(p.id, n); if (n === 0) queue.push(p.id) }
  }
  return seen < packages.length
}

/**
 * Validate a proposed work-package set for the admitted tier. Standard: 1–3 independent packages, no dependencies. Advanced: up to ADVANCED_BOUNDS, ids unique, dependencies exist and
 * form no cycle, every package has acceptance criteria. Both: every dimension the user required is served by some package (the tier never licenses silent omission). Pure.
 */
export function validateTaskGraph(tier: ResearchTier, packages: readonly WorkPackage[], requiredDimensions: readonly string[]): GraphValidation {
  const issues = new Set<GraphIssue>()
  if (packages.length === 0) issues.add('NO_PACKAGES')
  const max = tier === 'STANDARD_REPORT' ? STANDARD_BOUNDS.maxWorkPackages : ADVANCED_BOUNDS.maxWorkPackages
  if (packages.length > max) issues.add('TOO_MANY_PACKAGES')
  const ids = new Set<string>()
  for (const p of packages) { if (ids.has(p.id)) issues.add('DUPLICATE_ID'); ids.add(p.id) }
  for (const p of packages) {
    if (p.acceptance.filter(a => a.trim().length > 0).length === 0) issues.add('MISSING_ACCEPTANCE_CRITERIA')
    if (tier === 'STANDARD_REPORT' && p.dependsOn.length > 0) issues.add('DEPENDENCIES_NOT_ALLOWED_FOR_STANDARD')
    if (p.dependsOn.some(d => !ids.has(d) || d === p.id)) issues.add(p.dependsOn.includes(p.id) ? 'DEPENDENCY_CYCLE' : 'UNKNOWN_DEPENDENCY')
  }
  if (!issues.has('DUPLICATE_ID') && !issues.has('UNKNOWN_DEPENDENCY') && hasCycle(packages)) issues.add('DEPENDENCY_CYCLE')
  const uncovered = requiredDimensions.filter(d => d.trim() && !packages.some(p => same(p.dimension, d)))
  if (uncovered.length > 0) issues.add('REQUIRED_DIMENSION_UNCOVERED')
  return { ok: issues.size === 0, issues: [...issues], uncovered }
}

// ── research-gap decisions ──────────────────────────────────────────────────────────────────────────────────────────────

export interface GapRequest {
  /** dimensions Sonnet (or the Standard pass) says are missing evidence */
  dimensions: readonly string[]
  acceptance: readonly string[]
}

export interface GapContext {
  tier: ResearchTier
  /** supplemental rounds already used in this request */
  roundsUsed: number
  /** the dimensions the user asked for: the original scope */
  requiredDimensions: readonly string[]
  /** is the request still active and bound to the locked Context Version? */
  active: boolean
  /** could the extra billable cost be reserved atomically while keeping the protected synthesis and verification reservations? */
  canReserve: boolean
}

export type GapDenial = 'REQUEST_NOT_ACTIVE' | 'ROUND_LIMIT' | 'OUT_OF_SCOPE' | 'NO_ACCEPTANCE_CRITERIA' | 'RESERVATION_REFUSED'

export type GapDecision =
  | { decision: 'APPROVED'; approved: string[]; denied: []; followUp: 'RETRIEVE_AND_GATE'; policyVersion: string }
  | { decision: 'PARTIALLY_APPROVED'; approved: string[]; denied: string[]; reason: GapDenial; followUp: 'RETRIEVE_AND_GATE'; policyVersion: string }
  | { decision: 'DENIED'; approved: []; denied: string[]; reason: GapDenial; followUp: 'NO_FURTHER_RETRIEVAL'; policyVersion: string }

const maxRounds = (tier: ResearchTier) => (tier === 'STANDARD_REPORT' ? STANDARD_BOUNDS.supplementalPasses : ADVANCED_BOUNDS.maxGapRounds)

/**
 * Decide a gap request. A request is a proposal. Invariants (R13): DENIED means no further retrieval and a reason; APPROVED authorises at least one dimension; a dimension outside the
 * user's original scope is never approved (that needs a new user-authorised request); nothing is approved unless the cost can be reserved. Pure.
 */
export function decideGap(req: GapRequest, ctx: GapContext): GapDecision {
  const policyVersion = CONTROLLER_POLICY_VERSION
  const asked = [...new Set(req.dimensions.map(d => d.trim()).filter(Boolean))]
  const deny = (reason: GapDenial): GapDecision => ({ decision: 'DENIED', approved: [], denied: asked, reason, followUp: 'NO_FURTHER_RETRIEVAL', policyVersion })
  if (!ctx.active) return deny('REQUEST_NOT_ACTIVE')
  if (ctx.roundsUsed >= maxRounds(ctx.tier)) return deny('ROUND_LIMIT')
  if (req.acceptance.filter(a => a.trim()).length === 0) return deny('NO_ACCEPTANCE_CRITERIA')
  const inScope = asked.filter(d => ctx.requiredDimensions.some(r => same(r, d)))
  const outOfScope = asked.filter(d => !inScope.includes(d))
  if (inScope.length === 0) return deny('OUT_OF_SCOPE')
  if (!ctx.canReserve) return deny('RESERVATION_REFUSED')
  if (outOfScope.length > 0) return { decision: 'PARTIALLY_APPROVED', approved: inScope, denied: outOfScope, reason: 'OUT_OF_SCOPE', followUp: 'RETRIEVE_AND_GATE', policyVersion }
  return { decision: 'APPROVED', approved: inScope, denied: [], followUp: 'RETRIEVE_AND_GATE', policyVersion }
}

// ── report status ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type ReportStatus = 'COMPLETE' | 'PARTIAL' | 'INCOMPLETE' | 'BLOCKED' | 'FAILED'

export interface RunOutcome {
  requiredDimensions: readonly string[]
  /** dimensions whose package finished and passed validation */
  covered: readonly string[]
  /** dimensions of packages that were critical and failed or were dropped */
  criticalFailed: readonly string[]
  /** stopped by policy, safety or an authorisation refusal before a report could exist */
  blocked: boolean
  /** a technical failure with nothing usable */
  failed: boolean
}

/**
 * COMPLETE: every required dimension covered and no critical failure. PARTIAL: a usable report, but some non-critical dimension is missing (the report must list it as a limitation).
 * INCOMPLETE: a critical dimension failed, or nothing was covered. BLOCKED and FAILED come first. Pure.
 */
export function reportStatusOf(o: RunOutcome): ReportStatus {
  if (o.failed) return 'FAILED'
  if (o.blocked) return 'BLOCKED'
  const required = o.requiredDimensions.filter(d => d.trim())
  const covered = required.filter(d => o.covered.some(c => same(c, d)))
  if (o.criticalFailed.length > 0 || covered.length === 0) return 'INCOMPLETE'
  return covered.length === required.length ? 'COMPLETE' : 'PARTIAL'
}

/** The dimensions a PARTIAL or INCOMPLETE report must name as limitations. */
export function limitationsOf(o: Pick<RunOutcome, 'requiredDimensions' | 'covered'>): string[] {
  return o.requiredDimensions.filter(d => d.trim() && !o.covered.some(c => same(c, d)))
}
