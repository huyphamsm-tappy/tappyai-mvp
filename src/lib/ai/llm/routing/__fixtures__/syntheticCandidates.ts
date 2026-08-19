import type { ModelCandidate, TaskClass } from '../types'
import type { ProviderId } from '../../types'

// ── TEST-ONLY synthetic providers ────────────────────────────────────────────
//
// With only Claude installed, every routing assertion would be vacuous: "picks
// Claude" passes whether the router computes anything or just returns a
// constant. A router that always answers Claude and a correct cheapest-eligible
// router are indistinguishable against a one-entry registry.
//
// These synthetic candidates exist so the tests can prove the opposite of the
// trivial implementation:
//   - a cheap provider WINS when it is eligible
//   - the cheapest provider LOSES when it cannot do the job
//   - the cheapest provider LOSES when it is unavailable
//   - premium wins ONLY when the quality floor actually demands it
//
// They are fixtures, never shipped: production code importing __fixtures__ is
// a boundary violation caught by architecture.test.ts.

const ALL_TASKS: readonly TaskClass[] = [
  'conversational', 'tool_dialogue', 'planning', 'extraction', 'short_generation', 'vision',
]

/** Provider ids are borrowed from the real union purely as labels; no adapter
 *  for any of them is installed, and none is reachable at runtime. */
const P = {
  cheap: 'deepseek' as ProviderId,
  medium: 'gemini' as ProviderId,
  premium: 'openai' as ProviderId,
  toolless: 'grok' as ProviderId,
}

function candidate(over: Partial<ModelCandidate> & Pick<ModelCandidate, 'providerId' | 'modelId' | 'tier'>): ModelCandidate {
  return {
    toolCalling: true,
    vision: true,
    streaming: true,
    structuredOutput: true,
    multiSystemMessages: 'unverified',
    promptCache: { supported: false, minCacheableTokens: null },
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    reasoning: 'standard',
    latencyClass: 'standard',
    supportedTaskClasses: ALL_TASKS,
    languages: 'multilingual',
    cost: { inputPerMTok: 1, outputPerMTok: 1, cacheReadPerMTok: null, cacheWritePerMTok: null },
    fallbackEligible: true,
    available: true,
    ...over,
  }
}

/** Cheap, capable, fast — should win most ordinary work. */
export const CHEAP_FAST = candidate({
  providerId: P.cheap, modelId: 'synthetic-cheap-fast', tier: 'cheap',
  reasoning: 'basic', latencyClass: 'fast', vision: false,
  cost: { inputPerMTok: 0.10, outputPerMTok: 0.40, cacheReadPerMTok: null, cacheWritePerMTok: null },
})

/** Mid tier: stronger reasoning, vision, still far below premium. */
export const MEDIUM_ALLROUND = candidate({
  providerId: P.medium, modelId: 'synthetic-medium-allround', tier: 'medium',
  reasoning: 'standard', latencyClass: 'standard',
  cost: { inputPerMTok: 0.60, outputPerMTok: 2.00, cacheReadPerMTok: null, cacheWritePerMTok: null },
})

/** Premium reasoning, deliberately SLOW so latency policy can exclude it. */
export const PREMIUM_REASONER = candidate({
  providerId: P.premium, modelId: 'synthetic-premium-reasoner', tier: 'premium',
  reasoning: 'advanced', latencyClass: 'slow',
  cost: { inputPerMTok: 3.00, outputPerMTok: 15.00, cacheReadPerMTok: null, cacheWritePerMTok: null },
})

/** CHEAPEST of all, but cannot call tools. Proves capability beats cost. */
export const TOOLLESS_CHEAPEST = candidate({
  providerId: P.toolless, modelId: 'synthetic-toolless-cheapest', tier: 'cheap',
  reasoning: 'basic', latencyClass: 'fast', toolCalling: false, vision: false,
  cost: { inputPerMTok: 0.05, outputPerMTok: 0.20, cacheReadPerMTok: null, cacheWritePerMTok: null },
})

/** Cheaper than everything and fully capable — but not configured. Proves
 *  availability is a hard filter, not a preference. */
export const UNAVAILABLE_CHEAPEST = candidate({
  providerId: P.cheap, modelId: 'synthetic-unavailable-cheapest', tier: 'cheap',
  reasoning: 'advanced', latencyClass: 'fast', available: false,
  cost: { inputPerMTok: 0.01, outputPerMTok: 0.05, cacheReadPerMTok: null, cacheWritePerMTok: null },
})

/** A stand-in for the real premium incumbent, so "does Claude win by default?"
 *  is answerable without touching the real registry. */
export const INCUMBENT_PREMIUM = candidate({
  providerId: 'claude', modelId: 'synthetic-incumbent', tier: 'premium',
  reasoning: 'advanced', latencyClass: 'standard',
  promptCache: { supported: true, minCacheableTokens: 4096 },
  multiSystemMessages: 'verified',
  cost: { inputPerMTok: 1.00, outputPerMTok: 5.00, cacheReadPerMTok: 0.10, cacheWritePerMTok: 1.25 },
})

/** The default fleet used by most tests. */
export const FLEET: readonly ModelCandidate[] = [
  CHEAP_FAST, MEDIUM_ALLROUND, PREMIUM_REASONER, TOOLLESS_CHEAPEST,
  UNAVAILABLE_CHEAPEST, INCUMBENT_PREMIUM,
]

export { candidate as syntheticCandidate }
