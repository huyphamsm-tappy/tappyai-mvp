import type { DecisionStage } from '../intent'

// ── Phase A A2 — Turn Intent Gate ────────────────────────────────────────────
//
// A canonical 4-value classification of what the current user turn is asking
// for. Downstream engine (retrieval, filtering, ranking, synthesis) reads this
// enum instead of the older `DecisionStage` — the two carry different vocabs,
// and the gate normalizes.
//
// Vocabulary (frozen product principle P2):
//   new_consultation      first search, or a task-switch
//   follow_up_question    factual follow-up ("how much are they?")
//   refinement            add/change constraints ("any cheaper?", "quieter one")
//   clarification_response reply to a clarifying question the assistant asked
//
// Behavior rules:
//   * new_consultation triggers retrieval + ranking + selection
//   * follow_up_question NEVER triggers a new retrieval — the assistant answers
//     from prior evidence (Round 1's sanitize + this gate together prevent the
//     duplicate-card class of bug)
//   * refinement re-runs retrieval/ranking with the updated NeedProfile
//   * clarification_response merges the answer into state, then behaves like a
//     new_consultation (with the answer folded in)
//
// This module is a PURE adapter. It calls `resolveDecisionStage` (which already
// merges the intent regex, the profile-change signal, and the task-switch veto)
// and maps its output to the canonical enum. No new detector.

export type TurnIntent =
  | 'new_consultation'
  | 'follow_up_question'
  | 'refinement'
  | 'clarification_response'

export interface IntentGateInput {
  /** The `DecisionStage` from `resolveDecisionStage` — may be null. */
  stage: DecisionStage | null
  /** Whether ANY prior assistant turn exists in the conversation. */
  hasPriorAssistantTurn: boolean
  /**
   * Whether this turn switched subject relative to the previous NeedProfile
   * (e.g. "quán phở" → "khách sạn Đà Nẵng"). Feeds new_consultation.
   */
  taskSwitched: boolean
  /**
   * Whether the assistant's PREVIOUS turn ended with a clarifying question —
   * meaning the current user turn is likely answering it. `detectDecisionStage`
   * cannot know this alone; the route sets it from the last assistant frame.
   */
  assistantAskedClarification: boolean
}

/**
 * Compute the canonical turn intent from the mixed signals available today.
 * Never reads the raw user text — that's `resolveDecisionStage`'s job. This
 * gate is the mapping layer, not a second classifier.
 */
export function classifyTurnIntent(input: IntentGateInput): TurnIntent {
  const { stage, hasPriorAssistantTurn, taskSwitched, assistantAskedClarification } = input

  // First turn = new_consultation. This is the primary path — retrieval fires,
  // Rule-of-1–3 selects, synthesizer opens with a Pick.
  if (!hasPriorAssistantTurn) return 'new_consultation'

  // A task switch mid-conversation restarts the consultation. State reset is
  // NOT the gate's job — the delta / needProfile builder handles field wipe.
  if (taskSwitched) return 'new_consultation'

  // The assistant just asked. The current user turn is the answer.
  if (assistantAskedClarification) return 'clarification_response'

  // `refinement` — the ranker signal AND the intent regex both agree the user
  // is adding a constraint ("any cheaper?", "quieter one"). Trigger re-rank
  // with the merged NeedProfile; do NOT re-run retrieval unless the delta
  // touched a hard constraint the current candidate set does not satisfy.
  if (stage === 'refinement' || stage === 'comparison') return 'refinement'

  // `decision` / `rejection` / `confirmation` — the user is expressing an
  // opinion on what they've already seen. That's a follow-up: the assistant
  // answers from the frozen evidence, does not re-rank, does not re-render
  // cards. Round 1's sanitize on this branch already prevents marker/image
  // duplication in the reply.
  if (stage === 'decision' || stage === 'rejection' || stage === 'confirmation') {
    return 'follow_up_question'
  }

  // No stage signal, but the conversation has history. Treat as follow-up: the
  // assistant answers factually from prior context. This is the conservative
  // default — a factual follow-up NEVER triggers unnecessary retrieval.
  return 'follow_up_question'
}

/**
 * Should the pipeline run retrieval + ranking + selection this turn?
 *
 * `new_consultation` and `refinement` are the ONLY intents that trigger
 * retrieval. `follow_up_question` never does — that is the whole point of the
 * gate, and how contextual-follow-up-card-duplication is prevented structurally
 * (rather than only via Round 1's history sanitize).
 *
 * `clarification_response` gates on whether the assistant's clarification was
 * about a HARD CONSTRAINT (which needs re-retrieval) or a SOFT PREFERENCE
 * (which only re-ranks the existing candidate set).
 */
export function shouldRunRetrieval(intent: TurnIntent): boolean {
  return intent === 'new_consultation' || intent === 'refinement' || intent === 'clarification_response'
}

/** Should the pipeline render (or re-render) the recommendation cards? */
export function shouldRenderCards(intent: TurnIntent): boolean {
  return intent === 'new_consultation' || intent === 'refinement'
}
