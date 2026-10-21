import { turnStartsNewConsultation, turnDomain } from './actionability'
import { detectPlanningIntent, isPlanningRefinement, normalizeVN } from '../intent'
import { consultLunaOneEnabled } from '../evidence/flag'

// ── What a follow-up may inherit: only the CURRENT subject's turns ───────────────────────────────
//
// PRELAUNCH 5a (Session D, 2026-09-24): "trưa nay ăn gì dưới 100k" followed by "tư vấn mua điện
// thoại Samsung" carried the 100k lunch ceiling into the phone purchase. `budgetFromHistory` walks
// back through EVERY user turn for the last one that stated a bound, so a budget outlived its
// subject. A budget belongs to the consultation it was stated in.
//
// The subject boundary is the repository's existing, measured rule — `turnStartsNewConsultation`
// (the turn's own domain differs from the thread's) — applied to every user turn, so the boundary
// is found wherever it happened, not only on the last turn: after "food 100k → phone → rẻ hơn?"
// the "rẻ hơn?" belongs to the phone subject and must not reach back to the lunch.
//
// Pure and deterministic; no model call.

type Msg = { role: string; content: unknown }

/** Lower case, no diacritics, words separated by single spaces, padded with a space on each side. */
const foldVN = (s: string) => ` ${normalizeVN(s.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim()} `
/**
 * A market reference price, named specifically: fuel, gold / silver, exchange rates, the power tariff, stocks, crypto. Folded text.
 * Bare words are not enough — "vàng" is also a colour, "bác" a person, "giá điện thoại" a phone price, "USD" any price unit.
 */
const MARKET_SUBJECT = / (?:gia xang|xang dau|xang (?:e5|e10|ron|hom nay|bao nhieu|tang|giam)|ron ?9[25]|dau (?:diesel|hoa|tho|brent|wti|do)|gia dau (?:the gioi|tho|hom nay)|gia vang|vang (?:sjc|9999|nhan|mieng|the gioi|hom nay)|gia bac|bac (?:9999|phu quy|thoi|mieng)|ty gia|ngoai te|gia (?:usd|do la|dola|euro|yen|nhan dan te|won)|(?:usd|do la|dola|euro) hom nay|gia dien(?! thoai| may)|tien dien|chung khoan|vn ?index|co phieu|gia bitcoin|bitcoin hom nay|gia btc|tien ao|tien dien tu) /
/** …asked as a price or a level. */
const MARKET_ASK = / (?:gia|ty gia|bao nhieu|hom nay|hien tai|hien nay|moi nhat|tang|giam|bien dong) /
/** A place or an item already on the table — "cây xăng gần đây", "tiệm vàng nào", "cái thứ hai giá sao": not a market lookup. */
const PLACE_OR_ANAPHORA = / (?:cay xang|tram xang|cua hang|tiem vang|tiem|quan|shop|gan day|gan nhat|quanh day|o dau|mua o|chi duong|duong di|cai (?:nay|do|thu nhat|thu hai|thu ba|re nhat|dat nhat)|(?:quan|cho|o|ben) do) /

/**
 * CONSULT_LUNA_ONE (G1, live UAT 2, 14/10): a self-contained MARKET PRICE LOOKUP ("giá xăng hôm nay bao nhiêu", "tỷ giá đô", "vàng
 * SJC hôm nay") names no consultation domain of its own, so `turnStartsNewConsultation` (which needs one) read it as a follow-up of
 * the thread — after "quán bún bò ngon" → "ở Đà Nẵng" it inherited the PLACE domain, the place price guard then ran fail-closed on
 * fuel prices with no place snippets and deleted a sourced answer. Such a turn is a subject of its own.
 */
export function isMarketPriceLookup(text: string): boolean {
  const f = foldVN(text)
  return MARKET_SUBJECT.test(f) && MARKET_ASK.test(f) && !PLACE_OR_ANAPHORA.test(f)
}

/**
 * The messages of the current subject: everything from the most recent user turn that started a
 * new consultation (inclusive). The whole thread when no switch happened.
 * CONSULT_LUNA_ONE: a LAST turn that is a market price lookup is its own subject. Only the last turn is read this way — an earlier
 * lookup in the thread does not cut a later follow-up off its consultation ("bún bò" → "giá xăng?" → "còn quán nào khác?").
 */
export function currentSubjectMessages<T extends Msg>(messages: readonly T[], opts: { hasGps: boolean; lang: string; lunaOne?: boolean }): T[] {
  const userIdx = messages.map((m, i) => (m && m.role === 'user' ? i : -1)).filter(i => i >= 0)
  const lastUser = userIdx.length >= 2 ? messages[userIdx[userIdx.length - 1]] : null
  if (lastUser && typeof lastUser.content === 'string' && (opts.lunaOne ?? consultLunaOneEnabled()) && isMarketPriceLookup(lastUser.content)) {
    return messages.slice(userIdx[userIdx.length - 1])
  }
  for (let k = userIdx.length - 1; k >= 1; k--) {
    const upTo = messages.slice(0, userIdx[k] + 1)
    if (turnStartsNewConsultation({ messages: upTo as Array<{ role: string; content: unknown }>, hasGps: opts.hasGps, lang: opts.lang })) {
      return messages.slice(userIdx[k])
    }
  }
  return messages.slice()
}

/**
 * The plan type a refinement turn inherits: the nearest earlier planning turn, walking back through
 * `priorUserTexts` (the current subject's user turns before this one, oldest first) and STOPPING at
 * a turn about something a plan is not — a purchase, or another tool subject (news, gold, a
 * ticket…). A plan's own follow-ups ("mai đi mốt về, budget 20 triệu", "gần biển") carry no
 * planning words and are walked through.
 *
 * UAT3 P0 (2026-09-27): "kiếm con nào m1 dram 32gb, ổ cứng 512 á" — two turns into a MacBook
 * purchase — inherited `trip` from a Quy Nhơn plan three turns up, the planning block went out
 * on a laptop question, and the model ran flights/hotels/weather and appended the plan.
 */
export function inheritedPlanningIntent(priorUserTexts: readonly string[], opts: { hasGps: boolean; lang: string }): 'trip' | 'evening' | null {
  for (let i = priorUserTexts.length - 1; i >= 0; i--) {
    const t = priorUserTexts[i]
    const p = detectPlanningIntent(t)
    if (p) return p
    if (!isPlanningRefinement(t) || turnDomain({ role: 'user', content: t }, opts) === 'shopping') return null
  }
  return null
}

/** The user texts of the current subject (strings only), oldest first. */
export function currentSubjectUserTexts(messages: readonly Msg[], opts: { hasGps: boolean; lang: string }): string[] {
  return currentSubjectMessages(messages, opts)
    .filter(m => m.role === 'user')
    .map(m => (typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? (m.content as Array<{ text?: string }>).map(p => p.text || '').join(' ') : ''))
}
