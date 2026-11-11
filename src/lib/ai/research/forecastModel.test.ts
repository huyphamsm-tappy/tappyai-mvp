import { describe, it, expect, afterEach, vi } from 'vitest'
import { groundForecast, runForecast, forecastNotes, packFindingsForForecast, wantsForecastModel, specFromRaw, type ForecastSpec } from './forecastModel'
import { ForecastSpecSchema } from './deepResearchDeps'
import { researchForecastModelOn } from './deepResearchState'
import { numberInText, runDeepResearch, type DeepResearchDeps, type Evidence, type Finding, type ResearchPlan } from './deepResearch'

// The 11/11 forecast report compounded one percentage three ways and "decomposed" it into price and volume by dividing: no drivers, no real sensitivity, no break-even. The model here is computed
// by code from stated assumptions (each labelled as a source's or an assumption); the model call only supplies the inputs and the code refuses a base level no finding states.
const NOW = Date.parse('2026-11-11T00:00:00Z')

const spec = (over: Partial<ForecastSpec> = {}): ForecastSpec => ({
  unit: 'nghìn tỷ đồng', baseYear: 2026,
  base: { value: 100, source: 1, scope: 'toàn quốc' },
  baseRange: { low: 80, high: 120, note: 'định nghĩa khác nhau' },
  years: [2027, 2028, 2029],
  volume: { low: -1.5, base: 1.5, high: 3, basis: 'source', source: 2, note: 'tần suất uống giảm' },
  price: { low: 1.5, base: 3.5, high: 5, basis: 'assumption', note: 'giá và cơ cấu' },
  adjustment: { low: -1.5, base: -0.5, high: 0, years: [2027, 2028], basis: 'assumption', note: 'thuế đồ uống có đường' },
  ...over,
})
const findings: Finding[] = [
  { step: 1, source: 1, text: 'Quy mô thị trường năm 2026 khoảng 100 nghìn tỷ đồng', figure: { series: 'Quy mô', label: '2026', value: 100, unit: 'nghìn tỷ đồng' } },
  { step: 1, source: 2, text: 'Doanh thu bình quân mỗi cửa hàng tăng 1,5% trong nửa đầu năm' },
]
// an independent formula, not the module's own: value after n years at the given per-year percentages, with the adjustment in the listed years only
const by = (base: number, vol: number, price: number, adj: number, years: number, adjYears: number) => base * Math.pow((1 + vol / 100) * (1 + price / 100), years) * Math.pow(1 + adj / 100, adjYears)

describe('the flag and the question', () => {
  it('the flag is off by default, on only for "1", locked in production unless the owner lists it', () => {
    expect(researchForecastModelOn({})).toBe(false)
    expect(researchForecastModelOn({ RESEARCH_FORECAST_MODEL: '1' })).toBe(true)
    expect(researchForecastModelOn({ RESEARCH_FORECAST_MODEL: 'on' })).toBe(false)
    expect(researchForecastModelOn({ RESEARCH_FORECAST_MODEL: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(researchForecastModelOn({ RESEARCH_FORECAST_MODEL: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'RESEARCH_FORECAST_MODEL' })).toBe(true)
  })
  it('only a question that asks about the future wants the model: forecast words, or a year after this one', () => {
    expect(wantsForecastModel('Dự báo doanh thu trà sữa Việt Nam 2027–2029 và phân tích độ nhạy', NOW)).toBe(true)
    expect(wantsForecastModel('What will revenue be in 2028?', NOW)).toBe(true)
    expect(wantsForecastModel('Quy mô thị trường trà sữa Việt Nam năm 2025', NOW)).toBe(false)
    expect(wantsForecastModel('Xu hướng thị trường trà sữa tại Hà Nội', NOW)).toBe(false)
  })
})

describe('runForecast: scenarios', () => {
  const r = runForecast(spec())
  it('the base scenario compounds volume, price and the adjustment (only in its listed years), year by year', () => {
    const base = r.scenarios.find(s => s.name === 'base')!
    expect(base.series.map(x => x.year)).toEqual([2027, 2028, 2029])
    expect(base.series[0].value).toBeCloseTo(by(100, 1.5, 3.5, -0.5, 1, 1), 6)
    expect(base.series[1].value).toBeCloseTo(by(100, 1.5, 3.5, -0.5, 2, 2), 6)
    expect(base.series[2].value).toBeCloseTo(by(100, 1.5, 3.5, -0.5, 3, 2), 6)
  })
  it('low and high use each assumption\'s own low and high; the growth rate over the period is derived from the end value', () => {
    expect(r.scenarios.find(s => s.name === 'low')!.series[2].value).toBeCloseTo(by(100, -1.5, 1.5, -1.5, 3, 2), 6)
    expect(r.scenarios.find(s => s.name === 'high')!.series[2].value).toBeCloseTo(by(100, 3, 5, 0, 3, 2), 6)
    const base = r.scenarios.find(s => s.name === 'base')!
    expect(base.cagr).toBeCloseTo((Math.pow(base.series[2].value / 100, 1 / 3) - 1) * 100, 6)
  })
  it('a year between the base year and the first asked year is compounded but not listed', () => {
    const r2 = runForecast(spec({ years: [2028, 2029], adjustment: undefined }))
    expect(r2.scenarios[0].series.map(x => x.year)).toEqual([2028, 2029])
    expect(r2.scenarios.find(s => s.name === 'base')!.series[0].value).toBeCloseTo(by(100, 1.5, 3.5, 0, 2, 0), 6)
  })
})

describe('runForecast: sensitivity, two-way table, break-even', () => {
  const r = runForecast(spec())
  const last = by(100, 1.5, 3.5, -0.5, 3, 2)
  it('the tornado moves ONE assumption at a time, others at base, ranked by the size of the swing; the base level moves the whole level', () => {
    const vol = r.tornado.find(t => t.driver === 'volume')!
    expect(vol.lowValue).toBeCloseTo(by(100, -1.5, 3.5, -0.5, 3, 2), 6)
    expect(vol.highValue).toBeCloseTo(by(100, 3, 3.5, -0.5, 3, 2), 6)
    expect(vol.lowDeltaPct).toBeCloseTo((vol.lowValue / last - 1) * 100, 6)
    const lvl = r.tornado.find(t => t.driver === 'base_level')!
    expect(lvl.lowValue).toBeCloseTo(last * 0.8, 6)
    expect(lvl.highValue).toBeCloseTo(last * 1.2, 6)
    expect(r.tornado[0].driver).toBe('base_level')
    const swings = r.tornado.map(t => t.swingPct)
    expect(swings).toEqual([...swings].sort((a, b) => b - a))
    expect(r.tornado.map(t => t.driver).sort()).toEqual(['adjustment', 'base_level', 'price', 'volume'])
  })
  it('without a base range or an adjustment those rows are absent', () => {
    const t = runForecast(spec({ baseRange: undefined, adjustment: undefined })).tornado.map(x => x.driver).sort()
    expect(t).toEqual(['price', 'volume'])
  })
  it('the two-way table is 5 by 5, its centre is the base scenario, and it rises along both axes', () => {
    const g = r.grid
    expect(g.volumes).toEqual([-1.5, 0, 1.5, 2.25, 3])
    expect(g.prices).toEqual([1.5, 2.5, 3.5, 4.25, 5])
    expect(g.cells[2][2].value).toBeCloseTo(last, 6)
    for (let i = 0; i < 5; i++) for (let j = 1; j < 5; j++) { expect(g.cells[i][j].value).toBeGreaterThan(g.cells[i][j - 1].value); expect(g.cells[j][i].value).toBeGreaterThan(g.cells[j - 1][i].value) }
  })
  it('break-even: at the price growth it gives, the last-year value equals the base-year value (checked by plugging it back)', () => {
    for (const b of r.breakeven) expect(by(100, b.volume, b.priceGrowth, -0.5, 3, 2)).toBeCloseTo(100, 6)
    expect(r.breakeven.find(b => b.volume === 3)!.priceGrowth).toBeLessThan(0)
    expect(r.breakeven.find(b => b.volume === -1.5)!.priceGrowth).toBeGreaterThan(0)
  })
})

describe('groundForecast: the inputs are held to the findings', () => {
  const ok = (s: ForecastSpec, f: readonly Finding[] = findings) => groundForecast(s, f, numberInText)
  it('a spec whose base value a finding of that source states is accepted unchanged', () => {
    const g = ok(spec())
    expect(g.ok).toBe(true)
    if (g.ok) { expect(g.downgrades).toEqual([]); expect(g.spec.volume.basis).toBe('source') }
  })
  it('a base value no finding states is refused, and so is one that another source states', () => {
    expect(ok(spec({ base: { value: 500, source: 1, scope: 'x' }, baseRange: undefined }))).toEqual({ ok: false, reason: 'base_not_in_findings' })
    expect(ok(spec({ base: { value: 100, source: 2, scope: 'x' } }))).toEqual({ ok: false, reason: 'base_not_in_findings' })
  })
  it('a "source" assumption whose value is not in the finding it cites becomes an assumption, and is reported', () => {
    const g = ok(spec({ volume: { low: -1.5, base: 2.2, high: 3, basis: 'source', source: 2, note: 'n' } }))
    expect(g.ok).toBe(true)
    if (g.ok) { expect(g.spec.volume.basis).toBe('assumption'); expect(g.spec.volume.source).toBeUndefined(); expect(g.downgrades).toHaveLength(1) }
  })
  it('refuses an assumption out of order, silly years, a rate beyond 50% a year, and a base range that excludes the base', () => {
    expect(ok(spec({ price: { low: 5, base: 3.5, high: 1.5, basis: 'assumption', note: 'n' } }))).toEqual({ ok: false, reason: 'assumption_order' })
    expect(ok(spec({ years: [2025, 2027] }))).toEqual({ ok: false, reason: 'bad_years' })
    expect(ok(spec({ years: [] }))).toEqual({ ok: false, reason: 'bad_years' })
    expect(ok(spec({ years: [2027, 2040] }))).toEqual({ ok: false, reason: 'bad_years' })
    expect(ok(spec({ volume: { low: -1, base: 60, high: 70, basis: 'assumption', note: 'n' } }))).toEqual({ ok: false, reason: 'rate_out_of_range' })
    expect(ok(spec({ baseRange: { low: 110, high: 120, note: 'n' } }))).toEqual({ ok: false, reason: 'bad_base_range' })
    expect(ok(spec({ adjustment: { low: -1, base: -0.5, high: 0, years: [2035], basis: 'assumption', note: 'n' } }))).toEqual({ ok: false, reason: 'bad_years' })
  })
  it('anything that is not a spec is refused, never thrown', () => {
    expect(groundForecast(null as never, findings, numberInText)).toEqual({ ok: false, reason: 'bad_shape' })
    expect(groundForecast({ unit: 'x' } as never, findings, numberInText)).toEqual({ ok: false, reason: 'bad_shape' })
  })
})

describe('what the writer is given', () => {
  const notes = forecastNotes(runForecast(spec()))
  it('names the rule, the scenario table by year, the ranked sensitivity, the break-even and every assumption with its basis', () => {
    expect(notes).toContain('never do your own arithmetic')
    expect(notes).toMatch(/\| 2027 \| [\d.]+ \| [\d.]+ \| [\d.]+ \|/)
    expect(notes).toContain('### Sensitivity')
    expect(notes).toContain('### Break-even')
    expect(notes).toContain('source [2]')
    expect(notes).toContain('assumption (no source)')
    expect(notes).toContain('Base level')
  })
  it('without a base range or adjustment those lines are not there', () => {
    const n = forecastNotes(runForecast(spec({ baseRange: undefined, adjustment: undefined })))
    expect(n).not.toContain('Base level range')
    expect(n).not.toContain('Adjustment')
  })
})

describe('packFindingsForForecast', () => {
  it('figure findings first, each tagged with its source number, inside the budget', () => {
    const lines = packFindingsForForecast([{ step: 1, source: 7, text: 'không có số' }, { step: 1, source: 3, text: 'có số', figure: { series: 's', label: 'l', value: 1, unit: 'u' } }], 1000)
    expect(lines).toEqual(['[3] có số', '[7] không có số'])
    expect(packFindingsForForecast(Array.from({ length: 50 }, (_, i) => ({ step: 1, source: i + 1, text: 'x'.repeat(100) })), 1000).join('\n').length).toBeLessThanOrEqual(1000)
  })
})

describe('the model\'s structured answer', () => {
  const raw = {
    unit: 'nghìn tỷ đồng', baseYear: 2026, base: { value: 100, source: 1, scope: 'toàn quốc', note: '' }, baseRange: null, years: [2027, 2028],
    volume: { low: -1, base: 1.5, high: 3, basis: 'source' as const, source: 2, note: 'n' },
    price: { low: 1, base: 3, high: 4, basis: 'assumption' as const, source: null, note: 'n' },
    adjustment: null,
  }
  it('nulls become absent keys, an empty note is dropped, and the result passes the grounding like a hand-written spec', () => {
    const s = specFromRaw(raw)
    expect('baseRange' in s).toBe(false)
    expect('adjustment' in s).toBe(false)
    expect('source' in s.price).toBe(false)
    expect(s.volume.source).toBe(2)
    expect('note' in s.base).toBe(false)
    expect(groundForecast(s, findings, numberInText).ok).toBe(true)
  })
  it('the schema asks for every field the code needs, with nulls allowed only where a field may not apply', () => {
    expect(ForecastSpecSchema.safeParse(raw).success).toBe(true)
    expect(ForecastSpecSchema.safeParse({ ...raw, base: { ...raw.base, source: undefined } }).success).toBe(false)
    expect(ForecastSpecSchema.safeParse({ ...raw, volume: { ...raw.volume, basis: 'guess' } }).success).toBe(false)
    expect(ForecastSpecSchema.safeParse({ ...raw, years: undefined }).success).toBe(false)
  })
})

describe('the engine', () => {
  afterEach(() => vi.unstubAllEnvs())
  const plan: ResearchPlan = { title: 'T', steps: [{ title: 'Quy mô', queries: ['q'] }] }
  function run(question: string, forecast?: DeepResearchDeps['forecast']) {
    const seen: Array<Record<string, unknown>> = []
    const traces: Array<Record<string, unknown>> = []
    const asked: unknown[] = []
    const deps: DeepResearchDeps = {
      async plan() { return structuredClone(plan) },
      async gather() { return [{ title: 'Nguồn', url: 'https://a.vn/p', snippet: 's', text: 'Quy mô thị trường năm 2026 khoảng 100 nghìn tỷ đồng' }] },
      async notes(_s: string, _q: string, e: readonly Evidence[]) { return [{ text: 'Quy mô thị trường năm 2026 khoảng 100 nghìn tỷ đồng', source: e[0]!.id, figure: { series: 'Quy mô', label: '2026', value: 100, unit: 'nghìn tỷ đồng' } }] },
      async *write(i) { seen.push(i as unknown as Record<string, unknown>); yield '# B\n\n## Quy mô\nNội dung [1]\n' },
      trace: e => { traces.push(e) },
      ...(forecast ? { forecast: async (i: Parameters<NonNullable<DeepResearchDeps['forecast']>>[0]) => { asked.push(i); return forecast(i) } } : {}),
    }
    return runDeepResearch(question, '', 'vi', deps, { status() {}, text() {} }).then(() => ({ seen, traces, asked }))
  }
  const give = async () => spec()
  const Q = 'Dự báo doanh thu trà sữa Việt Nam 2027–2029 và phân tích độ nhạy'
  it('flag on, a forecast question, a grounded spec: the writer gets the computed model, with the findings the call saw', async () => {
    vi.stubEnv('RESEARCH_FORECAST_MODEL', '1')
    const r = await run(Q, give)
    expect((r.seen[0].forecast as { scenarios: unknown[] }).scenarios).toHaveLength(3)
    expect(r.asked).toHaveLength(1)
    expect(r.traces.find(t => t.ev === 'forecast')).toMatchObject({ ok: true })
  })
  it('flag off: the call is never made and the writer\'s input has no forecast key', async () => {
    const r = await run(Q, give)
    expect(r.asked).toHaveLength(0)
    expect('forecast' in r.seen[0]).toBe(false)
  })
  it('flag on but not a forecast question: no call', async () => {
    vi.stubEnv('RESEARCH_FORECAST_MODEL', '1')
    expect((await run('Xu hướng thị trường trà sữa tại Hà Nội', give)).asked).toHaveLength(0)
  })
  it('an ungrounded spec, a failing call, and no spec all leave the report as before, and say why in the log', async () => {
    vi.stubEnv('RESEARCH_FORECAST_MODEL', '1')
    const bad = await run(Q, async () => spec({ base: { value: 999, source: 1, scope: 'x' }, baseRange: undefined }))
    expect('forecast' in bad.seen[0]).toBe(false)
    expect(bad.traces.find(t => t.ev === 'forecast')).toMatchObject({ ok: false, reason: 'base_not_in_findings' })
    const boom = await run(Q, async () => { throw new Error('x') })
    expect('forecast' in boom.seen[0]).toBe(false)
    const none = await run(Q, async () => null)
    expect('forecast' in none.seen[0]).toBe(false)
  })
})
