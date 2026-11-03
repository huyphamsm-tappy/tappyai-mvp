import { describe, it, expect } from 'vitest'
import { deepResearchV2On, DEEP_RESEARCH_V2_FLAG, V2_LIMITS, stepCoverage, decideNext, missingParts, findingsForPart, termScores } from './deepResearchState'
import type { Finding, ResearchPlan } from './deepResearch'

const fin = (step: number, text: string, source = 1, figure = false): Finding => ({ step, text, source, ...(figure ? { figure: { series: 's', label: 'l', value: 1, unit: 'u' } } : {}) })
const plan: ResearchPlan = { title: 't', steps: [{ title: 'Quy mô thị trường', queries: ['q'] }, { title: 'Bản đồ đối thủ', queries: ['q'] }, { title: 'Bù quy mô', queries: ['q'], completes: 1 }] }

describe('DEEP_RESEARCH_V2 flag (03/11)', () => {
  it('is OFF unless exactly "1"', () => {
    expect(deepResearchV2On({})).toBe(false)
    for (const v of ['0', 'true', 'on', ' 1', '1 ', '']) expect(deepResearchV2On({ [DEEP_RESEARCH_V2_FLAG]: v })).toBe(false)
    expect(deepResearchV2On({ [DEEP_RESEARCH_V2_FLAG]: '1' })).toBe(true)
  })
  it('is locked OFF in a production runtime; the owner opens it by name in CONSULT_PRODUCTION_ALLOW', () => {
    for (const prod of [{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }]) {
      expect(deepResearchV2On({ ...prod, [DEEP_RESEARCH_V2_FLAG]: '1' })).toBe(false)
      expect(deepResearchV2On({ ...prod, [DEEP_RESEARCH_V2_FLAG]: '1', CONSULT_PRODUCTION_ALLOW: DEEP_RESEARCH_V2_FLAG })).toBe(true)
    }
  })
})

describe('stepCoverage', () => {
  it('counts findings, figures and distinct sources per section; a follow-up counts for the step it completes', () => {
    const findings = [fin(1, 'a', 1, true), fin(1, 'b', 2), fin(3, 'c', 3), fin(3, 'd', 3), fin(2, 'e', 4)]
    const c = stepCoverage(plan, findings)
    expect(c.map(x => x.step)).toEqual([1, 2]) // the follow-up is not a section
    expect(c[0]).toMatchObject({ findings: 4, figures: 1, sources: 3, status: 'covered' })
    expect(c[1]).toMatchObject({ findings: 1, status: 'thin' })
  })
  it('empty and thin by the V2 threshold', () => {
    const c = stepCoverage(plan, [fin(1, 'a'), fin(1, 'b'), fin(1, 'c')])
    expect(c[0]!.status).toBe('thin')
    expect(c[1]!.status).toBe('empty')
    expect(stepCoverage(plan, Array.from({ length: V2_LIMITS.thinFindings }, (_, i) => fin(1, `f${i}`)))[0]!.status).toBe('covered')
  })
})

describe('decideNext: when another gap round is worth running', () => {
  const thin = [{ step: 1, title: 'x', findings: 1, figures: 0, sources: 1, status: 'thin' as const }]
  const covered = [{ step: 1, title: 'x', findings: 9, figures: 3, sources: 5, status: 'covered' as const }]
  const ok = { round: 1, newFindings: 20, msLeft: 100_000 }
  it('researches on while a step is thin, there is time, rounds are left and the last round gave enough', () => {
    expect(decideNext({ ...ok, coverage: thin })).toEqual({ next: 'research', reason: 'research' })
  })
  it('stops for each reason, checked in order', () => {
    expect(decideNext({ ...ok, msLeft: V2_LIMITS.minMsLeftForRound - 1, coverage: thin })).toEqual({ next: 'synthesize', reason: 'time' })
    expect(decideNext({ ...ok, round: V2_LIMITS.maxGapRounds, coverage: thin })).toEqual({ next: 'synthesize', reason: 'rounds' })
    expect(decideNext({ ...ok, newFindings: V2_LIMITS.minNewFindings - 1, coverage: thin })).toEqual({ next: 'synthesize', reason: 'diminishing' })
    // every step has findings: reported as 'covered', but the model's gap check decides whether to go on (a count says nothing about content)
    expect(decideNext({ ...ok, coverage: covered })).toEqual({ next: 'research', reason: 'covered' })
    expect(decideNext({ ...ok, coverage: thin, llmUsd: V2_LIMITS.llmUsdCap })).toEqual({ next: 'synthesize', reason: 'budget' })
    expect(decideNext({ ...ok, coverage: thin, llmUsd: V2_LIMITS.llmUsdCap - 0.001 }).next).toBe('research')
    // time wins over everything
    expect(decideNext({ round: V2_LIMITS.maxGapRounds, newFindings: 0, msLeft: 0, coverage: covered }).reason).toBe('time')
  })
})

describe('missingParts / findingsForPart', () => {
  it('a part is named when a heading shares a term with it', () => {
    const heads = ['Quy mô thị trường', 'Phân tích mô hình kiếm tiền']
    expect(missingParts(['Quy mô thị trường và tốc độ tăng trưởng', 'Bản đồ các đối thủ lớn', 'Mô hình kiếm tiền'], heads)).toEqual(['Bản đồ các đối thủ lớn'])
    expect(missingParts(['Bản đồ các đối thủ lớn'], [])).toEqual(['Bản đồ các đối thủ lớn'])
    expect(missingParts([], heads)).toEqual([])
  })
  it('the findings that speak to a part: shared terms first, figures first among equals, at most n, none unrelated', () => {
    const fs = [fin(1, 'Shopee chiếm thị phần lớn nhất'), fin(1, 'Bản đồ đối thủ lớn: Shopee và TikTok Shop'), fin(1, 'thời tiết hôm nay đẹp'), fin(2, 'Các đối thủ lớn gồm Grab', 2, true)]
    const got = findingsForPart('Bản đồ các đối thủ lớn', fs, 2)
    // both share three terms with the part; the one with a figure comes first
    expect(got.map(f => f.text)).toEqual(['Các đối thủ lớn gồm Grab', 'Bản đồ đối thủ lớn: Shopee và TikTok Shop'])
    expect(findingsForPart('Bản đồ các đối thủ lớn', fs, 10).map(f => f.text)).not.toContain('thời tiết hôm nay đẹp')
  })
  it('termScores is the same measure stepForGap always used', () => {
    expect(termScores('quy mô thị trường', [{ title: 'Quy mô thị trường Việt Nam' }, { title: 'thời tiết' }])).toEqual([4, 0]) // 'trường' (6 letters) and three neighbouring pairs
  })
})
