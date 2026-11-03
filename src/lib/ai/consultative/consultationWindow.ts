// ── CONSULT_THREAD_AWARE_ASK (Wave 2E): where ONE consultation ends ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Evidence from earlier turns (a budget, a line, "có magsafe") answers a question of an ask card only inside the consultation the card belongs to. `subjectUserTexts` cuts only when the DOMAIN changes,
// so "tìm ốp UAG cho iphone 15 dưới 200k có magsafe" … (a reply) … "giờ mua ốp UAG cho iphone 17 pro max" were one subject, and the new request inherited the old line, budget and MagSafe: the card was
// not asked at all (review F-R1).
//
// A consultation is a request followed by its clarifying questions and the user's answers. Once Tappy gives a REPLY that is not a clarifying question (products, places, advice - anything
// that closes the chain), the next request that needs a card starts a new consultation: the user's words from before that reply are not evidence for it. (A follow-up that points at what the reply showed
// is read by the router from the reply itself and never needs the older words; a refinement, "xem thêm" or a refusal is not an ask card at all.)
//
// Pure. No model, no list of words: the only signal is whether an assistant message is a clarifying question (the ask card, or the area question) - the same test the router uses (`wasAskReply`).

import { wasAskReply } from './consultBrain'
import { AREA_ASK_EN, AREA_ASK_VI } from './areaAsk'

export interface WindowMessage { role: string; content: unknown }

const textOf = (c: unknown): string => typeof c === 'string' ? c : Array.isArray(c) ? c.map(p => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join(' ') : ''

/** An assistant message that keeps the consultation open: a clarifying ask card, or the code's area question. */
export function isClarifyingQuestion(assistantText: string): boolean {
  return wasAskReply(assistantText) || assistantText.includes(AREA_ASK_VI) || assistantText.includes(AREA_ASK_EN)
}

/**
 * The user texts of the CURRENT consultation, oldest first: those after the last assistant reply that is not a clarifying question, never more than the `subjectUserCount` last ones (the domain
 * boundary the caller already has). With no such reply, every user text of the subject.
 */
export function currentConsultationTexts(messages: readonly WindowMessage[], subjectUserCount: number): string[] {
  const entries = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, text: textOf(m.content) }))
  let closing = -1
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].role === 'assistant' && entries[i].text.trim() !== '' && !isClarifyingQuestion(entries[i].text)) { closing = i; break }
  }
  const users = entries.slice(closing + 1).filter(e => e.role === 'user').map(e => e.text)
  return users.slice(-Math.max(1, Math.min(users.length, subjectUserCount)))
}

/** The assistant texts of the current SUBJECT (those after the first of its `subjectUserCount` user messages), oldest first: where the card the user may point at can be. */
export function subjectAssistantTexts(messages: readonly WindowMessage[], subjectUserCount: number): string[] {
  const entries = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, text: textOf(m.content) }))
  const userIdx = entries.map((e, i) => (e.role === 'user' ? i : -1)).filter(i => i >= 0)
  const startUser = userIdx[Math.max(0, userIdx.length - Math.max(1, subjectUserCount))]
  return entries.slice(startUser ?? 0).filter(e => e.role === 'assistant').map(e => e.text)
}
