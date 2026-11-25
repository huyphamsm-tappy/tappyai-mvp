// Deterministic Dossier assembly (R13 §8.7). Pure TypeScript, no search, no database, no network, no model:
//   1 normalise · 2 deduplicate evidence and detect syndication · 3 entity grouping · 4 relevance ranking (BM25-style) · 5 fact grouping · 6 claim/evidence mapping ·
//   7 fact status (the §8.6 gate) · 8 budget-aware packing.
// Packing never cuts a conflicting or high-authority fact to hit a number: the budget drops the least relevant plain evidence first and says what it dropped.
// Not wired into the chat or the research engine yet (its steps return findings, not facts).

import { canonicalSourceUrl } from './deepResearch'
import { evaluateFact, type EvidenceInput, type FactEvaluation, type SourceType } from '@/lib/tvi/evidenceGate'
import { fold } from './researchSignals'

export interface EvidenceIn { id: string; url: string; title: string; snippet?: string; text?: string; publishedAt?: string | null; sourceType: SourceType }
export interface FactIn { entityKey: string; factType: string; value: unknown; evidenceId: string; relation?: EvidenceInput['relation']; retrievedAt: string }

export interface RankedSource { id: string; url: string; title: string; score: number; group: string; excerpt: string }
export interface FactGroup { entityKey: string; factType: string; valueKey: string; value: unknown; evidenceIds: string[]; independentGroups: number; state: FactEvaluation; important: boolean }
export interface Dossier {
  sources: RankedSource[]
  facts: FactGroup[]
  /** how many sources were the same page or a copy of another, and merged */
  duplicatesMerged: number
  syndicatedGroups: number
  omitted: { sources: number; facts: number }
  chars: number
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
/** A cheap stable fingerprint of the opening of a page, so a syndicated or copied article lands in the same group as its original. */
function fingerprint(e: { title: string; text: string }): string {
  const body = fold(e.text).replace(/[^a-z0-9 ]/g, '').slice(0, 300)
  const basis = body.length >= 80 ? body : fold(e.title)
  let h = 5381
  for (let i = 0; i < basis.length; i++) h = ((h << 5) + h + basis.charCodeAt(i)) | 0
  return `fp${(h >>> 0).toString(36)}`
}
const hostOf = (url: string): string => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }

const tokens = (s: string): string[] => fold(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2)

/** BM25-style score of one document against the query terms (k1 = 1.2, b = 0.75), title counted twice. Pure. */
function bm25(queryTerms: readonly string[], docs: ReadonlyArray<string[]>): number[] {
  const N = docs.length || 1
  const avg = docs.reduce((a, d) => a + d.length, 0) / N || 1
  const df = new Map<string, number>()
  for (const t of new Set(queryTerms)) df.set(t, docs.filter(d => d.includes(t)).length)
  return docs.map(d => {
    let s = 0
    for (const t of new Set(queryTerms)) {
      const tf = d.filter(x => x === t).length
      if (!tf) continue
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5))
      s += idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.length / avg))))
    }
    return Math.round(s * 1e4) / 1e4
  })
}

const valueKey = (v: unknown): string => {
  const canon = (x: unknown): unknown => Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, y]) => [k, canon(y)])) : typeof x === 'string' ? x.trim().toLowerCase().replace(/\s+/g, ' ') : x
  return JSON.stringify(canon(v))
}

export interface AssembleInput { query: string; evidence: readonly EvidenceIn[]; facts: readonly FactIn[]; now?: Date; /** character budget for the packed dossier (excerpts + fact values) */ budgetChars: number }

/** Assemble the dossier. The same input always gives the same output. Pure. */
export function assembleDossier(i: AssembleInput): Dossier {
  const now = i.now ?? new Date()
  // 1-2 normalise, deduplicate by canonical address, group copies by fingerprint (syndication) and by publisher
  const byUrl = new Map<string, EvidenceIn & { text: string; group: string }>()
  let duplicatesMerged = 0
  const idMap = new Map<string, string>()
  const groupOfFp = new Map<string, string>()
  for (const e of i.evidence) {
    const url = canonicalSourceUrl(e.url) ?? e.url
    const text = clean(e.text), title = clean(e.title)
    // the same page written two ways (www., a trailing slash, a fragment) is one page
    const key = (() => { try { const x = new URL(url); return `${x.hostname.toLowerCase().replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}${x.search}` } catch { return url } })()
    const prior = byUrl.get(key)
    if (prior) { duplicatesMerged++; idMap.set(e.id, prior.id); continue }
    const fp = fingerprint({ title, text })
    const group = groupOfFp.get(fp) ?? (groupOfFp.set(fp, hostOf(url) || fp), groupOfFp.get(fp)!)
    if (group !== (hostOf(url) || fp)) duplicatesMerged++
    byUrl.set(key, { ...e, url, title, text, snippet: clean(e.snippet), group })
    idMap.set(e.id, e.id)
  }
  const sourcesList = [...byUrl.values()]
  const syndicatedGroups = new Set(sourcesList.map(s => s.group)).size < new Set(sourcesList.map(s => hostOf(s.url))).size ? new Set(sourcesList.map(s => hostOf(s.url))).size - new Set(sourcesList.map(s => s.group)).size : 0
  // 4 relevance ranking
  const terms = tokens(i.query)
  const docs = sourcesList.map(s => [...tokens(s.title), ...tokens(s.title), ...tokens(s.snippet ?? ''), ...tokens(s.text)])
  const scores = bm25(terms, docs)
  const ranked: RankedSource[] = sourcesList
    .map((s, k) => ({ id: s.id, url: s.url, title: s.title, score: scores[k], group: s.group, excerpt: (s.snippet || s.text).slice(0, 400) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  const evidenceById = new Map(sourcesList.map(s => [s.id, s]))
  // 3, 5, 6, 7 group facts by entity + type + canonical value, map to evidence, evaluate with the §8.6 gate
  const groups = new Map<string, { f: FactIn; ev: Array<{ id: string; relation: EvidenceInput['relation'] }> }>()
  for (const f of i.facts) {
    const eid = idMap.get(f.evidenceId) ?? f.evidenceId
    if (!evidenceById.has(eid)) continue
    const k = `${f.entityKey}|${f.factType}|${valueKey(f.value)}`
    const g = groups.get(k) ?? { f, ev: [] }
    if (!g.ev.some(x => x.id === eid)) g.ev.push({ id: eid, relation: f.relation ?? 'SUPPORTS' })
    groups.set(k, g)
  }
  const factGroups: FactGroup[] = []
  const byEntityType = new Map<string, number>()
  for (const k of groups.keys()) { const et = k.split('|').slice(0, 2).join('|'); byEntityType.set(et, (byEntityType.get(et) ?? 0) + 1) }
  for (const [k, g] of groups) {
    const evidence: EvidenceInput[] = g.ev.map(x => { const s = evidenceById.get(x.id)!; return { relation: x.relation, sourceType: s.sourceType, independenceGroup: s.group, sourceDomain: hostOf(s.url) } })
    const ev = evaluateFact({ factType: g.f.factType, retrievedAt: g.f.retrievedAt, evidence }, now)
    const et = k.split('|').slice(0, 2).join('|')
    // several different values for one entity and type are a disagreement worth keeping whole
    const competing = (byEntityType.get(et) ?? 0) > 1
    factGroups.push({ entityKey: g.f.entityKey, factType: g.f.factType, valueKey: valueKey(g.f.value), value: g.f.value, evidenceIds: g.ev.map(x => x.id), independentGroups: ev.independentSupport, state: ev.state, important: competing || ev.state === 'CONFLICTING' || ev.bestAuthority === 'HIGH' })
  }
  factGroups.sort((a, b) => Number(b.important) - Number(a.important) || a.entityKey.localeCompare(b.entityKey) || a.factType.localeCompare(b.factType) || a.valueKey.localeCompare(b.valueKey))
  // 8 budget-aware packing: important facts first and never cut; then other facts; then sources by relevance until the budget is used
  const factChars = (f: FactGroup) => f.entityKey.length + f.factType.length + f.valueKey.length + 40
  let used = 0
  const facts: FactGroup[] = []
  let omittedFacts = 0
  for (const f of factGroups) {
    if (f.important || used + factChars(f) <= i.budgetChars) { facts.push(f); used += factChars(f) } else omittedFacts++
  }
  const needed = new Set(facts.flatMap(f => f.evidenceIds))
  const sources: RankedSource[] = []
  let omittedSources = 0
  for (const s of ranked) {
    const len = s.excerpt.length + s.title.length + s.url.length + 20
    if (needed.has(s.id) || used + len <= i.budgetChars) { sources.push(s); used += len } else omittedSources++
  }
  return { sources, facts, duplicatesMerged, syndicatedGroups, omitted: { sources: omittedSources, facts: omittedFacts }, chars: used }
}
