import { describe, it, expect } from 'vitest'
import { consolidate, consolidatedNotes, parsePeriod, freshnessHints } from './consolidate'
import { researchConsolidationOn } from './deepResearchState'
import { checkedFigure, type Finding, type ResearchPlan } from './deepResearch'

// Cases come from the two real reports of 11/11 (TappyAI trend + forecast): the same brand count read as 389 / 313 / 204, a share that "rose then fell" which are two consecutive years, a 2024 reading
// quoted as the latest when 2026 data existed, and the same fact written in three sections.
const NOW = Date.parse('2026-11-11T00:00:00Z')

type F = { series: string; label: string; value: number; unit: string; subject?: string; scope?: string; period?: string }
const mk = (step: number, source: number, text: string, figure?: F): Finding => ({ step, source, text, ...(figure ? { figure } : {}) })
const plan: ResearchPlan = { title: 'T', steps: [{ title: 'Quy mô', queries: ['q'] }, { title: 'Chuỗi lớn', queries: ['q'] }, { title: 'Giá', queries: ['q'] }, { title: 'Bổ sung', queries: ['q'], completes: 2 }] }

describe('the flag', () => {
  it('is off by default, on only for "1", locked in production unless the owner lists it', () => {
    expect(researchConsolidationOn({})).toBe(false)
    expect(researchConsolidationOn({ RESEARCH_CONSOLIDATION: '1' })).toBe(true)
    expect(researchConsolidationOn({ RESEARCH_CONSOLIDATION: 'true' })).toBe(false)
    expect(researchConsolidationOn({ RESEARCH_CONSOLIDATION: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(researchConsolidationOn({ RESEARCH_CONSOLIDATION: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'RESEARCH_CONSOLIDATION' })).toBe(true)
  })
})

describe('parsePeriod', () => {
  it('reads a year, a half and a quarter in the ways the sources write them', () => {
    expect(parsePeriod('2025')?.key).toBe('2025')
    expect(parsePeriod('2026-H1')?.key).toBe('2026-H1')
    expect(parsePeriod('H1 2026')?.key).toBe('2026-H1')
    expect(parsePeriod('6 tháng đầu 2026')?.key).toBe('2026-H1')
    expect(parsePeriod('Quý III/2025')?.key).toBe('2025-Q3')
    expect(parsePeriod('Q1 2025')?.key).toBe('2025-Q1')
  })
  it('is null for no year, and orders a half-year of 2026 after the whole of 2025', () => {
    expect(parsePeriod('Toco Toco')).toBeNull()
    expect(parsePeriod(undefined)).toBeNull()
    expect(parsePeriod('2026-H1')!.order).toBeGreaterThan(parsePeriod('2025')!.order)
  })
})

describe('the same fact in several steps is kept once', () => {
  it('merges a figure read twice (same subject, measure, scope, period, value): one finding, both sources, the earliest section', () => {
    const f = { series: 'Số cửa hàng', label: 'Phúc Long', unit: 'cửa hàng', subject: 'Phúc Long', scope: 'toàn quốc', period: '2025', value: 237 }
    const c = consolidate([mk(2, 3, 'Phúc Long có 237 cửa hàng', f), mk(3, 7, 'Phúc Long: 237 điểm bán năm 2025', f)], NOW)
    expect(c.findings).toHaveLength(1)
    expect(c.findings[0].sources).toEqual([3, 7])
    expect(c.findings[0].steps).toEqual([2, 3])
    expect(c.stats.merged).toBe(1)
  })
  it('merges two near-identical sentences with no figure, and keeps two different ones', () => {
    const a = 'Mixue cắt giảm điểm bán không hiệu quả lần đầu trong nửa đầu 2025'
    const c = consolidate([mk(1, 1, a), mk(5, 2, `${a}.`), mk(5, 3, 'Phúc Long mở thêm 19 cửa hàng trong năm')], NOW)
    expect(c.findings.map(x => x.sources)).toEqual([[1, 2], [3]])
  })
})

describe('what is a conflict and what is not', () => {
  const stores = (source: number, value: number, scope: string, period = '2025', subject = 'Toco Toco'): F => ({ series: 'Số cửa hàng', label: subject, unit: 'cửa hàng', subject, scope, period, value })
  it('two sources, same brand, same scope, same year, different values: a conflict (synonyms of "national" are one scope)', () => {
    const c = consolidate([mk(1, 4, 'x', stores(4, 389, 'toàn quốc')), mk(2, 5, 'y', stores(5, 313, 'Cả nước'))], NOW)
    expect(c.conflicts).toHaveLength(1)
    expect(c.conflicts[0].values.map(v => v.value).sort((a, b) => a - b)).toEqual([313, 389])
  })
  it('national 389 and Hanoi 204 are different scopes: no conflict, listed as a scope split', () => {
    const c = consolidate([mk(1, 4, 'x', stores(4, 389, 'toàn quốc')), mk(2, 5, 'y', stores(5, 204, 'Hà Nội'))], NOW)
    expect(c.conflicts).toHaveLength(0)
    expect(c.scopeSplits).toHaveLength(1)
  })
  it('one value with no scope stated beside one with a scope: "scope unclear", not a contradiction', () => {
    const c = consolidate([mk(1, 4, 'x', stores(4, 389, 'toàn quốc')), mk(2, 5, 'y', stores(5, 204, ''))], NOW)
    expect(c.conflicts).toHaveLength(0)
    expect(c.scopeUnclear).toHaveLength(1)
  })
  it('values within rounding of each other are not a conflict', () => {
    const c = consolidate([mk(1, 4, 'x', stores(4, 12.3, 'toàn quốc')), mk(2, 5, 'y', stores(5, 12.31, 'toàn quốc'))], NOW)
    expect(c.conflicts).toHaveLength(0)
  })
  it('the same source repeating two values is not "two sources disagree"', () => {
    const c = consolidate([mk(1, 4, 'x', stores(4, 389, 'toàn quốc')), mk(2, 4, 'y', stores(4, 313, 'toàn quốc'))], NOW)
    expect(c.conflicts).toHaveLength(0)
  })
})

describe('a share read in consecutive years is a trend, not a contradiction (the "<20k rose then fell" report)', () => {
  const share = (period: string, value: number): F => ({ series: 'Tỷ lệ chi dưới 20.000 đồng', label: 'Dưới 20k', unit: '%', subject: 'chi dưới 20k', scope: 'khảo sát iPOS', period, value })
  const findings = [mk(1, 10, 'a', share('2023', 4.3)), mk(1, 11, 'b', share('2024', 12.3)), mk(2, 12, 'c', share('2024', 12.3)), mk(2, 13, 'd', share('2025', 7.22))]
  it('no conflict; one trend 2023 -> 2024 -> 2025, newest 2025; the 2024 reading keeps both sources', () => {
    const c = consolidate(findings, NOW)
    expect(c.conflicts).toHaveLength(0)
    expect(c.trends).toHaveLength(1)
    expect(c.trends[0].points.map(p => p.period)).toEqual(['2023', '2024', '2025'])
    expect(c.trends[0].points[1].sources).toEqual([11, 12])
    expect(c.trends[0].newest).toBe('2025')
  })
  it('works from the older shape too: a year in the label, no subject / scope / period fields', () => {
    const old = (label: string, value: number, source: number) => mk(1, source, 't', { series: 'Tần suất uống hằng ngày', label, value, unit: '%' })
    const c = consolidate([old('2024', 18.2, 1), old('2025', 13.6, 2)], NOW)
    expect(c.conflicts).toHaveLength(0)
    expect(c.trends[0].points.map(p => p.period)).toEqual(['2024', '2025'])
  })
})

describe('freshness: the newest period found for a measure', () => {
  const spend = (period: string, value: number, source: number) => mk(1, source, 't', { series: 'Chi 21-35k', label: 'Chi 21-35k', unit: '%', subject: 'chi 21-35k', scope: 'khảo sát', period, value })
  it('a measure whose newest reading is two years old is stale; one with a 2026 half-year reading is not', () => {
    expect(consolidate([spend('2023', 29.6, 1), spend('2024', 40, 2)], NOW).stale.map(s => s.newest)).toEqual(['2024'])
    expect(consolidate([spend('2024', 40, 2), spend('2026-H1', 24.59, 3)], NOW).stale).toHaveLength(0)
  })
  it('a measure with no period is never called stale', () => {
    expect(consolidate([mk(1, 1, 't', { series: 'Giá', label: 'Ly trà sữa', unit: 'đồng', value: 35000 })], NOW).stale).toHaveLength(0)
  })
})

// Measured 11/11 (live runs): a run's findings hold dozens of measures that are not the subject (yoghurt share, bottled tea) and 20-40 of them are "old"; handed whole, the list pulls the report off topic.
describe('the old-period list is short and led by the measures read the most', () => {
  const many = (): Finding[] => Array.from({ length: 12 }, (_, i) => Array.from({ length: i + 1 }, (_, k) => mk(1, 100 + i * 20 + k, 't', { series: `Chỉ số ${i}`, label: '2023', unit: '%', value: 10 + k })).flat()).flat()
  it('stale items carry how many readings each has, most-read first', () => {
    const c = consolidate(many(), NOW)
    expect(c.stale).toHaveLength(12)
    expect(c.stale[0].readings).toBe(12)
    const r = c.stale.map(s => s.readings)
    expect(r).toEqual([...r].sort((a, b) => b - a))
  })
  it('the notes show at most 8 and say how many more there are', () => {
    const notes = consolidatedNotes(plan, consolidate(many(), NOW))
    const lines = notes.split('\n').filter(l => /: newest 2023$/.test(l))
    expect(lines).toHaveLength(8)
    expect(lines[0]).toContain('Chỉ số 11')
    expect(notes).toContain('4 more not shown')
  })
  it('with few of them all are shown and nothing is said about more', () => {
    const notes = consolidatedNotes(plan, consolidate(many().slice(0, 3), NOW))
    expect(notes).not.toContain('more not shown')
  })
})

// Measured 11/11: all eight trend reports lacked the 2026 half-year figures that the forecast run of the same hour found; the gap check had no way to know which measures were running on old readings.
describe('freshness hints for the gap check', () => {
  const m = (series: string, period: string, value: number, source: number) => mk(1, source, 't', { series, label: series, unit: '%', subject: series, scope: 'khảo sát', period, value })
  it('a measure read twice whose newest reading is before this year is a hint; one with a current-year reading, a single reading, or no period is not', () => {
    const c = consolidate([m('Chi 21-35k', '2023', 29.6, 1), m('Chi 21-35k', '2024', 40, 2), m('Đã mới', '2024', 1, 3), m('Đã mới', '2026-H1', 2, 4), m('Một lần', '2024', 5, 5), mk(1, 6, 't', { series: 'Không kỳ', label: 'x', unit: '%', value: 3 }), mk(1, 7, 't', { series: 'Không kỳ', label: 'y', unit: '%', value: 4 })], NOW)
    const h = freshnessHints(c, 2026)
    expect(h).toHaveLength(1)
    expect(h[0]).toContain('Chi 21-35k')
    expect(h[0]).toContain('2024')
  })
  it('two readings in the same past year count (2025 is before 2026), the most-read measure first, and at most `limit`', () => {
    const many = Array.from({ length: 9 }, (_, i) => Array.from({ length: i + 2 }, (_, k) => m(`Chỉ số ${i}`, '2025', 10 + k, 100 + i * 20 + k))).flat()
    const h = freshnessHints(consolidate(many, NOW), 2026, 6)
    expect(h).toHaveLength(6)
    expect(h[0]).toContain('Chỉ số 8')
  })
  it('latest lists every dated measure with its newest period and how many readings it has', () => {
    const c = consolidate([m('A', '2023', 1, 1), m('A', '2025', 2, 2), m('B', '2026', 3, 3)], NOW)
    expect(c.latest.map(l => `${l.metric}:${l.newest}:${l.readings}`).sort()).toEqual(['A:2025:2', 'B:2026:1'])
  })
})

describe('the writer notes', () => {
  const f = { series: 'Số cửa hàng', label: 'Toco Toco', unit: 'cửa hàng', subject: 'Toco Toco', scope: 'toàn quốc', period: '2025' }
  const findings = [mk(2, 4, 'Toco Toco có 389 cửa hàng', { ...f, value: 389 }), mk(3, 5, 'Toco Toco có 313 cửa hàng', { ...f, value: 313 }), mk(3, 6, 'Giá trung bình 35.000 đồng')]
  it('puts each finding under its own section once, with all its sources, and says (no findings) for an empty section', () => {
    const notes = consolidatedNotes(plan, consolidate(findings, NOW))
    expect(notes).toContain('## Quy mô\n- (no findings)')
    expect(notes).toContain('- Toco Toco có 389 cửa hàng [4]')
    expect(notes.match(/Giá trung bình 35\.000/g)).toHaveLength(1)
  })
  it('a finding of a follow-up step that completes step 2 goes under step 2', () => {
    const notes = consolidatedNotes(plan, consolidate([mk(4, 9, 'Gong Cha có 46 cửa hàng')], NOW))
    expect(notes).toContain('## Chuỗi lớn\n- Gong Cha có 46 cửa hàng [9]')
  })
  it('states a real conflict with its sources and the rule never to pick one silently; no conflict block when there is none', () => {
    const withConflict = consolidatedNotes(plan, consolidate(findings, NOW))
    expect(withConflict).toContain('never pick one silently')
    expect(withConflict).toContain('389 [4]')
    expect(withConflict).toContain('313 [5]')
    const none = consolidatedNotes(plan, consolidate([findings[2]], NOW))
    expect(none).not.toContain('never pick one silently')
  })
  it('a trend block says these are readings at different dates, not a conflict', () => {
    const t = (period: string, value: number, source: number) => mk(1, source, 't', { series: 'S', label: 'L', unit: '%', subject: 'S', scope: 'x', period, value })
    const notes = consolidatedNotes(plan, consolidate([t('2024', 1, 1), t('2025', 2, 2)], NOW))
    expect(notes).toContain('NOT a conflict')
    expect(notes).toContain('2024: 1 [1]; 2025: 2 [2]')
  })
})

describe('the engine keeps the three new fields of a figure', () => {
  const page = 'Toco Toco có 389 cửa hàng trên toàn quốc năm 2025.'
  it('subject, scope and period survive the check against the source text (trimmed)', () => {
    expect(checkedFigure({ series: 'Số cửa hàng', label: 'Toco Toco', value: 389, unit: 'cửa hàng', subject: ' Toco Toco ', scope: 'toàn quốc', period: '2025' }, page)).toEqual({ series: 'Số cửa hàng', label: 'Toco Toco', value: 389, unit: 'cửa hàng', subject: 'Toco Toco', scope: 'toàn quốc', period: '2025' })
  })
  it('the older shape comes out exactly as before: no new keys, and empty strings add none', () => {
    expect(checkedFigure({ series: 'Số cửa hàng', label: 'Toco Toco', value: 389, unit: 'cửa hàng' }, page)).toEqual({ series: 'Số cửa hàng', label: 'Toco Toco', value: 389, unit: 'cửa hàng' })
    expect(Object.keys(checkedFigure({ series: 'S', label: 'L', value: 389, unit: 'u', subject: '', scope: '', period: '' }, page)!)).toEqual(['series', 'label', 'value', 'unit'])
  })
  it('a value that the source does not write is still dropped, new fields or not', () => {
    expect(checkedFigure({ series: 'S', label: 'L', value: 999, unit: 'u', subject: 'x', scope: 'y', period: '2025' }, page)).toBeUndefined()
  })
})

describe('determinism and edges', () => {
  it('no findings: nothing, and notes still list the sections', () => {
    const c = consolidate([], NOW)
    expect(c.findings).toEqual([])
    expect(consolidatedNotes(plan, c)).toContain('## Giá\n- (no findings)')
  })
  it('the same input gives the same output', () => {
    const f = { series: 'S', label: 'L', unit: '%', subject: 'S', scope: 'x', period: '2025' }
    const input = [mk(1, 1, 'a', { ...f, value: 1 }), mk(2, 2, 'a', { ...f, value: 1 }), mk(2, 3, 'b', { ...f, value: 5 })]
    expect(consolidate(input, NOW)).toEqual(consolidate(input, NOW))
  })
})
