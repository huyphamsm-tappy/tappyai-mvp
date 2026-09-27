import { turnStartsNewConsultation, turnDomain } from './actionability'
import { detectPlanningIntent, isPlanningRefinement } from '../intent'

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
