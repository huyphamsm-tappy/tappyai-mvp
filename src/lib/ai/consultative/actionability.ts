// ── CONSULTATIVE V1 — clarify BEFORE search (item 1, owner decision 2026-09-19) ──────────────
//
// THE single place in the system that decides whether a request is answered by searching now or
// by asking first. Everything else that used to ask ("R7(c)", the legacy memory line, the model's
// own reflex) is removed by item 7 or overridden by the V1 block; this module is the only gate.
//
// ACTIONABLE — search straight away:
//   · places (food / spa / entertainment / travel-place): the AREA is known (a district, a landmark,
//     "gần tôi", or GPS — GPS counts, never ask for it) AND at least one signal a pick can be
//     advised on: a budget, an occasion (who / why — party size, companions, a named occasion), a
//     stated hard constraint (phòng riêng, đậu xe, mở khuya…) or a mood. A bare subject ("bún bò",
//     "gội đầu") is NOT a signal — "Quán bún bò ngon ở TP.HCM" is the owner's own example of too
//     broad. Time alone ("giờ", "tối nay") is not a signal either.
//   · shopping: the product is known. A gift with no product is not.
//   · travel planning / inform ("Hội An có gì hay"), movies, follow-ups, chitchat: not gated here.
//
// NOT ACTIONABLE — ask ONCE, in ONE turn, at most 3 short questions with tappable options (the
// clients' follow-up chips), NO tool call and NO model: the turn is server-authored, costs $0 and
// is not charged to the AI-question quota (same as canned replies). The gate runs BEFORE the quota
// is spent, which is also why it reads no memory: memory is loaded after the quota branch. After
// one clarify the next turn proceeds on whatever was answered, assumptions stated — never twice in
// a row (`isClarifyReply` on the previous assistant text).
//
// Options come from the question and GPS — a district the user named, "gần tôi" when GPS is
// present, the domain's usual price bands — never invented venues or areas.

import { deriveNeedProfile } from './needProfile'
import { deriveDecisionFrame } from './decisionFrame'
import { deriveSituation, type SituationFrame } from './situationFrame'
import { normalizeVN, namedCinemaQuery } from '../intent'

export type Missing = 'area' | 'signal' | 'subject'

export interface ClarifyQuestion { q: string; options: string[] }

export interface Actionability {
  actionable: boolean
  domain: 'food' | 'spa' | 'entertainment' | 'travel' | 'shopping' | null
  missing: Missing[]
  /** What the gate SAW — for the log, so a wrong verdict can be explained. */
  signals: { area: boolean; budget: boolean; occasion: boolean; constraint: boolean; subject: boolean }
  questions: ClarifyQuestion[]
  reply: string | null
}

const LEAD_VI = 'Để chọn đúng chỗ, mình cần biết thêm:'
const LEAD_EN = 'To pick the right place, I need a little more:'
const LEAD_SHOP_VI = 'Để chọn đúng, mình cần biết:'
const LEAD_SHOP_EN = 'To pick well, I need to know:'

/** True when `text` is a clarify turn this module authored (the next turn must not ask again). */
export function isClarifyReply(text: string | null | undefined): boolean {
  if (!text) return false
  return text.startsWith(LEAD_VI) || text.startsWith(LEAD_EN) || text.startsWith(LEAD_SHOP_VI) || text.startsWith(LEAD_SHOP_EN)
}

const BUDGET_OPTIONS: Record<'food' | 'spa' | 'entertainment' | 'travel', { vi: string[]; en: string[] }> = {
  food: { vi: ['dưới 100k/người', '100–200k/người', 'trên 200k/người'], en: ['under 100k each', '100–200k each', 'over 200k each'] },
  spa: { vi: ['dưới 300k', '300–500k', 'trên 500k'], en: ['under 300k', '300–500k', 'over 500k'] },
  entertainment: { vi: ['dưới 200k/người', '200–500k/người', 'trên 500k/người'], en: ['under 200k each', '200–500k each', 'over 500k each'] },
  travel: { vi: ['dưới 1tr/đêm', '1–2tr/đêm', 'trên 2tr/đêm'], en: ['under 1M/night', '1–2M/night', 'over 2M/night'] },
}

/** Venue kinds a city has only a few of — the kind itself is the pick. */
const RARE_VENUE_KIND = /\b(cong vien nuoc|water ?park|thuy cung|aquarium)\b/
const fold = (s: string) => ' ' + normalizeVN(s.toLowerCase()).replace(/\s+/g, ' ').trim() + ' '
const GIFT = /\b(qua|gift|present|qua tang|tang gi|tang ban|tang nguoi yeu)\b/
const ACTIVITY = /\b(lam gi|di dau|choi gi|di choi|hoat dong gi|what to do|where to go|things to do)\b/
const DURATION = /\b(\d+ ngay|\d+ dem|nua ngay|mot ngay|\d+ days?|\d+ nights?|half a day|day trip)\b/
// An area the need profile does not read (it knows cities and "quận N"): "q1", the named
// districts of HCMC / Hà Nội / Đà Nẵng, and "near me". Data, not invention.
const AREA = /\b(q\.?\s?\d{1,2}|quan\s?\d{1,2}|district\s?\d{1,2}|phu nhuan|binh thanh|go vap|tan binh|tan phu|thu duc|binh tan|nha be|hoc mon|cu chi|binh chanh|can gio|ba dinh|hoan kiem|dong da|hai ba trung|cau giay|thanh xuan|tay ho|long bien|hoang mai|ha dong|nam tu liem|bac tu liem|hai chau|son tra|ngu hanh son|thanh khe|lien chieu|cam le|gan day|gan toi|quanh day|near me|nearby|gan cong ty|gan nha)\b/

function domainOf(frame: { domains: string[]; placeDecision: boolean }): Actionability['domain'] {
  if (frame.domains.includes('shopping') && !frame.placeDecision) return 'shopping'
  for (const d of ['food', 'spa', 'entertainment', 'travel'] as const) if (frame.domains.includes(d)) return d
  return null
}

export function assessActionability(input: {
  messages: Array<{ role: string; content: unknown }>
  hasGps: boolean
  lang: string
  lastAssistantText: string | null
  planningIntent?: unknown
  forcedTool?: string | null
  movieRecommend?: boolean
  clipContext?: unknown
}): Actionability {
  const none: Actionability = { actionable: true, domain: null, missing: [], signals: { area: false, budget: false, occasion: false, constraint: false, subject: false }, questions: [], reply: null }
  if (input.movieRecommend || input.planningIntent || input.clipContext) return none
  // Never twice in a row: after one clarify the turn proceeds on what was answered.
  if (isClarifyReply(input.lastAssistantText)) return none
  const userTexts = input.messages.filter(m => m && m.role === 'user' && typeof m.content === 'string').map(m => m.content as string)
  if (userTexts.length === 0) return none
  const need = deriveNeedProfile(input.messages, { gps: input.hasGps ? { lat: 0, lng: 0 } : null })
  const frame = deriveDecisionFrame({ messages: input.messages, need, planningIntent: null, forcedTool: input.forcedTool ?? null, hasGps: input.hasGps, storedPreferences: null, now: new Date() })
  const situation: SituationFrame = deriveSituation(userTexts, need, { hasGps: input.hasGps })
  const en = input.lang === 'en'
  const last = fold(userTexts[userTexts.length - 1])

  // A gift request is shopping with no product ("quà sinh nhật cho bạn gái") — the frame reads
  // it as inform with no domain, so it is named here.
  const gift = GIFT.test(last) && !need.subject
  const domain: Actionability['domain'] = gift ? 'shopping' : domainOf(frame)

  const occasionSignal = !!situation.who || situation.partySize !== null || (!!situation.occasion && situation.occasion !== 'hangout' && situation.occasion !== 'quick_bite')

  // "cuối tuần làm gì / đi đâu / chơi gì" with no domain and no one-to-go-with: nothing to search
  // yet — one question about the KIND of outing (options are domains, never venues). With a party
  // stated ("gia đình 4 người đi đâu") the model can already pick; that turn is not gated.
  if (!domain && ACTIVITY.test(last) && frame.goal !== 'plan' && !occasionSignal && !need.budget) {
    const q: ClarifyQuestion = { q: en ? 'What kind of outing?' : 'Bạn muốn làm gì?', options: en ? ['eat & drink', 'go out', 'spa & beauty'] : ['ăn uống', 'đi chơi / giải trí', 'spa & làm đẹp'] }
    const signals = { area: input.hasGps || !!need.location.text, budget: !!need.budget, occasion: false, constraint: false, subject: false }
    return { actionable: false, domain: null, missing: ['subject'], signals, questions: [q], reply: buildReply([q], en ? LEAD_EN : LEAD_VI, en) }
  }

  if (!domain) return { ...none, domain }

  // Phase D (2026-09-20, measured live run 22): a question ABOUT A NAMED VENUE ("tối nay rạp CGV
  // Vincom Đồng Khởi chiếu phim gì, mấy giờ, vé bao nhiêu?") is not a request to pick one — budget and
  // party size decide nothing here, and the canned clarify asked for both. The venue is the answer.
  if (namedCinemaQuery(last) !== null) return { ...none, domain }
  // …and a city-scale venue KIND with a handful of instances (a water park, an aquarium — measured live
  // run 27: "thủy cung nào ở Sài Gòn…" was asked "Tầm giá? Mấy người?") is answered by naming them.
  if (RARE_VENUE_KIND.test(last)) return { ...none, domain }

  // A gift is gated whatever the frame's goal says (it reads "quà sinh nhật" as inform).
  if (domain === 'shopping') {
    const subject = !!need.subject && !frame.clarify && !gift
    const signals = { area: true, budget: !!need.budget, occasion: false, constraint: false, subject }
    if (subject || (frame.goal === 'inform' && !gift)) return { ...none, domain, signals }
    const q: ClarifyQuestion = gift
      ? { q: en ? 'What kind of gift?' : 'Quà loại gì?', options: [] }
      : { q: en ? 'What exactly do you want to buy?' : 'Bạn muốn mua món gì?', options: [] }
    return { actionable: false, domain, missing: ['subject'], signals, questions: [q], reply: buildReply([q], en ? LEAD_SHOP_EN : LEAD_SHOP_VI, en) }
  }

  // A trip with a destination and a duration ("Hội An … đi 1 ngày") is a plan, not a place pick,
  // whatever domain the frame guessed from the words.
  if (frame.goal === 'inform' || frame.goal === 'plan' || (!!need.location.text && DURATION.test(last))) return { ...none, domain }

  const area = input.hasGps || !!need.location.text || situation.place.nearMe || userTexts.slice(-3).some(t => AREA.test(fold(t)))
  const budget = !!need.budget
  const occasion = occasionSignal
  const constraint = situation.hard.length > 0 || situation.mood !== null
  const signals = { area, budget, occasion, constraint, subject: true }
  const missing: Missing[] = []
  if (!area) missing.push('area')
  if (!budget && !occasion && !constraint) missing.push('signal')
  if (missing.length === 0) return { ...none, domain, signals }

  const questions: ClarifyQuestion[] = []
  if (!area) {
    questions.push({
      q: en ? 'Which area?' : 'Bạn ở khu nào?',
      // Nothing to offer but "near me": a district list would be invented.
      options: [en ? 'Near me' : 'Gần tôi'],
    })
  }
  if (!budget) questions.push({ q: en ? 'Budget?' : 'Tầm giá?', options: BUDGET_OPTIONS[domain][en ? 'en' : 'vi'] })
  if (!occasion) questions.push({ q: en ? 'How many people?' : 'Mấy người?', options: en ? ['1–2', '3–5', 'a big group'] : ['1–2 người', '3–5 người', 'nhóm đông'] })
  const qs = questions.slice(0, 3)
  return { actionable: false, domain, missing, signals, questions: qs, reply: buildReply(qs, en ? LEAD_EN : LEAD_VI, en) }
}

/**
 * After a clarify turn the user's answer ("2 người", "dưới 100k") is half a request. For every
 * deterministic reader of the thread (need profile, decision frame, situation, search-now), the
 * original request and the answer are ONE user turn and the clarify itself is not there — so the
 * goal, the domain and the party size are read from "ăn gì ngon giờ — 2 người", not from
 * "2 người". The model still receives the real thread.
 */
/** The separator mergeClarifyAnswer puts between the request and the answer. */
export const CLARIFY_JOIN = ' — '

export function mergeClarifyAnswer<T extends { role: string; content: unknown }>(messages: T[]): T[] {
  const n = messages.length
  if (n < 3) return messages
  const answer = messages[n - 1], clarify = messages[n - 2], request = messages[n - 3]
  if (answer.role !== 'user' || clarify.role !== 'assistant' || request.role !== 'user') return messages
  if (typeof answer.content !== 'string' || typeof request.content !== 'string' || !isClarifyReply(String(clarify.content))) return messages
  return [...messages.slice(0, n - 3), { ...request, content: `${request.content}${CLARIFY_JOIN}${answer.content}` }]
}

/**
 * The MODEL-FACING thread: every answered canned clarify collapsed, anywhere in the history.
 *
 * 🚨 THE MODEL IMITATES ITS OWN HISTORY. Android E2E 2026-09-19 (session 2): after the canned
 * clarify and the user's chip, the model asked instead of searching, then asked again on the next
 * two turns — the third time in the canned clarify's own format ("Để gợi ý đúng ý, mình cần biết:
 * • Mấy người?"). A rule ("never ask twice") loses to an example that sits in the history as an
 * assistant turn that asked a question with options. So the model never sees that turn: the
 * canned clarify is dropped and the request + the answer become ONE complete user message, exactly
 * as `mergeClarifyAnswer` already builds it for the deterministic readers — and here for EVERY
 * answered clarify, not only the last one, so the example is gone on later turns too.
 *
 * Model history and UI history are allowed to differ: the clarify turn stays in the transcript
 * the clients render and in the raw thread the memory extractor summarises; this applies only to
 * what route.ts feeds the LLM (`modelMessages`). An UNANSWERED clarify (last message) is kept —
 * there is nothing to fold it into.
 */
export function collapseClarifyTurns<T extends { role: string; content: unknown }>(messages: T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const next = messages[i + 1]
    const prev = out[out.length - 1]
    if (
      m.role === 'assistant' && isClarifyReply(typeof m.content === 'string' ? m.content : '')
      && next && next.role === 'user' && typeof next.content === 'string'
      && prev && prev.role === 'user' && typeof prev.content === 'string'
    ) {
      out[out.length - 1] = { ...prev, content: `${prev.content}${CLARIFY_JOIN}${next.content}` }
      i++ // the answer is folded into the request
      continue
    }
    out.push(m)
  }
  return out
}

/**
 * Memory as a signal (owner decision 2026-09-18: "memory is used to CHOOSE, never to ask"): a
 * returning user whose memory already holds a budget for the domain, tastes in the domain, or
 * usual companions has given the signal a stranger would be asked for. Evaluated by the route
 * once memory is loaded (after the memory-free gate, still before the quota is spent) — the
 * clarify is dropped when this is true. Shopping is never unblocked by memory: a product must be
 * named. Never a silent decision: the route logs what unblocked the turn.
 */
export function memorySignal(
  memory: { preferences?: Record<string, string[] | undefined>; budget?: Record<string, unknown>; companions?: string | null } | null,
  prefs: { budget_level?: string | null; cuisine_likes?: string[] | null } | null,
  a: Actionability,
): string | null {
  if (a.actionable || !a.domain || a.domain === 'shopping' || a.missing.includes('area')) return null
  const domain = a.domain
  const b = memory?.budget ?? {}
  if (b[domain] || b.default || b.general) return `memory.budget.${b[domain] ? domain : 'default'}`
  if (prefs?.budget_level) return 'prefs.budget_level'
  const tastes = memory?.preferences?.[domain]
  if (tastes && tastes.length > 0) return `memory.preferences.${domain}`
  if (domain === 'food' && prefs?.cuisine_likes && prefs.cuisine_likes.length > 0) return 'prefs.cuisine_likes'
  if (memory?.companions) return 'memory.companions'
  return null
}

/**
 * The clarify turn: the lead sentence, each question on its own line with its options in
 * parentheses, and the FIRST question's options as follow-up chips (both clients render at most
 * three chips, and a tap sends the option as the user's next message).
 */
function buildReply(questions: ClarifyQuestion[], lead: string, en: boolean): string {
  const lines = questions.map(q => `• ${q.q}${q.options.length ? ` (${q.options.join(' / ')})` : ''}`)
  const tail = en ? 'Answer what you like — I will assume the rest and say so.' : 'Bạn trả lời phần nào cũng được, phần còn lại mình tự giả sử và nói rõ.'
  const chips = (questions.find(q => q.options.length > 1) ?? questions[0])?.options.slice(0, 3) ?? []
  const fu = chips.length ? `\n\n[FOLLOWUPS]${chips.join('|')}[/FOLLOWUPS]` : ''
  return `${lead}\n${lines.join('\n')}\n${tail}${fu}`
}

/**
 * Does the LAST user turn, read on its own, belong to a different domain than the thread it sits
 * in? The need profile only detects a task switch on a venue noun ("khách sạn", "quán ăn"), so a
 * broad "cuối tuần đi chơi đâu" after a food consultation kept the thread's domain and its budget
 * and area — the gate then judged it actionable for FOOD, no clarify fired, no search-now
 * directive fired, and the model asked ("bạn thích chơi gì?") instead of searching (Android
 * re-test B4 / B9, 2026-09-19, 2/2). Here the turn's own domain (the gate's own reading, which
 * knows "đi chơi") is compared with the thread's; when both exist and differ, the turn starts a
 * new consultation: the gate, the situation frame and the intent gate all read the turn alone.
 * Never fires on an answer chip, a refinement or a follow-up (those have no domain of their own).
 */
export function turnStartsNewConsultation(input: { messages: Array<{ role: string; content: unknown }>; hasGps: boolean; lang: string }): boolean {
  const users = input.messages.filter(m => m && m.role === 'user')
  if (users.length < 2) return false
  const last = users[users.length - 1]
  if (typeof last.content !== 'string') return false
  const thread = assessActionability({ messages: input.messages, hasGps: input.hasGps, lang: input.lang, lastAssistantText: null })
  const own = assessActionability({ messages: [last], hasGps: input.hasGps, lang: input.lang, lastAssistantText: null })
  return !!own.domain && !!thread.domain && own.domain !== thread.domain
}
