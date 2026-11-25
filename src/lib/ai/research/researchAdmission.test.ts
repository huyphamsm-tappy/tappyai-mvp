import { describe, it, expect } from 'vitest'
import { admitResearch, promoteAfterEvidence, scoreSignals, hardTriggersOf, researchAdmissionOn, STANDARD_BOUNDS, ADMISSION_POLICY_VERSION, type ResearchSignals } from './researchAdmission'

const base: ResearchSignals = { dimensions: 1, dependentStages: false, marketsOrPeriods: 1, analysis: 'SUMMARY', output: 'CONCISE' }
const sig = (o: Partial<ResearchSignals> = {}): ResearchSignals => ({ ...base, ...o })

describe('the flag', () => {
  it('is off by default, on only for "1", locked in production unless the owner lists it', () => {
    expect(researchAdmissionOn({})).toBe(false)
    expect(researchAdmissionOn({ RESEARCH_ADMISSION: 'true' })).toBe(false)
    expect(researchAdmissionOn({ RESEARCH_ADMISSION: '1' })).toBe(true)
    expect(researchAdmissionOn({ RESEARCH_ADMISSION: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(researchAdmissionOn({ RESEARCH_ADMISSION: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'RESEARCH_ADMISSION' })).toBe(true)
  })
})

describe('admitResearch', () => {
  it('a focused one-question report is STANDARD, score 0', () => {
    const d = admitResearch(sig())
    expect(d.tier).toBe('STANDARD_REPORT'); expect(d.score.total).toBe(0); expect(d.reason).toBe('SCORE_STANDARD'); expect(d.policyVersion).toBe(ADMISSION_POLICY_VERSION)
  })
  it('three related dimensions with a comparison and a multi-section report reach score 4: Advanced by score alone', () => {
    const d = admitResearch(sig({ dimensions: 3, analysis: 'COMPARISON', output: 'MULTI_SECTION' }))
    expect(d.score).toMatchObject({ scope: 1, taskGraph: 1, analysis: 1, output: 1, total: 4 })
    expect(d.tier).toBe('ADVANCED_RESEARCH_REPORT'); expect(d.reason).toBe('SCORE_ADVANCED')
  })
  it('score 3 is the top of Standard', () => {
    const d = admitResearch(sig({ dimensions: 2, analysis: 'COMPARISON', output: 'CONCISE' }))
    expect(d.score.total).toBe(3); expect(d.tier).toBe('STANDARD_REPORT')
  })
  it('each pre-retrieval hard trigger forces ADVANCED even when the score is low', () => {
    expect(admitResearch(sig({ dependentStages: true })).triggers).toEqual(['DEPENDENT_STAGES'])
    expect(admitResearch(sig({ dimensions: 4 })).triggers).toEqual(['FOUR_PLUS_DIMENSIONS'])
    expect(admitResearch(sig({ marketsOrPeriods: 2 })).triggers).toEqual(['MULTI_MARKET_OR_PERIOD'])
    expect(admitResearch(sig({ analysis: 'SCENARIO' })).triggers).toEqual(['QUANTITATIVE_ANALYSIS'])
    for (const s of [sig({ dependentStages: true }), sig({ dimensions: 4 }), sig({ marketsOrPeriods: 2 }), sig({ analysis: 'SCENARIO' })]) {
      const d = admitResearch(s); expect(d.tier).toBe('ADVANCED_RESEARCH_REPORT'); expect(d.reason).toBe('HARD_TRIGGER')
    }
  })
  it('evidence that is not known yet cannot fire at admission: evidence stats are ignored before retrieval', () => {
    const d = admitResearch(sig({ evidence: { independentSources: 20, sourceFamilies: 6, supplementalRounds: 5, materialConflicts: 3 } }))
    expect(d.tier).toBe('STANDARD_REPORT'); expect(d.triggers).toEqual([])
  })
  it('a missing or zero dimension count is treated as one', () => {
    expect(admitResearch(sig({ dimensions: 0 })).tier).toBe('STANDARD_REPORT')
    expect(scoreSignals(sig({ dimensions: 0 })).scope).toBe(0)
  })
  it('takes no previous tier: the signature cannot inherit one', () => {
    expect(admitResearch.length).toBe(1)
  })
})

describe('hardTriggersOf (evidence side)', () => {
  const ev = (o: Partial<NonNullable<ResearchSignals['evidence']>> = {}) => sig({ evidence: { independentSources: 3, sourceFamilies: 1, supplementalRounds: 0, materialConflicts: 0, ...o } })
  it('nine sources need three families: nine pages of one kind of site are not enough', () => {
    expect(hardTriggersOf(ev({ independentSources: 9, sourceFamilies: 3 }))).toEqual(['NINE_PLUS_SOURCES_THREE_FAMILIES'])
    expect(hardTriggersOf(ev({ independentSources: 12, sourceFamilies: 2 }))).toEqual([])
    expect(hardTriggersOf(ev({ independentSources: 8, sourceFamilies: 5 }))).toEqual([])
  })
  it('two supplemental rounds and one material conflict fire; one round does not', () => {
    expect(hardTriggersOf(ev({ supplementalRounds: 2 }))).toEqual(['TWO_PLUS_SUPPLEMENTAL_ROUNDS'])
    expect(hardTriggersOf(ev({ supplementalRounds: 1 }))).toEqual([])
    expect(hardTriggersOf(ev({ materialConflicts: 1 }))).toEqual(['MATERIAL_EVIDENCE_CONFLICT'])
  })
})

describe('promoteAfterEvidence', () => {
  const withEvidence = (o: Partial<NonNullable<ResearchSignals['evidence']>>) => sig({ evidence: { independentSources: 3, sourceFamilies: 1, supplementalRounds: 0, materialConflicts: 0, ...o } })
  it('a Standard report with a new evidence trigger is promoted once, with a record', () => {
    const r = promoteAfterEvidence('STANDARD_REPORT', withEvidence({ materialConflicts: 2 }), false)
    expect(r).toEqual({ promoted: true, tier: 'ADVANCED_RESEARCH_REPORT', record: { from: 'STANDARD_REPORT', to: 'ADVANCED_RESEARCH_REPORT', triggers: ['MATERIAL_EVIDENCE_CONFLICT'], policyVersion: ADMISSION_POLICY_VERSION, reason: 'EVIDENCE_HARD_TRIGGER' } })
  })
  it('no second promotion, no promotion without a trigger, nothing to do for Advanced', () => {
    expect(promoteAfterEvidence('STANDARD_REPORT', withEvidence({ materialConflicts: 1 }), true)).toEqual({ promoted: false, tier: 'STANDARD_REPORT', why: 'ALREADY_PROMOTED_ONCE' })
    expect(promoteAfterEvidence('STANDARD_REPORT', withEvidence({}), false)).toEqual({ promoted: false, tier: 'STANDARD_REPORT', why: 'NO_NEW_TRIGGER' })
    expect(promoteAfterEvidence('ADVANCED_RESEARCH_REPORT', withEvidence({}), false)).toEqual({ promoted: false, tier: 'ADVANCED_RESEARCH_REPORT', why: 'ALREADY_ADVANCED' })
  })
  it('never goes down: Advanced stays Advanced even when evidence is thin', () => {
    expect(promoteAfterEvidence('ADVANCED_RESEARCH_REPORT', withEvidence({ independentSources: 0 }), false).tier).toBe('ADVANCED_RESEARCH_REPORT')
  })
  it('a pre-retrieval trigger (dimensions, markets) is not re-reported as an evidence promotion', () => {
    expect(promoteAfterEvidence('STANDARD_REPORT', sig({ dimensions: 5, evidence: { independentSources: 1, sourceFamilies: 1, supplementalRounds: 0, materialConflicts: 0 } }), false).promoted).toBe(false)
  })
})

describe('bounds', () => {
  it('Standard bounds match R13 4.2.1', () => {
    expect(STANDARD_BOUNDS).toEqual({ maxWorkPackages: 3, targetSources: 8, supplementalPasses: 1 })
  })
})
