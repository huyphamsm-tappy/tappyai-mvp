// ── Unwind S2A (28/10/2026): answer with stated assumptions instead of the code-built question card ─────────────────────────────────────
//
// Measured on localhost 28/10 (turn 6a, a 3-day Quy Nhơn plan with a 20 million budget): the rules and the intent layer both said "ask",
// the route sent the code-built card (consultAskReply, "Để lên trọn buổi cho bạn: … Chọn nhanh bên dưới") and the model was never called.
// ChatGPT answered the same message at once - a full itinerary, the budget split, "assuming 2 people" - and asked at the end.
//
// With CONSULT_UNWIND_S2A the card is skipped when the decision ALREADY HOLDS ENOUGH, read from its structure only: at least
// MIN_KNOWN_TO_ANSWER non-empty `known` slots (what the user said that matters for the choice), a domain, and a card of the intent layer
// or the rules (never the server's own domain question). The turn becomes a pick (a travel request that asked for a plan becomes the plan
// turn, promoteTripPlan) and the model is told which questions are still open: answer now with a stated assumption for each, and end with
// ONE question. A decision with fewer known slots is a request that really lacks its core and is still asked, as before.
// No word list and no reading of the user's words here. Pure.

import type { ConsultDecision } from './consultBrain'

/** Two stated facts (e.g. a destination and a length, or a dish and an area) are enough to answer with assumptions. */
export const MIN_KNOWN_TO_ANSWER = 2

export interface UnwoundAsk { questions: string[] }

export function answerInsteadOfAsk(d: ConsultDecision | null, opts: { serverFallback: boolean }): { decision: ConsultDecision | null; unwound: UnwoundAsk | null } {
  if (!d || d.turn !== 'ask' || !d.ask || d.domains.length === 0 || opts.serverFallback) return { decision: d, unwound: null }
  const known = Object.values(d.known).filter(v => typeof v === 'string' && v.trim() !== '').length
  if (known < MIN_KNOWN_TO_ANSWER) return { decision: d, unwound: null }
  const questions = d.ask.questions.map(q => q.q.trim()).filter(Boolean)
  return { decision: { ...d, turn: 'pick', ask: undefined }, unwound: { questions } }
}

/** The line the model reads on such a turn (route.ts, the "DA HIEU" block). */
export function unwoundAskLine(u: UnwoundAsk, lang: string): string {
  const open = u.questions.length ? u.questions.join(' | ') : (lang === 'en' ? '(none)' : '(khong)')
  return lang === 'en'
    ? `\n- THIS TURN DOES NOT ASK FIRST: answer NOW in full. For each open point, choose a reasonable assumption and STATE it in the answer. Open points: ${open}. End with exactly ONE short question about the open point that matters most.`
    : `\n- LUOT NAY KHONG HOI LAI TRUOC: tra loi DAY DU ngay. Moi diem con mo: tu chon mot gia dinh hop ly va NOI RO gia dinh do trong cau tra loi. Diem con mo: ${open}. Ket thuc bang DUNG MOT cau hoi ngan ve diem con mo quan trong nhat.`
}
