import { describe, it, expect, afterEach, vi } from 'vitest'
import { seriesRelevant, sectionTextOf } from './chartRelevance'
import { researchChartRelevanceOn } from './deepResearchState'
import { sectionCharts, runDeepResearch, type DeepResearchDeps, type Evidence, type Finding, type ResearchChart, type ResearchPlan } from './deepResearch'

// Measured 11/11: the forecast report drew charts of bottled-tea litres, FMCG revenue and food-delivery platforms - series the report itself said it did not use - because the chart is chosen as the
// largest group of figures of the section. A chart is now drawn only from a series the written section talks about.

describe('the flag', () => {
  it('is off by default, on only for "1", locked in production unless the owner lists it', () => {
    expect(researchChartRelevanceOn({})).toBe(false)
    expect(researchChartRelevanceOn({ RESEARCH_CHART_RELEVANCE: '1' })).toBe(true)
    expect(researchChartRelevanceOn({ RESEARCH_CHART_RELEVANCE: 'yes' })).toBe(false)
    expect(researchChartRelevanceOn({ RESEARCH_CHART_RELEVANCE: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(researchChartRelevanceOn({ RESEARCH_CHART_RELEVANCE: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'RESEARCH_CHART_RELEVANCE' })).toBe(true)
  })
})

describe('seriesRelevant', () => {
  const text = 'Phúc Long có doanh thu tăng, cửa hàng mở thêm. Doanh thu bình quân mỗi cửa hàng là 23,5 triệu đồng.'
  it('a series whose words the section uses is relevant, with or without diacritics', () => {
    expect(seriesRelevant('Doanh thu Phúc Long', text)).toBe(true)
    expect(seriesRelevant('Doanh thu Phuc Long', text)).toBe(true)
  })
  it('a series the section never talks about is not', () => {
    expect(seriesRelevant('Sản lượng thị trường trà đóng chai', text)).toBe(false)
    expect(seriesRelevant('GMV giao đồ ăn', text)).toBe(false)
  })
  it('needs at least 60% of the series\' words: 3 of 5 is enough, 2 of 5 is not; years and short words do not count', () => {
    expect(seriesRelevant('doanh thu phuc xanh tim', text)).toBe(true)
    expect(seriesRelevant('doanh thu vang xanh tim', text)).toBe(false)
    expect(seriesRelevant('Doanh thu Phúc Long 2025 (%) và', text)).toBe(true)
  })
  it('an empty series or an empty section is not relevant', () => {
    expect(seriesRelevant('', text)).toBe(false)
    expect(seriesRelevant('Doanh thu', '')).toBe(false)
  })
})

describe('sectionTextOf', () => {
  const report = '# T\n\n## 1. Tóm tắt\nTóm tắt ở đây.\n\n## 2. Chuỗi lớn\nPhúc Long.\n\n### 2.1. Con\nCon của mục hai.\n\n## 3. Giá\nGiá bán.\n'
  it('is the text of that level-2 section including its subsections, up to the next level-2 heading', () => {
    const t = sectionTextOf(report, h => /Chuỗi lớn/.test(h))
    expect(t).toContain('Phúc Long.')
    expect(t).toContain('Con của mục hai.')
    expect(t).not.toContain('Giá bán')
    expect(t).not.toContain('Tóm tắt ở đây')
  })
  it('is empty when no heading matches', () => {
    expect(sectionTextOf(report, () => false)).toBe('')
  })
})

describe('sectionCharts with relevance', () => {
  const plan: ResearchPlan = { title: 'T', steps: [{ title: 'Chuỗi lớn', queries: ['q'] }] }
  const report = '# T\n\n## Chuỗi lớn\nDoanh thu Phúc Long tăng qua các năm.\n'
  const fig = (series: string, label: string, value: number, source = 1): Finding => ({ step: 1, source, text: 't', figure: { series, label, value, unit: 'tỷ' } })
  const findings = [
    fig('Doanh thu Phúc Long', '2023', 1535), fig('Doanh thu Phúc Long', '2024', 1621), fig('Doanh thu Phúc Long', '2025', 1891),
    fig('Sản lượng trà đóng chai', 'A', 790), fig('Sản lượng trà đóng chai', 'B', 824), fig('Sản lượng trà đóng chai', 'C', 860), fig('Sản lượng trà đóng chai', 'D', 900),
  ]
  it('without it the larger group wins, as before', () => {
    expect(sectionCharts(report, plan, findings)[0].title).toBe('Sản lượng trà đóng chai')
  })
  it('with it the chart is the series the section talks about, though the other group is larger', () => {
    const c = sectionCharts(report, plan, findings, undefined, true)
    expect(c).toHaveLength(1)
    expect(c[0].title).toBe('Doanh thu Phúc Long')
  })
  it('with it and no series the section talks about, there is no chart', () => {
    expect(sectionCharts(report, plan, findings.slice(3), undefined, true)).toEqual([])
  })
})

describe('the engine, with and without the flag', () => {
  afterEach(() => vi.unstubAllEnvs())
  const plan: ResearchPlan = { title: 'T', steps: [{ title: 'Chuỗi lớn', queries: ['q'] }] }
  const text = 'Doanh thu Phúc Long 1.535 1.621 1.891 tỷ; sản lượng 790 824 860 900'
  const figs = [['Doanh thu Phúc Long', '2023', 1535], ['Doanh thu Phúc Long', '2024', 1621], ['Doanh thu Phúc Long', '2025', 1891], ['Sản lượng trà đóng chai', 'A', 790], ['Sản lượng trà đóng chai', 'B', 824], ['Sản lượng trà đóng chai', 'C', 860], ['Sản lượng trà đóng chai', 'D', 900]] as const
  function run() {
    const charts: ResearchChart[] = []
    const deps: DeepResearchDeps = {
      async plan() { return structuredClone(plan) },
      async gather() { return [{ title: 'Nguồn', url: 'https://a.vn/p', snippet: 's', text }] },
      async notes(_s: string, _q: string, e: readonly Evidence[]) { return figs.map(([series, label, value], i) => ({ text: `phát hiện ${i}`, source: e[0]!.id, figure: { series, label, value, unit: 'tỷ' } })) },
      async *write() { yield '# B\n\n## Chuỗi lớn\nDoanh thu Phúc Long tăng qua các năm [1]\n' },
    }
    return runDeepResearch('câu hỏi', '', 'vi', deps, { status() {}, text() {}, charts(c) { charts.push(...c) } }).then(() => charts)
  }
  it('flag off: the larger (off-topic) group is drawn, as before', async () => {
    expect((await run())[0].title).toBe('Sản lượng trà đóng chai')
  })
  it('flag on: the series the section talks about is drawn', async () => {
    vi.stubEnv('RESEARCH_CHART_RELEVANCE', '1')
    expect((await run())[0].title).toBe('Doanh thu Phúc Long')
  })
})
