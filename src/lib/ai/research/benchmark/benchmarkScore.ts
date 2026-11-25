// The automatic part of the benchmark score (Report Engine V2.1, M1). Pure and deterministic. It measures what code can measure honestly; what it cannot (is a number TRUE, is a source good, does the report
// help a decision) is left to the human sheet and is never guessed here. The six criteria and their weights are the owner's (20 / 20 / 15 / 15 / 20 / 10).
//   completeness  : the share of the question's mandatory facts the report contains (benchmarkSet.ts), and for a forecast the share of the forecast checks;
//   citation      : the verifier's supported share of the checked sentences (claimVerifier.ts), when the run had one;
//   efficiency    : pages (about 2,250 characters a page), repetition and cost against the tier's budget (0.15 Standard, 0.45 Advanced);
//   accuracy, source quality, analytic and decision value: human.

import { fold } from '../researchSignals'
import { repeatedFigures } from '../reportRepeats'
import { sourceCountOf } from '@/lib/answerDoc/reportExport'
import type { BenchmarkQuestion } from './benchmarkSet'

export type Tier = 'standard' | 'advanced'
export const CHARS_PER_PAGE = 2_250
export const TIER_BUDGET_USD: Record<Tier, number> = { standard: 0.15, advanced: 0.45 }

export const CRITERIA_WEIGHTS = { accuracy: 20, citation: 20, completeness: 15, source: 15, analytic: 20, efficiency: 10 } as const
export type Criterion = keyof typeof CRITERIA_WEIGHTS

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const round1 = (x: number) => Math.round(x * 10) / 10

/** Efficiency, 0 to 5: 5 minus a penalty for each page over 8 (1 per 4 pages, at most 3), for each point of repetition over 5% (1 per 5 points, at most 2), and 1 for a cost over the tier's budget. */
export function efficiencyScore(o: { pages: number; repeatedPct: number; usd: number; tier: Tier }): number {
  const pages = clamp((o.pages - 8) / 4, 0, 3)
  const repeats = clamp((o.repeatedPct - 5) / 5, 0, 2)
  const cost = o.usd > TIER_BUDGET_USD[o.tier] ? 1 : 0
  return round1(Math.max(0, 5 - pages - repeats - cost))
}

export interface ForecastChecks { scenarios: boolean; years: boolean; sensitivity: boolean; breakeven: boolean; assumptionsLabelled: boolean }

/** What a forecast report must show, found on the folded text: scenarios, the three years, a sensitivity, a break-even, assumptions labelled as the report's own. */
export function forecastChecks(text: string): ForecastChecks {
  const f = fold(text)
  return {
    scenarios: /kich ban/.test(f) && /(thap|co so|cao)/.test(f),
    years: /2027/.test(f) && /2028/.test(f) && /2029/.test(f),
    sensitivity: /(do nhay|tornado|sensitiv)/.test(f) && /(san luong|gia)/.test(f),
    breakeven: /(hoa von|break-?even)/.test(f),
    assumptionsLabelled: /(gia dinh)/.test(f),
  }
}

// words that name a kind of report, not its subject: a section sharing only these with the question says nothing about the subject
const GENERIC = new Set(['xu', 'huong', 'thi', 'truong', 'du', 'bao', 'doanh', 'thu', 'giai', 'doan', 'viet', 'nam', 'tai', 'cua', 'cac', 'voi', 'nhu', 'nao', 'anh', 'phan', 'tich', 'sanh', 'quy', 'cho', 'nhung', 'khi', 'duoc', 'hay', 'het', 'nay', 'the', 'ung', 'ban', 'ngay', 'rui', 'ro', 'hoi', 'hoi'])
const contentWords = (s: string): string[] => [...new Set(fold(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^\d+$/.test(w) && !GENERIC.has(w)))]
// sections every report has; never filler candidates
const USUAL = /(tom tat|khuyen nghi|nguon|pham vi|gioi han|chua tra loi|rui ro|ket luan)/

const hits = (f: BenchmarkQuestion['facts'][number], folded: string): boolean =>
  f.all.every(p => p.test(folded)) && (!f.atLeast || f.atLeast.of.filter(p => p.test(folded)).length >= f.atLeast.n)

/**
 * Level-2 sections that may be filler: not one of the usual sections, no content word of the question in the heading or in the first 400 characters, and no mandatory fact found in the section. A proxy for
 * a human to check, not a verdict (it flags "Giá cả" as readily as "Thanh toán"). Returns the headings as written. Pure.
 */
export function fillerCandidates(text: string, q: BenchmarkQuestion): string[] {
  const words = contentWords(q.text)
  const parts = String(text ?? '').split(/^##(?!#)[ \t]+/m).slice(1)
  const out: string[] = []
  for (const part of parts) {
    const [headLine, ...rest] = part.split('\n')
    const heading = headLine.trim()
    if (USUAL.test(fold(heading))) continue
    const body = rest.join('\n')
    const opening = new Set(contentWords(`${heading} ${body.slice(0, 400)}`))
    if (words.some(w => opening.has(w))) continue
    const folded = fold(body)
    if (q.facts.some(f => hits(f, folded))) continue
    out.push(heading)
  }
  return out
}

export interface BenchmarkScore {
  chars: number
  pagesApprox: number
  sources: number
  repeatedPct: number
  facts: Array<{ id: string; hit: boolean }>
  factRecallPct: number
  /** lines that state a figure and the year 2026: the report's grip on the latest period */
  latestPeriodLines: number
  fillerCandidates: string[]
  forecast: ForecastChecks | null
  auto: { completeness: number; citation: number | null; efficiency: number }
}

/** Score one report against its question. `verifier`: the supported and checked counts of the run, when it had them. Pure. */
export function scoreReport(text: string, q: BenchmarkQuestion, o: { tier: Tier; usd: number; verifier?: { supported: number; checked: number } | null }): BenchmarkScore {
  const folded = fold(text)
  const facts = q.facts.map(f => ({ id: f.id, hit: hits(f, folded) }))
  const factRecallPct = facts.length ? Math.round((facts.filter(f => f.hit).length / facts.length) * 100) : 0
  const pagesApprox = Math.round((text.length / CHARS_PER_PAGE) * 10) / 10
  const repeatedPct = repeatedFigures(text).share
  const forecast = q.kind === 'forecast' ? forecastChecks(text) : null
  const forecastRecall = forecast ? (Object.values(forecast).filter(Boolean).length / Object.values(forecast).length) * 100 : null
  const completeness = round1(((forecastRecall === null ? factRecallPct : (factRecallPct + forecastRecall) / 2) / 100) * 5)
  const citation = o.verifier && o.verifier.checked > 0 ? round1((o.verifier.supported / o.verifier.checked) * 5) : null
  return {
    chars: text.length, pagesApprox, sources: sourceCountOf(text, []), repeatedPct, facts, factRecallPct,
    latestPeriodLines: text.split('\n').filter(l => /2026/.test(l) && /\d[\d.,]*\s*(%|ty|trieu|nghin|cua hang)/.test(fold(l))).length,
    fillerCandidates: fillerCandidates(text, q), forecast,
    auto: { completeness, citation, efficiency: efficiencyScore({ pages: pagesApprox, repeatedPct, usd: o.usd, tier: o.tier }) },
  }
}

/**
 * The weighted total out of 100 when all six criteria have a score (each 0 to 5); with any missing, no total but `partial` (the weighted score over the criteria that are known, out of 100) and
 * `weightCovered` (the weight those criteria carry). Pure.
 */
export function weightedTotal(s: Partial<Record<Criterion, number | null>>): { total: number | null; partial: number; weightCovered: number } {
  let sum = 0
  let covered = 0
  for (const k of Object.keys(CRITERIA_WEIGHTS) as Criterion[]) {
    const v = s[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    sum += (clamp(v, 0, 5) / 5) * CRITERIA_WEIGHTS[k]
    covered += CRITERIA_WEIGHTS[k]
  }
  const all = covered === 100
  return { total: all ? Math.round(sum * 10) / 10 : null, partial: covered ? Math.round((sum / covered) * 1000) / 10 : 0, weightCovered: covered }
}
