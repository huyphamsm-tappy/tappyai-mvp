// The engine's side of RESEARCH_CONTRACTS (R13 4.3): one run's assignments, step checks and gap decisions, recorded as counts and codes (never the question or a finding).
// Observational today: a failed check is logged, it does not stop the run (see the top of researchContracts.ts).
import { contractsForPlan, validateAssignment, validateResultForAssignment, validateGapRequest, gapDecisionFor, validateGapDecision, WORK_PACKAGE_RESULT_SCHEMA, type ContractsIssued, type AssignmentContext, type ReserveRefusal, type ResearchGapRequest, type WorkPackageAssignment } from './researchContracts'
import { decideGap, ADVANCED_BOUNDS, ADVANCED_RUN_BOUNDS } from './researchController'
import { fold } from './researchSignals'
import type { ResearchPlan } from './deepResearch'
import type { WorkPackageResult } from './workPackageContract'

/** Initial defaults (R13 asks for benchmarks): measured Advanced runs cost 0.47-0.51 USD with the lead's synthesis ~0.27; the verifier is code, so it reserves nothing. */
export const CONTRACT_BUDGET = { ceilingMicros: 800_000, protectedSynthesisMicros: 300_000, protectedVerifierMicros: 0 } as const

export interface StepCheck { step: number; packageId: string; accepted: boolean; claims: number; rejected: number; issues: string[] }
export interface GapCheck { round: number; requestValid: boolean; status: string; reason: string; decisionValid: boolean; supplemental: string[]; /** the engine does not act on this decision yet */ enforced: false }
export interface ContractsSummary { version: string; assignments: number; assignmentIssues: string[]; steps: StepCheck[]; gaps: GapCheck[]; refused?: ReserveRefusal }

type Step = ResearchPlan['steps'][number]

export function createContractsRun(plan: ResearchPlan, o: { question: string; context: string; lang: string; nowMs: number; deadlineMs: number; ceilingMicros?: number }) {
  const issued: ContractsIssued = contractsForPlan(plan, { ...o, ceilingMicros: o.ceilingMicros ?? CONTRACT_BUDGET.ceilingMicros, protectedSynthesisMicros: CONTRACT_BUDGET.protectedSynthesisMicros, protectedVerifierMicros: CONTRACT_BUDGET.protectedVerifierMicros })
  const assignments: WorkPackageAssignment[] = [...issued.assignments]
  const ids = new Set(assignments.map(a => a.workPackageId))
  const reservations = new Map([...issued.envelopes].map(([, e]) => [e.budgetReservationRef, e.hardBudgetLimitMicros] as const))
  const steps: StepCheck[] = []
  const gaps: GapCheck[] = []
  const seenGaps = new Set<string>()
  const slot = Math.floor(issued.supplementalPoolMicros / (ADVANCED_RUN_BOUNDS.gapRounds * ADVANCED_RUN_BOUNDS.followUpSteps))
  let pool = issued.supplementalPoolMicros
  const ctxOf = (allowed: ReadonlySet<string>, used: ReadonlyMap<string, ReadonlySet<number>>, seal: boolean): AssignmentContext => ({
    researchRequestId: issued.researchRequestId, lockedContextVersion: issued.lockedContextVersion, packageIds: ids, allowedSourcePackRefs: allowed, usedVersions: used, reservations,
    nowMs: o.nowMs, outputSchemaVersions: new Set([WORK_PACKAGE_RESULT_SCHEMA]), requireSourcePack: seal,
  })
  const summaryIssues = (): string[] => [...new Set(issued.validation.flatMap(v => v.issues))]
  return {
    issued,
    /** the step's evidence is gathered and read: seal its source pack (a new assignment version) and check the result built from its kept findings */
    checkStep(k: number, s: { evidenceIds: readonly number[]; allEvidenceIds: readonly number[]; findings: ReadonlyArray<{ source: number; text: string }> }): StepCheck {
      const a = assignments[k]
      const packageId = a?.workPackageId ?? `wp${k + 1}`
      const out = (c: Omit<StepCheck, 'step' | 'packageId'>): StepCheck => { const r = { step: k + 1, packageId, ...c }; steps.push(r); return r }
      if (!a) return out({ accepted: false, claims: 0, rejected: 0, issues: ['NO_ASSIGNMENT'] })
      const sealed: WorkPackageAssignment = { ...a, assignmentVersion: a.assignmentVersion + 1, sourcePackRefs: s.evidenceIds.map(id => `ev:${id}`) }
      const v = validateAssignment(sealed, ctxOf(new Set(s.allEvidenceIds.map(id => `ev:${id}`)), new Map([[a.workPackageId, new Set([a.assignmentVersion])]]), true))
      if (!v.ok) return out({ accepted: false, claims: 0, rejected: 0, issues: v.issues })
      const facts = s.findings.map((_, i) => `fv:${k + 1}.${i + 1}`)
      const result: WorkPackageResult = {
        researchRequestId: a.researchRequestId, workPackageId: a.workPackageId, assignmentVersion: sealed.assignmentVersion, executionAttemptId: `ex:${a.workPackageId}:1`, status: 'SUCCEEDED',
        extractedClaims: s.findings.map((f, i) => ({ claimId: `c${i + 1}`, statement: f.text, claimType: 'finding', supportingFactVersionIds: [facts[i]!], uncertainty: 'MEDIUM' as const })),
        factVersionRefs: facts, evidenceRefs: [...new Set(s.findings.map(f => `ev:${f.source}`))], evidenceConflicts: [], dataGaps: [], summaryFindings: '', limitations: [], completedAt: new Date(o.nowMs).toISOString(),
      }
      const r = validateResultForAssignment(result, sealed, { lockedContextVersion: issued.lockedContextVersion, factVersionIds: new Set(facts) })
      return out({ accepted: r.accepted, claims: r.acceptedClaims.length, rejected: r.rejectedClaimIds.length, issues: r.issues })
    },
    /** a gap round asked for follow-up steps: check the request, decide it as the Controller would, and issue supplemental assignments for what is approved */
    checkGap(g: { round: number; plan: ResearchPlan; more: readonly Step[] }): GapCheck {
      const base = g.plan.steps.filter(s => !s.completes)
      const dimOf = (s: Step) => (s.completes ? g.plan.steps[s.completes - 1]?.title : undefined) ?? s.title
      const required = g.plan.parts?.length ? [...g.plan.parts, ...base.map(s => s.title)] : base.map(s => s.title)
      const req: ResearchGapRequest = {
        researchRequestId: issued.researchRequestId, gapRequestId: `gap:${g.round + 1}:${seenGaps.size + 1}`, requestedBy: 'SONNET_ADVANCED_LEAD', rationaleCode: 'GAP_CHECK',
        missingDimensions: g.more.map(dimOf), affectedWorkPackageIds: [...new Set(g.more.flatMap(s => (s.completes ? [`wp${s.completes}`] : [])))].filter(id => ids.has(id)),
        requiredEvidenceTypes: [], suggestedQueries: g.more.flatMap(s => s.queries), urgency: 'OPTIONAL', expectedResolutionCriteria: g.more.map(s => `findings for: ${s.title}`),
      }
      const rv = validateGapRequest(req, { researchRequestId: issued.researchRequestId, packageIds: ids, seenGapRequestIds: seenGaps })
      seenGaps.add(req.gapRequestId)
      const d = decideGap({ dimensions: req.missingDimensions, acceptance: req.expectedResolutionCriteria }, { tier: 'ADVANCED_RESEARCH_REPORT', roundsUsed: g.round, requiredDimensions: required, active: true, canReserve: slot > 0 && pool >= slot })
      const approvedSteps = d.decision === 'DENIED' ? [] : g.more.filter(s => d.approved.some(x => fold(x) === fold(dimOf(s)))).slice(0, Math.floor(pool / Math.max(slot, 1)))
      const first = g.plan.steps.length
      const newIds = approvedSteps.map(s => `wp${first + g.more.indexOf(s) + 1}`)
      const refs = newIds.map(id => `res:${id}`)
      const decision = gapDecisionFor(req, d, { lockedContextVersion: issued.lockedContextVersion, decisionId: `dec:${req.gapRequestId}`, evaluatedAt: new Date(o.nowMs).toISOString(), supplementalWorkPackageIds: newIds, budgetReservationRefs: refs })
      const dv = validateGapDecision(decision, req, issued.lockedContextVersion)
      const issuedIds: string[] = []
      if (decision.decisionStatus !== 'DENIED') {
        approvedSteps.forEach((s, i) => {
          const id = newIds[i]!
          pool -= slot; reservations.set(refs[i]!, slot); ids.add(id)
          const a: WorkPackageAssignment = { researchRequestId: issued.researchRequestId, workPackageId: id, assignmentVersion: 1, dimensionName: s.title, objective: s.title, targetEntityIds: [], sourcePackRefs: [], lockedContextVersion: issued.lockedContextVersion, dependencyWorkPackageIds: [], criticality: 'SUPPLEMENTAL', acceptanceCriteria: [`findings for: ${s.title}`], expectedOutputSchemaVersion: WORK_PACKAGE_RESULT_SCHEMA, budgetReservationRef: refs[i]!, deadlineAt: issued.assignments[0]?.deadlineAt ?? new Date(o.nowMs).toISOString() }
          if (validateAssignment(a, ctxOf(new Set(), new Map(), false)).ok) { assignments.push(a); issuedIds.push(id) }
        })
      }
      const r: GapCheck = { round: g.round + 1, requestValid: rv.ok, status: decision.decisionStatus, reason: decision.reasonCode, decisionValid: dv.ok, supplemental: issuedIds, enforced: false }
      gaps.push(r)
      return r
    },
    summary(): ContractsSummary { return { version: 'research-contracts.v1', assignments: assignments.length, assignmentIssues: summaryIssues(), steps, gaps, ...(issued.refused ? { refused: issued.refused } : {}) } },
  }
}
export type ContractsRun = ReturnType<typeof createContractsRun>
export { ADVANCED_BOUNDS }
