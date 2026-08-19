import type { ProviderId } from '../types'

// ── Routing contract (P1) ────────────────────────────────────────────────────
// Provider-neutral by construction. Nothing here names a vendor, an SDK, or a
// model id literal; `providerId` and `modelId` are values supplied by the
// capability registry, never branched on by policy.

/**
 * What the caller is asking for. Derived from the 14 real call sites in this
 * codebase — deliberately six, not a taxonomy. Complexity and risk are separate
 * axes: a `tool_dialogue` turn can be routine or elevated, cheap or hard.
 */
export type TaskClass =
  | 'conversational'    // chat, no-tool turn
  | 'tool_dialogue'     // chat, tool turn
  | 'planning'          // chat, multi-step itinerary/evening plan
  | 'extraction'        // memory + price extraction, structured pulls
  | 'short_generation'  // crons, translate, suggestions, content rewrite
  | 'vision'            // image understanding

export type Complexity = 'low' | 'medium' | 'high'

/** Separate from complexity. `elevated` means a wrong answer costs the user
 *  something concrete — today: the turn carries a money claim. */
export type Risk = 'routine' | 'elevated'

export type Tier = 'cheap' | 'medium' | 'premium'
export type ReasoningClass = 'basic' | 'standard' | 'advanced'
export type LatencyClass = 'fast' | 'standard' | 'slow'
export type LatencyBudget = 'interactive' | 'batch'

/**
 * Whether a provider keeps CONSECUTIVE system messages addressable as separate
 * cacheable blocks. Measured on Anthropic (P0: 100% hit rate with the
 * breakpoint between `systemShared` and `system`). NOT portable — a provider
 * with a single system-instruction field may merge or reject them, which would
 * silently destroy the prompt-cache split. Never assume; measure, then record.
 */
export type MultiSystemSupport = 'verified' | 'unverified' | 'unsupported'

/**
 * Signals the router is allowed to see.
 *
 * SECURITY (P1 boundary): every field is a derived boolean, enum or count.
 * There is deliberately NO raw user text, tool output, web result, or memory
 * content here. Untrusted content can therefore influence a derived signal
 * within policy bounds, but can never name or select a provider or model.
 * Enforced by architecture.test.ts.
 */
export interface RoutingSignals {
  taskClass: TaskClass
  complexity: Complexity
  risk: Risk
  needsTools: boolean
  needsVision: boolean
  needsStreaming: boolean
  needsStructuredOutput: boolean
  approxInputTokens: number
  maxOutputTokens: number
  latencyBudget: LatencyBudget
  /** BCP-47-ish code, used only as a capability filter. Never a tier input. */
  lang: string
  /** Reserved for the Prompt Injection phase. P1 never reads it for selection;
   *  a guard proves it cannot widen the eligible set. */
  securityVerdict: 'clean' | 'suspicious' | 'blocked'
}

/** Static capability + cost metadata for one model. Supplied by the registry. */
export interface ModelCapabilities {
  providerId: ProviderId
  modelId: string
  tier: Tier
  toolCalling: boolean
  vision: boolean
  streaming: boolean
  structuredOutput: boolean
  multiSystemMessages: MultiSystemSupport
  promptCache: { supported: boolean; minCacheableTokens: number | null }
  contextWindow: number
  maxOutputTokens: number
  reasoning: ReasoningClass
  latencyClass: LatencyClass
  supportedTaskClasses: readonly TaskClass[]
  /** `'multilingual'`, or an explicit allow-list of language codes. TappyAI is
   *  Vietnamese-first, so a model that cannot hold Vietnamese must be
   *  excludable by capability rather than by folklore. */
  languages: 'multilingual' | readonly string[]
  /** Real published rates. Never invented — a model with unverified pricing
   *  must not be registered. */
  cost: {
    inputPerMTok: number
    outputPerMTok: number
    cacheReadPerMTok: number | null
    cacheWritePerMTok: number | null
  }
  fallbackEligible: boolean
}

/** A capability entry plus its runtime availability (credentials + adapter). */
export interface ModelCandidate extends ModelCapabilities {
  available: boolean
}

/**
 * Closed, ordered, machine-readable. Never free text, never model-generated,
 * never chain-of-thought. Exactly one applies to any decision.
 */
export type ReasonCode =
  | 'ONLY_ELIGIBLE'               // one candidate survived the filter
  | 'PREMIUM_REASONING_REQUIRED'  // the quality floor forced the premium tier
  | 'ELEVATED_RISK_FLOOR'         // risk raised the floor above complexity's base
  | 'CHEAPEST_ELIGIBLE'           // ordinary case: cheapest capable model
  | 'NO_ELIGIBLE_MODEL'           // nothing satisfies the requirements

export interface FallbackPolicy {
  /** At most ONE hop. Every entry already satisfies the same capability
   *  requirements as the primary — a fallback is never a downgrade to
   *  something that cannot do the job. */
  readonly chain: readonly ProviderId[]
  readonly maxHops: 1
  /** Availability failures only. A 4xx is malformed everywhere; retrying it on
   *  another vendor doubles cost and hides the bug. */
  readonly retryOn: 'availability'
}

export interface RoutingDecision {
  providerId: ProviderId
  modelId: string
  tier: Tier
  taskClass: TaskClass
  complexity: Complexity
  risk: Risk
  reasonCode: ReasonCode
  /** Deterministic engines have no probability. `certain` = a strictly better
   *  candidate won; `heuristic` = a tie was broken by the documented tiebreak. */
  confidence: 'certain' | 'heuristic'
  fallbackPolicy: FallbackPolicy
  /** Auditability without a combinatorial reason enum. */
  consideredCount: number
  eligibleCount: number
}

/**
 * No silent fallback to a premium vendor. When nothing satisfies the
 * requirements the router says so and the CALLER decides — it never quietly
 * returns Claude, which would make Claude the universal fallback by omission.
 */
export type RoutingOutcome =
  | { ok: true; decision: RoutingDecision }
  | {
      ok: false
      reasonCode: 'NO_ELIGIBLE_MODEL'
      taskClass: TaskClass
      complexity: Complexity
      risk: Risk
      consideredCount: number
    }
