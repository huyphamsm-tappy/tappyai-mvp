// ── Phase 8 M4 — evidence-aware guards: page provenance for the settle-path guards (TAPPY_AGENT=2, web) ────────────────────────
//
// THE DEFECT (M3 eval RS-C1, 08/10): Luna read webdulichhoian.com [S2], wrote "Vé phố cổ hiện được niêm yết **80.000đ/người Việt** và
// **120.000đ/khách quốc tế**. … [S2]", and the travel guard deleted the sentence: its only price evidence is a live flight fare, so a
// page-backed price was judged exactly like an invented one. Every factual guard has the same blind spot (docs/phase8/
// M4-EVIDENCE-GUARD-AUDIT.md): they read evidence only from place / product / transport tool rows, never from the pages the agent read.
//
// THE RULE (code owns integrity, Luna owns interpretation): each sentence of the reply is judged ONCE, against the M3 evidence ledger,
// BEFORE the factual guards run:
//
//   SUPPORTED     the sentence cites a page read this turn ([S#] in the sentence, or the next marker in the same paragraph line) and EVERY
//                 checkable value in it — money, clock times, numbers with their unit or next word, model identifiers (M2 / S24),
//                 availability cues — is stated by a cited source (entity-scoped: when the sentence names a venue / product, the value
//                 must sit in a passage that names it too, so an area listicle's price never becomes one venue's price). A source that
//                 is weak for that kind of fact (sourceType.ts matrix: a marketplace for a spec, an unclassified blog for a price)
//                 supports only an ATTRIBUTED sentence ("người bán ghi …", "theo …"). Carried task evidence (TASK_STATE) supports too,
//                 when fresh: same constraint signature (the existing M3 rule) and no identifier in the user's message that the
//                 reference does not carry (M2 → M4, another date).
//                 → held out of the heuristic guards and restored UNCHANGED afterwards, citation included.
//   CONTRADICTED  supported by its cited source, but a numeric ledger CONFLICT has another source saying otherwise, and the reply mentions
//                 neither that source nor its value → kept, plus one code-written note naming the other source (Luna's own explanation,
//                 when present, means there is nothing to add). No value is chosen for the user.
//   UNKNOWN       uncited, or cited but not stated by the source → the existing guards decide exactly as before (remove / qualify).
//                 "Not in our deterministic data" is not "false", and "not in the page" is not "supported". A marker on a sentence whose
//                 number its cited sources never state is removed (no misattribution).
//   INVALID       an impossible value (25:70, an inverted range, a 7⭐ rating) → never held out.
//
// Hard guards are untouched: link egress, marketplace naming, leak check run BEFORE this pass; link sanitising, CTA validation, the
// grounding gate and the risk backstop run AFTER the restore, on the restored text. Page text is DATA: it is only ever compared against
// (never executed, never written into the reply except the bounded numeric value of a conflict side, which came from the ledger's
// cleaned values). Pure: no model, no network, no I/O.

import { extractMoneyClaims, sentenceSpans } from './moneyGuard'
import { AVAIL_RE } from './travelGuard'
import { unitOf } from './agent/runtime/evidence'
import { reliabilityFor, type ClaimKind, type SourceType } from './agent/runtime/sourceType'

export type Provenance = 'USER_INPUT' | 'SEARCH_SNIPPET' | 'PAGE_EVIDENCE' | 'TASK_STATE' | 'MODEL_KNOWLEDGE' | 'UNKNOWN'
export type GuardVerdict = 'SUPPORTED' | 'CONTRADICTED' | 'UNKNOWN' | 'INVALID'

/** A page read this turn: its id ([S#]), type, and the bounded extract (title, description, headings, passages, structured facts). */
export interface GuardSource { id: string; host: string; sourceType: SourceType; passages: string[] }
export interface GuardConflict { attribute: string; sides: Array<{ value: string; sourceId: string; reliability: string }> }
/** A task evidence reference carried from an earlier turn (task.research_state.evidence, M3 `EvidenceRef`). */
export interface CarriedRef { url: string; title: string; host: string; source_type: SourceType; constraints_sig: string; claims: Array<{ attribute: string; value: string; type: string }> }

/** Everything the settle path needs to judge provenance; built by the agent runtime at the end of the loop. */
export interface GuardEvidence {
  sources: GuardSource[]
  conflicts: GuardConflict[]
  /** Evidence references from earlier turns, as loaded at the START of this turn. */
  carried: CarriedRef[]
  /** The task's constraint signature at the start of this turn (null = no task). */
  constraintsSig: string | null
  /** The user's message this turn (identifier staleness; user-echo provenance). */
  userText: string
  /** WS2 final: price figures from OLD pages vs fresh ones (No-Fabrication Gate stale rule). */
  stalePrices?: number[]
  freshPrices?: number[]
}

export interface SentenceJudgement {
  verdict: GuardVerdict
  provenance: Provenance
  reason: string
  values: number
  sourceIds: string[]
  /** Cited, and states a number that no cited source states at all (any unit) — a misattribution candidate. */
  misattributed?: boolean
  /** The marker citing this sentence was removed: every sentence it covers is misattributed. */
  markersDropped?: boolean
  /** CONSULTATIVE_IN_AGENT (`cutUnsourcedMoney`): cited, and a money amount of the sentence is stated by NO page read this turn (any unit). */
  unsourcedMoney?: boolean
  note?: string
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const MARKER_RE = /\s?\[(S\d{1,2}(?:\s*,\s*S\d{1,2})*)\]/g
const TOKEN_MARK = '⁣'

// ── quantities ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type QKind = 'money' | 'time' | 'num' | 'id'
interface Q { kind: QKind; value: number; unit: string; currency?: string; alt?: number; token?: string; invalid?: boolean }

/** Next-word synonyms, so "4,8 sao" meets "4.8 stars" and "1.376 đánh giá" meets "1,376 reviews". */
const WORD_UNIT: Record<string, string> = { sao: 'stars', star: 'stars', stars: 'stars', danh: 'reviews', luot: 'reviews', reviews: 'reviews', review: 'reviews', ratings: 'reviews', nguoi: 'people', people: 'people', persons: 'people', khach: 'people' }

const blank = (s: string, a: number, b: number) => s.slice(0, a) + ' '.repeat(Math.max(0, b - a)) + s.slice(b)

/** The checkable values of a text: money (VND / USD amounts), clock times, numbers with their unit class or next word, model ids. */
export function quantitiesIn(text: string, canonMoney = false): Q[] {
  // Round 33 (CONSULTATIVE_IN_AGENT, `canonMoney`): a VND amount written in a scaled form ("2,01 triệu") is computed as 2.01 × 1 000 000 in floating point
  // (2 009 999.999…) and then compared with `===` against the same amount written in full ("2.010.000đ"). Only the REPRESENTATION is normalised — to a whole number of đồng,
  // for VND only (a USD amount keeps its cents). The amount itself is never changed: 2,01 triệu ≡ 2.010.000đ, 2,01 triệu ≢ 2.050.000đ.
  const money = (v: number, currency?: string): number => canonMoney && currency === 'VND' ? Math.round(v) : v
  let s = text
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, m => ' '.repeat(m.length))
    .replace(/https?:\/\/\S+/g, m => ' '.repeat(m.length))
    .replace(MARKER_RE, m => ' '.repeat(m.length))
    .replace(/\*\*/g, '  ')
    .replace(/^(\s*)\d{1,2}[.)](?=\s)/gm, (m, sp: string) => sp + ' '.repeat(m.length - sp.length))
  const out: Q[] = []
  for (const c of extractMoneyClaims(s)) {
    out.push({ kind: 'money', value: money(c.lo, c.currency), unit: 'money', currency: c.currency, invalid: !(c.lo > 0) || c.hi < c.lo })
    if (c.hi !== c.lo) out.push({ kind: 'money', value: money(c.hi, c.currency), unit: 'money', currency: c.currency })
    s = blank(s, c.start, c.end)
  }
  const times = /(?<![\d.,:])(\d{1,2})(?:\s*(?:h|giờ|gio)(?:\s*(\d{2}))?(?![\p{L}\d])|:(\d{2})(?!\d))/giu
  for (const m of [...s.matchAll(times)]) {
    const h = Number(m[1]), min = Number(m[2] ?? m[3] ?? 0)
    const clock = m[3] !== undefined || m[2] !== undefined
    // "30 giờ" is a duration (battery life), not a clock time; "25:70" is malformed.
    if (!clock && h > 24) out.push({ kind: 'num', value: h, unit: 'hours' })
    else out.push({ kind: 'time', value: h * 60 + min, unit: 'time', ...(min === 0 ? { alt: h } : {}), invalid: h > 24 || min > 59 })
    s = blank(s, m.index!, m.index! + m[0].length)
  }
  for (const m of [...s.matchAll(/(?<![\p{L}\d])\p{L}{1,8}\d{1,4}\p{L}{0,3}(?![\p{L}\d])/gu)]) {
    // A model / variant identifier (M2, S24, A17, iPhone15): checked as a token, not as a number.
    out.push({ kind: 'id', value: 0, unit: '', token: fold(m[0]) })
    s = blank(s, m.index!, m.index! + m[0].length)
  }
  for (const m of [...s.matchAll(/\d+(?:[.,]\d+)*/g)]) {
    const raw = m[0]
    const value = /^\d{1,3}([.,]\d{3})+$/.test(raw) ? Number(raw.replace(/[.,]/g, '')) : Number(raw.replace(',', '.'))
    if (!Number.isFinite(value)) continue
    const after = s.slice(m.index! + raw.length, m.index! + raw.length + 16)
    const cls = unitOf(raw + after)
    // Only a unit-like next word qualifies the number ("4,8 sao", "52 lần sạc" → no: "lan" is not a unit, the number stands alone);
    // an ordinary word ("Dune 3 có …") would make "3" unmatchable against "Dune 3 —".
    const word = fold(after).match(/^\s*([a-z]{2,})/)?.[1] ?? ''
    const unit = cls ?? WORD_UNIT[word] ?? ''
    const rated = /^\s*(?:⭐|★|\/\s*5\b)/.test(after) || unit === 'stars'
    out.push({ kind: 'num', value, unit, invalid: rated && value > 5 })
  }
  return out
}

interface Indexed { fold: string; qs: Q[] }
const index = (passages: readonly string[], canonMoney = false): Indexed[] => passages.filter(p => typeof p === 'string' && p.trim()).map(p => ({ fold: fold(p), qs: quantitiesIn(p, canonMoney) }))

/** Is quantity q stated in this passage? Strict: same money amount, same clock time, same number with the same unit / next word. */
function statedIn(q: Q, p: Indexed): boolean {
  switch (q.kind) {
    case 'money': return p.qs.some(x => (x.kind === 'money' && x.currency === q.currency && x.value === q.value) || (x.kind === 'num' && x.value === q.value && (x.unit === '' || x.unit === 'money')))
    case 'time': return p.qs.some(x => (x.kind === 'time' && x.value === q.value) || (q.alt !== undefined && x.kind === 'num' && x.value === q.alt && x.unit === 'hours'))
    case 'id': return new RegExp(`(?:^|[^a-z0-9])${q.token!.replace(/[^a-z0-9]/g, '')}(?![a-z0-9])`).test(p.fold.replace(/[\s-]+(?=\d)/g, ''))
    case 'num': return p.qs.some(x => (x.kind === 'num' && x.value === q.value && (q.unit === '' || x.unit === q.unit)) || (x.kind === 'money' && x.value === q.value && (q.unit === '' || q.unit === 'money')) || (x.kind === 'time' && q.unit === 'hours' && x.alt === q.value))
  }
}
/** Loose: the NUMBER appears at all (any unit) — used only to decide that a citation is a misattribution. */
const numberAnywhere = (q: Q, ps: readonly Indexed[]) => q.kind === 'id' ? ps.some(p => statedIn(q, p)) : ps.some(p => p.qs.some(x => x.value === q.value || x.alt === q.value || (q.alt !== undefined && x.value === q.alt)))

// ── sentence structure ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** `src` / `srcEnd`: the span of the sentence (or bare "[S2]" fragment) whose marker cites this sentence; -1 = uncited. */
interface Sent { start: number; end: number; body: string; own: string[]; ids: string[]; inherited: boolean; line: number; src: number; srcEnd: number }

/** Sentences (money-guard spans, so "80.000" is not a sentence end) with their own markers and the markers they inherit. */
function sentencesOf(text: string): Sent[] {
  const lineOf = (i: number) => text.slice(0, i).split('\n').length - 1
  const raw = sentenceSpans(text).map(([a, b]) => ({ a, b, t: text.slice(a, b) })).filter(x => x.t.trim())
  const out: Sent[] = raw.map(x => ({ start: x.a, end: x.b, body: x.t, own: [...x.t.matchAll(MARKER_RE)].flatMap(m => m[1].split(/\s*,\s*/)), ids: [], inherited: false, line: lineOf(x.a), src: -1, srcEnd: -1 }))
  // A bare marker fragment ("… mua vé. [S2]") belongs to the sentence before it; a sentence without a marker inherits the NEXT marker
  // in the same line (Luna cites at the end of a paragraph).
  for (let i = 0; i < out.length; i++) {
    if (out[i].own.length) { out[i].ids = out[i].own; out[i].src = out[i].start; out[i].srcEnd = out[i].end; continue }
    const next = out.slice(i + 1).find(s => s.line === out[i].line && s.own.length)
    if (next) { out[i].ids = next.own; out[i].inherited = true; out[i].src = next.start; out[i].srcEnd = next.end }
  }
  return out.filter(s => s.body.replace(MARKER_RE, '').trim().length > 0)
}

const NAME_RE = /\*\*([^*\n]{3,80})\*\*/g
/** Venue / product names the sentence states (bold names without digits, and known row names) — the entity scope of its values. */
function namesIn(sentence: string, known: readonly string[]): string[] {
  // A bold PROPER NAME ("**Phở Lệ**", "**Bánh Mì Phượng**"), not bold emphasis ("**khách Việt**", "**cuối buổi chiều**" — measured M4 eval
  // RS-C1 final run: emphasis read as an entity made a page-backed price "not with the entity").
  const proper = (n: string) => n.split(/\s+/).filter(w => /\p{L}/u.test(w)).every(w => /^\p{Lu}/u.test(w))
  const bold = [...sentence.matchAll(NAME_RE)].map(m => m[1].trim()).filter(n => !/\d/.test(n) && /\p{L}{3,}/u.test(n) && proper(n))
  const f = fold(sentence)
  return [...new Set([...bold, ...known.filter(n => n && n.length >= 3 && f.includes(fold(n)))])]
}
const nameIn = (name: string, p: Indexed) => p.fold.includes(fold(name).replace(/\s+/g, ' ').trim())
/** WS2: is this name the source site itself? ("CellphoneS" ↔ cellphones.com.vn, "FPT Shop" ↔ fptshop.com.vn, "Thế Giới Di Động" ↔ thegioididong.com). */
export function ownSite(name: string, host: string): boolean {
  const n = fold(name).replace(/[^a-z0-9]/g, '')
  const label = host.toLowerCase().replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9]/g, '')
  if (n.length < 4 || label.length < 4) return false
  return n === label || (Math.min(n.length, label.length) >= 6 && (label.startsWith(n) || n.startsWith(label)))
}

// Attributed ("người bán ghi …", "theo …") or explicitly QUALIFIED ("… nhưng chưa xác minh", "giá tham khảo, nên hỏi lại") — both tell the
// user whose claim it is and how far to trust it (measured M4 eval RS-C1 run 2: "Giá vé mình tìm được là 80.000đ, nhưng nguồn hiện có
// chưa xác minh chắc …" from an unclassified heritage site).
const ATTRIBUTION = /(?<!\p{L})(?:theo|người bán|nguoi ban|cửa hàng|ghi là|ghi rằng|ghi|quảng cáo|tự nhận|cam kết|cho biết|niêm yết|đăng|chưa xác minh|chưa được xác minh|chưa xác nhận|chưa kiểm chứng|tham khảo|nên hỏi|hỏi lại|kiểm tra lại|seller|listing|listed|claims?|according|says|states|advertised|reportedly|unverified|not verified)(?!\p{L})/iu
const kindOf = (qs: readonly Q[]): ClaimKind => qs.some(q => q.kind === 'money') ? 'price' : qs.some(q => q.kind === 'time') ? 'hours' : qs.some(q => q.kind === 'id' || /^(%|mah|wh|cycles|hours|gb|tb|kg|inch|w|hz|mp)$/.test(q.unit)) ? 'spec' : 'other'

/** Identifiers the user's message names (M4, S24, 128GB, 20/10, 2026). */
function identifiers(text: string): string[] {
  const f = fold(text)
  return [...new Set([...f.matchAll(/\b[a-z]{1,8}\d{1,4}[a-z]{0,3}\b|\b\d{1,4}(?:gb|tb)\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b20\d{2}\b/g)].map(m => m[0]))]
}

/** Carried task evidence that is still fresh for this turn (the existing signature rule + no identifier the reference lacks). */
export function freshCarried(ev: Pick<GuardEvidence, 'carried' | 'constraintsSig' | 'userText'>): CarriedRef[] {
  if (!ev.constraintsSig) return []
  const ids = identifiers(ev.userText)
  return ev.carried.filter(r => {
    if (r.constraints_sig !== ev.constraintsSig) return false
    const hay = fold(`${r.title} ${r.url} ${r.claims.map(c => c.value).join(' ')}`).replace(/[\s-]+(?=\d)/g, '')
    return ids.every(id => hay.includes(id.replace(/[\s-]+(?=\d)/g, '')))
  })
}

// ── judging ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** `today`: the system clock's day/month. When set, a dd/mm (or dd/mm/yyyy) naming exactly that day is the model framing "hôm nay (11/10)", not a claim the page must repeat. Any other date is judged as before. */
export interface JudgeOptions { cutUnsourcedMoney?: boolean; /** Round 33 (flag only): compare VND amounts as whole đồng (see `quantitiesIn`). */ canonMoney?: boolean; retrievedTexts?: readonly string[]; lang?: string; knownNames?: readonly string[]; today?: { day: number; month: number; year?: number } }

/** Today's day/month/year in Vietnam time (the server clock may be UTC). */
export function vnToday(now: Date = new Date()): { day: number; month: number; year: number } {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(now)
  const n = (t: string) => Number(p.find(x => x.type === t)?.value)
  return { day: n('day'), month: n('month'), year: n('year') }
}

/** Blanks today's date (system-clock framing) out of a sentence before its values are extracted. */
export function withoutTodayDate(body: string, t: { day: number; month: number; year?: number }): string {
  return body.replace(/(?<![\d/.])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/g, (m, d: string, mo: string, y?: string) => {
    if (Number(d) !== t.day || Number(mo) !== t.month) return m
    if (y !== undefined && t.year !== undefined && Number(y) !== t.year && Number(y) !== t.year % 100) return m
    return ' '.repeat(m.length)
  })
}

export function judgeText(text: string, ev: GuardEvidence, o: JudgeOptions = {}): Array<Sent & { j: SentenceJudgement }> {
  const canon = o.canonMoney === true
  const byId = new Map(ev.sources.map(s => [s.id, { s, ix: index(s.passages, canon) }]))
  const carried = freshCarried(ev).map(r => ({ r, ix: index([`${r.title} ${r.claims.filter(c => c.type === 'FACT').map(c => c.value).join(' · ')}`], canon) }))
  const userIx = index([ev.userText], canon)
  const replyQs = quantitiesIn(text, canon)
  const known = o.knownNames ?? []
  return sentencesOf(text).map(sent => {
    const qs = quantitiesIn(o.today ? withoutTodayDate(sent.body, o.today) : sent.body, canon)
    const cue = sent.body.match(new RegExp(AVAIL_RE.source, 'iu'))?.[0]?.trim() ?? null
    const ids = sent.ids.filter(id => byId.has(id))
    const base = { values: qs.length, sourceIds: ids }
    if (qs.some(q => q.invalid)) return { ...sent, j: { ...base, verdict: 'INVALID' as const, provenance: 'UNKNOWN' as const, reason: 'invalid_value' } }
    if (!qs.length && !cue) return { ...sent, j: { ...base, verdict: 'UNKNOWN' as const, provenance: 'UNKNOWN' as const, reason: 'nothing_checkable' } }
    const names = namesIn(sent.body, known)
    const scoped = (ps: readonly Indexed[]) => names.length ? ps.filter(p => names.some(n => nameIn(n, p))) : ps
    const coveredBy = (ps: readonly Indexed[]) => qs.every(q => scoped(ps).some(p => statedIn(q, p))) && (!cue || ps.some(p => p.fold.includes(fold(cue))))
    if (ids.length) {
      const cited = ids.map(id => byId.get(id)!)
      const all = cited.flatMap(c => c.ix)
      // WS2: a sentence naming the cited source ITSELF ("**CellphoneS:** 27.990.000đ [S2]" citing cellphones.com.vn) is about that
      // source's own page — every passage of it is entity evidence. Measured WS-I1: the retailer's own price passage never repeats the
      // store's name, so three page-backed prices were judged "not with the entity" and deleted. A listicle naming OTHER venues is
      // still scoped exactly as before.
      const coveredByCited = () => qs.every(q => cited.some(c => (names.length && !names.some(n => ownSite(n, c.s.host)) ? c.ix.filter(p => names.some(n => nameIn(n, p))) : c.ix).some(p => statedIn(q, p)))) && (!cue || all.some(p => p.fold.includes(fold(cue))))
      if (!coveredByCited()) {
        const misattributed = qs.some(q => !numberAnywhere(q, all))
        // Live 2026-10-11 (petrol): the shield only LABELS an unsupported sentence; the other guards decide. With the flag a cited money amount that
        // no page of the turn states at all is not left to them: the sentence goes and the one "chưa xác minh" line + source buttons replace it.
        const everyPage = [...byId.values()].flatMap(c => c.ix)
        // …and not in any other retrieved text of the turn (search snippets, tool rows): the read pages hold only 8 extracted passages, so a price the
        // retailer's SNIPPET states (live 2026-10-11, Philips kettle) is sourced, just not by the page's passages. Only a figure stated nowhere is cut.
        const retrieved = o.cutUnsourcedMoney === true && qs.some(q => q.kind === 'money' && !numberAnywhere(q, everyPage)) ? index((o.retrievedTexts ?? []).slice(0, 120), canon) : []
        const unsourcedMoney = o.cutUnsourcedMoney === true && qs.some(q => q.kind === 'money' && !numberAnywhere(q, everyPage) && !numberAnywhere(q, retrieved))
        return { ...sent, j: { ...base, verdict: 'UNKNOWN' as const, provenance: 'MODEL_KNOWLEDGE' as const, reason: names.length && coveredByUnscoped(qs, all, cue) ? 'value_not_with_entity' : 'cited_value_not_in_source', ...(misattributed ? { misattributed: true } : {}), ...(unsourcedMoney ? { unsourcedMoney: true } : {}) } }
      }
      // Provenance affects validation: a source weak for this kind of fact supports only an attributed sentence.
      const kind = kindOf(qs)
      const strong = cited.filter(c => reliabilityFor(c.s.sourceType, kind) !== 'low')
      if (!strong.length && !ATTRIBUTION.test(sent.body)) return { ...sent, j: { ...base, verdict: 'UNKNOWN' as const, provenance: 'PAGE_EVIDENCE' as const, reason: 'weak_source_unattributed' } }
      const note = contradiction(qs, ids, ev, text, replyQs, o.lang ?? 'vi', canon)
      return { ...sent, j: { ...base, verdict: note ? 'CONTRADICTED' as const : 'SUPPORTED' as const, provenance: 'PAGE_EVIDENCE' as const, reason: note ? 'undisclosed_conflict' : 'stated_by_cited_source', ...(note ? { note } : {}) } }
    }
    if (carried.length && coveredBy(carried.flatMap(c => c.ix))) return { ...sent, j: { ...base, verdict: 'SUPPORTED' as const, provenance: 'TASK_STATE' as const, reason: 'fresh_task_evidence' } }
    if (qs.every(q => userIx.some(p => statedIn(q, p)))) return { ...sent, j: { ...base, verdict: 'UNKNOWN' as const, provenance: 'USER_INPUT' as const, reason: 'user_values' } }
    return { ...sent, j: { ...base, verdict: 'UNKNOWN' as const, provenance: 'MODEL_KNOWLEDGE' as const, reason: ev.carried.length && !carried.length ? 'task_evidence_stale' : 'uncited' } }
  })
}
const coveredByUnscoped = (qs: readonly Q[], ps: readonly Indexed[], cue: string | null) => qs.every(q => ps.some(p => statedIn(q, p))) && (!cue || ps.some(p => p.fold.includes(fold(cue))))

/**
 * An undisclosed numeric conflict: a ledger CONFLICT whose side from a cited source carries one of this sentence's values, and whose
 * other side (another source, a different value of the same unit) the reply never mentions. Returns the note, or null.
 */
function contradiction(qs: readonly Q[], ids: readonly string[], ev: GuardEvidence, reply: string, replyQs: readonly Q[], lang: string, canonMoney = false): string | null {
  const mine = new Set(qs.map(q => q.value))
  for (const c of ev.conflicts) {
    const sides = c.sides.map(s => ({ ...s, q: quantitiesIn(s.value, canonMoney) })).filter(s => s.value.length <= 60 && s.q.length > 0)
    if (!sides.some(s => ids.includes(s.sourceId) && s.q.some(q => mine.has(q.value)))) continue
    const other = sides.find(s => !ids.includes(s.sourceId) && !s.q.some(q => mine.has(q.value)) && qs.some(q => unitClass(q) === unitClass(s.q[0])))
    if (!other) continue
    const disclosed = new RegExp(`\\[[^\\]]*\\b${other.sourceId}\\b[^\\]]*\\]`).test(reply) || other.q.some(oq => replyQs.some(rq => rq.value === oq.value))
    if (disclosed) continue
    return lang === 'en'
      ? `Note: another source [${other.sourceId}] states ${other.value} — the sources disagree, check before you rely on it.`
      : `Lưu ý: nguồn khác [${other.sourceId}] ghi ${other.value} — các nguồn chưa khớp, bạn kiểm tra lại trước khi dựa vào.`
  }
  return null
}
const unitClass = (q: Q | undefined) => !q ? '' : q.kind === 'money' ? `money:${q.currency}` : q.kind === 'time' ? 'time' : q.unit

// ── the shield ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ShieldReport {
  sentences: number
  supported: number
  contradicted: number
  unknown: number
  invalid: number
  byProvenance: Record<Provenance, number>
  markersDropped: number
  lost: number
  reattached: number
  reasons: Record<string, number>
}

/** The names a sentence carries, for its token: bold / linked labels that are not values, known row names, capitalised multi-word names. */
function contextNames(sentence: string, known: readonly string[]): string {
  const labels = [...sentence.matchAll(/\*\*([^*\n]{2,80})\*\*|\[([^\]\n]{2,80})\]\([^)]*\)/g)].map(m => (m[1] ?? m[2]).trim())
    .filter(n => /\p{L}{3,}/u.test(n) && !quantitiesIn(n).some(q => q.kind === 'money' || q.kind === 'time') && !/^S\d{1,2}$/.test(n))
  const f = fold(sentence)
  const rows = known.filter(n => n && n.length >= 3 && f.includes(fold(n)))
  const caps = [...sentence.replace(/\*\*|\[[^\]]*\]\([^)]*\)/g, ' ').matchAll(/(?<![\p{L}\d])\p{Lu}[\p{L}\d]*(?:\s+(?:\p{Lu}[\p{L}\d]*|\d{1,4}[\p{L}]{0,3}))+/gu)].map(m => m[0])
  return [...new Set([...labels, ...rows, ...caps])].join(' · ').replace(/[.!?]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
}

const tokenFor = (i: number) => `${TOKEN_MARK}TAPPYEVIDENCE${String.fromCharCode(97 + (i % 26)).repeat(1 + Math.floor(i / 26))}${TOKEN_MARK}`

/**
 * Holds SUPPORTED / CONTRADICTED sentences out of the heuristic guards: each is replaced by an inert token (no digits, no names, no
 * claim words), the guards run on the rest, and `restore` puts the original sentence back (with its conflict note, and its citation
 * re-attached if the marker it inherited was cut with another sentence). A token a guard removed anyway is restored before the
 * reply's machine blocks — a supported claim is never silently lost. Sentence ends are kept outside the token so every guard still
 * sees the same sentence boundaries.
 */
export function shieldSupported(text: string, ev: GuardEvidence | null | undefined, o: JudgeOptions = {}): { text: string; restore: (guarded: string) => string; report: ShieldReport } {
  const report: ShieldReport = { sentences: 0, supported: 0, contradicted: 0, unknown: 0, invalid: 0, byProvenance: { USER_INPUT: 0, SEARCH_SNIPPET: 0, PAGE_EVIDENCE: 0, TASK_STATE: 0, MODEL_KNOWLEDGE: 0, UNKNOWN: 0 }, markersDropped: 0, lost: 0, reattached: 0, reasons: {} }
  if (!ev || (!ev.sources.length && !ev.carried.length) || !text.trim()) return { text, restore: g => g, report }
  const judged = judgeText(text, ev, o)
  report.sentences = judged.length
  const held: Array<{ token: string; original: string; note?: string; ids: string[]; inherited: boolean }> = []
  let out = ''
  let at = 0
  // Misattribution: a marker is removed when EVERY sentence citing it (its own sentence, or the sentences of the paragraph that inherit
  // it) states a number the cited source never states (M4 eval RS-B1: the read page was the AirPods Pro 3 spec page, the reply gave
  // AirPods Pro 2 figures "[S1]"). One sentence the source does state — or one with nothing checkable — keeps it.
  const groups = new Map<number, { end: number; members: typeof judged }>()
  for (const s of judged) if (s.src >= 0) { const g = groups.get(s.src) ?? { end: s.srcEnd, members: [] }; g.members.push(s); groups.set(s.src, g) }
  const edits: Array<{ start: number; end: number; text: string }> = []
  for (const [src, g] of groups) {
    if (!g.members.every(m => m.j.misattributed)) continue
    if (g.members.some(m => m.j.unsourcedMoney)) continue // the sentence is cut whole below (its marker goes with it)
    for (const m of g.members) m.j.markersDropped = true
    report.markersDropped++
    edits.push({ start: src, end: g.end, text: text.slice(src, g.end).replace(MARKER_RE, '') })
  }
  for (const s of judged) {
    const j = s.j
    report.byProvenance[j.provenance]++
    report.reasons[j.reason] = (report.reasons[j.reason] ?? 0) + 1
    if (j.verdict === 'SUPPORTED') report.supported++
    else if (j.verdict === 'CONTRADICTED') report.contradicted++
    else if (j.verdict === 'INVALID') report.invalid++
    else report.unknown++
    if (j.unsourcedMoney) { edits.push({ start: s.start, end: s.start + s.body.length, text: '' }); report.reasons.unsourced_money_cut = (report.reasons.unsourced_money_cut ?? 0) + 1 }
    if (j.verdict === 'SUPPORTED' || j.verdict === 'CONTRADICTED') {
      // Body without its leading whitespace and its sentence end / trailing whitespace (those stay in the text).
      const lead = s.body.match(/^\s*/)![0].length
      const tail = s.body.match(/[.!?…]*\s*$/)![0].length
      const core = s.body.slice(lead, s.body.length - tail)
      if (!core.trim()) continue
      // The token keeps the sentence's NAMES (venue / product): the guards attribute a neighbour's claim to the subject named before it
      // (spec guard "subject persists", place-claim anaphora), and a blank in its place would let an unsupported neighbour pass.
      const ctx = contextNames(core, o.knownNames ?? [])
      const token = `${ctx ? `${ctx} ` : ''}${tokenFor(held.length)}`
      held.push({ token, original: core, ...(j.note ? { note: j.note } : {}), ids: s.ids, inherited: s.inherited })
      edits.push({ start: s.start + lead, end: s.start + s.body.length - tail, text: token })
    }
  }
  for (const e of edits.sort((a, b) => a.start - b.start)) {
    if (e.start < at) continue // never overlaps in practice (a held sentence is never a dropped marker's owner); first edit wins
    out += text.slice(at, e.start) + e.text
    at = e.end
  }
  out += text.slice(at)
  if (!held.length) return { text: out, restore: g => g, report }
  const restore = (guarded: string): string => {
    let r = guarded
    const lost: string[] = []
    for (const h of held) {
      if (!r.includes(h.token)) {
        // A guard rewrote the names in front of the token: the bare token is enough to find the place.
        const bare = h.token.slice(h.token.indexOf(TOKEN_MARK))
        const at = r.indexOf(bare)
        if (at >= 0) { const ls = r.lastIndexOf('\n', at) + 1; const sentStart = Math.max(ls, ...['. ', '! ', '? '].map(p => { const k = r.lastIndexOf(p, at); return k < 0 ? -1 : k + 2 })); r = r.slice(0, sentStart) + h.token + r.slice(at + bare.length) }
      }
      if (!r.includes(h.token)) { lost.push(h.note ? `${h.original}. ${h.note}` : h.original); continue }
      if (!h.note) { r = r.replace(h.token, () => h.original); continue }
      // CONTRADICTED: the claim stays, the other source's value follows it (after the sentence end).
      const i = r.indexOf(h.token)
      const end = i + h.token.length + r.slice(i + h.token.length).match(/^[.!?…]*/)![0].length
      r = `${r.slice(0, i)}${h.original}${r.slice(i + h.token.length, end) || '.'} ${h.note}${r.slice(end)}`
    }
    if (lost.length) {
      report.lost += lost.length
      const block = lost.join(' ')
      const m = /\[(?:CTA_BUTTONS|FOLLOWUPS|TAPPY_[A-Z_]+)\]/.exec(r)
      r = m ? `${r.slice(0, m.index).trimEnd()}\n\n${block}\n\n${r.slice(m.index)}` : `${r.trimEnd()}\n\n${block}`
    }
    // Citation integrity: a sentence that inherited its marker keeps a citation even when the sentence carrying the marker was cut.
    for (const h of held) {
      if (!h.inherited || !h.ids.length) continue
      const i = r.indexOf(h.original)
      if (i < 0) continue
      const lineEnd = r.indexOf('\n', i) < 0 ? r.length : r.indexOf('\n', i)
      const line = r.slice(r.lastIndexOf('\n', i) + 1, lineEnd)
      if (h.ids.some(id => new RegExp(`\\[[^\\]]*\\b${id}\\b[^\\]]*\\]`).test(line))) continue
      r = r.slice(0, i + h.original.length) + ` [${h.ids.join(', ')}]` + r.slice(i + h.original.length)
      report.reattached++
    }
    return r.split(TOKEN_MARK + 'TAPPYEVIDENCE').length > 1 ? r.replace(new RegExp(`${TOKEN_MARK}TAPPYEVIDENCE[a-z]+${TOKEN_MARK}`, 'g'), '') : r
  }
  return { text: out, restore, report }
}

/** Venue names the reply states that a page read this turn also names — grounded by page evidence for the grounding gate. */
export function pageGroundedNames(text: string, ev: GuardEvidence | null | undefined): string[] {
  if (!ev?.sources.length) return []
  const passages = ev.sources.flatMap(s => s.passages.map(p => fold(p)))
  const out = new Set<string>()
  for (const m of text.matchAll(NAME_RE)) {
    const n = m[1].trim()
    if (/\d/.test(n) || !/\p{L}{3,}/u.test(n)) continue
    const f = fold(n).replace(/\s+/g, ' ').trim()
    if (f.length >= 4 && passages.some(p => p.includes(f))) out.add(n)
  }
  return [...out]
}
