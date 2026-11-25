// Work-package contracts (R13 §4.3, §9.1): what a model's structured output must look like and how the Research Controller validates it BEFORE anyone consumes it.
// A model's WorkPackageResult is untrusted until validated: identity must match the assignment, every claim must stand on fact versions and evidence that belong to the assignment's own
// source pack, and a provider's "success" does not make the result quality-accepted. Pure; the engine does not use these yet (its steps return findings, not claims).

export type Uncertainty = 'LOW' | 'MEDIUM' | 'HIGH'
export type WorkPackageStatus = 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'TIMED_OUT' | 'BLOCKED' | 'REJECTED'
const STATUSES: readonly WorkPackageStatus[] = ['SUCCEEDED', 'PARTIAL', 'FAILED', 'TIMED_OUT', 'BLOCKED', 'REJECTED']
const UNCERTAINTIES: readonly Uncertainty[] = ['LOW', 'MEDIUM', 'HIGH']

export interface StructuredClaim {
  claimId: string
  statement: string
  claimType: string
  supportingFactVersionIds: string[]
  qualifyingFactVersionIds?: string[]
  conflictFactVersionIds?: string[]
  uncertainty: Uncertainty
}

export interface WorkPackageResult {
  researchRequestId: string
  workPackageId: string
  assignmentVersion: number
  executionAttemptId: string
  status: WorkPackageStatus
  extractedClaims: StructuredClaim[]
  factVersionRefs: string[]
  evidenceRefs: string[]
  evidenceConflicts: Array<{ factVersionIdA: string; factVersionIdB: string; description: string; evidenceRefs: string[] }>
  dataGaps: string[]
  summaryFindings: string
  limitations: string[]
  completedAt: string
}

/** What the Controller issued: the only identity, fact versions and evidence this work package may use. */
export interface AssignmentScope {
  researchRequestId: string
  workPackageId: string
  assignmentVersion: number
  allowedFactVersionIds: ReadonlySet<string>
  allowedEvidenceRefs: ReadonlySet<string>
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const strList = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')

function parseClaim(v: unknown): StructuredClaim | null {
  const c = v as Partial<StructuredClaim> | null
  if (!c || typeof c !== 'object' || !isStr(c.claimId) || !isStr(c.statement) || !isStr(c.claimType) || !strList(c.supportingFactVersionIds) || !UNCERTAINTIES.includes(c.uncertainty as Uncertainty)) return null
  if (c.qualifyingFactVersionIds !== undefined && !strList(c.qualifyingFactVersionIds)) return null
  if (c.conflictFactVersionIds !== undefined && !strList(c.conflictFactVersionIds)) return null
  return c as StructuredClaim
}

/** Shape-check untrusted model output into a WorkPackageResult, or null when any field has the wrong type. Never throws. */
export function parseWorkPackageResult(raw: unknown): WorkPackageResult | null {
  const r = raw as Partial<WorkPackageResult> | null
  if (!r || typeof r !== 'object') return null
  if (!isStr(r.researchRequestId) || !isStr(r.workPackageId) || !isStr(r.executionAttemptId) || !isStr(r.completedAt)) return null
  if (!Number.isInteger(r.assignmentVersion) || !STATUSES.includes(r.status as WorkPackageStatus)) return null
  if (!Array.isArray(r.extractedClaims) || !strList(r.factVersionRefs) || !strList(r.evidenceRefs) || !strList(r.dataGaps) || !strList(r.limitations) || typeof r.summaryFindings !== 'string') return null
  const claims = r.extractedClaims.map(parseClaim)
  if (claims.some(c => c === null)) return null
  const conflicts = Array.isArray(r.evidenceConflicts) ? r.evidenceConflicts : null
  if (!conflicts || !conflicts.every(c => c && isStr(c.factVersionIdA) && isStr(c.factVersionIdB) && typeof c.description === 'string' && strList(c.evidenceRefs))) return null
  return { ...(r as WorkPackageResult), extractedClaims: claims as StructuredClaim[], evidenceConflicts: conflicts }
}

export type ResultIssue =
  | 'MALFORMED' | 'WRONG_REQUEST' | 'WRONG_PACKAGE' | 'STALE_ASSIGNMENT_VERSION'
  | 'FACT_OUTSIDE_SOURCE_PACK' | 'EVIDENCE_OUTSIDE_SOURCE_PACK' | 'CLAIM_WITHOUT_SUPPORT' | 'DUPLICATE_CLAIM_ID' | 'CLAIM_NOT_SUPPORTED_BY_DECLARED_REFS'

export interface ResultValidation {
  /** usable by the lead model: identity matches and at least one claim passed */
  accepted: boolean
  issues: ResultIssue[]
  acceptedClaims: StructuredClaim[]
  /** claim ids dropped because they stand on something outside the source pack or on nothing */
  rejectedClaimIds: string[]
}

/**
 * Validate a (parsed) result against its assignment. Identity mismatches reject the whole result. A claim is kept only when it has at least one supporting fact version and every fact
 * version it names belongs to the assignment's source pack; evidence references outside the pack are an issue. A FAILED / TIMED_OUT / BLOCKED / REJECTED status is never accepted. SUCCEEDED
 * does not mean quality-accepted: acceptance criteria are judged by the Controller on the accepted claims, not here. Pure.
 */
export function validateWorkPackageResult(raw: unknown, scope: AssignmentScope): ResultValidation {
  const none = (issues: ResultIssue[]): ResultValidation => ({ accepted: false, issues, acceptedClaims: [], rejectedClaimIds: [] })
  const r = parseWorkPackageResult(raw)
  if (!r) return none(['MALFORMED'])
  const issues = new Set<ResultIssue>()
  if (r.researchRequestId !== scope.researchRequestId) issues.add('WRONG_REQUEST')
  if (r.workPackageId !== scope.workPackageId) issues.add('WRONG_PACKAGE')
  if (r.assignmentVersion !== scope.assignmentVersion) issues.add('STALE_ASSIGNMENT_VERSION')
  if (issues.size > 0) return none([...issues])
  if (r.status === 'FAILED' || r.status === 'TIMED_OUT' || r.status === 'BLOCKED' || r.status === 'REJECTED') return { accepted: false, issues: [], acceptedClaims: [], rejectedClaimIds: [] }
  if (r.evidenceRefs.some(e => !scope.allowedEvidenceRefs.has(e))) issues.add('EVIDENCE_OUTSIDE_SOURCE_PACK')
  if (r.factVersionRefs.some(f => !scope.allowedFactVersionIds.has(f))) issues.add('FACT_OUTSIDE_SOURCE_PACK')
  const seen = new Set<string>()
  const declared = new Set(r.factVersionRefs)
  const acceptedClaims: StructuredClaim[] = []
  const rejectedClaimIds: string[] = []
  for (const c of r.extractedClaims) {
    if (seen.has(c.claimId)) { issues.add('DUPLICATE_CLAIM_ID'); rejectedClaimIds.push(c.claimId); continue }
    seen.add(c.claimId)
    const named = [...c.supportingFactVersionIds, ...(c.qualifyingFactVersionIds ?? []), ...(c.conflictFactVersionIds ?? [])]
    if (c.supportingFactVersionIds.length === 0) { issues.add('CLAIM_WITHOUT_SUPPORT'); rejectedClaimIds.push(c.claimId); continue }
    if (named.some(id => !scope.allowedFactVersionIds.has(id))) { issues.add('FACT_OUTSIDE_SOURCE_PACK'); rejectedClaimIds.push(c.claimId); continue }
    if (named.some(id => !declared.has(id))) { issues.add('CLAIM_NOT_SUPPORTED_BY_DECLARED_REFS'); rejectedClaimIds.push(c.claimId); continue }
    acceptedClaims.push(c)
  }
  return { accepted: acceptedClaims.length > 0, issues: [...issues], acceptedClaims, rejectedClaimIds }
}
