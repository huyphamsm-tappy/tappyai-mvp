// ── "LẬP KẾ HOẠCH" IS A PLAN (owner 02/10, A4) ───────────────────────────────────────────────────────────────────
//
// "lập kế hoạch đi chơi đà nẵng 3 ngày 2 đêm" → ask card → "Tuần sau · TP.HCM · 2 người" used to end as a PICK
// (a hotel list + "Còn 16 lựa chọn nữa"); the plan was a SEPARATE step behind the "Lên kế hoạch chi tiết" button. A user
// who says "make a plan" wants the plan. Decided by CODE (not by the intent model, which flipped between ask/plan/pick
// run to run on the same words): once the ask is answered (or the request is already complete), a travel PICK whose
// thread asked for a plan becomes the PLAN turn. The ask itself is kept — it is the "confirm" step of ask → confirm → advice.

import type { ConsultDecision } from './consultBrain'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

/** "lập / lên / soạn kế hoạch|lịch trình", "kế hoạch đi …", "lịch trình", "plan a trip", "itinerary". Folded text. */
const PLAN_REQUEST = /\b(?:lap|len|xay dung|soan|thiet ke|tu van|giup)\s+(?:cho\s+(?:minh|toi|tui|em)\s+)?(?:mot\s+|1\s+)?(?:ke hoach|lich trinh)\b|\bke hoach\s+(?:di|chuyen|du lich|cho chuyen)\b|\blich trinh\b|\bplan\s+(?:my\s+|a\s+|the\s+|our\s+)?(?:trip|travel|holiday|vacation)\b|\bmake\s+(?:me\s+)?a\s+(?:trip\s+)?plan\b|\bitinerary\b/
/** The button / confirm texts are the PLAN turn already; a ticket-only request is not a trip plan. */
const TICKET_ONLY = /\b(?:ve may bay|ve xe|ve tau|chuyen bay|dat ve|mua ve)\b/

const NEW_REQUEST = /\b(?:khach san|homestay|resort|nha nghi|ve may bay|chuyen bay|dat ve)\b/

export function asksForPlan(text: string): boolean {
  const f = fold(text)
  return PLAN_REQUEST.test(f) && !TICKET_ONLY.test(f)
}

type Msg = { role: string; content: unknown }
const textOf = (c: unknown): string => typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: { type?: string; text?: string }) => (p?.type === 'text' ? p.text ?? '' : '')).join(' ') : ''

/**
 * The user texts of the CURRENT request: the last one, and — while the assistant turn before it was our ask card — the
 * user text that opened the ask (at most 3 hops). Card answers ("Tuần sau · TP.HCM · 2 người") carry no plan words
 * themselves; the request does.
 */
export function requestTexts(messages: readonly Msg[], isAskReply: (assistantText: string) => boolean): string[] {
  const turns = messages.filter(m => m.role === 'user' || m.role === 'assistant')
  let i = turns.length - 1
  while (i >= 0 && turns[i].role !== 'user') i--
  if (i < 0) return []
  const out = [textOf(turns[i].content)]
  for (let hop = 0; hop < 3; hop++) {
    const prev = turns[i - 1]
    if (!prev || prev.role !== 'assistant' || !isAskReply(textOf(prev.content))) break
    const opener = turns[i - 2]
    if (!opener || opener.role !== 'user') break
    out.push(textOf(opener.content))
    i -= 2
  }
  return out
}

/**
 * A travel PICK (or the pick that answers an ask) whose request asked for a plan → the PLAN turn. Everything else is
 * returned untouched (same object). `known` is kept: the plan reads the same slots the pick would have searched with.
 */
export function promoteTripPlan(consult: ConsultDecision | null, messages: readonly Msg[], isAskReply: (assistantText: string) => boolean): { decision: ConsultDecision | null; promoted: boolean } {
  if (!consult || consult.turn !== 'pick' || consult.domains[0] !== 'travel') return { decision: consult, promoted: false }
  const k = consult.known
  // A plan needs a place or a kind of place; a flight-only thread keeps its fare flow.
  if (!k.diem_den && !k.phong_cach && !k.so_ngay) return { decision: consult, promoted: false }
  const texts = requestTexts(messages, isAskReply)
  if (!texts.some(asksForPlan)) return { decision: consult, promoted: false }
  // The answer to the ask card is a card option; a typed answer that is itself a lodging / fare request is a new request.
  if (texts.length > 1 && !asksForPlan(texts[0]) && NEW_REQUEST.test(fold(texts[0]))) return { decision: consult, promoted: false }
  return { decision: { ...consult, turn: 'plan' }, promoted: true }
}
