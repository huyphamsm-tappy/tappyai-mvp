import type { Complexity, LatencyBudget, Risk, RoutingSignals, TaskClass } from './types'

// ── Signal derivation (P1) ───────────────────────────────────────────────────
//
// Deterministic. No LLM, no I/O, no clock. Every signal is either knowable from
// the call itself (which method, are there tools, how big is the input) or
// already computed elsewhere in the request for other reasons — so routing adds
// no marginal cost.
//
// The codebase forbids the alternative: recommendationContract.test.ts fails if
// `AI.generate(` ever appears in the chat route, which is exactly the
// cheap-LLM-classifies-for-expensive-LLM architecture.

/** The closed field set. Anything not on this list cannot reach the router —
 *  which is how untrusted content is kept from naming a provider. */
export const SIGNAL_FIELDS = [
  'taskClass', 'complexity', 'risk',
  'needsTools', 'needsVision', 'needsStreaming', 'needsStructuredOutput',
  'approxInputTokens', 'maxOutputTokens', 'latencyBudget', 'lang', 'securityVerdict',
] as const

/** What a call site may declare. It expresses the JOB — never a vendor, never a
 *  model. There is deliberately no field through which one could be named. */
export interface RoutingHints {
  task?: TaskClass
  complexity?: Complexity
  risk?: Risk
  latencyBudget?: LatencyBudget
  lang?: string
  needsStructuredOutput?: boolean
  /** A capability REQUIREMENT the method alone cannot reveal: the chat route
   *  streams image turns through AI.stream, not AI.vision, so without this an
   *  image turn could be routed to a model that cannot see. */
  needsVision?: boolean
}

/**
 * Characters → tokens, deliberately CONSERVATIVE.
 *
 * ~3 chars/token rather than the usual English ~4, because Vietnamese with
 * diacritics tokenizes denser and this figure feeds a context-window filter.
 * Over-estimating fails toward a larger model; under-estimating picks one the
 * request overflows. This is an ESTIMATE and is never used for billing — actual
 * token counts come from the provider's own usage report.
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 3)
}

/** Same estimate over an assembled message list. Structure-only: it measures
 *  the SIZE of content, never reads or forwards it. */
export function estimateMessageTokens(messages: readonly { content?: unknown }[]): number {
  let chars = 0
  for (const m of messages ?? []) {
    const c = m?.content
    if (typeof c === 'string') chars += c.length
    else if (Array.isArray(c)) {
      for (const part of c) {
        const t = (part as { text?: unknown })?.text
        if (typeof t === 'string') chars += t.length
      }
    }
  }
  return Math.ceil(chars / 3)
}

const DEFAULT_COMPLEXITY: Record<TaskClass, Complexity> = {
  conversational: 'low',
  short_generation: 'low',
  extraction: 'low',
  vision: 'medium',
  tool_dialogue: 'medium',
  // Multi-step, multi-entity, must hold a budget and a day plan together.
  // This is a COMPLEXITY judgement; which model clears it is the router's call.
  planning: 'high',
}

export interface SignalInput {
  method: 'generate' | 'stream' | 'vision'
  hasTools: boolean
  approxInputTokens: number
  maxTokens?: number
  hints?: RoutingHints
}

export function deriveSignals(input: SignalInput): RoutingSignals {
  const { method, hasTools, hints } = input

  const taskClass: TaskClass =
    hints?.task ??
    (method === 'vision' ? 'vision'
      : method === 'stream' ? (hasTools ? 'tool_dialogue' : 'conversational')
        : 'short_generation')

  const approx = Number.isFinite(input.approxInputTokens) ? Math.max(0, input.approxInputTokens) : 0

  return {
    taskClass,
    complexity: hints?.complexity ?? DEFAULT_COMPLEXITY[taskClass],
    risk: hints?.risk ?? 'routine',
    needsTools: hasTools,
    // A hint may only ADD the requirement, never waive it: a vision() call
    // needs vision whatever the caller claims.
    needsVision: method === 'vision' || hints?.needsVision === true,
    needsStreaming: method === 'stream',
    needsStructuredOutput: hints?.needsStructuredOutput ?? false,
    approxInputTokens: approx,
    maxOutputTokens: input.maxTokens ?? 1024,
    // A streamed turn has a human watching the first token arrive.
    latencyBudget: hints?.latencyBudget ?? (method === 'stream' ? 'interactive' : 'batch'),
    lang: hints?.lang ?? 'vi',
    // P1 does not classify. Reserved for the Prompt Injection phase; the router
    // is proven not to read it (router.test.ts).
    securityVerdict: 'clean',
  }
}
