import type { AnalysisTier, MessageInputType } from './types'
import type { RuleEvaluation } from './rules'
import { TIER2_AMBIGUOUS_MAX, TIER2_AMBIGUOUS_MIN, TIER2_MIN_CHARS, URL_ONLY_MAX_PROSE_LETTERS } from './config'

// Scam Shield · message analysis — cost routing.
//
// The cheapest correct answer wins. The decision is made from what the deterministic stages
// already know (how much prose there is, what the rules found), never from a model, so it costs
// nothing to make and is reproducible from a log line.
//
//   LEVEL 0  A bare link (or a link with a few words around it). The URL engine IS the answer;
//            asking a model to comment on "check this: https://…" would spend money to add
//            nothing. No model, no quota.
//   LEVEL 1  An ordinary message. The economical model.
//   LEVEL 2  Ambiguous (the rules landed in the middle band), high-stakes (the rules floored it
//            at HIGH — the user is about to get a serious warning and deserves the better
//            explanation), long, or read off a screenshot (OCR noise needs the stronger reader).
//   LEVEL 3  Reserved. Never chosen in V1.

export interface RoutingDecision {
  tier: AnalysisTier
  reason:
    | 'url_only'
    | 'no_content'
    | 'ordinary'
    | 'ambiguous_rules'
    | 'high_stakes'
    | 'long_message'
    | 'screenshot'
}

export function planAnalysis(input: {
  inputType: MessageInputType
  /** Letters in the message once every URL is removed. */
  proseLetters: number
  hasUrl: boolean
  textLength: number
  rules: RuleEvaluation
}): RoutingDecision {
  if (input.inputType === 'screenshot') return { tier: 2, reason: 'screenshot' }
  if (input.hasUrl && input.proseLetters <= URL_ONLY_MAX_PROSE_LETTERS) return { tier: 0, reason: 'url_only' }
  if (!input.hasUrl && input.proseLetters === 0) return { tier: 0, reason: 'no_content' }
  if (input.rules.floor === 'HIGH') return { tier: 2, reason: 'high_stakes' }
  if (input.rules.score >= TIER2_AMBIGUOUS_MIN && input.rules.score <= TIER2_AMBIGUOUS_MAX) {
    return { tier: 2, reason: 'ambiguous_rules' }
  }
  if (input.textLength >= TIER2_MIN_CHARS) return { tier: 2, reason: 'long_message' }
  return { tier: 1, reason: 'ordinary' }
}
