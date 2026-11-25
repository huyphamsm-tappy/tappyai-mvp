import { describe, it, expect, afterEach, vi } from 'vitest'
import { heavyHosts, staleSourceIds, sectionCharts, runDeepResearch, HOST_SHARE_AVOID_AT, type DeepResearchDeps, type Evidence, type Finding, type ResearchPlan } from './deepResearch'
import { researchSourceDiversityOn } from './deepResearchState'

const ev = (url: string, over: Partial<{ site: string }> = {}) => ({ url, ...over })

describe('the flag', () => {
  it('is off by default, on only for "1", locked in production unless the owner lists it', () => {
    expect(researchSourceDiversityOn({})).toBe(false)
    expect(researchSourceDiversityOn({ RESEARCH_SOURCE_DIVERSITY: '1' })).toBe(true)
    expect(researchSourceDiversityOn({ RESEARCH_SOURCE_DIVERSITY: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(researchSourceDiversityOn({ RESEARCH_SOURCE_DIVERSITY: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'RESEARCH_SOURCE_DIVERSITY' })).toBe(true)
  })
})

describe('heavyHosts', () => {
  it('lists the hosts that reached the threshold, www. ignored, sorted', () => {
    const rows = [...Array.from({ length: HOST_SHARE_AVOID_AT }, (_, i) => ev(`https://www.ipos.vn/p${i}`)), ...Array.from({ length: HOST_SHARE_AVOID_AT - 1 }, (_, i) => ev(`https://qandme.net/p${i}`)), ev('https://a.vn/x')]
    expect(heavyHosts(rows)).toEqual(['ipos.vn'])
  })
  it('a Google redirect row counts the real site it names, never google.com', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ev(`https://www.google.com/goto?url=x${i}`, { site: 'cafef.vn' }))
    expect(heavyHosts(rows)).toEqual(['cafef.vn'])
    expect(heavyHosts(Array.from({ length: 12 }, (_, i) => ev(`https://www.google.com/goto?url=y${i}`)))).toEqual([])
  })
})

describe('staleSourceIds and charts', () => {
  const NOW = Date.parse('2026-11-11T00:00:00Z')
  it('a dated source older than 24 months is stale; a recent one and an undated one are not judged', () => {
    const s = staleSourceIds([{ id: 1, published: '2017-05-01' }, { id: 2, published: '2025-06-01' }, { id: 3 }, { id: 4, published: '2024-10-01' }, { id: 5, published: '2024-11-20' }], NOW)
    expect([...s].sort()).toEqual([1, 4])
  })
  const plan: ResearchPlan = { title: 'T', steps: [{ title: 'Thị hiếu', queries: ['q'] }] }
  const fig = (label: string, value: number, source: number): Finding => ({ step: 1, text: 't', source, figure: { series: 'Tần suất', label, value, unit: '%' } })
  const report = '# T\n\n## Thị hiếu\nNội dung\n'
  it('a chart is not drawn from a stale source: three points from a 2017 survey draw nothing', () => {
    const findings = [fig('A', 10, 1), fig('B', 20, 1), fig('C', 30, 1)]
    expect(sectionCharts(report, plan, findings)).toHaveLength(1)
    expect(sectionCharts(report, plan, findings, new Set([1]))).toHaveLength(0)
  })
  it('the points from fresh sources still draw', () => {
    const findings = [fig('A', 10, 1), fig('B', 20, 2), fig('C', 30, 2), fig('D', 40, 2)]
    expect(sectionCharts(report, plan, findings, new Set([1]))[0].points.map(p => p.label)).toEqual(['B', 'C', 'D'])
  })
})

describe('the engine passes the hosts to avoid to later rounds, only with the flag', () => {
  afterEach(() => vi.unstubAllEnvs())
  function run() {
    const seen: Array<readonly string[] | undefined> = []
    let n = 0
    const deps: DeepResearchDeps = {
      async plan(): Promise<ResearchPlan> { return { title: 'T', steps: [{ title: 'Bước 1', queries: ['q1'] }] } },
      async gather(_q, _f, avoid) { seen.push(avoid); return Array.from({ length: HOST_SHARE_AVOID_AT }, () => { n++; return { title: `N${n}`, url: `https://ipos.vn/p${n}`, snippet: 's', text: 'nội dung' } }) },
      async notes(_s: string, _q: string, e: readonly Evidence[]) { return [{ text: `phát hiện ${e[0]!.id}`, source: e[0]!.id }] },
      async gaps() { return [{ title: 'Bù', queries: ['g'], completes: null }] },
      async *write() { yield '# B\n\n## Bước 1\nNội dung [1]\n' },
    }
    return runDeepResearch('q', '', 'vi', deps, { status() {}, text() {} }).then(() => seen)
  }
  it('flag off: nothing is ever avoided', async () => {
    expect((await run()).every(a => a === undefined)).toBe(true)
  })
  it('flag on: the first round has nothing to avoid, the follow-up round avoids the host that already gave the threshold', async () => {
    vi.stubEnv('RESEARCH_SOURCE_DIVERSITY', '1')
    const seen = await run()
    expect(seen[0]).toEqual([]); expect(seen[1]).toEqual(['ipos.vn'])
  })
})
