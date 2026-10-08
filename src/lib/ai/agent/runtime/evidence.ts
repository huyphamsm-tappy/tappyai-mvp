// ── Phase 8 M3 — the evidence ledger: FACT / INFERENCE / UNKNOWN / CONFLICT, with sources ───────────────────────────────────────
//
// One ledger per agent turn. Sources are the pages the agent read (read_page); evidence items are claims about a subject's attribute
// ("AirPods Pro 2 · battery_life_hours = 6"). Who decides what:
//
//   · LUNA reads each page against what it is looking for and reports claims, each with a stance — the page STATES it (with a quote), the
//     page IMPLIES it, or the page does NOT say (taskTracker-like structured call, readPage.ts). JSON-LD offers / ratings / hours are
//     taken by code as stated claims directly.
//   · CODE classifies, deterministically:
//       FACT       stated, quote (or value) found in the page text, by a source reliable enough FOR THAT KIND of claim
//                  (sourceType.ts matrix — e.g. a manufacturer for a spec, a government site for a fee);
//       INFERENCE  implied by the page, or "stated" but the quote could not be found in the page (never promoted to FACT);
//       UNKNOWN    the page does not say — or it is only the claim of a weak source for that kind (a seller saying "pin zin 100%"):
//                  kept, with who claims it, but not verified;
//       CONFLICT   two sources make different claims about the same subject + attribute — BOTH sides are kept, with their
//                  reliability; nothing is deleted and nothing is decided here.
//   · LUNA again reasons over the ledger: weighs sources, explains a conflict, infers carefully, says what to verify. The ledger grounds
//     the answer; it never writes it (no "FACT → answer", no "UNKNOWN → refuse").
//
// The model reads a compact view (ids, types, values, short quotes, source type + reliability). Pages themselves are never persisted;
// the task keeps only short evidence references (toTaskRefs) for re-use on follow-ups.

import { createHash } from 'node:crypto'
import { classifySource, reliabilityFor, reliabilityNote, hostOf, type ClaimKind, type Reliability, type SourceType } from './sourceType'
import type { PageDoc, StructuredFact } from './pageExtract'
import { isInstructionLike, cutSecrets } from '../guards'

export type EvidenceType = 'FACT' | 'INFERENCE' | 'UNKNOWN' | 'CONFLICT'
export const CLAIM_KINDS: ClaimKind[] = ['spec', 'price', 'availability', 'hours', 'policy', 'condition', 'experience', 'location', 'other']

export interface Source { id: string; url: string; canonicalUrl: string; title: string; host: string; retrievedAt: string; sourceType: SourceType; basis: string; reliabilityNote: string; publishedAt: string | null }

export interface EvidenceItem {
  id: string
  type: EvidenceType
  subject: string
  attribute: string
  kind: ClaimKind
  value: string
  sourceIds: string[]
  confidence: Reliability
  quote?: string
  /** Why the type is what it is (closed vocabulary). */
  basis: 'stated_verified' | 'stated_unverified_quote' | 'implied' | 'not_in_source' | 'weak_source_claim' | 'structured_data' | 'sources_disagree'
  /** For a CONFLICT: the competing claims. */
  sides?: Array<{ value: string; sourceId: string; type: EvidenceType; reliability: Reliability }>
}

/** A claim as Luna reports it for one page. */
export interface RawClaim { subject: string; attribute: string; kind: string; value: string; stance: 'stated' | 'inferred' | 'not_found'; quote: string }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const clean = (s: unknown, max: number): string => {
  if (typeof s !== 'string') return ''
  const t = squash(cutSecrets(s.replace(/https?:\/\/\S+|www\.\S+/gi, ' ')).text)
  return t && !isInstructionLike(t) ? t.slice(0, max) : ''
}
export const attrKey = (s: string) => fold(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
const subjTokens = (s: string) => new Set(fold(s).replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !['the', 'and', 'cho', 'cua', 'gen', 'the', 'ban', 'may'].includes(w)))

/** Same subject? Token overlap (handles "AirPods Pro 2" vs "AirPods Pro (2nd generation)"), plus the empty-subject case (page-level). */
export function sameSubject(a: string, b: string): boolean {
  const x = subjTokens(a), y = subjTokens(b)
  if (!x.size || !y.size) return fold(a).trim() === fold(b).trim()
  const inter = [...x].filter(w => y.has(w)).length
  return inter / Math.min(x.size, y.size) >= 0.75
}

/** Numbers in a value (comma / dot thousands handled loosely): used to compare "6 giờ" with "6 hours" or "812 cycles" with "50". */
export function numbersIn(v: string): number[] {
  return [...fold(v).matchAll(/\d+(?:[.,]\d+)*/g)].map(m => {
    const s = m[0]
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''))
    return Number(s.replace(',', '.'))
  }).filter(Number.isFinite)
}

/** Do two values disagree? Numeric: different leading number beyond 10 % (and beyond ±1). Text: neither contains the other. */
export function valuesDisagree(a: string, b: string): boolean {
  const na = numbersIn(a), nb = numbersIn(b)
  if (na.length && nb.length) {
    const x = na[0], y = nb[0]
    return Math.abs(x - y) > Math.max(1, 0.1 * Math.max(Math.abs(x), Math.abs(y)))
  }
  const fa = squash(fold(a)), fb = squash(fold(b))
  if (!fa || !fb) return false
  return !fa.includes(fb) && !fb.includes(fa)
}

/** Is the quote (or the value) really in the page? Whitespace / diacritics-insensitive; long quotes may match on their core. */
export function foundInPage(needle: string, hay: string): boolean {
  const n = squash(fold(needle)).replace(/["“”'‘’]/g, '')
  if (n.length < 3) return false
  const h = squash(fold(hay)).replace(/["“”'‘’]/g, '')
  if (h.includes(n)) return true
  if (n.length > 60) return h.includes(n.slice(0, 60)) || h.includes(n.slice(-60))
  return false
}

export class EvidenceLedger {
  readonly sources: Source[] = []
  readonly items: EvidenceItem[] = []
  private nextE = 1

  sourceFor(url: string): Source | undefined {
    const k = normUrl(url)
    return this.sources.find(s => normUrl(s.url) === k || normUrl(s.canonicalUrl) === k)
  }

  /** Registers a read page as a source (idempotent by URL). */
  addSource(doc: PageDoc, retrievedAt: string, lang: string): Source {
    const known = this.sourceFor(doc.url) ?? this.sourceFor(doc.canonicalUrl)
    if (known) return known
    const c = classifySource(doc.canonicalUrl || doc.url, doc)
    const s: Source = { id: `S${this.sources.length + 1}`, url: doc.url, canonicalUrl: doc.canonicalUrl, title: doc.title || doc.siteName || hostOf(doc.url), host: doc.host || hostOf(doc.url), retrievedAt, sourceType: c.type, basis: c.basis, reliabilityNote: reliabilityNote(c.type, lang), publishedAt: doc.publishedAt }
    this.sources.push(s)
    return s
  }

  /** Adds Luna's claims for one source (classified here) and the page's structured facts; returns what was added and any new conflicts. */
  addClaims(source: Source, raw: readonly RawClaim[], pageText: string, structured: readonly StructuredFact[] = []): { added: EvidenceItem[]; conflicts: EvidenceItem[] } {
    const added: EvidenceItem[] = []
    for (const f of structured) for (const c of structuredClaims(f)) added.push(this.push({ ...c, sourceIds: [source.id], type: 'FACT', confidence: reliabilityFor(source.sourceType, c.kind), basis: 'structured_data' }))
    for (const r of raw.slice(0, 12)) {
      const subject = clean(r.subject, 100), attribute = attrKey(r.attribute || ''), value = clean(r.value, 160), quote = clean(r.quote, 220)
      const kind = (CLAIM_KINDS as string[]).includes(r.kind) ? r.kind as ClaimKind : 'other'
      if (!attribute) continue
      const rel = reliabilityFor(source.sourceType, kind)
      let type: EvidenceType, basis: EvidenceItem['basis']
      if (r.stance === 'not_found' || !value) { type = 'UNKNOWN'; basis = 'not_in_source' }
      else if (r.stance === 'inferred') { type = 'INFERENCE'; basis = 'implied' }
      else if (!(quote && foundInPage(quote, pageText)) && !foundInPage(value, pageText)) { type = 'INFERENCE'; basis = 'stated_unverified_quote' }
      else if (rel === 'low') { type = 'UNKNOWN'; basis = 'weak_source_claim' }
      else { type = 'FACT'; basis = 'stated_verified' }
      added.push(this.push({ type, subject, attribute, kind, value: type === 'UNKNOWN' && basis === 'not_in_source' ? '' : value, sourceIds: [source.id], confidence: type === 'FACT' ? rel : type === 'INFERENCE' ? (rel === 'high' ? 'medium' : 'low') : 'low', ...(quote ? { quote } : {}), basis }))
    }
    return { added, conflicts: this.detectConflicts(added) }
  }

  private push(e: Omit<EvidenceItem, 'id'>): EvidenceItem {
    const item: EvidenceItem = { id: `E${this.nextE++}`, ...e }
    this.items.push(item)
    return item
  }

  /**
   * A new claim with a value that disagrees with an earlier claim (another source) on the same subject + attribute → one CONFLICT item
   * holding both sides (each side keeps its own item and type). Not-found items never conflict. One conflict per subject + attribute;
   * later disagreeing sides join it.
   */
  private detectConflicts(fresh: readonly EvidenceItem[]): EvidenceItem[] {
    const out: EvidenceItem[] = []
    for (const n of fresh) {
      if (n.type === 'CONFLICT' || !n.value) continue
      const rivals = this.items.filter(o => o !== n && o.type !== 'CONFLICT' && !!o.value && o.attribute === n.attribute && o.sourceIds[0] !== n.sourceIds[0] && sameSubject(o.subject, n.subject) && valuesDisagree(o.value, n.value))
      if (!rivals.length) continue
      const existing = this.items.find(c => c.type === 'CONFLICT' && c.attribute === n.attribute && sameSubject(c.subject, n.subject))
      const side = (x: EvidenceItem) => ({ value: x.value, sourceId: x.sourceIds[0], type: x.type, reliability: reliabilityFor(this.sources.find(s => s.id === x.sourceIds[0])?.sourceType ?? 'other', x.kind) })
      if (existing) {
        if (!existing.sides!.some(s => s.sourceId === n.sourceIds[0] && s.value === n.value)) existing.sides!.push(side(n))
        existing.sourceIds = [...new Set([...existing.sourceIds, n.sourceIds[0]])]
        continue
      }
      const sides = [...rivals.map(side), side(n)]
      out.push(this.push({ type: 'CONFLICT', subject: n.subject || rivals[0].subject, attribute: n.attribute, kind: n.kind, value: '', sourceIds: [...new Set(sides.map(s => s.sourceId))], confidence: 'low', basis: 'sources_disagree', sides }))
    }
    return out
  }

  counts(): Record<EvidenceType, number> {
    const c: Record<EvidenceType, number> = { FACT: 0, INFERENCE: 0, UNKNOWN: 0, CONFLICT: 0 }
    for (const i of this.items) c[i.type]++
    return c
  }

  /** The compact view the model reads for one source (after read_page). */
  viewFor(source: Source, items: readonly EvidenceItem[], conflicts: readonly EvidenceItem[]): Record<string, unknown> {
    return {
      source: { id: source.id, title: source.title, host: source.host, source_type: source.sourceType, reliability: source.reliabilityNote, ...(source.publishedAt ? { published: source.publishedAt } : {}) },
      evidence: items.map(e => ({ id: e.id, type: e.type, subject: e.subject, attribute: e.attribute, ...(e.value ? { value: e.value } : {}), confidence: e.confidence, ...(e.quote ? { quote: e.quote } : {}), ...(e.basis === 'weak_source_claim' ? { note: 'claimed by a source that is weak for this kind of fact — unverified' } : e.basis === 'stated_unverified_quote' ? { note: 'not found verbatim in the page — treat as inference' } : {}) })),
      ...(conflicts.length ? { conflicts: conflicts.map(c => ({ id: c.id, type: 'CONFLICT', subject: c.subject, attribute: c.attribute, sides: c.sides })) } : {}),
    }
  }

  /** Short references for the task (no page text): the sources read and up to 4 key claims each, with the constraint signature at read time. */
  toTaskRefs(constraintsSig: string, at: string): EvidenceRef[] {
    return this.sources.map(s => ({
      url: s.canonicalUrl || s.url, title: s.title.slice(0, 120), host: s.host, source_type: s.sourceType, retrieved_at: s.retrievedAt, constraints_sig: constraintsSig, at,
      claims: this.items.filter(e => e.sourceIds.includes(s.id) && e.type !== 'CONFLICT' && e.value).slice(0, 4).map(e => ({ subject: e.subject.slice(0, 80), attribute: e.attribute, value: e.value.slice(0, 120), type: e.type })),
      conflicts: this.items.filter(e => e.type === 'CONFLICT' && e.sourceIds.includes(s.id)).length,
    }))
  }
}

/** A stored evidence reference (task.research_state.evidence). */
export interface EvidenceRef { url: string; title: string; host: string; source_type: SourceType; retrieved_at: string; constraints_sig: string; at: string; claims: Array<{ subject: string; attribute: string; value: string; type: EvidenceType }>; conflicts: number }

/** A stable signature of the task's constraints (which evidence was gathered under). */
export function constraintsSignature(constraints: ReadonlyArray<{ key: string; value: string }>): string {
  return createHash('sha256').update([...constraints].map(c => `${c.key}=${fold(c.value)}`).sort().join('|')).digest('hex').slice(0, 12)
}

export function normUrl(u: string): string {
  try { const x = new URL(u); x.hash = ''; return `${x.protocol}//${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '') || '/'}${x.search}` } catch { return u }
}

function structuredClaims(f: StructuredFact): Array<Omit<EvidenceItem, 'id' | 'sourceIds' | 'type' | 'confidence' | 'basis'>> {
  const subject = f.name ?? ''
  const out: Array<Omit<EvidenceItem, 'id' | 'sourceIds' | 'type' | 'confidence' | 'basis'>> = []
  if (f.price) out.push({ subject, attribute: 'price', kind: 'price', value: `${f.price}${f.currency ? ` ${f.currency}` : ''}` })
  if (f.availability) out.push({ subject, attribute: 'availability', kind: 'availability', value: f.availability })
  if (f.rating !== undefined) out.push({ subject, attribute: 'rating', kind: 'experience', value: `${f.rating}${f.ratingCount !== undefined ? ` (${f.ratingCount} reviews)` : ''}` })
  if (f.openingHours) out.push({ subject, attribute: 'opening_hours', kind: 'hours', value: f.openingHours })
  if (f.address) out.push({ subject, attribute: 'address', kind: 'location', value: f.address })
  return out
}

/**
 * Citations, step 1 (here, no markdown): the model marks a sentence with [S1]; markers naming no source read this turn are removed.
 * Step 2 is the enrichment site (streamEnrichment.ts citeSources), the ONE place that turns retrieval into markdown links — through
 * `sanitizeUrlForMarkdown` / `escapeMarkdownLabel`, and only for URLs that are in this turn's tool frames.
 */
export function planCitations(text: string, sources: readonly Source[]): { text: string; cited: number; sources: Array<{ id: string; host: string; url: string }> } {
  const known = new Set(sources.map(s => s.id))
  const used = new Set<string>()
  const out = text.replace(/\s?\[(S\d{1,2}(?:\s*,\s*S\d{1,2})*)\]/g, (_m, ids: string) => {
    const keep = ids.split(/\s*,\s*/).filter(id => known.has(id))
    for (const id of keep) used.add(id)
    return keep.length ? ` [${keep.join(', ')}]` : ''
  })
  return { text: out, cited: used.size, sources: sources.map(s => ({ id: s.id, host: s.host, url: s.url })) }
}
