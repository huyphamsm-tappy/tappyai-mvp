import { detectDecisionStage, type DecisionStage } from '../intent'
import { deriveNeedProfile, type NeedProfile, type DeriveOptions } from './needProfile'

// ── Refinement, resolved from the need profile (Phase 2 §6) ─────────────────
//
// THE FINDING THIS MODULE EXISTS FOR
//
// The shipped `detectDecisionStage` recognises turn 3 of the product contract's
// own four-turn example ("Battery is more important than GPU" — it matches
// `\b(more|less)\s+\w+`) and misses turns 2 and 4:
//
//   turn 2  "I travel frequently."             → null
//   turn 4  "Actually increase my budget to 35M." → null   ← the canonical refinement
//
// On those turns the refinement stage block — "keep the task, apply only the new
// condition, ANSWER NOW, do not re-ask" — is never injected. That is the same
// class of defect as C2.1, where the refinement turn asked instead of answering.
//
// `detectDecisionStage` is deliberately NOT modified. It is precision-first by
// design, carries 71 passing tests, and route.ts depends on it. Instead the gap
// is closed ADDITIVELY with a signal the regexes cannot express: whether this
// turn actually CHANGED the structured need.
//
// That signal is strictly better than a keyword for this job. "Nâng ngân sách
// lên 35 triệu" is a refinement because a budget moved — not because it contains
// a particular word — and the profile already knows that it moved.

/** Task-scoped fields. `turnsObserved` is bookkeeping and never a change. */
function taskFingerprint(p: NeedProfile): string {
  return JSON.stringify({
    subject: p.subject,
    domain: p.domain,
    budgetStated: p.budgetStated,
    budgetMax: p.budget?.max ?? null,
    location: p.location.text,
    useCases: [...p.useCases].sort(),
    priorities: p.priorities.map(x => `${x.key}:${x.weight}`).sort(),
    mustHave: [...p.mustHave].sort(),
    avoid: [...p.avoid].sort(),
  })
}

/** Index of the last user message, or -1. */
function lastUserIndex(messages: Array<{ role: string; content: unknown }>): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === 'user') return i
  return -1
}

/**
 * Did the final user turn change the structured need, without starting a new task?
 *
 * A domain or subject switch is NOT a refinement — it is a new decision, and
 * treating it as one would tell the model to carry forward constraints the user
 * has moved on from. That is the failure `detectDecisionStage`'s own comment
 * calls out as worse than shipping nothing.
 */
export function taskSwitched(
  messages: Array<{ role: string; content: unknown }>,
  opts: DeriveOptions = {},
): boolean {
  const idx = lastUserIndex(messages)
  if (idx < 0) return false
  const before = deriveNeedProfile(messages.slice(0, idx), opts)
  const after = deriveNeedProfile(messages, opts)
  if (before.domain === null || after.domain === null) return false
  return after.domain !== before.domain
}

export function profileChanged(
  messages: Array<{ role: string; content: unknown }>,
  opts: DeriveOptions = {},
): boolean {
  const idx = lastUserIndex(messages)
  if (idx < 0) return false

  const before = deriveNeedProfile(messages.slice(0, idx), opts)
  const after = deriveNeedProfile(messages, opts)

  // Nothing to refine yet.
  if (before.turnsObserved === 0) return false
  // A new task, not a tweak to the old one.
  if (after.domain !== before.domain && after.domain !== null) return false
  if (after.subject !== before.subject && after.subject !== null && before.subject !== null) return false

  return taskFingerprint(after) !== taskFingerprint(before)
}

/**
 * The decision stage for this turn.
 *
 * The shipped detector wins whenever it fires: `comparison` and `confirmation`
 * are more specific claims than "something changed", and overriding them would
 * regress behaviour that is already measured and tested. The profile signal only
 * fills the gap where the detector returns null.
 */
export function resolveDecisionStage(
  messages: Array<{ role: string; content: unknown }>,
  opts: DeriveOptions = {},
): DecisionStage {
  const idx = lastUserIndex(messages)
  if (idx < 0) return null

  const raw = messages[idx].content
  const text = typeof raw === 'string'
    ? raw
    : Array.isArray(raw)
      ? (raw as Array<{ type?: string; text?: string }>).map(c => (c?.type === 'text' ? c.text || '' : '')).join(' ')
      : ''

  const hasPriorAssistantTurn = messages.slice(0, idx).some(m => m?.role === 'assistant')
  const shipped = detectDecisionStage(text, { hasPriorAssistantTurn })

  // ONE narrow veto, and only over 'refinement'.
  //
  // `instead` is in the shipped REFINEMENT_MARKER list, so "Actually, help me
  // find a hotel in Da Nang instead." is classified as a refinement — but it is a
  // task SWITCH. The refinement block would then tell the model to keep the
  // previous task (a laptop) and apply only the new condition, which is exactly
  // the harm detectDecisionStage's own comment warns about: "a FALSE refinement
  // tells the model to carry forward a task the user has moved on from".
  //
  // The veto fires only when the profile shows the DOMAIN actually changed —
  // never on a keyword — and never touches 'comparison' or 'confirmation'.
  if (shipped === 'refinement' && taskSwitched(messages, opts)) return null
  if (shipped) return shipped

  if (hasPriorAssistantTurn && profileChanged(messages, opts)) return 'refinement'
  return null
}
