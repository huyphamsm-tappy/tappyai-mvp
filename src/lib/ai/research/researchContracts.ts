// R13 4.3 "Orchestration contract" objects and their deterministic validators (flag RESEARCH_CONTRACTS, deepResearchState.ts). Pure: no model, no clock (callers pass `nowMs`), no I/O.
//
//   WorkPackageAssignment   what the Controller issues: identity, version, the locked Context Version, the source pack, acceptance criteria, the budget reservation, the deadline
//   WorkPackageResult       (workPackageContract.ts) a model's answer, untrusted until validateResultForAssignment()
//   ResearchGapRequest      a PROPOSAL from the lead; ResearchGapDecision is the Controller's one authoritative answer (gapDecisionFor wraps decideGap, researchController.ts)
//   BudgetExtensionRequest  a proposal to spend more; only the Controller approves, and approval needs a new reservation
//   reserveBudgets          the protected reservations (lead synthesis, verifier) come first; workers share what is left BY WEIGHT, never equally
//
// What the engine does with them today (deepResearch.ts, behind the flag): it issues an assignment per plan step, checks the result built from the step's kept findings against it, and checks every
// gap round; the outcome goes to the run's log. It does not yet stop a run on a failed check, because the notes step returns findings, not the model-issued claims these validators were written
// for. NOT built here: TokenExecutionLimits on the envelope, durable assignment state (R13 9.x), the Controller's budget-extension decision, criticality-based failure policy.

import { validateWorkPackageResult, type AssignmentScope, type ResultIssue, type ResultValidation } from './workPackageContract'
import { CONTROLLER_POLICY_VERSION, type GapDecision } from './researchController'
import type { ResearchPlan } from './deepResearch'

export const CONTRACTS_VERSION = 'research-contracts.v1'
export const WORK_PACKAGE_RESULT_SCHEMA = 'work-package-result.v1'
export const PRICING_POLICY_VERSION = 'pricing.initial-default'

const str = (v: unknown): v is string => typeof v === 'string'
const filled = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(str)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// ── assignment ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type WorkPackageCriticality = 'CRITICAL' | 'REQUIRED' | 'SUPPLEMENTAL'
const CRITICALITIES: readonly WorkPackageCriticality[] = ['CRITICAL', 'REQUIRED', 'SUPPLEMENTAL']

export interface AssignmentBudgetEnvelope {
  budgetReservationRef: string
  estimatedInputTokens: number
  estimatedOutputTokens: number
  softBudgetTargetMicros: number
  hardBudgetLimitMicros: number
  pricingPolicyVersion: string
  deadlineAt: string
}

export interface WorkPackageAssignment {
  researchRequestId: string
  workPackageId: string
  assignmentVersion: number
  dimensionName: string
  objective: string
  targetEntityIds: string[]
  sourcePackRefs: string[]
  lockedContextVersion: string
  dependencyWorkPackageIds: string[]
  criticality: WorkPackageCriticality
  acceptanceCriteria: string[]
  expectedOutputSchemaVersion: string
  budgetReservationRef: string
  deadlineAt: string
}

export interface AssignmentContext {
  researchRequestId: string
  /** the Context Version locked for this request */
  lockedContextVersion: string
  /** every package id of the task graph */
  packageIds: ReadonlySet<string>
  /** the evidence the Controller authorised for source packs */
  allowedSourcePackRefs: ReadonlySet<string>
  /** assignment versions already issued, per package */
  usedVersions: ReadonlyMap<string, ReadonlySet<number>>
  /** reservation ref to the hard limit reserved (micro-USD) */
  reservations: ReadonlyMap<string, number>
  nowMs: number
  outputSchemaVersions: ReadonlySet<string>
  /** true once the source pack is sealed: an empty pack is then a failure, before that it is just not built yet */
  requireSourcePack?: boolean
}

export type AssignmentIssue =
  | 'MALFORMED' | 'WRONG_REQUEST' | 'WRONG_CONTEXT_VERSION' | 'BAD_ASSIGNMENT_VERSION' | 'DUPLICATE_ASSIGNMENT_VERSION' | 'SOURCE_PACK_NOT_AUTHORIZED' | 'NO_OBJECTIVE'
  | 'NO_ACCEPTANCE_CRITERIA' | 'UNKNOWN_OUTPUT_SCHEMA' | 'NO_BUDGET_RESERVATION' | 'DEADLINE_PASSED' | 'SELF_DEPENDENCY' | 'UNKNOWN_DEPENDENCY' | 'BAD_CRITICALITY'
export interface Validation<I extends string> { ok: boolean; issues: I[] }

export function parseAssignment(raw: unknown): WorkPackageAssignment | null {
  if (!isObj(raw)) return null
  const a = raw
  if (!filled(a.researchRequestId) || !filled(a.workPackageId) || !Number.isInteger(a.assignmentVersion) || !str(a.dimensionName) || !str(a.objective) || !strs(a.targetEntityIds) || !strs(a.sourcePackRefs)) return null
  if (!filled(a.lockedContextVersion) || !strs(a.dependencyWorkPackageIds) || !strs(a.acceptanceCriteria) || !str(a.expectedOutputSchemaVersion) || !str(a.budgetReservationRef) || !str(a.deadlineAt) || !str(a.criticality)) return null
  return a as unknown as WorkPackageAssignment
}

/** Check an assignment against what the Controller knows: right request, the locked Context Version, a fresh version number, a source pack the Controller authorised, a reservation, a deadline ahead. Never throws. */
export function validateAssignment(raw: unknown, ctx: AssignmentContext): Validation<AssignmentIssue> {
  const a = parseAssignment(raw)
  if (!a) return { ok: false, issues: ['MALFORMED'] }
  const issues = new Set<AssignmentIssue>()
  if (a.researchRequestId !== ctx.researchRequestId) issues.add('WRONG_REQUEST')
  if (a.lockedContextVersion !== ctx.lockedContextVersion) issues.add('WRONG_CONTEXT_VERSION')
  if (a.assignmentVersion < 1) issues.add('BAD_ASSIGNMENT_VERSION')
  else if (ctx.usedVersions.get(a.workPackageId)?.has(a.assignmentVersion)) issues.add('DUPLICATE_ASSIGNMENT_VERSION')
  if (a.sourcePackRefs.some(r => !ctx.allowedSourcePackRefs.has(r)) || (ctx.requireSourcePack && a.sourcePackRefs.length === 0)) issues.add('SOURCE_PACK_NOT_AUTHORIZED')
  if (!filled(a.objective)) issues.add('NO_OBJECTIVE')
  if (a.acceptanceCriteria.filter(filled).length === 0) issues.add('NO_ACCEPTANCE_CRITERIA')
  if (!ctx.outputSchemaVersions.has(a.expectedOutputSchemaVersion)) issues.add('UNKNOWN_OUTPUT_SCHEMA')
  if (!((ctx.reservations.get(a.budgetReservationRef) ?? 0) > 0)) issues.add('NO_BUDGET_RESERVATION')
  const due = Date.parse(a.deadlineAt)
  if (!Number.isFinite(due) || due <= ctx.nowMs) issues.add('DEADLINE_PASSED')
  if (a.dependencyWorkPackageIds.includes(a.workPackageId)) issues.add('SELF_DEPENDENCY')
  else if (a.dependencyWorkPackageIds.some(d => !ctx.packageIds.has(d))) issues.add('UNKNOWN_DEPENDENCY')
  if (!CRITICALITIES.includes(a.criticality)) issues.add('BAD_CRITICALITY')
  return { ok: issues.size === 0, issues: [...issues] }
}

// ── result bound to its assignment ──────────────────────────────────────────────────────────────────────────────────────

export type ResultContractIssue = ResultIssue | 'WRONG_CONTEXT_VERSION'
export type ContractResultValidation = Omit<ResultValidation, 'issues'> & { issues: ResultContractIssue[] }

/**
 * validateWorkPackageResult with the assignment as the scope, plus two rules of the contract: an assignment locked to another Context Version is not valid here (nothing is accepted), and an
 * evidence reference outside the source pack rejects the WHOLE result (an unbound reference taints the answer; a claim on an unknown fact version only costs that claim). Pure.
 */
export function validateResultForAssignment(raw: unknown, a: WorkPackageAssignment, o: { lockedContextVersion: string; factVersionIds: ReadonlySet<string> }): ContractResultValidation {
  if (a.lockedContextVersion !== o.lockedContextVersion) return { accepted: false, issues: ['WRONG_CONTEXT_VERSION'], acceptedClaims: [], rejectedClaimIds: [] }
  const scope: AssignmentScope = { researchRequestId: a.researchRequestId, workPackageId: a.workPackageId, assignmentVersion: a.assignmentVersion, allowedFactVersionIds: o.factVersionIds, allowedEvidenceRefs: new Set(a.sourcePackRefs) }
  const v = validateWorkPackageResult(raw, scope)
  if (v.issues.includes('EVIDENCE_OUTSIDE_SOURCE_PACK')) return { accepted: false, issues: v.issues, acceptedClaims: [], rejectedClaimIds: v.rejectedClaimIds }
  return v
}

// ── gap request and decision ────────────────────────────────────────────────────────────────────────────────────────────

export interface ResearchGapRequest {
  researchRequestId: string
  gapRequestId: string
  requestedBy: 'SONNET_ADVANCED_LEAD'
  rationaleCode: string
  missingDimensions: string[]
  affectedWorkPackageIds: string[]
  requiredEvidenceTypes: string[]
  suggestedQueries: string[]
  urgency: 'BLOCKING' | 'OPTIONAL'
  expectedResolutionCriteria: string[]
}
export type GapRequestIssue = 'MALFORMED' | 'WRONG_REQUEST' | 'NO_GAP_REQUEST_ID' | 'DUPLICATE_GAP_REQUEST' | 'BAD_REQUESTER' | 'NO_RATIONALE' | 'NO_MISSING_DIMENSIONS' | 'UNKNOWN_AFFECTED_PACKAGE' | 'BAD_URGENCY' | 'NO_RESOLUTION_CRITERIA'

/** Shape and identity of a gap request. Whether it is IN SCOPE, within the round limit and affordable is decideGap's call, not this one. Never throws. */
export function validateGapRequest(raw: unknown, o: { researchRequestId: string; packageIds: ReadonlySet<string>; seenGapRequestIds: ReadonlySet<string> }): Validation<GapRequestIssue> {
  if (!isObj(raw)) return { ok: false, issues: ['MALFORMED'] }
  const g = raw
  if (!str(g.researchRequestId) || !str(g.gapRequestId) || !str(g.requestedBy) || !str(g.rationaleCode) || !str(g.urgency) || !strs(g.missingDimensions) || !strs(g.affectedWorkPackageIds) || !strs(g.requiredEvidenceTypes) || !strs(g.suggestedQueries) || !strs(g.expectedResolutionCriteria)) return { ok: false, issues: ['MALFORMED'] }
  if (g.gapRequestId && o.seenGapRequestIds.has(g.gapRequestId)) return { ok: false, issues: ['DUPLICATE_GAP_REQUEST'] }
  const issues = new Set<GapRequestIssue>()
  if (g.researchRequestId !== o.researchRequestId) issues.add('WRONG_REQUEST')
  if (!filled(g.gapRequestId)) issues.add('NO_GAP_REQUEST_ID')
  if (g.requestedBy !== 'SONNET_ADVANCED_LEAD') issues.add('BAD_REQUESTER')
  if (!filled(g.rationaleCode)) issues.add('NO_RATIONALE')
  if (g.missingDimensions.filter(filled).length === 0) issues.add('NO_MISSING_DIMENSIONS')
  if (g.affectedWorkPackageIds.some(id => !o.packageIds.has(id))) issues.add('UNKNOWN_AFFECTED_PACKAGE')
  if (g.urgency !== 'BLOCKING' && g.urgency !== 'OPTIONAL') issues.add('BAD_URGENCY')
  if (g.expectedResolutionCriteria.filter(filled).length === 0) issues.add('NO_RESOLUTION_CRITERIA')
  return { ok: issues.size === 0, issues: [...issues] }
}

export type ResearchGapDecisionStatus = 'APPROVED' | 'PARTIALLY_APPROVED' | 'DENIED'
export type ResearchGapResolutionAction = 'DISPATCH_SUPPLEMENTAL_HAIKU_WORK_PACKAGE' | 'ATTACH_VERIFIED_EVIDENCE_PACKET' | 'NO_FURTHER_RETRIEVAL'
export interface ResearchGapDecision {
  researchRequestId: string
  gapRequestId: string
  decisionId: string
  lockedContextVersion: string
  decisionStatus: ResearchGapDecisionStatus
  action: ResearchGapResolutionAction
  authorizedSupplementalRetrievalRefs: string[]
  supplementalWorkPackageIds: string[]
  verifiedEvidencePacketRefs: string[]
  budgetReservationRefs: string[]
  reasonCode: string
  evaluatedAt: string
  controllerPolicyVersion: string
}

/**
 * The Controller's decision on a gap request, from decideGap's answer. Nothing is dispatched before the cost is reserved: an approval that arrives with no supplemental package or no reservation
 * becomes a DENIED / RESERVATION_REFUSED (R13 17.6: "no supplemental retrieval is executed before Controller authorization and atomic reservation"). Pure.
 */
export function gapDecisionFor(req: ResearchGapRequest, d: GapDecision, o: { lockedContextVersion: string; decisionId: string; evaluatedAt: string; supplementalWorkPackageIds: readonly string[]; budgetReservationRefs: readonly string[] }): ResearchGapDecision {
  const common = { researchRequestId: req.researchRequestId, gapRequestId: req.gapRequestId, decisionId: o.decisionId, lockedContextVersion: o.lockedContextVersion, evaluatedAt: o.evaluatedAt, controllerPolicyVersion: d.policyVersion ?? CONTROLLER_POLICY_VERSION }
  const denied = (reasonCode: string): ResearchGapDecision => ({ ...common, decisionStatus: 'DENIED', action: 'NO_FURTHER_RETRIEVAL', authorizedSupplementalRetrievalRefs: [], supplementalWorkPackageIds: [], verifiedEvidencePacketRefs: [], budgetReservationRefs: [], reasonCode })
  if (d.decision === 'DENIED') return denied(d.reason)
  if (o.supplementalWorkPackageIds.length === 0 || o.budgetReservationRefs.length === 0) return denied('RESERVATION_REFUSED')
  return {
    ...common, decisionStatus: d.decision, action: 'DISPATCH_SUPPLEMENTAL_HAIKU_WORK_PACKAGE',
    authorizedSupplementalRetrievalRefs: o.supplementalWorkPackageIds.map(id => `auth:${req.gapRequestId}:${id}`),
    supplementalWorkPackageIds: [...o.supplementalWorkPackageIds], verifiedEvidencePacketRefs: [], budgetReservationRefs: [...o.budgetReservationRefs],
    reasonCode: d.decision === 'APPROVED' ? 'APPROVED' : d.reason,
  }
}

export type GapDecisionIssue = 'WRONG_REQUEST' | 'WRONG_GAP_REQUEST' | 'WRONG_CONTEXT_VERSION' | 'NO_REASON' | 'ACTION_STATUS_MISMATCH' | 'DENIED_WITH_DISPATCH' | 'DISPATCH_WITHOUT_PACKAGE' | 'DISPATCH_WITHOUT_RESERVATION'

/** The decision/action/reference combinations R13 forbids, and the binding of the decision to its request and to the locked Context Version. Pure. */
export function validateGapDecision(d: ResearchGapDecision, req: ResearchGapRequest, lockedContextVersion: string): Validation<GapDecisionIssue> {
  const issues = new Set<GapDecisionIssue>()
  if (d.researchRequestId !== req.researchRequestId) issues.add('WRONG_REQUEST')
  if (d.gapRequestId !== req.gapRequestId) issues.add('WRONG_GAP_REQUEST')
  if (d.lockedContextVersion !== lockedContextVersion) issues.add('WRONG_CONTEXT_VERSION')
  if (!filled(d.reasonCode)) issues.add('NO_REASON')
  const dispatch = d.action === 'DISPATCH_SUPPLEMENTAL_HAIKU_WORK_PACKAGE'
  if (d.decisionStatus === 'DENIED' ? d.action !== 'NO_FURTHER_RETRIEVAL' : d.action === 'NO_FURTHER_RETRIEVAL') issues.add('ACTION_STATUS_MISMATCH')
  if (d.decisionStatus === 'DENIED' && (d.supplementalWorkPackageIds.length > 0 || d.budgetReservationRefs.length > 0 || d.authorizedSupplementalRetrievalRefs.length > 0)) issues.add('DENIED_WITH_DISPATCH')
  if (dispatch && d.supplementalWorkPackageIds.length === 0) issues.add('DISPATCH_WITHOUT_PACKAGE')
  if (dispatch && d.budgetReservationRefs.length === 0) issues.add('DISPATCH_WITHOUT_RESERVATION')
  return { ok: issues.size === 0, issues: [...issues] }
}

// ── budget ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface BudgetExtensionRequest {
  requestId: string
  assignmentId: string
  workPackageId?: string
  currentBudgetReservationRef: string
  currentActualUsageMicros: number
  remainingTask: string
  reasonCode: string
  additionalInputTokensEstimate: number
  additionalOutputTokensEstimate: number
  additionalCostEstimateMicros: number
  expectedQualityImpactIfDenied: string
  deadlineAt: string
}
export type BudgetExtensionIssue = 'MALFORMED' | 'DUPLICATE_REQUEST' | 'UNKNOWN_ASSIGNMENT' | 'RESERVATION_MISMATCH' | 'PACKAGE_MISMATCH' | 'NEGATIVE_OR_NON_NUMERIC_AMOUNT' | 'NO_REMAINING_TASK' | 'NO_REASON' | 'EXCEEDS_REQUEST_CEILING'

/** Shape and identity of an extension request, and whether the extra cost fits under what is left of the request's ceiling. The approval itself (a new reservation) is the Controller's, not built here. Never throws. */
export function validateBudgetExtension(raw: unknown, o: { assignments: ReadonlyMap<string, { reservationRef: string; workPackageId: string }>; remainingCeilingMicros: number; seenRequestIds: ReadonlySet<string> }): Validation<BudgetExtensionIssue> {
  if (!isObj(raw)) return { ok: false, issues: ['MALFORMED'] }
  const r = raw
  const nums = [r.currentActualUsageMicros, r.additionalInputTokensEstimate, r.additionalOutputTokensEstimate, r.additionalCostEstimateMicros]
  if (!str(r.requestId) || !str(r.assignmentId) || !str(r.currentBudgetReservationRef) || !str(r.remainingTask) || !str(r.reasonCode) || !str(r.expectedQualityImpactIfDenied) || !str(r.deadlineAt) || (r.workPackageId !== undefined && !str(r.workPackageId))) return { ok: false, issues: ['MALFORMED'] }
  if (o.seenRequestIds.has(r.requestId)) return { ok: false, issues: ['DUPLICATE_REQUEST'] }
  const issues = new Set<BudgetExtensionIssue>()
  const known = o.assignments.get(r.assignmentId)
  if (!known) issues.add('UNKNOWN_ASSIGNMENT')
  else {
    if (known.reservationRef !== r.currentBudgetReservationRef) issues.add('RESERVATION_MISMATCH')
    if (r.workPackageId !== undefined && r.workPackageId !== known.workPackageId) issues.add('PACKAGE_MISMATCH')
  }
  if (nums.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) issues.add('NEGATIVE_OR_NON_NUMERIC_AMOUNT')
  else if ((r.additionalCostEstimateMicros as number) > o.remainingCeilingMicros) issues.add('EXCEEDS_REQUEST_CEILING')
  if (!filled(r.remainingTask)) issues.add('NO_REMAINING_TASK')
  if (!filled(r.reasonCode)) issues.add('NO_REASON')
  return { ok: issues.size === 0, issues: [...issues] }
}

export interface ReserveInput {
  /** the request's hard ceiling, in micro-USD (1 USD = 1 000 000) */
  ceilingMicros: number
  protectedSynthesisMicros: number
  protectedVerifierMicros: number
  /** the share of what is left for workers that is held back for supplemental (gap-round) packages */
  supplementalShare: number
  pricingPolicyVersion: string
  deadlineAt: string
  packages: ReadonlyArray<{ id: string; weight: number }>
}
export type ReserveRefusal = 'NO_PACKAGES' | 'PROTECTED_EXCEEDS_CEILING' | 'NO_ROOM_FOR_WORKERS'
export type ReserveResult =
  | { ok: true; protectedRefs: { synthesis: string; verifier: string }; envelopes: Map<string, AssignmentBudgetEnvelope>; supplementalPoolMicros: number }
  | { ok: false; reason: ReserveRefusal }

/** Initial defaults (R13 asks for benchmarks before freeze): tokens an envelope is estimated from, per unit of weight. */
const TOKENS_PER_WEIGHT = { input: 4000, output: 1200 } as const
const SOFT_TARGET = 0.8

/**
 * R13 "Budget quality protection": the protected reservations (lead synthesis, independent verifier) are taken from the ceiling FIRST; the workers divide only what remains, in proportion to their
 * weight (not equally); a share of that is held for supplemental packages. The sum of everything reserved never passes the ceiling, so a worker that exhausts its own envelope cannot reach the protected
 * ones. Refuses up front when the ceiling cannot hold the protected reservations or leaves nothing for workers. Pure and integer (micro-USD, rounded down).
 */
export function reserveBudgets(i: ReserveInput): ReserveResult {
  const packages = i.packages.filter(p => p.weight > 0)
  if (packages.length === 0) return { ok: false, reason: 'NO_PACKAGES' }
  const protectedTotal = i.protectedSynthesisMicros + i.protectedVerifierMicros
  if (protectedTotal > i.ceilingMicros) return { ok: false, reason: 'PROTECTED_EXCEEDS_CEILING' }
  const workers = i.ceilingMicros - protectedTotal
  if (workers <= 0) return { ok: false, reason: 'NO_ROOM_FOR_WORKERS' }
  const supplementalPoolMicros = Math.floor(workers * Math.min(Math.max(i.supplementalShare, 0), 0.9))
  const base = workers - supplementalPoolMicros
  const total = packages.reduce((n, p) => n + p.weight, 0)
  const envelopes = new Map<string, AssignmentBudgetEnvelope>()
  for (const p of packages) {
    const hard = Math.floor(base * p.weight / total)
    envelopes.set(p.id, {
      budgetReservationRef: `res:${p.id}`, estimatedInputTokens: Math.round(TOKENS_PER_WEIGHT.input * p.weight), estimatedOutputTokens: Math.round(TOKENS_PER_WEIGHT.output * p.weight),
      softBudgetTargetMicros: Math.floor(hard * SOFT_TARGET), hardBudgetLimitMicros: hard, pricingPolicyVersion: i.pricingPolicyVersion, deadlineAt: i.deadlineAt,
    })
  }
  return { ok: true, protectedRefs: { synthesis: 'res:protected-synthesis', verifier: 'res:protected-verifier' }, envelopes, supplementalPoolMicros }
}

// ── what the engine issues ──────────────────────────────────────────────────────────────────────────────────────────────

/** A short digest for ids (not a security measure): two 32-bit mixes (cyrb53 style) to 12 hex characters. Pure JS on purpose: this file is reachable from the client bundle (deepResearch.ts is imported by ChatInterface), where `node:crypto` does not exist. */
const fnv = (s: string): string => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return ((h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')).slice(0, 12)
}
/** The Context Version of one request: a digest of what the plan was written from (the question, the conversation and its language). Same input, same version. */
export const lockedContextVersionOf = (question: string, context: string, lang: string): string => `ctxv:${fnv(JSON.stringify([question, context, lang]))}`
export const researchRequestIdOf = (question: string, nowMs: number): string => `rr:${fnv(`${question}|${nowMs}`)}`

export interface ContractsIssued {
  researchRequestId: string
  lockedContextVersion: string
  assignments: WorkPackageAssignment[]
  /** validateAssignment of each assignment, in order */
  validation: Array<Validation<AssignmentIssue>>
  envelopes: Map<string, AssignmentBudgetEnvelope>
  supplementalPoolMicros: number
  /** set when no assignment could be issued: the ceiling does not hold the protected reservations */
  refused?: ReserveRefusal
}

/**
 * One assignment per plan step (a plan step IS a work package here), version 1, all bound to the same locked Context Version, each with its own reservation from reserveBudgets (a step's weight is its
 * number of queries). The planned steps are REQUIRED (the plan call does not rank them: CRITICAL is never inferred), a follow-up step (`completes`) is SUPPLEMENTAL. The source pack is empty until the step's
 * evidence is gathered. Pure.
 */
export function contractsForPlan(plan: ResearchPlan, o: { question: string; context: string; lang: string; nowMs: number; deadlineMs: number; ceilingMicros: number; protectedSynthesisMicros: number; protectedVerifierMicros: number; supplementalShare?: number }): ContractsIssued {
  const researchRequestId = researchRequestIdOf(o.question, o.nowMs)
  const lockedContextVersion = lockedContextVersionOf(o.question, o.context, o.lang)
  const deadlineAt = new Date(o.nowMs + o.deadlineMs).toISOString()
  const ids = plan.steps.map((_, k) => `wp${k + 1}`)
  const weights = plan.steps.map((s, k) => ({ id: ids[k]!, weight: Math.max(1, s.queries.length) }))
  const r = reserveBudgets({ ceilingMicros: o.ceilingMicros, protectedSynthesisMicros: o.protectedSynthesisMicros, protectedVerifierMicros: o.protectedVerifierMicros, supplementalShare: o.supplementalShare ?? 0.2, pricingPolicyVersion: PRICING_POLICY_VERSION, deadlineAt, packages: weights })
  if (!r.ok) return { researchRequestId, lockedContextVersion, assignments: [], validation: [], envelopes: new Map(), supplementalPoolMicros: 0, refused: r.reason }
  const assignments: WorkPackageAssignment[] = plan.steps.map((s, k) => ({
    researchRequestId, workPackageId: ids[k]!, assignmentVersion: 1, dimensionName: s.title, objective: s.brief?.objective?.trim() || s.title, targetEntityIds: [], sourcePackRefs: [], lockedContextVersion,
    dependencyWorkPackageIds: [], criticality: s.completes ? 'SUPPLEMENTAL' : 'REQUIRED',
    acceptanceCriteria: [s.brief?.output?.trim() || `findings for: ${s.title}`], expectedOutputSchemaVersion: WORK_PACKAGE_RESULT_SCHEMA, budgetReservationRef: r.envelopes.get(ids[k]!)!.budgetReservationRef, deadlineAt,
  }))
  const reservations = new Map([...r.envelopes].map(([id, e]) => [e.budgetReservationRef, e.hardBudgetLimitMicros] as const))
  const ctx: AssignmentContext = { researchRequestId, lockedContextVersion, packageIds: new Set(ids), allowedSourcePackRefs: new Set(), usedVersions: new Map(), reservations, nowMs: o.nowMs, outputSchemaVersions: new Set([WORK_PACKAGE_RESULT_SCHEMA]) }
  return { researchRequestId, lockedContextVersion, assignments, validation: assignments.map(a => validateAssignment(a, ctx)), envelopes: r.envelopes, supplementalPoolMicros: r.supplementalPoolMicros }
}
