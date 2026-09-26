import { turnStartsNewConsultation } from './actionability'

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

/**
 * The messages of the current subject: everything from the most recent user turn that started a
 * new consultation (inclusive). The whole thread when no switch happened.
 */
export function currentSubjectMessages<T extends Msg>(messages: readonly T[], opts: { hasGps: boolean; lang: string }): T[] {
  const userIdx = messages.map((m, i) => (m && m.role === 'user' ? i : -1)).filter(i => i >= 0)
  for (let k = userIdx.length - 1; k >= 1; k--) {
    const upTo = messages.slice(0, userIdx[k] + 1)
    if (turnStartsNewConsultation({ messages: upTo as Array<{ role: string; content: unknown }>, hasGps: opts.hasGps, lang: opts.lang })) {
      return messages.slice(userIdx[k])
    }
  }
  return messages.slice()
}

/** The user texts of the current subject (strings only), oldest first. */
export function currentSubjectUserTexts(messages: readonly Msg[], opts: { hasGps: boolean; lang: string }): string[] {
  return currentSubjectMessages(messages, opts)
    .filter(m => m.role === 'user')
    .map(m => (typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? (m.content as Array<{ text?: string }>).map(p => p.text || '').join(' ') : ''))
}
