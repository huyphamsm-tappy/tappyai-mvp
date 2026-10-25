// ── CONSULT_THREAD_AWARE_ASK (Wave 2D · A): an ask card never asks what the evidence already answers ───────────────────────────────────────────────────────
//
// The card of a turn is decided from the LAST message alone (consultRouter.ts step 4) - so a budget the user gave one turn earlier, a value the intent layer read out of the user's own words, or the
// product the user just pointed at on a shown card were all asked again ("Dòng nào?", "Tầm giá?"). Before the final card goes out, every question on it is checked against the evidence the thread
// really holds, with the router's OWN slot reader (slotView - the same detectors that decide which questions exist), never a second opinion of what a slot is:
//
//   source 1  user_thread   the user's words of this consultation (earlier turns count only when they are about the same product family: a budget may follow "ốp UAG", never "laptop")
//   source 2  luna_checked  values the intent layer wrote into `known` - counted ONLY when a word of the value is in the user's words or in a shown product's name (a value the model made up is not
//                           an answer), and only through the question's own detector (a brand such as "UAG" does not answer "which LINE?")
//   source 3  shown_card    the product the user's message points at (shownProductRef.ts: exactly one shown product matches) read through the same detectors
//
// A question answered by any source is dropped. All dropped → the ask becomes a pick (the search runs); some dropped → the card keeps only what is still open. An id the router does not manage
// (a card the intent layer or the brain wrote) is never judged: it stays. Pure; no model call.

import type { ConsultDecision, ConsultDomain } from './consultBrain'
import { familyRootOf, filterShownByFamily, joinQuery, slotView, titleConflictsWithMessage } from './consultRouter'
import { resolveShownReference } from './shownProductRef'
import { refineAsk } from './echoQuestion'
import { cityInText } from '@/lib/ai/tools/vietnamCities'

/**
 * The old "not worth asking" gate (refineAsk: a multi-question card that filtering cut below two is a pick) must not be turned round by the narrowing this module and the intent merge do: a card of two or
 * more questions narrowed to ONE would otherwise be asked, where the flag-OFF turn searches (review F-R3). When the card as it stood BEFORE the narrowing is a pick by that gate, the pick stands.
 */
export function settleNarrowedCard(before: ConsultDecision | null | undefined, narrowed: ConsultDecision | null | undefined, userTexts: readonly string[], opts: { localShop: boolean }): { card: ConsultDecision | null; notWorthAsking: boolean } {
  const narrowedBelowTwo = !!before?.ask && before.ask.questions.length >= 2 && narrowed?.turn === 'ask' && (narrowed.ask?.questions.length ?? 0) < 2
  const notWorthAsking = narrowedBelowTwo && refineAsk(before ?? null, userTexts, opts)?.turn === 'pick'
  return { card: (notWorthAsking ? before : narrowed) ?? null, notWorthAsking }
}

const foldKey = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const wordKeys = (s: string): string[] => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(foldKey)

export type SlotSource = 'user_thread' | 'luna_checked' | 'shown_card'

export interface AskEvidenceInput {
  /** The user's texts of the current subject, oldest first; the LAST one is this turn's message. */
  userTexts: readonly string[]
  /** The product names of the newest shopping card the thread showed (empty when none). */
  shownTitles: readonly string[]
  /** Wave 2E: the user's earlier texts of this consultation, including those before the card (the words of the request itself); defaults to `userTexts` without the last one. */
  establishedTexts?: readonly string[]
  /** `known` of the intent layer's decision (already checked once against the user's words; checked again here against the whole evidence). */
  lunaKnown: Record<string, string>
  gps: boolean
}

export interface ReconcileReport {
  applicable: boolean
  /** The question ids on the card before reconciling. */
  asked: string[]
  /** Question id → the source that answered it. */
  resolved: Record<string, SlotSource>
  /** The ids still open. */
  kept: string[]
  outcome: 'not_applicable' | 'unchanged' | 'trimmed' | 'to_pick'
  /** What the message resolved to on the shown card. */
  reference: 'none' | 'one' | 'many'
  /** Intent-layer values counted / not counted (a count only). */
  lunaCounted: number
  lunaNotGrounded: number
}

/**
 * The earlier user texts that belong with the last one: the same product family, or no family at all (a bare "500k-1tr"). Other domains: every text from the last one that names ANOTHER city than the
 * last text does (Wave 2E, F-R6): "khách sạn Đà Lạt … 2 người, dưới 1 triệu" followed by "giờ tìm khách sạn Nha Trang" is a new request, and the party, date and budget of the old one are not asked-for
 * answers of the new one. (A city the table does not know says nothing, so nothing is cut.)
 */
export function compatibleTexts(texts: readonly string[], domain: ConsultDomain | undefined): string[] {
  if (texts.length === 0) return []
  const last = texts[texts.length - 1]
  if (domain !== 'shopping') {
    const lastCity = cityInText(last)?.query
    if (!lastCity) return [...texts]
    const cities = texts.map(t => cityInText(t)?.query)
    let other = -1
    cities.forEach((c, i) => { if (i < texts.length - 1 && c && c !== lastCity) other = i })
    if (other < 0) return [...texts]
    // What follows the old city's text without naming a city of its own may still be about the old trip ("ngân sách 1 triệu"): it is not carried either - the first text that names THIS city starts the request.
    const from = cities.findIndex((c, i) => i > other && c === lastCity)
    return texts.slice(from < 0 ? texts.length - 1 : from)
  }
  const rl = familyRootOf(last)
  return texts.filter((t, i) => i === texts.length - 1 || ((r) => r === null || rl === null || r === rl)(familyRootOf(t)))
}

const SEP = ' ; '
const missingIds = (domain: ConsultDomain, text: string, gps: boolean): Set<string> => new Set(slotView(domain, text, gps).missing.map(m => m.id))

export function reconcileAsk(d: ConsultDecision, ev: AskEvidenceInput): { decision: ConsultDecision; report: ReconcileReport } {
  const asked = d.ask?.questions.map(q => q.id) ?? []
  const idle = (outcome: ReconcileReport['outcome'], reference: ReconcileReport['reference'] = 'none'): { decision: ConsultDecision; report: ReconcileReport } =>
    ({ decision: d, report: { applicable: outcome !== 'not_applicable', asked, resolved: {}, kept: asked, outcome, reference, lunaCounted: 0, lunaNotGrounded: 0 } })
  const domain = d.domains[0]
  // A card of the shown product's own difference (shownProductRef) IS the open question; "domain" is the domain question; no domain, no ask → nothing to judge.
  if (d.turn !== 'ask' || !d.ask || !domain || d.evidence === 'shown_card' || d.ask.questions[0]?.id === 'domain' || ev.userTexts.length === 0) return idle('not_applicable')

  const last = ev.userTexts[ev.userTexts.length - 1]
  const thread = compatibleTexts(ev.userTexts, domain)
  // Wave 2E: the texts are joined with a separator no slot reader treats as a sign. With " . " a text that ends in a number followed by one that starts with one ("Quận 3" + "2 người") read "3 . 2" -
  // a date - and the "Đi ngày nào?" question was dropped as answered (found by the 120-cell matrix: travel plan after the area answer).
  const threadText = thread.join(SEP)
  // Wave 2E: only the shown products of THIS message's family can be evidence (a charger card never answers a phone request), the words the user already used are not names, and a title the
  // message contradicts (another line, a negated requirement) is not the product it points at.
  const shown = filterShownByFamily(ev.shownTitles, last)
  const rawRef = domain === 'shopping' && shown.length >= 2 ? resolveShownReference(last, shown, { established: ev.establishedTexts ?? ev.userTexts.slice(0, -1) }) : { kind: 'none' as const, titles: [] as string[], matchedTokens: 0 }
  const ref = rawRef.kind === 'one' && titleConflictsWithMessage(last, rawRef.titles[0], ev.gps) ? { kind: 'none' as const, titles: [] as string[], matchedTokens: 0 } : rawRef
  const title = ref.kind === 'one' ? ref.titles[0] : ''
  // A value of the intent layer counts only when EVERY word of it is in the user's words of this consultation, or in the name of the ONE product the message points at. A shown name the message does
  // not point at is not the user's choice, and a value that adds a word of its own ("UAG Monarch" for a user who said "UAG") is a guess.
  const hay = new Set([...wordKeys(threadText), ...wordKeys(title)])
  const grounded: string[] = []
  let notGrounded = 0
  for (const v of Object.values(ev.lunaKnown)) {
    if (typeof v !== 'string' || !v.trim()) continue
    const words = wordKeys(v).filter(k => k.length >= 2)
    if (words.length > 0 && words.every(k => hay.has(k))) grounded.push(v); else notGrounded++
  }

  // The ids the router manages for this thread: any id it would still ask for a single text of the consultation (a text that answers the question itself, or a bare "lấy luôn nhé", names no family).
  const managed = new Set<string>()
  for (const t of thread) for (const id of missingIds(domain, t, ev.gps)) managed.add(id)
  const stages: Array<[SlotSource, string]> = [['user_thread', threadText], ['luna_checked', [threadText, ...grounded].join(SEP)], ['shown_card', [threadText, ...grounded, title].filter(Boolean).join(SEP)]]
  const stageMissing = stages.map(([, text]) => missingIds(domain, text, ev.gps))
  const resolved: Record<string, SlotSource> = {}
  for (const id of asked) {
    if (!managed.has(id)) continue // not an id the router manages for this thread: never judged, it stays
    const at = stageMissing.findIndex(s => !s.has(id))
    if (at >= 0) resolved[id] = stages[at][0]
  }
  const kept = asked.filter(id => !(id in resolved))
  const report: ReconcileReport = { applicable: true, asked, resolved, kept, outcome: 'unchanged', reference: ref.kind, lunaCounted: grounded.length, lunaNotGrounded: notGrounded }
  if (Object.keys(resolved).length === 0) return { decision: d, report }

  if (kept.length === 0) {
    const view = slotView(domain, stages[2][1], ev.gps)
    return {
      decision: { ...d, turn: 'pick', ask: undefined, known: { ...d.known, ...view.known }, assumptions: view.assumptions, query: joinQuery(view.queryParts), ...(view.area ? { area: view.area } : {}) },
      report: { ...report, outcome: 'to_pick' },
    }
  }
  return { decision: { ...d, ask: { ...d.ask, questions: d.ask.questions.filter(q => kept.includes(q.id)) } }, report: { ...report, outcome: 'trimmed' } }
}
