// Consolidation of the findings before the writer (11/11, owner, after reading two real reports: "duplication and fragmentation are large, and some figures are wrong").
// Pure and deterministic: no model, no search, no network. Behind RESEARCH_CONSOLIDATION (deepResearchState.ts), off by default, locked in production.
//
// What the two reports showed, and the rule that answers each:
//   - the same fact in three sections           -> a fact read again (same subject, measure, scope, period, value) or a near-identical sentence is kept ONCE, with all its sources, in its earliest section;
//   - "389 vs 313 vs 204 stores" for one brand  -> a disagreement is a CONFLICT only for the same subject, measure, unit, scope AND period read by two different sources; another scope is a scope split,
//                                                  a value with no scope beside a scoped one is "scope unclear", never a contradiction;
//   - "rose 2023-24 but fell in 2025: conflict" -> readings of one measure at different periods are a TREND (oldest to newest), never a conflict;
//   - 2024 survey quoted though 2026 existed    -> the newest period found for each measure is reported, and an old one (older than last year) is marked, so the writer says "latest available".
// The writer is told these in its notes; nothing here decides which source is right.

import type { Finding, ResearchPlan } from './deepResearch'
import { FIGURE_CONFLICT_GAP } from './figureGap'
import { fold } from './researchSignals'

export interface PeriodKey { key: string; year: number; order: number }

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4' }

/** A year, a half-year or a quarter as the sources write it ("2025", "H1 2026", "2026-H1", "6 tháng đầu 2026", "Quý III/2025", "Q1 2025"); null when there is no year. Pure. */
export function parsePeriod(raw: string | null | undefined): PeriodKey | null {
  const s = fold(String(raw ?? ''))
  const y = s.match(/(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/)
  if (!y) return null
  const year = Number(y[1])
  let part = ''
  const q = s.match(/\bq([1-4])\b/) ?? s.match(/\bquy\s*(iv|iii|ii|i|[1-4])\b/)
  const h = s.match(/\bh([12])\b/)
  if (q) part = `Q${/^[1-4]$/.test(q[1]) ? q[1] : ROMAN[q[1]]}`
  else if (h) part = `H${h[1]}`
  else if (/(6 thang dau|nua dau|first half)/.test(s)) part = 'H1'
  else if (/(6 thang cuoi|nua cuoi|second half)/.test(s)) part = 'H2'
  const endMonth = part === 'H1' ? 6 : part === 'H2' ? 12 : part ? Number(part[1]) * 3 : 12
  return { key: part ? `${year}-${part}` : String(year), year, order: year * 100 + endMonth }
}

/** A label that is only a period ("2024", "H1 2026", "Quý III/2025"), as the older figure shape writes the year in the label. */
const PERIOD_ONLY = /^(?:(?:h[12]|q[1-4]|quy (?:iv|iii|ii|i|[1-4])|6 thang (?:dau|cuoi)|nua (?:dau|cuoi))[ \-/]*)?(?:19|20)\d{2}(?:[ \-/]*(?:h[12]|q[1-4]))?$/
const NATIONAL = /^(toan quoc|ca nuoc|viet nam|vietnam|nationwide|national|trong nuoc)$/
const normScope = (s: string | undefined): string => { const x = fold(s ?? ''); return NATIONAL.test(x) ? 'national' : x }

export interface ValueGroup { value: number; sources: number[]; scope: string }
export interface ConflictItem { subject: string; metric: string; unit: string; scope: string; period: string | null; values: ValueGroup[] }
export interface TrendPoint { period: string; value: number; values: number[]; sources: number[] }
export interface TrendItem { subject: string; metric: string; unit: string; scope: string; points: TrendPoint[]; newest: string }
export interface StaleItem { subject: string; metric: string; unit: string; scope: string; newest: string; /** how many findings read this measure: the measures a run read most are its central ones */ readings: number }
/** The writer is shown at most this many old-period measures (most-read first): a run's findings hold dozens of measures that are not the subject. */
export const MAX_STALE_SHOWN = 8
/** A measure read at a dated period: its newest period (and that period's year) and how many findings read it. */
export interface LatestItem { subject: string; metric: string; unit: string; scope: string; newest: string; year: number; readings: number }
export interface ConsolidatedFinding { text: string; sources: number[]; steps: number[]; figure?: Finding['figure'] }
export interface Consolidation {
  findings: ConsolidatedFinding[]
  conflicts: ConflictItem[]
  scopeSplits: ConflictItem[]
  scopeUnclear: ConflictItem[]
  trends: TrendItem[]
  stale: StaleItem[]
  /** every measure read at a dated period, the most-read first (what the freshness hints are drawn from) */
  latest: LatestItem[]
  stats: { in: number; out: number; merged: number; conflicts: number; scopeSplits: number; scopeUnclear: number; trends: number; stale: number }
}

interface Norm { f: Finding; metric: string; unit: string; subject: string; scope: string; period: PeriodKey | null; value: number; subjectText: string; metricText: string; unitText: string; scopeText: string }

function normOf(f: Finding): Norm | null {
  const g = f.figure
  if (!g || !Number.isFinite(g.value)) return null
  const labelIsPeriod = PERIOD_ONLY.test(fold(g.label ?? ''))
  const period = parsePeriod(g.period) ?? (labelIsPeriod ? parsePeriod(g.label) : null)
  const subjectText = (g.subject ?? '').trim() || (labelIsPeriod ? '' : (g.label ?? '').trim())
  return {
    f, value: g.value, period,
    metric: fold(g.series ?? ''), unit: fold(g.unit ?? ''), subject: fold(subjectText), scope: normScope(g.scope),
    subjectText, metricText: (g.series ?? '').trim(), unitText: (g.unit ?? '').trim(), scopeText: (g.scope ?? '').trim(),
  }
}

const baseKey = (n: Norm) => `${n.metric}|${n.unit}|${n.subject}`
/** The identity of the fact a finding states (subject, measure, unit, scope, period, folded) and its value; null when it has no figure. Two findings with the same key speak of the same thing. Pure. */
export function figureKey(f: Finding): { key: string; value: number } | null {
  const n = normOf(f)
  return n ? { key: `${baseKey(n)}|${n.scope}|${n.period?.key ?? '-'}`, value: n.value } : null
}
const sortedNums = (xs: Iterable<number>) => [...new Set(xs)].sort((a, b) => a - b)
const apart = (lo: number, hi: number) => hi - lo > Math.abs(hi) * FIGURE_CONFLICT_GAP

function valueGroups(items: readonly Norm[]): ValueGroup[] {
  const by = new Map<number, { sources: Set<number>; scope: string }>()
  for (const n of items) {
    const e = by.get(n.value) ?? { sources: new Set<number>(), scope: n.scopeText }
    e.sources.add(n.f.source)
    by.set(n.value, e)
  }
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([value, e]) => ({ value, sources: sortedNums(e.sources), scope: e.scope }))
}
const range = (items: readonly Norm[]) => { const v = items.map(n => n.value); return { lo: Math.min(...v), hi: Math.max(...v) } }
const sourcesOf = (items: readonly Norm[]) => new Set(items.map(n => n.f.source))

const tokensOf = (text: string): Set<string> => new Set(fold(text).split(/[^a-z0-9]+/).filter(t => t.length >= 2))
function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}
const NEAR_DUPLICATE = 0.8

/** The findings once, the conflicts that are conflicts, the trends, and the newest period of each measure. `now` is a timestamp (ms). Pure and deterministic. */
export function consolidate(findings: readonly Finding[], now: number = Date.now()): Consolidation {
  // 1. a fact read again is one finding with all its sources; the earliest step keeps it
  const merged: ConsolidatedFinding[] = []
  const byFigure = new Map<string, ConsolidatedFinding>()
  const plain: Array<{ tokens: Set<string>; c: ConsolidatedFinding }> = []
  const norms: Norm[] = []
  const add = (c: ConsolidatedFinding, f: Finding) => {
    if (!c.sources.includes(f.source)) c.sources = sortedNums([...c.sources, f.source])
    if (!c.steps.includes(f.step)) c.steps = sortedNums([...c.steps, f.step])
  }
  for (const f of findings) {
    const n = normOf(f)
    if (n) {
      norms.push(n)
      const key = `${baseKey(n)}|${n.scope}|${n.period?.key ?? '-'}|${Number(n.value.toPrecision(9))}`
      const have = byFigure.get(key)
      if (have) { add(have, f); continue }
      const c: ConsolidatedFinding = { text: f.text, sources: [f.source], steps: [f.step], figure: f.figure }
      byFigure.set(key, c); merged.push(c)
      continue
    }
    const tokens = tokensOf(f.text)
    const same = plain.find(p => jaccard(p.tokens, tokens) >= NEAR_DUPLICATE)
    if (same) { add(same.c, f); continue }
    const c: ConsolidatedFinding = { text: f.text, sources: [f.source], steps: [f.step] }
    plain.push({ tokens, c }); merged.push(c)
  }

  // 2. conflicts, scope splits and scope-unclear values: per subject, measure, unit and period
  const conflicts: ConflictItem[] = []
  const scopeSplits: ConflictItem[] = []
  const scopeUnclear: ConflictItem[] = []
  const byPeriod = new Map<string, Norm[]>()
  for (const n of norms) { const k = `${baseKey(n)}|${n.period?.key ?? '-'}`; byPeriod.set(k, [...(byPeriod.get(k) ?? []), n]) }
  for (const items of byPeriod.values()) {
    const head = items[0]
    const item = (xs: readonly Norm[], scope: string): ConflictItem => ({ subject: head.subjectText, metric: head.metricText, unit: head.unitText, scope, period: head.period?.key ?? null, values: valueGroups(xs) })
    const byScope = new Map<string, Norm[]>()
    for (const n of items) byScope.set(n.scope, [...(byScope.get(n.scope) ?? []), n])
    // the same scope read by two sources with different values
    for (const [scope, xs] of byScope) {
      const { lo, hi } = range(xs)
      if (sourcesOf(xs).size >= 2 && apart(lo, hi)) conflicts.push(item(xs, xs[0].scopeText || (scope ? scope : '')))
    }
    const named = [...byScope.keys()].filter(s => s !== '')
    if (named.length >= 2) {
      const { lo, hi } = range(items.filter(n => n.scope !== ''))
      if (apart(lo, hi)) scopeSplits.push(item(items.filter(n => n.scope !== ''), ''))
    }
    if (byScope.has('') && named.length >= 1) {
      const { lo, hi } = range(items)
      if (apart(lo, hi)) scopeUnclear.push(item(items, ''))
    }
  }

  // 3. trends: one measure, one subject, one scope, read at two or more periods; and the newest period of each measure
  const bySeries = new Map<string, Norm[]>()
  for (const n of norms) if (n.period) { const k = `${baseKey(n)}|${n.scope}`; bySeries.set(k, [...(bySeries.get(k) ?? []), n]) }
  const trends: TrendItem[] = []
  const stale: StaleItem[] = []
  const latest: LatestItem[] = []
  const nowYear = new Date(now).getUTCFullYear()
  for (const items of bySeries.values()) {
    const head = items[0]
    const periods = new Map<string, { order: number; items: Norm[] }>()
    for (const n of items) { const p = n.period!; const e = periods.get(p.key) ?? { order: p.order, items: [] }; e.items.push(n); periods.set(p.key, e) }
    const ordered = [...periods.entries()].sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
    const newest = ordered[ordered.length - 1]
    if (ordered.length >= 2) {
      trends.push({
        subject: head.subjectText, metric: head.metricText, unit: head.unitText, scope: head.scopeText, newest: newest[0],
        points: ordered.map(([period, e]) => { const vs = valueGroups(e.items); return { period, value: vs[0].value, values: vs.map(v => v.value), sources: sortedNums(e.items.map(n => n.f.source)) } }),
      })
    }
    latest.push({ subject: head.subjectText, metric: head.metricText, unit: head.unitText, scope: head.scopeText, newest: newest[0], year: Math.floor(newest[1].order / 100), readings: items.length })
    if (Math.floor(newest[1].order / 100) <= nowYear - 2) stale.push({ subject: head.subjectText, metric: head.metricText, unit: head.unitText, scope: head.scopeText, newest: newest[0], readings: items.length })
  }
  stale.sort((a, b) => b.readings - a.readings || a.metric.localeCompare(b.metric) || a.subject.localeCompare(b.subject))
  latest.sort((a, b) => b.readings - a.readings || a.metric.localeCompare(b.metric) || a.subject.localeCompare(b.subject))

  return {
    findings: merged, conflicts, scopeSplits, scopeUnclear, trends, stale, latest,
    stats: { in: findings.length, out: merged.length, merged: findings.length - merged.length, conflicts: conflicts.length, scopeSplits: scopeSplits.length, scopeUnclear: scopeUnclear.length, trends: trends.length, stale: stale.length },
  }
}

/**
 * The measures a run read more than once whose newest reading is before this year (no reading from the current year yet), most-read first, at most `limit`: lines for the gap check, so it looks up
 * the latest period of the central measures first (this year to date, the latest quarter). A measure read once, or with no period, is not a hint. Pure.
 */
export function freshnessHints(c: Consolidation, nowYear: number, limit = 6): string[] {
  return c.latest.filter(l => l.year < nowYear && l.readings >= 2).slice(0, limit)
    .map(l => `${l.subject ? `${l.subject} / ` : ''}${l.metric}${l.unit ? ` (${l.unit})` : ''}${l.scope ? `, scope: ${l.scope}` : ''}: newest reading ${l.newest}, ${l.readings} readings, none from ${nowYear}`)
}

const tags = (sources: readonly number[]) => sources.map(s => `[${s}]`).join('')
const label = (c: { subject: string; metric: string; unit: string }) => `${c.subject ? `${c.subject} / ` : ''}${c.metric}${c.unit ? ` (${c.unit})` : ''}`

/**
 * The writer's notes: one "## title" per section with its findings (each once, all its sources), then the checks the code computed. A finding sits in the section of its earliest step; a follow-up step
 * that completes a section counts as that section. With nothing to check, the notes are the sections alone. Pure.
 */
export function consolidatedNotes(plan: ResearchPlan, c: Consolidation): string {
  const sectionOf = (step: number) => plan.steps[step - 1]?.completes ?? step
  const placed = new Map<number, ConsolidatedFinding[]>()
  for (const f of c.findings) { const s = sectionOf(f.steps[0]); placed.set(s, [...(placed.get(s) ?? []), f]) }
  const body = plan.steps.map((s, k) => (s.completes ? '' : `## ${s.title}\n${(placed.get(k + 1) ?? []).map(f => `- ${f.text} ${tags(f.sources)}`).join('\n') || '- (no findings)'}`)).filter(Boolean).join('\n\n')
  const blocks: string[] = []
  const values = (x: ConflictItem, withScope: boolean) => x.values.map(v => `${withScope && v.scope ? `${v.scope}: ` : ''}${v.value} ${tags(v.sources)}`).join(' vs ')
  if (c.conflicts.length) blocks.push(`### Conflicting figures: different values for the same measure, scope and period (the sources disagree: report each value with its source number, never pick one silently)\n${c.conflicts.map(x => `- ${label(x)}, scope: ${x.scope || 'not stated'}, period: ${x.period ?? 'not stated'}: ${values(x, false)}`).join('\n')}`)
  if (c.trends.length) blocks.push(`### The same measure at different dates (NOT a conflict: readings from different periods; describe the change over time and use the newest as the current value)\n${c.trends.map(x => `- ${label(x)}${x.scope ? `, scope: ${x.scope}` : ''}: ${x.points.map(p => `${p.period}: ${p.values.join(' / ')} ${tags(p.sources)}`).join('; ')}`).join('\n')}`)
  if (c.scopeSplits.length) blocks.push(`### The same measure for different scopes (NOT a conflict: name the scope with each value)\n${c.scopeSplits.map(x => `- ${label(x)}, period: ${x.period ?? 'not stated'}: ${values(x, true)}`).join('\n')}`)
  if (c.scopeUnclear.length) blocks.push(`### A value whose scope is not stated beside values that have one (it may be another scope, for example national against one city: do not call it a contradiction, say the scope is unclear)\n${c.scopeUnclear.map(x => `- ${label(x)}, period: ${x.period ?? 'not stated'}: ${values(x, true)}`).join('\n')}`)
  if (c.stale.length) blocks.push(`### The newest period found for these measures is old (write "latest available: <period>"; never present it as current)\n${c.stale.slice(0, MAX_STALE_SHOWN).map(x => `- ${label(x)}${x.scope ? `, scope: ${x.scope}` : ''}: newest ${x.newest}`).join('\n')}${c.stale.length > MAX_STALE_SHOWN ? `\n(${c.stale.length - MAX_STALE_SHOWN} more not shown)` : ''}`)
  return blocks.length ? `${body}\n\n## Data checks computed by code from the findings above (use them; never contradict them)\n${blocks.join('\n\n')}` : body
}
