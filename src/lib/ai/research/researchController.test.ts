import { describe, it, expect } from 'vitest'
import { validateTaskGraph, decideGap, reportStatusOf, limitationsOf, ADVANCED_BOUNDS, CONTROLLER_POLICY_VERSION, type WorkPackage, type GapContext } from './researchController'

const wp = (id: string, dimension: string, over: Partial<WorkPackage> = {}): WorkPackage => ({ id, title: `t-${id}`, dimension, dependsOn: [], critical: false, acceptance: ['có số liệu có nguồn'], ...over })
const DIMS = ['quy mô', 'đối thủ', 'giá']

describe('validateTaskGraph: Standard', () => {
  it('three independent packages covering every dimension are fine', () => {
    expect(validateTaskGraph('STANDARD_REPORT', [wp('a', 'quy mô'), wp('b', 'đối thủ'), wp('c', 'giá')], DIMS)).toEqual({ ok: true, issues: [], uncovered: [] })
  })
  it('four packages, or any dependency, is not a Standard graph', () => {
    const four = validateTaskGraph('STANDARD_REPORT', [wp('a', 'quy mô'), wp('b', 'đối thủ'), wp('c', 'giá'), wp('d', 'giá')], DIMS)
    expect(four.issues).toContain('TOO_MANY_PACKAGES')
    const dep = validateTaskGraph('STANDARD_REPORT', [wp('a', 'quy mô'), wp('b', 'đối thủ', { dependsOn: ['a'] })], ['quy mô', 'đối thủ'])
    expect(dep.issues).toContain('DEPENDENCIES_NOT_ALLOWED_FOR_STANDARD')
  })
  it('empty graph and missing acceptance criteria are refused', () => {
    expect(validateTaskGraph('STANDARD_REPORT', [], []).issues).toContain('NO_PACKAGES')
    expect(validateTaskGraph('STANDARD_REPORT', [wp('a', 'x', { acceptance: ['  '] })], ['x']).issues).toContain('MISSING_ACCEPTANCE_CRITERIA')
  })
})

describe('validateTaskGraph: Advanced', () => {
  it('a dependency chain is allowed, up to the bound', () => {
    const g = [wp('a', 'quy mô'), wp('b', 'đối thủ', { dependsOn: ['a'] }), wp('c', 'giá', { dependsOn: ['a', 'b'], critical: true })]
    expect(validateTaskGraph('ADVANCED_RESEARCH_REPORT', g, DIMS).ok).toBe(true)
    const many = Array.from({ length: ADVANCED_BOUNDS.maxWorkPackages + 1 }, (_, i) => wp(`p${i}`, 'quy mô'))
    expect(validateTaskGraph('ADVANCED_RESEARCH_REPORT', many, ['quy mô']).issues).toContain('TOO_MANY_PACKAGES')
  })
  it('rejects unknown dependencies, duplicate ids, self-dependency and cycles', () => {
    expect(validateTaskGraph('ADVANCED_RESEARCH_REPORT', [wp('a', 'x', { dependsOn: ['zzz'] })], ['x']).issues).toContain('UNKNOWN_DEPENDENCY')
    expect(validateTaskGraph('ADVANCED_RESEARCH_REPORT', [wp('a', 'x'), wp('a', 'x')], ['x']).issues).toContain('DUPLICATE_ID')
    expect(validateTaskGraph('ADVANCED_RESEARCH_REPORT', [wp('a', 'x', { dependsOn: ['a'] })], ['x']).issues).toContain('DEPENDENCY_CYCLE')
    const cyc = [wp('a', 'x', { dependsOn: ['b'] }), wp('b', 'x', { dependsOn: ['a'] })]
    expect(validateTaskGraph('ADVANCED_RESEARCH_REPORT', cyc, ['x']).issues).toContain('DEPENDENCY_CYCLE')
  })
})

describe('no silent omission', () => {
  it('a required dimension no package serves is reported, whatever the tier; matching ignores case and diacritics', () => {
    const v = validateTaskGraph('ADVANCED_RESEARCH_REPORT', [wp('a', 'QUY MO')], ['quy mô', 'giá'])
    expect(v.issues).toEqual(['REQUIRED_DIMENSION_UNCOVERED']); expect(v.uncovered).toEqual(['giá'])
  })
})

describe('decideGap', () => {
  const ctx = (o: Partial<GapContext> = {}): GapContext => ({ tier: 'ADVANCED_RESEARCH_REPORT', roundsUsed: 0, requiredDimensions: DIMS, active: true, canReserve: true, ...o })
  const req = { dimensions: ['giá'], acceptance: ['có ít nhất 2 nguồn'] }
  it('approves an in-scope gap with a reservation', () => {
    expect(decideGap(req, ctx())).toEqual({ decision: 'APPROVED', approved: ['giá'], denied: [], followUp: 'RETRIEVE_AND_GATE', policyVersion: CONTROLLER_POLICY_VERSION })
  })
  it('partially approves: the in-scope part runs, the out-of-scope part is denied and named', () => {
    const d = decideGap({ ...req, dimensions: ['giá', 'chính trị'] }, ctx())
    expect(d).toMatchObject({ decision: 'PARTIALLY_APPROVED', approved: ['giá'], denied: ['chính trị'], reason: 'OUT_OF_SCOPE' })
  })
  it('denies with no further retrieval and a reason: out of scope, round limit, inactive, no criteria, no reservation', () => {
    expect(decideGap({ ...req, dimensions: ['chính trị'] }, ctx())).toMatchObject({ decision: 'DENIED', reason: 'OUT_OF_SCOPE', approved: [], followUp: 'NO_FURTHER_RETRIEVAL' })
    expect(decideGap(req, ctx({ roundsUsed: ADVANCED_BOUNDS.maxGapRounds }))).toMatchObject({ decision: 'DENIED', reason: 'ROUND_LIMIT' })
    expect(decideGap(req, ctx({ active: false }))).toMatchObject({ decision: 'DENIED', reason: 'REQUEST_NOT_ACTIVE' })
    expect(decideGap({ ...req, acceptance: [] }, ctx())).toMatchObject({ decision: 'DENIED', reason: 'NO_ACCEPTANCE_CRITERIA' })
    expect(decideGap(req, ctx({ canReserve: false }))).toMatchObject({ decision: 'DENIED', reason: 'RESERVATION_REFUSED' })
  })
  it('Standard gets one supplemental pass only', () => {
    expect(decideGap(req, ctx({ tier: 'STANDARD_REPORT', roundsUsed: 0 })).decision).toBe('APPROVED')
    expect(decideGap(req, ctx({ tier: 'STANDARD_REPORT', roundsUsed: 1 }))).toMatchObject({ decision: 'DENIED', reason: 'ROUND_LIMIT' })
  })
  it('a DENIED decision never authorises anything (invariant)', () => {
    for (const c of [ctx({ active: false }), ctx({ canReserve: false }), ctx({ roundsUsed: 9 })]) {
      const d = decideGap(req, c)
      expect(d.decision).toBe('DENIED'); expect(d.approved).toEqual([]); expect(d.followUp).toBe('NO_FURTHER_RETRIEVAL')
    }
  })
})

describe('reportStatusOf', () => {
  const base = { requiredDimensions: DIMS, criticalFailed: [] as string[], blocked: false, failed: false }
  it('COMPLETE only when every dimension is covered with no critical failure', () => {
    expect(reportStatusOf({ ...base, covered: DIMS })).toBe('COMPLETE')
  })
  it('PARTIAL when a non-critical dimension is missing; the limitations name it', () => {
    expect(reportStatusOf({ ...base, covered: ['quy mô', 'đối thủ'] })).toBe('PARTIAL')
    expect(limitationsOf({ requiredDimensions: DIMS, covered: ['quy mô', 'đối thủ'] })).toEqual(['giá'])
  })
  it('INCOMPLETE when a critical package failed or nothing was covered', () => {
    expect(reportStatusOf({ ...base, covered: ['quy mô', 'đối thủ'], criticalFailed: ['giá'] })).toBe('INCOMPLETE')
    expect(reportStatusOf({ ...base, covered: [] })).toBe('INCOMPLETE')
  })
  it('FAILED beats BLOCKED beats everything else', () => {
    expect(reportStatusOf({ ...base, covered: DIMS, failed: true, blocked: true })).toBe('FAILED')
    expect(reportStatusOf({ ...base, covered: DIMS, blocked: true })).toBe('BLOCKED')
  })
})
