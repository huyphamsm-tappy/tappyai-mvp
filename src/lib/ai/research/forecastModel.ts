// A scenario model computed by code (11/11, after the forecast report: one percentage compounded three ways, price and volume "decomposed" by dividing, no drivers, no real sensitivity, no break-even).
// Pure and deterministic. Behind RESEARCH_FORECAST_MODEL (deepResearchState.ts), off by default, locked in production, Advanced only (the dependency exists only there).
//   The model call supplies INPUTS only (a ForecastSpec: the base level, the forecast years, low / base / high per-year assumptions for volume, price-and-mix and an adjustment such as a tax),
//   each labelled as a finding's (basis "source" + the finding's number) or an assumption. It never computes the forecast.
//   groundForecast() holds the inputs to the findings: a base level no finding of the cited source states is refused (the model may not invent the number everything stands on); a "source"
//                    assumption whose value is not in the finding it cites becomes an assumption, and is reported; shape, years, order and size are checked.
//   runForecast()    computes the scenarios, a one-at-a-time sensitivity ranking, a two-way table and the break-even, from the inputs alone.
//   forecastNotes()  is what the writer is given: the tables and the rule to use the numbers exactly.

import type { Finding } from './deepResearch'
import { fold } from './researchSignals'

export interface RateRange { /** percent per year; low is the most adverse, high the most favourable */ low: number; base: number; high: number }
export interface Basis { basis: 'source' | 'assumption'; source?: number; note: string }
export interface ForecastSpec {
  unit: string
  baseYear: number
  base: { value: number; source: number; scope: string; note?: string }
  /** other defensible levels of the base in the same unit (different definitions of the market), when the findings give them */
  baseRange?: { low: number; high: number; note: string }
  /** the years the question asks for, ascending; every year from baseYear + 1 is compounded, only these are listed */
  years: number[]
  volume: RateRange & Basis
  price: RateRange & Basis
  /** an effect applied only in the listed years (a tax, a rule), percent per year, 0 when none */
  adjustment?: RateRange & Basis & { years: number[] }
}

/** The model's structured answer as the schema returns it (nulls where a field does not apply). */
type RawRate = RateRange & { basis: 'source' | 'assumption'; source?: number | null; note: string }
export interface ForecastSpecRaw {
  unit: string; baseYear: number
  base: { value: number; source: number; scope: string; note?: string }
  baseRange?: { low: number; high: number; note: string } | null
  years: number[]
  volume: RawRate; price: RawRate
  adjustment?: (RawRate & { years: number[] }) | null
}
/** The inputs call is made once more when its first answer fails (a model answer that does not match the schema is occasional); a second failure is the caller's. */
export async function askTwice<T>(ask: () => Promise<T>): Promise<T> {
  try { return await ask() } catch { return ask() }
}
/** Raw structured answer to ForecastSpec: null becomes absent, an empty note is dropped. Pure. */
export function specFromRaw(r: ForecastSpecRaw): ForecastSpec {
  const rate = <T extends RawRate>(x: T) => { const { source, ...rest } = x; return { ...rest, ...(source !== null && source !== undefined ? { source } : {}) } }
  return {
    unit: r.unit, baseYear: r.baseYear,
    base: { value: r.base.value, source: r.base.source, scope: r.base.scope, ...(r.base.note ? { note: r.base.note } : {}) },
    ...(r.baseRange ? { baseRange: r.baseRange } : {}),
    years: r.years,
    volume: rate(r.volume), price: rate(r.price),
    ...(r.adjustment ? { adjustment: rate(r.adjustment) } : {}),
  }
}

export type GroundReject = 'bad_shape' | 'bad_years' | 'rate_out_of_range' | 'assumption_order' | 'bad_base_range' | 'base_not_in_findings' | 'base_not_on_page'
export type Grounded = { ok: true; spec: ForecastSpec; downgrades: string[] } | { ok: false; reason: GroundReject }

const MAX_RATE = 50
const MAX_SPAN = 8
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isInt = (x: unknown): x is number => isNum(x) && Number.isInteger(x)
const isRange = (r: unknown): r is RateRange & Basis => { const x = r as Partial<RateRange & Basis> | null; return !!x && typeof x === 'object' && isNum(x.low) && isNum(x.base) && isNum(x.high) && (x.basis === 'source' || x.basis === 'assumption') && typeof x.note === 'string' && (x.source === undefined || isInt(x.source)) }

/** Whether a question asks about the future: forecast words, or a year after this one. Pure. */
export function wantsForecastModel(question: string, now: number = Date.now()): boolean {
  const f = fold(String(question ?? '').slice(0, 2000))
  if (/(du bao|forecast|projection|kich ban|scenario|cagr|do nhay|sensitivity)/.test(f)) return true
  const nowYear = new Date(now).getUTCFullYear()
  return [...f.matchAll(/(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/g)].some(m => Number(m[1]) > nowYear)
}

/** The findings the spec call reads: one line "[source] text", the findings with a figure first, never more than `budget` characters. Pure. */
export function packFindingsForForecast(findings: readonly Finding[], budget = 30_000): string[] {
  const out: string[] = []
  let used = 0
  for (const f of [...findings].sort((a, b) => Number(!!b.figure) - Number(!!a.figure))) {
    const line = `[${f.source}] ${f.text}`
    const cost = (out.length ? 1 : 0) + line.length
    if (used + cost > budget) break
    out.push(line); used += cost
  }
  return out
}

/**
 * Hold a spec to the findings. `numberIn(value, text)` says whether a value is written in a text (deepResearch's numberInText, passed in so this file does not import the engine). The checks run in this
 * order: shape, years, rate size, assumption order, base range, then the base level itself. Pure; never throws.
 */
export function groundForecast(spec: ForecastSpec, findings: readonly Finding[], numberIn: (value: number, text: string) => boolean,
  /** 15/11: whether the base level is written on the SOURCE'S OWN PAGE (a card whose verified quote holds the figure's number), not only in a note the model wrote about it. Absent = the older check alone. */
  onPage?: (source: number, value: number) => boolean): Grounded {
  const no = (reason: GroundReject): Grounded => ({ ok: false, reason })
  const s = spec as Partial<ForecastSpec> | null
  if (!s || typeof s !== 'object' || typeof s.unit !== 'string' || !isInt(s.baseYear) || !s.base || !isNum(s.base.value) || s.base.value <= 0 || !isInt(s.base.source) || typeof s.base.scope !== 'string'
    || !Array.isArray(s.years) || !isRange(s.volume) || !isRange(s.price) || (s.adjustment !== undefined && (!isRange(s.adjustment) || !Array.isArray(s.adjustment.years)))) return no('bad_shape')
  const { baseYear, years } = s as ForecastSpec
  const last = years[years.length - 1]
  if (!years.length || !years.every(isInt) || years.some((y, i) => y <= baseYear || (i > 0 && y <= years[i - 1])) || last - baseYear > MAX_SPAN) return no('bad_years')
  const adj = (s as ForecastSpec).adjustment
  if (adj && (!adj.years.every(isInt) || adj.years.some(y => y <= baseYear || y > last))) return no('bad_years')
  const ranges = [(s as ForecastSpec).volume, (s as ForecastSpec).price, ...(adj ? [adj] : [])]
  if (ranges.some(r => [r.low, r.base, r.high].some(x => Math.abs(x) > MAX_RATE))) return no('rate_out_of_range')
  if (ranges.some(r => !(r.low <= r.base && r.base <= r.high))) return no('assumption_order')
  const sp = s as ForecastSpec
  if (sp.baseRange && (!isNum(sp.baseRange.low) || !isNum(sp.baseRange.high) || sp.baseRange.low > sp.base.value || sp.baseRange.high < sp.base.value || sp.baseRange.low <= 0 || typeof sp.baseRange.note !== 'string')) return no('bad_base_range')
  const stated = (value: number, source: number) => findings.some(f => f.source === source && ((f.figure && Math.abs(f.figure.value - value) <= Math.abs(value) * 1e-9) || numberIn(value, f.text)))
  if (!stated(sp.base.value, sp.base.source)) return no('base_not_in_findings')
  if (onPage && !onPage(sp.base.source, sp.base.value)) return no('base_not_on_page')
  const downgrades: string[] = []
  const check = <T extends RateRange & Basis>(r: T, name: string): T => {
    if (r.basis !== 'source') return r
    if (r.source !== undefined && stated(Math.abs(r.base), r.source)) return r
    downgrades.push(name)
    const { source: _dropped, ...rest } = r
    void _dropped
    return { ...rest, basis: 'assumption' } as T
  }
  const volume = check(sp.volume, 'volume')
  const price = check(sp.price, 'price')
  const adjustment = adj ? check(adj, 'adjustment') : undefined
  return { ok: true, spec: { ...sp, volume, price, ...(adjustment ? { adjustment } : {}) }, downgrades }
}

export interface ScenarioRow { year: number; value: number }
export interface Scenario { name: 'low' | 'base' | 'high'; series: ScenarioRow[]; /** percent per year from the base year to the last year, derived from the end value */ cagr: number }
export interface TornadoRow { driver: 'volume' | 'price' | 'adjustment' | 'base_level'; lowValue: number; highValue: number; lowDeltaPct: number; highDeltaPct: number; swingPct: number }
export interface GridCell { volume: number; price: number; value: number; cagr: number }
export interface Breakeven { volume: number; priceGrowth: number }
export interface ForecastResult {
  spec: ForecastSpec
  lastYear: number
  scenarios: Scenario[]
  tornado: TornadoRow[]
  grid: { volumes: number[]; prices: number[]; cells: GridCell[][] }
  breakeven: Breakeven[]
}

const up = (pct: number) => 1 + pct / 100

/** The scenarios, the one-at-a-time sensitivity, the two-way table and the break-even, from the inputs alone. A spec that passed groundForecast. Pure and deterministic. */
export function runForecast(spec: ForecastSpec): ForecastResult {
  const lastYear = spec.years[spec.years.length - 1]
  const n = lastYear - spec.baseYear
  const adjYears = new Set(spec.adjustment?.years ?? [])
  type P = { vol: number; price: number; adj: number; base: number }
  const path = (p: P): ScenarioRow[] => {
    const out: ScenarioRow[] = []
    let v = p.base
    for (let y = spec.baseYear + 1; y <= lastYear; y++) { v = v * up(p.vol) * up(p.price) * up(adjYears.has(y) ? p.adj : 0); out.push({ year: y, value: v }) }
    return out
  }
  const endOf = (p: P) => path(p)[n - 1].value
  const B: P = { vol: spec.volume.base, price: spec.price.base, adj: spec.adjustment?.base ?? 0, base: spec.base.value }
  const cagrOf = (end: number) => (Math.pow(end / spec.base.value, 1 / n) - 1) * 100
  const scenarios: Scenario[] = (['low', 'base', 'high'] as const).map(name => {
    const series = path({ vol: spec.volume[name], price: spec.price[name], adj: spec.adjustment ? spec.adjustment[name] : 0, base: spec.base.value })
    return { name, series: series.filter(r => spec.years.includes(r.year)), cagr: cagrOf(series[series.length - 1].value) }
  })
  const baseEnd = endOf(B)
  const delta = (v: number) => (v / baseEnd - 1) * 100
  const row = (driver: TornadoRow['driver'], lowValue: number, highValue: number): TornadoRow => ({ driver, lowValue, highValue, lowDeltaPct: delta(lowValue), highDeltaPct: delta(highValue), swingPct: delta(highValue) - delta(lowValue) })
  const tornado: TornadoRow[] = [
    row('volume', endOf({ ...B, vol: spec.volume.low }), endOf({ ...B, vol: spec.volume.high })),
    row('price', endOf({ ...B, price: spec.price.low }), endOf({ ...B, price: spec.price.high })),
    ...(spec.adjustment ? [row('adjustment', endOf({ ...B, adj: spec.adjustment.low }), endOf({ ...B, adj: spec.adjustment.high }))] : []),
    ...(spec.baseRange ? [row('base_level', baseEnd * spec.baseRange.low / spec.base.value, baseEnd * spec.baseRange.high / spec.base.value)] : []),
  ].sort((a, b) => b.swingPct - a.swingPct || a.driver.localeCompare(b.driver))
  const five = (r: RateRange) => [r.low, (r.low + r.base) / 2, r.base, (r.base + r.high) / 2, r.high]
  const volumes = five(spec.volume)
  const prices = five(spec.price)
  const cells = volumes.map(volume => prices.map((price): GridCell => { const value = endOf({ ...B, vol: volume, price }); return { volume, price, value, cagr: cagrOf(value) } }))
  // value_last = base * ((1+v)(1+p))^n * A, A = the base adjustment compounded over its years; equal to the base value when 1+p = A^(-1/n) / (1+v)
  const A = [...adjYears].filter(y => y > spec.baseYear && y <= lastYear).reduce((a) => a * up(B.adj), 1)
  const breakeven = volumes.map(volume => ({ volume, priceGrowth: (Math.pow(1 / A, 1 / n) / up(volume) - 1) * 100 }))
  return { spec, lastYear, scenarios, tornado, grid: { volumes, prices, cells }, breakeven }
}

const f2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2)
const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1)
const signed = (x: number) => `${x >= 0 ? '+' : ''}${f1(x)}`
const basisOf = (r: Basis) => (r.basis === 'source' && r.source !== undefined ? `source [${r.source}]` : 'assumption (no source)')
const DRIVER: Record<TornadoRow['driver'], string> = { volume: 'Volume', price: 'Price and mix', adjustment: 'Adjustment', base_level: 'Base level' }

/** The model as notes for the writer: assumptions with their basis, scenarios by year, the ranked sensitivity, the two-way table and the break-even. Numbers rounded for reading only. Pure. */
export function forecastNotes(r: ForecastResult): string {
  const s = r.spec
  const rng = (x: RateRange) => `low ${f1(x.low)} / base ${f1(x.base)} / high ${f1(x.high)}`
  const lines: string[] = []
  lines.push('## Scenario model (computed by code from the stated assumptions: use its numbers exactly, never do your own arithmetic, and say for each assumption whether a source gives it or it is an assumption)')
  lines.push(`Unit: ${s.unit}. Base year ${s.baseYear}: ${f2(s.base.value)} [${s.base.source}] (scope: ${s.base.scope || 'not stated'}). Rates are percent per year.`)
  lines.push('### Assumptions')
  lines.push(`- Volume: ${rng(s.volume)} — ${basisOf(s.volume)}: ${s.volume.note}`)
  lines.push(`- Price and mix: ${rng(s.price)} — ${basisOf(s.price)}: ${s.price.note}`)
  if (s.adjustment) lines.push(`- Adjustment in ${s.adjustment.years.join(', ')}: ${rng(s.adjustment)} — ${basisOf(s.adjustment)}: ${s.adjustment.note}`)
  if (s.baseRange) lines.push(`- Base level range: ${f2(s.baseRange.low)} to ${f2(s.baseRange.high)} — ${s.baseRange.note}`)
  lines.push('### Scenarios')
  lines.push('| Year | Low | Base | High |', '|---|---|---|---|')
  const by = (name: Scenario['name']) => r.scenarios.find(x => x.name === name)!
  for (const row of by('base').series) lines.push(`| ${row.year} | ${f2(by('low').series.find(x => x.year === row.year)!.value)} | ${f2(row.value)} | ${f2(by('high').series.find(x => x.year === row.year)!.value)} |`)
  lines.push(`Growth ${s.baseYear} to ${r.lastYear}, percent per year: low ${f1(by('low').cagr)} / base ${f1(by('base').cagr)} / high ${f1(by('high').cagr)}.`)
  lines.push(`### Sensitivity of the ${r.lastYear} value to one assumption at a time (others at base), largest swing first`)
  r.tornado.forEach((t, i) => lines.push(`${i + 1}. ${DRIVER[t.driver]}: ${f2(t.lowValue)} (${signed(t.lowDeltaPct)}%) to ${f2(t.highValue)} (${signed(t.highDeltaPct)}%)`))
  lines.push(`### Two-way table: ${r.lastYear} value, volume growth down the side, price-and-mix growth across`)
  lines.push(`| Volume \\ Price | ${r.grid.prices.map(f2).join(' | ')} |`, `|---|${r.grid.prices.map(() => '---').join('|')}|`)
  r.grid.cells.forEach((cellRow, i) => lines.push(`| ${f2(r.grid.volumes[i])} | ${cellRow.map(c => f2(c.value)).join(' | ')} |`))
  lines.push(`### Break-even: price-and-mix growth per year needed for the ${r.lastYear} value not to fall below the ${s.baseYear} value (base adjustment applied)`)
  for (const b of r.breakeven) lines.push(`- volume ${signed(b.volume)}% a year: price and mix ${signed(b.priceGrowth)}% a year`)
  return lines.join('\n')
}
