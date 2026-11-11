import { describe, it, expect, afterEach, vi } from 'vitest'
import { runDeepResearch, type DeepResearchDeps, type ResearchPlan } from './deepResearch'
import { researchThesisOn, researchEvidenceCardsOn } from './deepResearchState'
import { outlineFrom, analystCards, outlineWriterInput, releaseText, type Outline } from './thesisReport'
import type { EvidenceCard } from './evidenceCards'
import type { Evidence } from './deepResearch'

const card = (n: number, o: Partial<EvidenceCard> = {}): EvidenceCard => ({
  id: `C${n}`, step: 1, source: n, text: `fact ${n}`, quoteStatus: 'VERIFIED', figureInQuote: false, sourceKind: 'PRESS', host: `h${n}.vn`, family: 'statistic', authority: 'MEDIUM',
  independenceGroup: `h${n}.vn`, score: 3, confidence: 'MEDIUM', ...o,
} as EvidenceCard)
const ev = (id: number, text = ''): Evidence => ({ id, title: `Source ${id}`, url: `https://h${id}.vn/a`, snippet: '', text, site: `h${id}.vn` } as Evidence)

describe('flag', () => {
  it('is off unless exactly 1, locked in production, and it switches the cards on', () => {
    expect(researchThesisOn({})).toBe(false)
    expect(researchThesisOn({ RESEARCH_THESIS_REPORT: '1' })).toBe(true)
    expect(researchThesisOn({ RESEARCH_THESIS_REPORT: 'true' })).toBe(false)
    expect(researchThesisOn({ RESEARCH_THESIS_REPORT: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(researchEvidenceCardsOn({ RESEARCH_THESIS_REPORT: '1' })).toBe(true)
    expect(researchEvidenceCardsOn({})).toBe(false)
  })
})

describe('outlineFrom: the analyst may only point at cards that exist', () => {
  const cards = [card(1), card(2), card(3), card(4)]
  const raw = {
    thesis: 'The market moved up-market',
    sections: [
      { title: 'Price moved up', points: [{ claim: 'Prices rose', cards: ['C1', 'C2', 'C99'] }, { claim: 'Nothing behind this', cards: ['C77'] }] },
      { title: 'Tax arrives', points: [{ claim: 'Tax from 2027', cards: ['C3'] }] },
      { title: 'Empty section', points: [{ claim: 'x', cards: [] }] },
    ],
    doubts: ['sources differ on size'],
  }
  it('drops unknown card ids, points with no real card, and sections left with no point', () => {
    const o = outlineFrom(raw, cards, { minSections: 2, maxSections: 6 })!
    expect(o.thesis).toBe('The market moved up-market')
    expect(o.sections.map(s => s.title)).toEqual(['Price moved up', 'Tax arrives'])
    expect(o.sections[0].points).toEqual([{ claim: 'Prices rose', cards: ['C1', 'C2'] }])
    expect(o.doubts).toEqual(['sources differ on size'])
  })
  it('refuses an outline with no thesis or too few sections (the engine then writes the way it did before)', () => {
    expect(outlineFrom({ ...raw, thesis: '  ' }, cards, { minSections: 2, maxSections: 6 })).toBeNull()
    expect(outlineFrom({ ...raw, sections: [raw.sections[0]] }, cards, { minSections: 2, maxSections: 6 })).toBeNull()
    expect(outlineFrom(null, cards, { minSections: 2, maxSections: 6 })).toBeNull()
    expect(outlineFrom('text', cards, { minSections: 2, maxSections: 6 })).toBeNull()
  })
  it('keeps at most maxSections', () => {
    const many = { thesis: 't', sections: Array.from({ length: 9 }, (_, i) => ({ title: `S${i}`, points: [{ claim: 'c', cards: ['C1'] }] })) }
    expect(outlineFrom(many, cards, { minSections: 2, maxSections: 4 })!.sections).toHaveLength(4)
  })
})

describe('analystCards: what the analyst reads', () => {
  it('lists the readable cards with confidence, kind and the support of their fact; never an UNVERIFIED quote', () => {
    const cards = [card(1, { confidence: 'HIGH' }), card(2, { quoteStatus: 'UNVERIFIED' }), card(3)]
    const out = analystCards(cards, new Map([['C1', 'STRONG']]), 10)
    expect(out).toContain('C1')
    expect(out).toContain('HIGH')
    expect(out).toContain('STRONG')
    expect(out).not.toContain('C2')
    expect(out).toContain('C3')
  })
})

describe('outlineWriterInput: the writer is handed the outline and only the sources it uses, under the run\'s own numbers', () => {
  // the cards carry the sources' original ids (5, 7, 9); the run numbers the cited ones 1, 2, 3
  const cards = [card(1, { source: 5, text: 'Price rose 10% in 2026' }), card(2, { source: 7, text: 'Tax 8% from 2027' }), card(3, { source: 5, text: 'Another fact' })]
  const outline: Outline = { thesis: 'T', sections: [{ title: 'A', points: [{ claim: 'p1', cards: ['C1', 'C3'] }] }, { title: 'B', points: [{ claim: 'p2', cards: ['C2'] }] }], doubts: [] }
  const cited = [ev(1), ev(2), ev(3)]
  const number = new Map([[5, 1], [7, 2], [9, 3]])
  it('cites by the run\'s numbers and leaves the unused source out', () => {
    const w = outlineWriterInput(outline, cards, cited, number)
    expect(w.sources.map(s => s.id)).toEqual([1, 2])
    expect(w.notes).toContain('## A')
    expect(w.notes).toContain('Price rose 10% in 2026 [1]')
    expect(w.notes).toContain('Tax 8% from 2027 [2]')
    expect(w.notes).toContain('THESIS: T')
  })
  it('adds a source the scenario model cites even when no point uses it', () => {
    expect(outlineWriterInput(outline, cards, cited, number, [3]).sources.map(s => s.id)).toEqual([1, 2, 3])
  })
  it('gives the chart code a plan and findings with the same numbers and the same section titles', () => {
    const w = outlineWriterInput(outline, cards, cited, number)
    expect(w.plan.steps.map(s => s.title)).toEqual(['A', 'B'])
    expect(w.findings.map(f => [f.step, f.source])).toEqual([[1, 1], [1, 1], [2, 2]])
  })
})

describe('releaseText: only checked text is shown', () => {
  const sources = [
    { id: 1, title: 'S1', snippet: '', text: 'Doanh thu năm 2025 đạt 12.500 tỷ đồng.' },
    { id: 2, title: 'S2', snippet: '', text: 'Có 700 cửa hàng.' },
    { id: 3, title: 'S3', snippet: '', text: 'unused source' },
  ]
  it('drops a sentence whose figure is not in the source it cites, and a citation to a source that does not exist', () => {
    const report = '## 1. A\nDoanh thu đạt 12.500 tỷ đồng [1]. Doanh thu đạt 99.999 tỷ đồng [1]. Có 700 cửa hàng [2]. Chuỗi mở thêm 800 cửa hàng [9].'
    const r = releaseText(report, sources)
    expect(r.text).toContain('12.500')
    expect(r.text).toContain('700 cửa hàng')
    expect(r.text).not.toContain('99.999')
    expect(r.text).not.toContain('800 cửa hàng')
    expect(r.dropped).toBe(2)
  })
  it('keeps headings, tables and sentences without figures, and renumbers the citations that remain', () => {
    const report = '## 1. A\nCó 700 cửa hàng [2].\n\n## 2. B\nDoanh thu đạt 12.500 tỷ đồng [1]. Đây là nhận định không có số.\n| Kịch bản | 2027 |\n| thấp | 120 |'
    const r = releaseText(report, sources)
    expect(r.text).toContain('## 2. B')
    expect(r.text).toContain('| thấp | 120 |')
    expect(r.text).toContain('Đây là nhận định không có số.')
    expect(r.text).toContain('Có 700 cửa hàng [1]')
    expect(r.text).toContain('12.500 tỷ đồng [2]')
    expect(r.used.map(s => s.id)).toEqual([1, 2])
    expect(r.used.map(s => s.title)).toEqual(['S2', 'S1'])
  })
  it('drops a sentence with a figure and no citation at all', () => {
    const r = releaseText('Thị trường tăng 35% mỗi năm.', sources)
    expect(r.text).not.toContain('35%')
    expect(r.dropped).toBe(1)
  })
})

describe('the engine with a thesis', () => {
  afterEach(() => vi.unstubAllEnvs())
  const PAGE = 'Theo khảo sát của iPOS.vn, nhóm chi 36.000–70.000 đồng một ly tăng từ 48,29% lên 61,78% trong nửa đầu năm 2026.'
  const plan: ResearchPlan = { title: 'T', steps: [{ title: 'Chi tiêu', queries: ['q'] }] }
  const outline: Outline = { thesis: 'Dòng tiền dịch lên nhóm giá cao', sections: [{ title: 'Giá tăng', points: [{ claim: 'p', cards: ['C1'] }] }, { title: 'Còn lại', points: [{ claim: 'q', cards: ['C1'] }] }], doubts: [] }
  const seen: { analyzed: number; thesisNotes?: string; emittedAtSecondChunk: number } = { analyzed: 0, emittedAtSecondChunk: -1 }
  function run(analyze: DeepResearchDeps['analyze']) {
    seen.analyzed = 0; seen.thesisNotes = undefined; seen.emittedAtSecondChunk = -1
    let emitted = ''
    const deps: DeepResearchDeps = {
      async plan() { return structuredClone(plan) },
      async gather() { return [{ title: 'iPOS', url: 'https://ipos.vn/bao-cao', snippet: 's', text: PAGE }] },
      async notes(_s: string, _q: string, e: readonly Evidence[]) { return [{ text: 'Nhóm 36–70k tăng lên 61,78%', source: e[0]!.id, quote: 'nhóm chi 36.000–70.000 đồng một ly tăng từ 48,29% lên 61,78%' }] as never },
      ...(analyze ? { analyze: async (i: never) => { seen.analyzed++; return analyze(i) } } : {}),
      async *write(i) {
        seen.thesisNotes = i.thesisNotes
        yield '# Báo cáo\n\n## 1. Giá tăng\nNhóm giá cao tăng lên 61,78% [1]. '
        seen.emittedAtSecondChunk = emitted.length
        yield 'Nhóm giá cao đạt 99,99% [1]. Đây là nhận định không có số.\n'
      },
    }
    return runDeepResearch('câu hỏi', '', 'vi', deps, { status() {}, text(x) { emitted += x } }).then(out => ({ out, emitted }))
  }
  it('flag on: the writer gets the outline, nothing is shown until the code has read the text, and a figure the source lacks is dropped', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1')
    const { out, emitted } = await run(async () => outline)
    expect(seen.analyzed).toBe(1)
    expect(seen.thesisNotes).toContain('THESIS: Dòng tiền dịch lên nhóm giá cao')
    expect(seen.emittedAtSecondChunk).toBe(0)
    expect(emitted).toContain('61,78%')
    expect(emitted).not.toContain('99,99')
    expect(emitted).toContain('Đây là nhận định không có số.')
    expect(emitted).toContain('iPOS')
    expect(out.thesis).toEqual({ dropped: 1, charsBefore: expect.any(Number) })
  })
  it('flag on but the analyst gives nothing: the report is written from the findings as before, streamed', async () => {
    vi.stubEnv('RESEARCH_THESIS_REPORT', '1')
    const { out, emitted } = await run(async () => null)
    expect(seen.analyzed).toBe(1)
    expect(seen.thesisNotes).toBeUndefined()
    expect(seen.emittedAtSecondChunk).toBeGreaterThan(0)
    expect(emitted).toContain('99,99')
    expect(out.thesis).toBeUndefined()
  })
  it('flag off: the analyst is never called', async () => {
    const { out } = await run(async () => outline)
    expect(seen.analyzed).toBe(0)
    expect(out.thesis).toBeUndefined()
  })
})
