// Report Engine V2.1, M3-M5 (owner 11/11): a report that argues one thesis, not a catalog of everything found.
//   analyst  - reads the evidence cards (never the raw pages) and returns a thesis, 2-6 sections, the points of each section and the cards that carry each point, and what is doubtful;
//   writer   - is handed that outline and the sources it uses, renumbered from 1 (the report lists only what it cites);
//   release  - the text is held until the code has read it: a sentence whose figure is not in the source it cites, or that cites a source that does not exist, or that gives a figure with no
//              citation, is dropped; the remaining citations are renumbered in order of use. The verifier is the code of claimVerifier.ts, never the model that wrote the text.
// Pure and deterministic: the model calls live in deepResearchDeps.ts. The checks prove numbers and citation ids, not meaning (claimVerifier's own scope).
import { z } from 'zod'
import type { Evidence, Finding, ResearchPlan } from './deepResearch'
import type { EvidenceCard } from './evidenceCards'
import { verifyReport, written, type VerifierSource } from './claimVerifier'
import { lenientArray } from './lenientSchema'

export interface OutlinePoint { claim: string; cards: string[] }
export interface OutlineSection { title: string; points: OutlinePoint[] }
export interface Outline { thesis: string; sections: OutlineSection[]; doubts: string[] }
export interface OutlineBounds { minSections: number; maxSections: number }

/** Standard (Haiku): a short report, up to four sections. Advanced (Sonnet): up to six, with the doubts argued in a section of their own. */
export const STANDARD_OUTLINE: OutlineBounds = { minSections: 2, maxSections: 4 }
export const ADVANCED_OUTLINE: OutlineBounds = { minSections: 3, maxSections: 6 }
/** The most cards the analyst reads (the best by confidence). */
export const ANALYST_CARDS_MAX = 90

/**
 * A list of short texts that may arrive as an array, a JSON string, or plain text (one item per line, or "C1, C2" for ids): measured 11/11, the analyst wrote `doubts` as plain text in 2 of 5 live runs.
 * `required`: an absent list stays absent (refused, so the retry runs) - and the JSON schema sent to the model says required. A list that defaults to empty is sent as OPTIONAL (zod-to-json-schema asks
 * the schema whether undefined parses), and Advanced then returned a thesis with no sections at all.
 */
const textList = (split: RegExp, required = false) => z.preprocess((v: unknown) => {
  if (typeof v === 'string') {
    try { return JSON.parse(v) } catch { return v.split(split).map(x => x.replace(/^\s*[-*•\d.)]+\s+/, '').trim()).filter(Boolean) }
  }
  return (v === undefined || v === null) && !required ? [] : v
}, z.array(z.string()))
export const OutlineSchema = z.object({
  thesis: z.string(),
  sections: lenientArray(z.object({ title: z.string(), points: lenientArray(z.object({ claim: z.string(), cards: textList(/[\s,;]+/, true) }), { required: true }) }), { required: true }),
  doubts: textList(/\n+/),
})

/** The policy scan (Standard): one stronger-model call writes the queries for rules coming into force (a tax, a law, a standard, a ban), which the cheap planner does not know to ask for. title and queries are required (sent to the model as required). */
export const PolicyScanSchema = z.object({ title: z.string(), queries: z.array(z.string()) })
export interface PolicyStep { title: string; queries: string[] }

/** The scan's answer as a follow-up step: at most three non-empty queries; null when there is no title or no query. Pure. */
export function policyStepFrom(raw: unknown): PolicyStep | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { title?: unknown; queries?: unknown }
  const title = typeof r.title === 'string' ? r.title.trim() : ''
  const queries = (Array.isArray(r.queries) ? r.queries : []).filter((q): q is string => typeof q === 'string' && !!q.trim()).map(q => q.trim()).slice(0, 3)
  return title && queries.length ? { title, queries } : null
}

/** The gap check's follow-up steps with the policy step first (a cap on follow-up steps then drops the weakest gap, so the scan adds a call but not a step). Pure. */
export function withPolicyStep<T extends { title: string; queries: string[] }>(gaps: readonly T[], policy: PolicyStep | null): Array<T | PolicyStep> {
  return policy ? [policy, ...gaps] : (gaps as T[])
}

/** The analyst's raw answer into an outline that points only at cards that exist: unknown ids are dropped, a point with no real card is dropped, a section with no point is dropped. null when nothing usable is left (no thesis, too few sections): the engine then writes the way it did before. Pure. */
export function outlineFrom(raw: unknown, cards: readonly EvidenceCard[], bounds: OutlineBounds): Outline | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { thesis?: unknown; sections?: unknown; doubts?: unknown }
  const thesis = typeof r.thesis === 'string' ? r.thesis.trim() : ''
  if (!thesis) return null
  const known = new Set(cards.map(c => c.id))
  const sections: OutlineSection[] = []
  for (const s of Array.isArray(r.sections) ? r.sections : []) {
    const title = typeof (s as { title?: unknown })?.title === 'string' ? (s as { title: string }).title.trim() : ''
    if (!title) continue
    const points: OutlinePoint[] = []
    for (const p of Array.isArray((s as { points?: unknown }).points) ? (s as { points: unknown[] }).points : []) {
      const claim = typeof (p as { claim?: unknown })?.claim === 'string' ? (p as { claim: string }).claim.trim() : ''
      const ids = [...new Set((Array.isArray((p as { cards?: unknown }).cards) ? (p as { cards: unknown[] }).cards : []).filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(x => known.has(x)))]
      if (claim && ids.length) points.push({ claim, cards: ids })
    }
    if (points.length) sections.push({ title, points })
  }
  if (sections.length < bounds.minSections) return null
  const doubts = (Array.isArray(r.doubts) ? r.doubts : []).filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim()).slice(0, 6)
  return { thesis, sections: sections.slice(0, bounds.maxSections), doubts }
}

/** What the analyst reads: one line per readable card (never an UNVERIFIED quote), best confidence first, with how far its fact is held (STRONG: two independent groups agree, SINGLE: one, CONFLICT: they differ). Pure. */
export function analystCards(cards: readonly EvidenceCard[], support: ReadonlyMap<string, string>, limit = ANALYST_CARDS_MAX): string {
  const rank = { HIGH: 2, MEDIUM: 1, LOW: 0 } as const
  return cards.filter(c => c.quoteStatus !== 'UNVERIFIED')
    .sort((a, b) => rank[b.confidence] - rank[a.confidence] || b.score - a.score || Number(a.id.slice(1)) - Number(b.id.slice(1)))
    .slice(0, limit)
    .map(c => `${c.id} [${c.confidence}${support.get(c.id) ? `, ${support.get(c.id)}` : ''}; ${c.sourceKind.toLowerCase()}, ${c.host || 'unknown'}${c.published ? `, ${c.published}` : ''}] ${c.text.slice(0, 260)}`)
    .join('\n')
}

export interface WriterInput {
  /** the sources this outline uses, numbered 1..n in order of first use */
  sources: Evidence[]
  /** the notes the writer gets: the thesis, then each section with its points and the cards' facts, each cited by its new number */
  notes: string
  /** the same sections as a plan and the cards as findings, for the chart code (a section's chart goes under the heading that has the section's title) */
  plan: ResearchPlan
  findings: Finding[]
}

/**
 * The outline into what the writer is handed. `cited` are the run's sources under the numbers the whole run uses (the scenario model's notes cite those numbers) and `number` maps a card's own source id to
 * that number; the writer gets only the sources a point uses (plus `extra`, e.g. the base source of the scenario model). Release renumbers what the text really cites. Pure.
 */
export function outlineWriterInput(outline: Outline, cards: readonly EvidenceCard[], cited: readonly Evidence[], number: ReadonlyMap<number, number>, extra: readonly number[] = []): WriterInput {
  const byCard = new Map(cards.map(c => [c.id, c]))
  const byEv = new Map(cited.map(e => [e.id, e]))
  const used = new Set<number>(extra.filter(n => byEv.has(n)))
  const findings: Finding[] = []
  const body = outline.sections.map((s, k) => {
    const lines = s.points.map(p => {
      const facts = p.cards.map(id => byCard.get(id)).filter((c): c is EvidenceCard => !!c && number.has(c.source)).map(c => {
        const n = number.get(c.source)!
        used.add(n)
        findings.push({ step: k + 1, text: c.text, source: n, ...(c.figure ? { figure: c.figure } : {}) })
        return `  - ${c.text} [${n}]`
      })
      return `- POINT: ${p.claim}\n${facts.join('\n')}`
    })
    return `## ${s.title}\n${lines.join('\n')}`
  })
  const sources = [...used].sort((a, b) => a - b).flatMap(id => { const e = byEv.get(id); return e ? [e] : [] })
  const notes = `THESIS: ${outline.thesis}\n\n${body.join('\n\n')}${outline.doubts.length ? `\n\n## What is doubtful\n${outline.doubts.map(d => `- ${d}`).join('\n')}` : ''}`
  return { sources, notes, plan: { title: outline.thesis.slice(0, 120), steps: outline.sections.map(s => ({ title: s.title, queries: [], status: 'done' })) } as unknown as ResearchPlan, findings }
}

const CITE = /\[(\d{1,3})\]/g
const SENTENCE = /(?<=[.!?…])\s+/
const ERRORS = new Set(['number_not_in_source', 'bad_citation', 'uncited_number'])

export interface Released { text: string; /** sentences dropped */ dropped: number; /** the sources the remaining text cites, numbered 1..n in order of first citation */ used: VerifierSource[]; /** old number to new number, for what else carries source numbers (the charts) */ renumbered: Map<number, number> }

/**
 * The text that may be shown: each sentence is read by the verifier against the sources it cites; a sentence with a figure the source does not hold, a citation to a source that does not exist, or a figure with
 * no citation is dropped. Headings, tables (the scenario model's numbers are computed by code, not read from a page), list markers and sentences without a figure stay. The citations that remain are renumbered
 * in order of first use, and `used` lists those sources in the new order. Pure.
 */
export function releaseText(report: string, sources: readonly (VerifierSource & { url?: string; site?: string; published?: string })[], /** text whose figures code computed (the scenario model): a sentence whose figures are all in it is not dropped for lacking a source */ trusted = ''): Released {
  let dropped = 0
  const kept = String(report ?? '').split('\n').map(line => {
    if (/^\s*(#{1,6}\s|\|)/.test(line) || !line.trim()) return line
    const marker = /^(\s*(?:[-*+]|\d+[.)])\s+)/.exec(line)?.[1] ?? ''
    const body = line.slice(marker.length)
    const sentences = body.split(SENTENCE).filter(Boolean)
    const ok = sentences.filter(s => {
      const r = verifyReport(s, sources)
      let bad = [...Object.entries(r.counts)].some(([k, n]) => ERRORS.has(k) && n > 0)
      // a figure the model computed is the report's own analysis, sourced by the code that computed it: allowed when every figure the verifier refused is in the model's text and no citation id is wrong
      if (bad && trusted && !r.counts.bad_citation) {
        const refused = r.flagged.flatMap(f => f.figures)
        if (refused.length && refused.every(f => written(f, trusted))) bad = false
      }
      if (bad) dropped++
      return !bad
    })
    if (!ok.length) return null
    return marker + ok.join(' ')
  }).filter((l): l is string => l !== null).join('\n').replace(/\n{3,}/g, '\n\n')
  const order: number[] = []
  for (const m of kept.matchAll(CITE)) { const id = Number(m[1]); if (!order.includes(id)) order.push(id) }
  const map = new Map(order.map((id, i) => [id, i + 1]))
  const byId = new Map(sources.map(s => [s.id, s]))
  const text = kept.replace(CITE, (_, d: string) => `[${map.get(Number(d)) ?? d}]`)
  const used = order.flatMap(id => { const s = byId.get(id); return s ? [{ ...s, id: map.get(id)! }] : [] })
  return { text, dropped, used, renumbered: map }
}
