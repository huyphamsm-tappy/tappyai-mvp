import type { ProviderId } from '../types'
import type {
  Complexity, ModelCandidate, ReasonCode, ReasoningClass, Risk,
  RoutingOutcome, RoutingSignals, Tier,
} from './types'

// ── Routing policy (P1) ──────────────────────────────────────────────────────
//
// A PURE function: (signals, candidates) → outcome. No I/O, no env, no clock,
// no randomness, no network, no LLM. That is not stylistic — it is what makes
// a decision replayable from a log line, unit-testable without mocks, and
// impossible for untrusted runtime content to steer.
//
// The policy is CHEAPEST MODEL THAT SATISFIES THE REQUIREMENTS. It never
// branches on a provider or model name; it reads capability and cost metadata
// supplied by the registry. Swapping the fleet changes the answer, not the code.
//
// Deliberately NOT here:
//   - "if planning → premium". Planning raises COMPLEXITY, complexity raises the
//     reasoning floor, and the floor excludes models that cannot meet it. If a
//     mid-tier model clears the floor, it wins — including for planning.
//   - a fallback to any particular vendor. When nothing qualifies the router
//     returns ok:false and the caller decides. Quietly substituting the
//     incumbent would make it the universal fallback by omission.

export const REASON_CODES = [
  'ONLY_ELIGIBLE',
  'PREMIUM_REASONING_REQUIRED',
  'ELEVATED_RISK_FLOOR',
  'CHEAPEST_ELIGIBLE',
  'NO_ELIGIBLE_MODEL',
] as const satisfies readonly ReasonCode[]

const TIER_RANK: Record<Tier, number> = { cheap: 0, medium: 1, premium: 2 }
const REASONING_RANK: Record<ReasoningClass, number> = { basic: 0, standard: 1, advanced: 2 }

/** Complexity sets the floor; elevated risk lifts it to at least `standard`.
 *  A vendor is never named — this maps a job onto a CAPABILITY. */
export function requiredReasoning(complexity: Complexity, risk: Risk): ReasoningClass {
  const base: ReasoningClass =
    complexity === 'high' ? 'advanced' : complexity === 'medium' ? 'standard' : 'basic'
  if (risk === 'elevated' && REASONING_RANK[base] < REASONING_RANK.standard) return 'standard'
  return base
}

function speaks(candidate: ModelCandidate, lang: string): boolean {
  return candidate.languages === 'multilingual' || candidate.languages.includes(lang)
}

/** Hard requirements. Every one of these is a "cannot do the job", never a
 *  preference — which is why capability always beats price. */
function isEligible(c: ModelCandidate, s: RoutingSignals, floor: ReasoningClass): boolean {
  if (!c.available) return false
  if (s.needsTools && !c.toolCalling) return false
  if (s.needsVision && !c.vision) return false
  if (s.needsStreaming && !c.streaming) return false
  if (s.needsStructuredOutput && !c.structuredOutput) return false
  if (!c.supportedTaskClasses.includes(s.taskClass)) return false
  if (!speaks(c, s.lang)) return false
  if (c.contextWindow < s.approxInputTokens) return false
  if (c.maxOutputTokens < s.maxOutputTokens) return false
  if (REASONING_RANK[c.reasoning] < REASONING_RANK[floor]) return false
  // An interactive turn is one a human is waiting on, streaming or not.
  if (s.latencyBudget === 'interactive' && c.latencyClass === 'slow') return false
  return true
}

/** Cost order: tier first (the tier IS the cost class), then the published
 *  rates, then model id so the order is TOTAL and the result cannot depend on
 *  the order candidates happened to arrive in. */
function byCost(a: ModelCandidate, b: ModelCandidate): number {
  return (
    TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
    a.cost.inputPerMTok - b.cost.inputPerMTok ||
    a.cost.outputPerMTok - b.cost.outputPerMTok ||
    (a.modelId < b.modelId ? -1 : a.modelId > b.modelId ? 1 : 0)
  )
}

/** True when only the model-id tiebreak separated the top two — i.e. the choice
 *  was arbitrary on cost grounds. Reported as `heuristic` rather than dressed
 *  up as certainty. */
function isCostTie(a: ModelCandidate, b: ModelCandidate): boolean {
  return TIER_RANK[a.tier] === TIER_RANK[b.tier]
    && a.cost.inputPerMTok === b.cost.inputPerMTok
    && a.cost.outputPerMTok === b.cost.outputPerMTok
}

export function route(signals: RoutingSignals, candidates: readonly ModelCandidate[]): RoutingOutcome {
  const floor = requiredReasoning(signals.complexity, signals.risk)
  const eligible = candidates.filter(c => isEligible(c, signals, floor))

  if (eligible.length === 0) {
    return {
      ok: false,
      reasonCode: 'NO_ELIGIBLE_MODEL',
      taskClass: signals.taskClass,
      complexity: signals.complexity,
      risk: signals.risk,
      consideredCount: candidates.length,
    }
  }

  // Copy before sorting: the caller's array is not ours to reorder.
  const sorted = [...eligible].sort(byCost)
  const best = sorted[0]
  const runnerUp = sorted[1]

  // At most ONE hop, a different provider (a same-provider "fallback" does not
  // survive that provider being down), and already proven capable — the chain
  // is drawn from the eligible set, so it satisfies every requirement above.
  const chain: ProviderId[] = sorted
    .slice(1)
    .filter(c => c.fallbackEligible && c.providerId !== best.providerId)
    .slice(0, 1)
    .map(c => c.providerId)

  const riskRaisedFloor =
    signals.risk === 'elevated' &&
    REASONING_RANK[requiredReasoning(signals.complexity, 'routine')] < REASONING_RANK[floor]

  // Ordered, mutually exclusive, closed. The premium check comes FIRST so a
  // premium pick always explains itself as an earned capability requirement
  // rather than as an accident of being the last one standing.
  const reasonCode: ReasonCode =
    best.tier === 'premium' && floor === 'advanced' ? 'PREMIUM_REASONING_REQUIRED'
      : eligible.length === 1 ? 'ONLY_ELIGIBLE'
        : riskRaisedFloor ? 'ELEVATED_RISK_FLOOR'
          : 'CHEAPEST_ELIGIBLE'

  return {
    ok: true,
    decision: {
      providerId: best.providerId,
      modelId: best.modelId,
      tier: best.tier,
      taskClass: signals.taskClass,
      complexity: signals.complexity,
      risk: signals.risk,
      reasonCode,
      confidence: runnerUp !== undefined && isCostTie(best, runnerUp) ? 'heuristic' : 'certain',
      fallbackPolicy: { chain, maxHops: 1, retryOn: 'availability' },
      consideredCount: candidates.length,
      eligibleCount: eligible.length,
    },
  }
}
