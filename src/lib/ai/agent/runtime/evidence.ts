// ── Phase 8 M3 — the evidence ledger: FACT / INFERENCE / UNKNOWN / CONFLICT, with sources ───────────────────────────────────────
//
// One ledger per agent turn. Sources are the pages the agent read (read_page); evidence items are claims about a subject's attribute
// ("AirPods Pro 2 · battery_life_hours = 6"). Who decides what:
//
//   · CODE builds the candidate claims of each page DETERMINISTICALLY (candidateClaims, latency pass 08/10 — no per-page model call):
//     the sentences of the bounded extract that match what the agent is looking for (`focus`) are STATED claims with their quote and
//     the quantity they give; sentences that only partly match are IMPLIED (inference candidates); no matching sentence = NOT IN SOURCE.
//     JSON-LD offers / ratings / hours are stated claims directly. `addClaims` also accepts claims reported by a model (RawClaim) —
//     the classification below is the same either way.
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
import { classifySource, reliabilityFor, reliabilityNote, hostOf, sourceClassOf, type ClaimKind, type Reliability, type SourceType, type SourceClass } from './sourceType'
import { parsePriceStatement, normaliseVariant, ageDays, pricesDisagree, priceView, type PriceEvidence } from './priceEvidence'
import { claimsDisagree } from './claimConflict'
import { extractMoneyClaims } from '@/lib/ai/moneyGuard'
import type { PageDoc, StructuredFact } from './pageExtract'
import { isInstructionLike, cutSecrets } from '../guards'

export type EvidenceType = 'FACT' | 'INFERENCE' | 'UNKNOWN' | 'CONFLICT'
export const CLAIM_KINDS: ClaimKind[] = ['spec', 'price', 'availability', 'hours', 'policy', 'condition', 'experience', 'location', 'other']

export interface Source { id: string; url: string; canonicalUrl: string; title: string; host: string; retrievedAt: string; sourceType: SourceType; basis: string; reliabilityNote: string; publishedAt: string | null; /** WS2: owner taxonomy class (metadata). */ sourceClass: SourceClass; /** WS2: what following this source's link does (link contract). */ actionType: LinkActionType }

/** WS2 link contract: what a real link does when followed. Research sources produce MAP / WEBSITE / PRODUCT / BOOK / SOCIAL / SOURCE;
 *  ORDER and CALL come from provider rows (card actions), never from a page. */
export type LinkActionType = 'MAP' | 'WEBSITE' | 'PRODUCT' | 'BOOK' | 'ORDER' | 'CALL' | 'SOCIAL' | 'SOURCE'
/** A real source / action link (WS2 link contract): the URL is the page actually read; label and title come from the page, never the model. */
export interface SourceLink { id: string; url: string; label: string; title: string; source_type: SourceClass; action_type: LinkActionType; host: string }

/** The action type of a read page, deterministically from its class and what it states about itself. */
export function actionTypeFor(cls: SourceClass, doc?: Pick<PageDoc, 'structured'> | null): LinkActionType {
  const offer = (doc?.structured ?? []).some(f => /Product|Offer/i.test(f.type) && !!f.price)
  if (cls === 'MAPS_BUSINESS') return 'MAP'
  if (cls === 'BOOKING_PLATFORM') return 'BOOK'
  if (offer || cls === 'PRODUCT_RETAILER') return 'PRODUCT'
  if (cls === 'SOCIAL') return 'SOCIAL'
  if (cls.startsWith('OFFICIAL_')) return 'WEBSITE'
  return 'SOURCE'
}
/** The link contract record of a source. */
export function sourceLink(s: Source): SourceLink {
  return { id: s.id, url: s.url, label: s.host, title: s.title, source_type: s.sourceClass, action_type: s.actionType, host: s.host }
}

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
  /** WS2: a price claim's contract record (variant, type, figures, source, retrieval time). */
  price?: PriceEvidence
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

/** The unit class of the first quantity in a value (hours, %, mAh, money, cycles, GB, km, …), or null. */
export function unitOf(v: string): string | null {
  const f = fold(v)
  const m = /\d(?:[\d.,]*\d)?\s*(%|mah|wh|gio|h\b|hours?|hrs?|phut|minutes?|mins?|ngay|days?|thang|months?|nam\b|years?|chu ky|cycles?|gb|tb|mb|kg|g\b|km|m\b|cm|mm|inch|"|vnd|d\b|dong|trieu|tr\b|k\b|usd|\$|eur|w\b|hz|mp)/.exec(f)
  if (!m) return /[$€]/.test(v) ? 'money' : null
  const u = m[1]
  if (/^(gio|h|hours?|hrs?)$/.test(u)) return 'hours'
  if (/^(phut|minutes?|mins?)$/.test(u)) return 'minutes'
  if (/^(ngay|days?)$/.test(u)) return 'days'
  if (/^(thang|months?)$/.test(u)) return 'months'
  if (/^(nam|years?)$/.test(u)) return 'years'
  if (/^(chu ky|cycles?)$/.test(u)) return 'cycles'
  if (/^(vnd|d|dong|trieu|tr|k|usd|\$|eur)$/.test(u)) return 'money'
  return u
}

/** Do two values disagree? Numeric: different leading number beyond 10 % (and beyond ±1), same unit class. Text: neither contains the other. */
export function valuesDisagree(a: string, b: string): boolean {
  // Comparable only like with like: the same unit class (or both without a unit), and numbers with numbers — "812" (a cycle count with
  // no unit) is never compared with "100%", and a figure is never compared with a sentence.
  const ua = unitOf(a), ub = unitOf(b)
  if ((ua || ub) && ua !== ub) return false
  const na = numbersIn(a), nb = numbersIn(b)
  if ((na.length > 0) !== (nb.length > 0)) return false
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

  /**
   * RETRIEVAL_V5 lần 2c (B3, owner 20/10): a CONFLICT needs a named subject on both sides. The page-level candidates (candidateClaims) have
   * no subject and the question itself as attribute, so every number on every page "disagreed" — measured Cổng 2 lần 2: u22 resolution
   * number "57-NQ/TW" vs "2,6 tỉ đồng", u09 "49" vs savings rates, u26 a hotline "1900599997 đ", u08 a procedure code "1.004194"; two of them
   * reached the reply as "các nguồn chưa khớp". Structured facts (a product / place name) still conflict as before. Off: unchanged.
   */
  constructor(private readonly o: { namedConflictsOnly?: boolean } = {}) {}

  sourceFor(url: string): Source | undefined {
    const k = normUrl(url)
    return this.sources.find(s => normUrl(s.url) === k || normUrl(s.canonicalUrl) === k)
  }

  /** Registers a read page as a source (idempotent by URL). */
  addSource(doc: PageDoc, retrievedAt: string, lang: string): Source {
    const known = this.sourceFor(doc.url) ?? this.sourceFor(doc.canonicalUrl)
    if (known) return known
    // WS2: classified by the host the page was FETCHED from (canonicalUrl is same-host only — pageExtract), never by a cross-host claim.
    const at = doc.canonicalUrl || doc.url
    const c = classifySource(at, doc)
    const cls = sourceClassOf(c, at, doc)
    const s: Source = { id: `S${this.sources.length + 1}`, url: doc.url, canonicalUrl: doc.canonicalUrl, title: doc.title || doc.siteName || hostOf(doc.url), host: doc.host || hostOf(doc.url), retrievedAt, sourceType: c.type, basis: c.basis, reliabilityNote: reliabilityNote(c.type, lang), publishedAt: doc.publishedAt, sourceClass: cls, actionType: actionTypeFor(cls, doc) }
    this.sources.push(s)
    // M4: the bounded extract (and the publication date the model was shown) stays with the turn (never persisted) so the settle-path guards can check what a cited sentence states.
    this.extracts.set(s.id, [doc.title, doc.description, doc.publishedAt ? `published ${doc.publishedAt.slice(0, 10)}` : '', ...doc.headings, ...doc.passages, ...doc.structured.map(f => [f.name, f.price && `${f.price} ${f.currency ?? ''}`, f.availability, f.openingHours, f.address, f.rating !== undefined ? `${f.rating}${f.ratingCount !== undefined ? ` (${f.ratingCount} reviews)` : ''}` : ''].filter(Boolean).join(' · '))].filter((x): x is string => typeof x === 'string' && x.trim().length > 0))
    return s
  }

  /** M4: per source, the text of its bounded extract (this turn only). */
  private readonly extracts = new Map<string, string[]>()

  /** M4: what the settle-path guards read (guardEvidence.ts): each source with its extract, and the conflicts with their sides. */
  guardView(): { sources: Array<{ id: string; host: string; sourceType: SourceType; passages: string[] }>; conflicts: Array<{ attribute: string; sides: Array<{ value: string; sourceId: string; reliability: string }> }>; stalePrices: number[]; freshPrices: number[] } {
    return {
      sources: this.sources.map(s => ({ id: s.id, host: s.host, sourceType: s.sourceType, passages: this.extracts.get(s.id) ?? [] })),
      conflicts: this.items.filter(i => i.type === 'CONFLICT' && i.sides?.length).map(i => ({ attribute: i.attribute, sides: i.sides!.map(x => ({ value: x.value, sourceId: x.sourceId, reliability: x.reliability })) })),
      // WS2 final: price figures by freshness (a page dated > 180 days before the read is OLD) — the No-Fabrication Gate's stale rule.
      stalePrices: this.items.filter(i => i.price && i.price.age_days !== null && i.price.age_days > 180).flatMap(i => [i.price!.amount, i.price!.amount_max].filter((x): x is number => typeof x === 'number')),
      freshPrices: this.items.filter(i => i.price && !(i.price.age_days !== null && i.price.age_days > 180)).flatMap(i => [i.price!.amount, i.price!.amount_max].filter((x): x is number => typeof x === 'number')),
    }
  }

  /** Adds Luna's claims for one source (classified here) and the page's structured facts; returns what was added and any new conflicts. */
  addClaims(source: Source, raw: readonly RawClaim[], pageText: string, structured: readonly StructuredFact[] = []): { added: EvidenceItem[]; conflicts: EvidenceItem[] } {
    const added: EvidenceItem[] = []
    for (const f of structured) for (const c of structuredClaims(f)) {
      const item = this.push({ ...c, sourceIds: [source.id], type: 'FACT', confidence: reliabilityFor(source.sourceType, c.kind), basis: 'structured_data' })
      if (c.kind === 'price') item.price = priceRecord(source, item, c.value, f.name ?? '')
      added.push(item)
    }
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
      const item = this.push({ type, subject, attribute, kind, value: type === 'UNKNOWN' && basis === 'not_in_source' ? '' : value, sourceIds: [source.id], confidence: type === 'FACT' ? rel : type === 'INFERENCE' ? (rel === 'high' ? 'medium' : 'low') : 'low', ...(quote ? { quote } : {}), basis })
      // WS2: a price is recorded with its type, variant and retrieval time (the variant from the sentence, else the page title).
      if (kind === 'price' && item.value) item.price = priceRecord(source, item, quote || value, [subject, quote].join(' '))
      added.push(item)
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
      if (this.o.namedConflictsOnly && !n.subject.trim()) continue
      // WS2: two prices are compared like with like (variant, condition, price type — priceEvidence.pricesDisagree), never by first number.
      // WS2 final: every other kind is compared like with like as well (claimConflict.ts: hours, availability, durations, policy polarity,
      // numbers) — two wordings of one fact are not a conflict, a hedged or subjective claim never is.
      const differ = (o: EvidenceItem) => o.price && n.price ? pricesDisagree(o.price, n.price) : claimsDisagree(n.kind, { value: o.value, quote: o.quote }, { value: n.value, quote: n.quote })
      // Hours / availability read from a page's own structured data are compared with the same kind read from another page's text.
      const sameAttr = (o: EvidenceItem) => o.attribute === n.attribute || (o.kind === n.kind && (n.kind === 'hours' || n.kind === 'availability'))
      const rivals = this.items.filter(o => o !== n && o.type !== 'CONFLICT' && !!o.value && sameAttr(o) && o.sourceIds[0] !== n.sourceIds[0] && sameSubject(o.subject, n.subject) && differ(o))
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
      source: { id: source.id, title: source.title, host: source.host, source_type: source.sourceType, source_class: source.sourceClass, link_kind: source.actionType, reliability: source.reliabilityNote, retrieved_at: source.retrievedAt, ...(source.publishedAt ? { published: source.publishedAt } : {}) },
      evidence: items.map(e => ({ id: e.id, type: e.type, subject: e.subject, attribute: e.attribute, ...(e.value ? { value: e.value } : {}), ...(e.price ? { price: priceView(e.price) } : {}), confidence: e.confidence, ...(e.quote ? { quote: e.quote } : {}), ...(e.basis === 'weak_source_claim' ? { note: 'claimed by a source that is weak for this kind of fact — unverified' } : e.basis === 'stated_unverified_quote' ? { note: 'not found verbatim in the page — treat as inference' } : {}) })),
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

/** WS2: the price contract record of one price evidence item. */
function priceRecord(source: Source, item: EvidenceItem, statement: string, about: string): PriceEvidence {
  const p = parsePriceStatement(statement)
  return {
    entity: item.subject || source.title.slice(0, 120), variant: normaliseVariant(about) ?? normaliseVariant(source.title), ...p,
    source_url: source.url, source_title: source.title, source_type: source.sourceClass, reliability: reliabilityFor(source.sourceType, 'price'),
    retrieved_at: source.retrievedAt, published_at: source.publishedAt, age_days: ageDays(source.publishedAt, source.retrievedAt),
    evidence_status: item.type, confidence: item.confidence,
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
export function planCitations(text: string, sources: readonly Source[]): { text: string; cited: number; sources: SourceLink[] } {
  const known = new Set(sources.map(s => s.id))
  const used = new Set<string>()
  const out = text.replace(/\s?\[(S\d{1,2}(?:\s*,\s*S\d{1,2})*)\]/g, (_m, ids: string) => {
    const keep = ids.split(/\s*,\s*/).filter(id => known.has(id))
    for (const id of keep) used.add(id)
    return keep.length ? ` [${keep.join(', ')}]` : ''
  })
  return { text: out, cited: used.size, sources: sources.map(sourceLink) }
}

// ── deterministic candidate claims (latency pass) ───────────────────────────────────────────────────────────────────────────────

const STOP = new Set(['va', 'cua', 'cho', 'la', 'co', 'khong', 'nao', 'bao', 'nhieu', 'gi', 'mot', 'nhung', 'cac', 'voi', 'trong', 'duoc', 've', 'theo', 'chinh', 'thuc', 'and', 'the', 'of', 'to', 'for', 'is', 'in', 'on', 'a', 'an', 'how', 'what', 'official', 'by', 'with'])
/**
 * Bilingual term groups (folded): a focus written in Vietnamese still matches an English page and back ("tình trạng pin" ↔ "battery
 * condition", "dung lượng" ↔ "capacity"). Matching is by GROUP, so a group counts once. Retrieval vocabulary, not a judgement.
 */
const TERM_GROUPS: string[][] = [
  ['pin', 'battery', 'batteries'], ['dung luong', 'capacity', 'mah'], ['chu ky', 'cycle', 'cycles'], ['tinh trang', 'condition', 'health', 'status', 'maximum capacity', 'suc khoe', 'battery health'],
  ['gia', 'price', 'prices', 'cost', 'phi', 'fee', 'fees', 'le phi'], ['bao hanh', 'warranty', 'guarantee'], ['gio mo cua', 'mo cua', 'opening', 'open', 'hours'],
  ['ve', 've vao', 'ticket', 'tickets', 'admission'], ['thoi luong', 'duration', 'life', 'listening', 'playback'], ['sac', 'charge', 'charging', 'charger'],
  ['chong nuoc', 'water', 'waterproof', 'ip54', 'ip68', 'ipx4'], ['man hinh', 'display', 'screen'], ['trong luong', 'weight', 'nang'],
]
const GROUP_OF = new Map<string, number>()
TERM_GROUPS.forEach((g, i) => { for (const w of g) GROUP_OF.set(w, i) })
/** Group keys present in a text: single words and two-word phrases mapped to their group; other words stand for themselves. */
function termKeys(text: string, dropStop: boolean): Set<string> {
  const words = fold(text).split(/[^a-z0-9]+/).filter(Boolean)
  const out = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    const two = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : ''
    if (two && GROUP_OF.has(two)) { out.add(`g${GROUP_OF.get(two)}`); continue }
    const w = words[i]
    if (GROUP_OF.has(w)) out.add(`g${GROUP_OF.get(w)}`)
    else if (w.length >= 2 && !(dropStop && STOP.has(w))) out.add(w)
  }
  return out
}
const focusTerms = (s: string) => [...termKeys(s, true)]
const sentencesOf = (passages: readonly string[]) => passages.flatMap(p => p.split(/(?<=[.!?…;])\s+(?=[A-ZÀ-Ỹ0-9"“(])/)).map(x => x.trim()).filter(x => x.length >= 12 && x.length <= 400)

/** The quantity a sentence gives (number + unit when there is one), else a short form of the sentence. */
export function quantityIn(sentence: string): string {
  const m = /(?:(?:up to|tối đa|khoảng|around|about|from|từ)\s+)?\d[\d.,]*\s*(?:%|mAh|Wh|giờ|h\b|hours?|hrs?|phút|minutes?|ngày|days?|tháng|months?|năm|years?|chu kỳ|cycles?|GB|TB|kg|km|inch|VNĐ|VND|đ|đồng|triệu|USD|\$|W\b|Hz|MP)?/i.exec(sentence)
  return m && /\d/.test(m[0]) ? m[0].trim() : sentence.slice(0, 160)
}

/**
 * Candidate claims of one page for what the agent is looking for (`focus`), without a model call:
 *   · up to 3 sentences that carry at least two of the focus's term groups (one for a one-term focus) → STATED, quote = the sentence;
 *   · the best sentence that contains some focus term and a number, but not enough terms → IMPLIED (an inference candidate);
 *   · nothing matching → NOT FOUND (UNKNOWN for this source).
 * The attribute is the focus itself (folded slug), so pages read for the same focus are compared for CONFLICT; the subject is left
 * empty (page-level). Pure; the ledger classifies them (reliability by source type × kind, quote verification, conflicts).
 */
export function candidateClaims(doc: Pick<PageDoc, 'passages' | 'title' | 'description'>, focus: string, kind: ClaimKind): RawClaim[] {
  const attribute = attrKey(focus) || 'info'
  const q = focusTerms(focus)
  const sentences = sentencesOf([doc.description, ...doc.passages].filter(Boolean))
  // Stated = the sentence carries at least two of the focus's term groups (or all of a one-term focus): long focus phrases rarely
  // repeat whole in one sentence, and "half of the terms" turned most real statements into inference candidates (measured 08/10).
  const need = Math.max(1, Math.min(2, Math.ceil(q.length / 2)))
  const scored = sentences.map((s, i) => { const t = termKeys(s, false); const hits = q.filter(w => t.has(w)).length; return { s, i, hits, num: /\d/.test(s) } })
  const stated = scored.filter(x => x.hits >= need).sort((a, b) => b.hits - a.hits || Number(b.num) - Number(a.num) || a.i - b.i).slice(0, 3)
  // WS2: a price claim's value is the MONEY in the sentence ("MacBook Pro M4 16GB giá 39.990.000đ" is 39.990.000đ, not "4" from "M4").
  const valueOf = (s: string) => kind === 'price' ? (extractMoneyClaims(s)[0]?.raw ?? quantityIn(s)) : quantityIn(s)
  if (stated.length) return stated.map(x => ({ subject: '', attribute, kind, value: valueOf(x.s), stance: 'stated' as const, quote: x.s }))
  const implied = scored.filter(x => x.hits >= 1 && x.num).sort((a, b) => b.hits - a.hits || a.i - b.i).slice(0, 2)
  if (implied.length) return implied.map(x => ({ subject: '', attribute, kind, value: valueOf(x.s), stance: 'inferred' as const, quote: x.s }))
  return [{ subject: '', attribute, kind, value: '', stance: 'not_found', quote: '' }]
}
