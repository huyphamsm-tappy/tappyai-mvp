import { describe, it, expect } from 'vitest'
import { parseWorkPackageResult, validateWorkPackageResult, type AssignmentScope, type WorkPackageResult, type StructuredClaim } from './workPackageContract'

const scope: AssignmentScope = { researchRequestId: 'rr1', workPackageId: 'wp1', assignmentVersion: 2, allowedFactVersionIds: new Set(['fv1', 'fv2']), allowedEvidenceRefs: new Set(['ev1', 'ev2']) }
const claim = (o: Partial<StructuredClaim> = {}): StructuredClaim => ({ claimId: 'c1', statement: 'Quán mở cửa 8-21h', claimType: 'opening_hours', supportingFactVersionIds: ['fv1'], uncertainty: 'LOW', ...o })
const result = (o: Partial<WorkPackageResult> = {}): WorkPackageResult => ({
  researchRequestId: 'rr1', workPackageId: 'wp1', assignmentVersion: 2, executionAttemptId: 'a1', status: 'SUCCEEDED', extractedClaims: [claim()], factVersionRefs: ['fv1'], evidenceRefs: ['ev1'],
  evidenceConflicts: [], dataGaps: [], summaryFindings: 's', limitations: [], completedAt: '2026-11-10T00:00:00Z', ...o,
})

describe('parseWorkPackageResult (untrusted output)', () => {
  it('accepts a well-formed result and refuses wrong types, unknown status and non-objects without throwing', () => {
    expect(parseWorkPackageResult(result())).not.toBeNull()
    for (const bad of [null, 'x', 5, [], {}, { ...result(), status: 'OK' }, { ...result(), assignmentVersion: 1.5 }, { ...result(), extractedClaims: 'no' }, { ...result(), factVersionRefs: [1] }, { ...result(), evidenceConflicts: undefined }]) {
      expect(parseWorkPackageResult(bad)).toBeNull()
    }
    expect(parseWorkPackageResult({ ...result(), extractedClaims: [{ ...claim(), uncertainty: 'MAYBE' }] })).toBeNull()
  })
})

describe('validateWorkPackageResult', () => {
  it('a result whose claims stand on its own source pack is accepted', () => {
    const v = validateWorkPackageResult(result(), scope)
    expect(v.accepted).toBe(true); expect(v.issues).toEqual([]); expect(v.acceptedClaims).toHaveLength(1)
  })
  it('identity must match the assignment: another request, another package, an old assignment version', () => {
    expect(validateWorkPackageResult(result({ researchRequestId: 'other' }), scope)).toMatchObject({ accepted: false, issues: ['WRONG_REQUEST'] })
    expect(validateWorkPackageResult(result({ workPackageId: 'other' }), scope).issues).toEqual(['WRONG_PACKAGE'])
    expect(validateWorkPackageResult(result({ assignmentVersion: 1 }), scope).issues).toEqual(['STALE_ASSIGNMENT_VERSION'])
  })
  it('a claim on a fact version outside the source pack is dropped, the rest kept', () => {
    const v = validateWorkPackageResult(result({ extractedClaims: [claim(), claim({ claimId: 'c2', supportingFactVersionIds: ['fvX'] })], factVersionRefs: ['fv1', 'fvX'] }), scope)
    expect(v.rejectedClaimIds).toEqual(['c2']); expect(v.acceptedClaims.map(c => c.claimId)).toEqual(['c1']); expect(v.issues).toContain('FACT_OUTSIDE_SOURCE_PACK'); expect(v.accepted).toBe(true)
  })
  it('evidence references outside the pack are an issue even when the claims are fine', () => {
    expect(validateWorkPackageResult(result({ evidenceRefs: ['ev1', 'evX'] }), scope).issues).toContain('EVIDENCE_OUTSIDE_SOURCE_PACK')
  })
  it('a claim with no supporting fact version, a duplicate claim id, and a claim naming a ref it did not declare are dropped', () => {
    const v = validateWorkPackageResult(result({ extractedClaims: [claim({ claimId: 'a', supportingFactVersionIds: [] }), claim({ claimId: 'b' }), claim({ claimId: 'b' }), claim({ claimId: 'd', supportingFactVersionIds: ['fv2'] })] }), scope)
    expect(v.rejectedClaimIds.sort()).toEqual(['a', 'b', 'd'].filter(x => x !== 'b').concat(['b']).sort())
    expect(v.issues).toEqual(expect.arrayContaining(['CLAIM_WITHOUT_SUPPORT', 'DUPLICATE_CLAIM_ID', 'CLAIM_NOT_SUPPORTED_BY_DECLARED_REFS']))
    expect(v.acceptedClaims.map(c => c.claimId)).toEqual(['b'])
  })
  it('a failed, timed-out, blocked or rejected execution is never accepted; SUCCEEDED with no usable claim is not accepted either', () => {
    for (const status of ['FAILED', 'TIMED_OUT', 'BLOCKED', 'REJECTED'] as const) expect(validateWorkPackageResult(result({ status }), scope).accepted).toBe(false)
    expect(validateWorkPackageResult(result({ extractedClaims: [] }), scope).accepted).toBe(false)
  })
  it('a PARTIAL result with valid claims is accepted (its gaps and limitations stay with it)', () => {
    expect(validateWorkPackageResult(result({ status: 'PARTIAL', dataGaps: ['giá vé'] }), scope).accepted).toBe(true)
  })
  it('malformed output is MALFORMED, never a crash', () => {
    expect(validateWorkPackageResult({ nonsense: true }, scope)).toEqual({ accepted: false, issues: ['MALFORMED'], acceptedClaims: [], rejectedClaimIds: [] })
  })
})
