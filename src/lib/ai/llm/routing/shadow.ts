import { getModelCandidates } from './modelRegistry'
import { route } from './router'
import { deriveSignals, type RoutingHints } from './signals'
import type { ProviderId } from '../types'
import type { Complexity, ReasonCode, Risk, RoutingOutcome, RoutingSignals, TaskClass, Tier } from './types'

// ── Shadow mode (P1) ─────────────────────────────────────────────────────────
//
// The router runs and records what it WOULD have chosen; the request is served
// exactly as before. That gives real production routing telemetry before the
// router is allowed to affect a single user.
//
// Off unless LLM_ROUTER_SHADOW=1. There is deliberately no code path in P1 that
// applies a decision — LLM_ROUTER_ENABLED is reserved and read NOWHERE, which
// an architecture guard asserts. A flag that cannot be honoured cannot be
// switched on by accident.

export const SHADOW_FLAG = 'LLM_ROUTER_SHADOW'

export interface ActualServing {
  providerId: ProviderId
  modelId: string
}

/** Flat and machine-readable, joinable with `tappyai_usage` on the log stream.
 *  Every field is derived — no prompt, no tool output, no memory, no secret. */
export interface ShadowRecord {
  type: 'tappyai_routing_shadow'
  selectedProvider: ProviderId | null
  selectedModel: string | null
  tier: Tier | null
  taskClass: TaskClass
  complexity: Complexity
  risk: Risk
  reasonCode: ReasonCode
  confidence: 'certain' | 'heuristic' | 'none'
  /** A CLASS, not a dollar figure. Per-request cost needs the provider's own
   *  token report, which does not exist at routing time; publishing a number
   *  here would be a fabrication. */
  costClass: Tier | 'none'
  fallbackChain: readonly ProviderId[]
  consideredCount: number
  eligibleCount: number
  actualProvider: ProviderId
  actualModel: string
  disagreement: boolean
}

export function buildShadowRecord(
  signals: RoutingSignals,
  outcome: RoutingOutcome,
  actual: ActualServing,
): ShadowRecord {
  const common = {
    type: 'tappyai_routing_shadow' as const,
    taskClass: signals.taskClass,
    complexity: signals.complexity,
    risk: signals.risk,
    actualProvider: actual.providerId,
    actualModel: actual.modelId,
  }

  if (!outcome.ok) {
    // No decision is a real, reportable outcome — never paper over it by
    // echoing whatever actually served the request.
    return {
      ...common,
      selectedProvider: null,
      selectedModel: null,
      tier: null,
      reasonCode: outcome.reasonCode,
      confidence: 'none',
      costClass: 'none',
      fallbackChain: [],
      consideredCount: outcome.consideredCount,
      eligibleCount: 0,
      disagreement: true,
    }
  }

  const d = outcome.decision
  return {
    ...common,
    selectedProvider: d.providerId,
    selectedModel: d.modelId,
    tier: d.tier,
    reasonCode: d.reasonCode,
    confidence: d.confidence,
    costClass: d.tier,
    fallbackChain: d.fallbackPolicy.chain,
    consideredCount: d.consideredCount,
    eligibleCount: d.eligibleCount,
    disagreement: d.providerId !== actual.providerId || d.modelId !== actual.modelId,
  }
}

export interface ObserveInput {
  method: 'generate' | 'stream' | 'vision'
  hasTools: boolean
  approxInputTokens: number
  maxTokens?: number
  hints?: RoutingHints
  actual: ActualServing
}

/**
 * Evaluate the router ONCE, before generation, and record the result.
 *
 * SECURITY: this is the only routing evaluation in a request's lifetime. It runs
 * on pre-generation signals only. It is never called from a tool result, a web
 * result, or any other untrusted runtime data — letting a fetched web page
 * re-trigger routing would hand routing control to that page.
 */
export function observeRouting(input: ObserveInput): void {
  if (process.env[SHADOW_FLAG] !== '1') return
  try {
    const signals = deriveSignals(input)
    const outcome = route(signals, getModelCandidates())
    console.log(JSON.stringify(buildShadowRecord(signals, outcome, input.actual)))
  } catch (e) {
    // Telemetry must never break a reply.
    console.error('[routing] shadow observation failed:', e)
  }
}
