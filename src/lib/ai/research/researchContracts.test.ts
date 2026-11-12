// R13 4.3 orchestration contract objects and their deterministic validators (RESEARCH_CONTRACTS). 17.5 "Work-package contracts": reject wrong assignment version, wrong locked Context,
// unauthorized source pack, unknown Fact Version and unbound Evidence reference.
import { describe, it, expect } from 'vitest'
import {
  validateAssignment, validateResultForAssignment, validateGapRequest, gapDecisionFor, validateGapDecision, validateBudgetExtension, reserveBudgets, contractsForPlan, lockedContextVersionOf,
  type WorkPackageAssignment, type AssignmentContext, type ResearchGapRequest, type BudgetExtensionRequest,
} from './researchContracts'
import { decideGap, type GapContext } from './researchController'
import type { WorkPackageResult } from './workPackageContract'

const NOW = Date.parse('2026-11-11T10:00:00Z')
const CTX_V = 'ctxv:abc'
const assignment = (o: Partial<WorkPackageAssignment> = {}): WorkPackageAssignment => ({
  researchRequestId: 'rr1', workPackageId: 'wp1', assignmentVersion: 1, dimensionName: 'Giá', objective: 'Giá trung bình một ly', targetEntityIds: [], sourcePackRefs: ['ev:1', 'ev:2'],
  lockedContextVersion: CTX_V, dependencyWorkPackageIds: [], criticality: 'REQUIRED', acceptanceCriteria: ['có giá theo năm'], expectedOutputSchemaVersion: 'work-package-result.v1',
  budgetReservationRef: 'res:wp1', deadlineAt: new Date(NOW + 60_000).toISOString(), ...o,
})
const ctx = (o: Partial<AssignmentContext> = {}): AssignmentContext => ({
  researchRequestId: 'rr1', lockedContextVersion: CTX_V, packageIds: new Set(['wp1', 'wp2']), allowedSourcePackRefs: new Set(['ev:1', 'ev:2', 'ev:3']), usedVersions: new Map(),
  reservations: new Map([['res:wp1', 100_000]]), nowMs: NOW, outputSchemaVersions: new Set(['work-package-result.v1']), ...o,
})

describe('validateAssignment', () => {
  it('a well-formed assignment bound to the locked Context, with a reservation, passes', () => {
    expect(validateAssignment(assignment(), ctx())).toEqual({ ok: true, issues: [] })
  })
  it.each([
    ['WRONG_REQUEST', { researchRequestId: 'rr9' }],
    ['WRONG_CONTEXT_VERSION', { lockedContextVersion: 'ctxv:other' }],
    ['BAD_ASSIGNMENT_VERSION', { assignmentVersion: 0 }],
    ['SOURCE_PACK_NOT_AUTHORIZED', { sourcePackRefs: ['ev:1', 'ev:99'] }],
    ['NO_OBJECTIVE', { objective: '  ' }],
    ['NO_ACCEPTANCE_CRITERIA', { acceptanceCriteria: [' '] }],
    ['UNKNOWN_OUTPUT_SCHEMA', { expectedOutputSchemaVersion: 'v0' }],
    ['NO_BUDGET_RESERVATION', { budgetReservationRef: 'res:none' }],
    ['DEADLINE_PASSED', { deadlineAt: new Date(NOW - 1).toISOString() }],
    ['SELF_DEPENDENCY', { dependencyWorkPackageIds: ['wp1'] }],
    ['UNKNOWN_DEPENDENCY', { dependencyWorkPackageIds: ['wp7'] }],
    ['BAD_CRITICALITY', { criticality: 'MAYBE' as never }],
  ] as const)('%s is refused', (issue, patch) => {
    const v = validateAssignment(assignment(patch as Partial<WorkPackageAssignment>), ctx())
    expect(v.ok).toBe(false)
    expect(v.issues).toContain(issue)
  })
  it('an assignment version already issued for this package is a duplicate', () => {
    const v = validateAssignment(assignment({ assignmentVersion: 2 }), ctx({ usedVersions: new Map([['wp1', new Set([1, 2])]]) }))
    expect(v.issues).toEqual(['DUPLICATE_ASSIGNMENT_VERSION'])
  })
  it('a reservation smaller than nothing (zero) is not a reservation', () => {
    expect(validateAssignment(assignment(), ctx({ reservations: new Map([['res:wp1', 0]]) })).issues).toContain('NO_BUDGET_RESERVATION')
  })
  it('an empty source pack is allowed only before the pack is sealed', () => {
    expect(validateAssignment(assignment({ sourcePackRefs: [] }), ctx()).ok).toBe(true)
    expect(validateAssignment(assignment({ sourcePackRefs: [] }), ctx({ requireSourcePack: true })).issues).toContain('SOURCE_PACK_NOT_AUTHORIZED')
  })
  it('anything that is not an object, or has the wrong field types, is MALFORMED and never throws', () => {
    for (const bad of [null, undefined, 5, 'x', [], { ...assignment(), sourcePackRefs: 'ev:1' }, { ...assignment(), targetEntityIds: [1] }]) expect(validateAssignment(bad, ctx()).issues).toEqual(['MALFORMED'])
  })
})

const result = (o: Partial<WorkPackageResult> = {}): WorkPackageResult => ({
  researchRequestId: 'rr1', workPackageId: 'wp1', assignmentVersion: 1, executionAttemptId: 'ex1', status: 'SUCCEEDED',
  extractedClaims: [{ claimId: 'c1', statement: 'Giá 45.000 đồng', claimType: 'figure', supportingFactVersionIds: ['fv:1.1'], uncertainty: 'LOW' }],
  factVersionRefs: ['fv:1.1'], evidenceRefs: ['ev:1'], evidenceConflicts: [], dataGaps: [], summaryFindings: 's', limitations: [], completedAt: 'x', ...o,
})
const rctx = { lockedContextVersion: CTX_V, factVersionIds: new Set(['fv:1.1', 'fv:1.2']) }

describe('validateResultForAssignment: a result is untrusted until it matches its assignment', () => {
  it('accepted when identity, locked Context, facts and evidence all belong to the assignment', () => {
    const v = validateResultForAssignment(result(), assignment(), rctx)
    expect(v.accepted).toBe(true)
    expect(v.acceptedClaims.map(c => c.claimId)).toEqual(['c1'])
  })
  it('a wrong assignment version is stale', () => {
    expect(validateResultForAssignment(result({ assignmentVersion: 2 }), assignment(), rctx).issues).toContain('STALE_ASSIGNMENT_VERSION')
  })
  it('an assignment locked to another Context is not valid under this one: nothing is accepted', () => {
    const v = validateResultForAssignment(result(), assignment({ lockedContextVersion: 'ctxv:old' }), rctx)
    expect(v.accepted).toBe(false); expect(v.acceptedClaims).toEqual([]); expect(v.issues).toContain('WRONG_CONTEXT_VERSION')
  })
  it('an evidence reference outside the source pack rejects the whole result (unbound evidence)', () => {
    const v = validateResultForAssignment(result({ evidenceRefs: ['ev:1', 'ev:7'] }), assignment(), rctx)
    expect(v.accepted).toBe(false); expect(v.acceptedClaims).toEqual([]); expect(v.issues).toContain('EVIDENCE_OUTSIDE_SOURCE_PACK')
  })
  it('a claim on a fact version the Controller never issued is rejected, the others stay', () => {
    const r = result({
      extractedClaims: [
        { claimId: 'c1', statement: 'a', claimType: 'figure', supportingFactVersionIds: ['fv:1.1'], uncertainty: 'LOW' },
        { claimId: 'c2', statement: 'b', claimType: 'figure', supportingFactVersionIds: ['fv:9.9'], uncertainty: 'LOW' },
      ], factVersionRefs: ['fv:1.1', 'fv:9.9'],
    })
    const v = validateResultForAssignment(r, assignment(), rctx)
    expect(v.acceptedClaims.map(c => c.claimId)).toEqual(['c1']); expect(v.rejectedClaimIds).toEqual(['c2']); expect(v.issues).toContain('FACT_OUTSIDE_SOURCE_PACK')
  })
  it('a claim with no supporting fact version is rejected; a malformed result is MALFORMED', () => {
    const none = result({ extractedClaims: [{ claimId: 'c1', statement: 'a', claimType: 'figure', supportingFactVersionIds: [], uncertainty: 'LOW' }] })
    expect(validateResultForAssignment(none, assignment(), rctx).accepted).toBe(false)
    expect(validateResultForAssignment({ nope: 1 }, assignment(), rctx).issues).toEqual(['MALFORMED'])
  })
  it('a FAILED provider answer is never accepted, however good its claims look', () => {
    expect(validateResultForAssignment(result({ status: 'FAILED' }), assignment(), rctx).accepted).toBe(false)
  })
})

const gap = (o: Partial<ResearchGapRequest> = {}): ResearchGapRequest => ({
  researchRequestId: 'rr1', gapRequestId: 'g1', requestedBy: 'SONNET_ADVANCED_LEAD', rationaleCode: 'MISSING_FIGURE', missingDimensions: ['Giá'], affectedWorkPackageIds: ['wp1'],
  requiredEvidenceTypes: ['STATISTIC'], suggestedQueries: ['giá trà sữa 2026'], urgency: 'BLOCKING', expectedResolutionCriteria: ['giá theo quý'], ...o,
})
const gctx = { researchRequestId: 'rr1', packageIds: new Set(['wp1', 'wp2']), seenGapRequestIds: new Set<string>() }

describe('validateGapRequest: a gap request is a proposal with a shape', () => {
  it('a well-formed request passes', () => { expect(validateGapRequest(gap(), gctx)).toEqual({ ok: true, issues: [] }) })
  it.each([
    ['WRONG_REQUEST', { researchRequestId: 'rr9' }],
    ['BAD_REQUESTER', { requestedBy: 'HAIKU_WORKER' as never }],
    ['NO_MISSING_DIMENSIONS', { missingDimensions: [' '] }],
    ['NO_RESOLUTION_CRITERIA', { expectedResolutionCriteria: [] }],
    ['UNKNOWN_AFFECTED_PACKAGE', { affectedWorkPackageIds: ['wp9'] }],
    ['BAD_URGENCY', { urgency: 'SOON' as never }],
    ['NO_RATIONALE', { rationaleCode: '' }],
    ['NO_GAP_REQUEST_ID', { gapRequestId: '' }],
  ] as const)('%s is refused', (issue, patch) => {
    const v = validateGapRequest(gap(patch as Partial<ResearchGapRequest>), gctx)
    expect(v.ok).toBe(false); expect(v.issues).toContain(issue)
  })
  it('a gap request id seen before is a duplicate delivery (idempotent: the earlier decision stands)', () => {
    expect(validateGapRequest(gap(), { ...gctx, seenGapRequestIds: new Set(['g1']) }).issues).toEqual(['DUPLICATE_GAP_REQUEST'])
  })
  it('garbage is MALFORMED', () => { expect(validateGapRequest('x', gctx).issues).toEqual(['MALFORMED']) })
})

const gapCtx = (o: Partial<GapContext> = {}): GapContext => ({ tier: 'ADVANCED_RESEARCH_REPORT', roundsUsed: 0, requiredDimensions: ['Giá', 'Kênh'], active: true, canReserve: true, ...o })
const opts = { lockedContextVersion: CTX_V, decisionId: 'd1', evaluatedAt: 'now', supplementalWorkPackageIds: ['wp9'], budgetReservationRefs: ['res:wp9'] }

describe('gapDecisionFor: exactly one authoritative decision per request, with mandatory references', () => {
  it('approved: dispatches a supplemental package that has an id and a reservation', () => {
    const req = gap()
    const d = gapDecisionFor(req, decideGap({ dimensions: req.missingDimensions, acceptance: req.expectedResolutionCriteria }, gapCtx()), opts)
    expect(d).toMatchObject({ gapRequestId: 'g1', researchRequestId: 'rr1', decisionStatus: 'APPROVED', action: 'DISPATCH_SUPPLEMENTAL_HAIKU_WORK_PACKAGE', lockedContextVersion: CTX_V, supplementalWorkPackageIds: ['wp9'], budgetReservationRefs: ['res:wp9'] })
    expect(validateGapDecision(d, req, CTX_V)).toEqual({ ok: true, issues: [] })
  })
  it('denied: no further retrieval, nothing supplemental and nothing reserved, with a reason', () => {
    const req = gap()
    const d = gapDecisionFor(req, decideGap({ dimensions: req.missingDimensions, acceptance: req.expectedResolutionCriteria }, gapCtx({ roundsUsed: 3 })), opts)
    expect(d).toMatchObject({ decisionStatus: 'DENIED', action: 'NO_FURTHER_RETRIEVAL', reasonCode: 'ROUND_LIMIT', supplementalWorkPackageIds: [], budgetReservationRefs: [], authorizedSupplementalRetrievalRefs: [] })
    expect(validateGapDecision(d, req, CTX_V).ok).toBe(true)
  })
  it('partially approved: only the in-scope dimension is dispatched', () => {
    const req = gap({ missingDimensions: ['Giá', 'Thời tiết'] })
    const d = gapDecisionFor(req, decideGap({ dimensions: req.missingDimensions, acceptance: req.expectedResolutionCriteria }, gapCtx()), opts)
    expect(d.decisionStatus).toBe('PARTIALLY_APPROVED'); expect(d.action).toBe('DISPATCH_SUPPLEMENTAL_HAIKU_WORK_PACKAGE')
  })
  it('an approval with no reservation is not an approval: nothing is dispatched before the cost is reserved', () => {
    const req = gap()
    const approved = decideGap({ dimensions: req.missingDimensions, acceptance: req.expectedResolutionCriteria }, gapCtx())
    const d = gapDecisionFor(req, approved, { ...opts, budgetReservationRefs: [] })
    expect(d.decisionStatus).toBe('DENIED'); expect(d.reasonCode).toBe('RESERVATION_REFUSED'); expect(d.action).toBe('NO_FURTHER_RETRIEVAL')
  })
  it('validateGapDecision refuses the combinations the contract forbids', () => {
    const req = gap()
    const ok = gapDecisionFor(req, decideGap({ dimensions: req.missingDimensions, acceptance: req.expectedResolutionCriteria }, gapCtx()), opts)
    expect(validateGapDecision({ ...ok, decisionStatus: 'DENIED' }, req, CTX_V).issues).toContain('DENIED_WITH_DISPATCH')
    expect(validateGapDecision({ ...ok, budgetReservationRefs: [] }, req, CTX_V).issues).toContain('DISPATCH_WITHOUT_RESERVATION')
    expect(validateGapDecision({ ...ok, supplementalWorkPackageIds: [] }, req, CTX_V).issues).toContain('DISPATCH_WITHOUT_PACKAGE')
    expect(validateGapDecision({ ...ok, lockedContextVersion: 'ctxv:old' }, req, CTX_V).issues).toContain('WRONG_CONTEXT_VERSION')
    expect(validateGapDecision({ ...ok, gapRequestId: 'g2' }, req, CTX_V).issues).toContain('WRONG_GAP_REQUEST')
    expect(validateGapDecision({ ...ok, action: 'NO_FURTHER_RETRIEVAL' }, req, CTX_V).issues).toContain('ACTION_STATUS_MISMATCH')
    expect(validateGapDecision({ ...ok, reasonCode: '' }, req, CTX_V).issues).toContain('NO_REASON')
  })
})

describe('reserveBudgets: protected synthesis first, workers share the rest by weight', () => {
  const base = { ceilingMicros: 1_000_000, protectedSynthesisMicros: 300_000, protectedVerifierMicros: 50_000, supplementalShare: 0.2, pricingPolicyVersion: 'p1', deadlineAt: 'd', packages: [{ id: 'wp1', weight: 3 }, { id: 'wp2', weight: 1 }] }
  it('reserves synthesis and verifier before any worker, and every worker limit sits inside what is left', () => {
    const r = reserveBudgets(base)
    if (!r.ok) throw new Error('refused')
    expect(r.protectedRefs.synthesis).toMatch(/^res:/); expect(r.protectedRefs.verifier).toMatch(/^res:/)
    const sum = [...r.envelopes.values()].reduce((n, e) => n + e.hardBudgetLimitMicros, 0)
    expect(sum + base.protectedSynthesisMicros + base.protectedVerifierMicros + r.supplementalPoolMicros).toBeLessThanOrEqual(base.ceilingMicros)
    expect(r.supplementalPoolMicros).toBe(130_000) // 20% of the 650 000 left for workers
  })
  it('not equal division: a heavier package gets a bigger envelope', () => {
    const r = reserveBudgets(base)
    if (!r.ok) throw new Error('refused')
    expect(r.envelopes.get('wp1')!.hardBudgetLimitMicros).toBe(3 * r.envelopes.get('wp2')!.hardBudgetLimitMicros)
    for (const e of r.envelopes.values()) expect(e.softBudgetTargetMicros).toBeLessThan(e.hardBudgetLimitMicros)
  })
  it('workers can never consume the protected reservations: a ceiling that cannot hold them refuses the whole run up front', () => {
    expect(reserveBudgets({ ...base, ceilingMicros: 340_000 })).toEqual({ ok: false, reason: 'PROTECTED_EXCEEDS_CEILING' })
    expect(reserveBudgets({ ...base, ceilingMicros: 350_000 })).toEqual({ ok: false, reason: 'NO_ROOM_FOR_WORKERS' })
  })
  it('every envelope has its own reservation ref, and an empty or zero-weight graph is refused', () => {
    const r = reserveBudgets(base)
    if (!r.ok) throw new Error('refused')
    expect(new Set([...r.envelopes.values()].map(e => e.budgetReservationRef)).size).toBe(2)
    expect(reserveBudgets({ ...base, packages: [] })).toEqual({ ok: false, reason: 'NO_PACKAGES' })
    expect(reserveBudgets({ ...base, packages: [{ id: 'a', weight: 0 }] })).toEqual({ ok: false, reason: 'NO_PACKAGES' })
  })
})

describe('validateBudgetExtension: only the Controller may approve, and a denial never shrinks the assignment', () => {
  const ext = (o: Partial<BudgetExtensionRequest> = {}): BudgetExtensionRequest => ({
    requestId: 'x1', assignmentId: 'wp1:v1', workPackageId: 'wp1', currentBudgetReservationRef: 'res:wp1', currentActualUsageMicros: 90_000, remainingTask: 'read two more pages', reasonCode: 'SOURCE_PACK_LARGER',
    additionalInputTokensEstimate: 3000, additionalOutputTokensEstimate: 800, additionalCostEstimateMicros: 20_000, expectedQualityImpactIfDenied: 'one dimension thinner', deadlineAt: 'd', ...o,
  })
  const ectx = { assignments: new Map([['wp1:v1', { reservationRef: 'res:wp1', workPackageId: 'wp1' }]]), remainingCeilingMicros: 50_000, seenRequestIds: new Set<string>() }
  it('a request that matches its assignment and fits under the ceiling passes', () => { expect(validateBudgetExtension(ext(), ectx)).toEqual({ ok: true, issues: [] }) })
  it.each([
    ['UNKNOWN_ASSIGNMENT', { assignmentId: 'zz' }],
    ['RESERVATION_MISMATCH', { currentBudgetReservationRef: 'res:other' }],
    ['PACKAGE_MISMATCH', { workPackageId: 'wp2' }],
    ['NEGATIVE_OR_NON_NUMERIC_AMOUNT', { additionalCostEstimateMicros: -1 }],
    ['NO_REMAINING_TASK', { remainingTask: ' ' }],
    ['NO_REASON', { reasonCode: '' }],
    ['EXCEEDS_REQUEST_CEILING', { additionalCostEstimateMicros: 60_000 }],
  ] as const)('%s is refused', (issue, patch) => {
    const v = validateBudgetExtension(ext(patch as Partial<BudgetExtensionRequest>), ectx)
    expect(v.ok).toBe(false); expect(v.issues).toContain(issue)
  })
  it('a repeated request id is a duplicate', () => { expect(validateBudgetExtension(ext(), { ...ectx, seenRequestIds: new Set(['x1']) }).issues).toEqual(['DUPLICATE_REQUEST']) })
})

describe('contractsForPlan: the engine issues one assignment per plan step, all bound to the same locked Context', () => {
  const plan = { title: 'T', steps: [{ title: 'Giá', queries: ['a', 'b', 'c'], brief: { objective: 'Giá một ly', output: 'bảng', sources: 'báo', boundary: 'không bàn kênh' } }, { title: 'Kênh', queries: ['d'] }, { title: 'Bổ sung giá', queries: ['e'], completes: 1 }] }
  const make = () => contractsForPlan(plan as never, { question: 'q', context: 'c', lang: 'vi', nowMs: NOW, deadlineMs: 120_000, ceilingMicros: 800_000, protectedSynthesisMicros: 300_000, protectedVerifierMicros: 0 })
  it('is deterministic, and every assignment it issues validates against its own context', () => {
    const a = make(); const b = make()
    expect(a).toEqual(b)
    expect(a.assignments).toHaveLength(3)
    expect(new Set(a.assignments.map(x => x.lockedContextVersion))).toEqual(new Set([lockedContextVersionOf('q', 'c', 'vi')]))
    expect(a.validation.every(v => v.ok)).toBe(true)
  })
  it('the objective is the brief\'s when there is one, the step title otherwise; a follow-up is SUPPLEMENTAL, the planned steps REQUIRED', () => {
    const a = make()
    expect(a.assignments.map(x => x.objective)).toEqual(['Giá một ly', 'Kênh', 'Bổ sung giá'])
    expect(a.assignments.map(x => x.criticality)).toEqual(['REQUIRED', 'REQUIRED', 'SUPPLEMENTAL'])
    expect(a.assignments.every(x => x.acceptanceCriteria.length > 0 && x.assignmentVersion === 1)).toBe(true)
  })
  it('a different question or context is a different locked Context Version', () => {
    expect(lockedContextVersionOf('q', 'c', 'vi')).not.toBe(lockedContextVersionOf('q2', 'c', 'vi'))
    expect(lockedContextVersionOf('q', 'c', 'vi')).not.toBe(lockedContextVersionOf('q', 'c2', 'vi'))
    expect(lockedContextVersionOf('q', 'c', 'vi')).toBe(lockedContextVersionOf('q', 'c', 'vi'))
  })
  it('a ceiling that cannot hold the protected synthesis issues nothing and says why', () => {
    const r = contractsForPlan(plan as never, { question: 'q', context: '', lang: 'vi', nowMs: NOW, deadlineMs: 1000, ceilingMicros: 100_000, protectedSynthesisMicros: 300_000, protectedVerifierMicros: 0 })
    expect(r.assignments).toEqual([]); expect(r.refused).toBe('PROTECTED_EXCEEDS_CEILING')
  })
})
