import { describe, it, expect } from 'vitest'
import { route, requiredReasoning, REASON_CODES } from './router'
import type { RoutingSignals, ModelCandidate } from './types'
import {
  FLEET, CHEAP_FAST, MEDIUM_ALLROUND, PREMIUM_REASONER,
  TOOLLESS_CHEAPEST, UNAVAILABLE_CHEAPEST, INCUMBENT_PREMIUM, syntheticCandidate,
} from './__fixtures__/syntheticCandidates'

// ── Routing policy (P1) ──────────────────────────────────────────────────────
// Every test runs against SYNTHETIC candidates. That is the point: with only
// Claude installed, "picks Claude" would pass against a router that computes
// nothing. These prove the opposite of the trivial implementation.

const signals = (over: Partial<RoutingSignals> = {}): RoutingSignals => ({
  taskClass: 'conversational',
  complexity: 'low',
  risk: 'routine',
  needsTools: false,
  needsVision: false,
  needsStreaming: false,
  needsStructuredOutput: false,
  approxInputTokens: 1_000,
  maxOutputTokens: 1_024,
  latencyBudget: 'batch',
  lang: 'vi',
  securityVerdict: 'clean',
  ...over,
})

const won = (s: RoutingSignals, fleet: readonly ModelCandidate[] = FLEET) => {
  const r = route(s, fleet)
  if (!r.ok) throw new Error(`expected a decision, got ${r.reasonCode}`)
  return r.decision
}

describe('cheapest eligible model wins', () => {
  it('picks the genuinely cheapest model when nothing is required beyond it', () => {
    expect(won(signals()).modelId).toBe(TOOLLESS_CHEAPEST.modelId)
  })

  it('breaks a same-tier tie by input cost, then output cost', () => {
    const a = syntheticCandidate({ providerId: 'gemini', modelId: 'a', tier: 'cheap', reasoning: 'basic', cost: { inputPerMTok: 0.2, outputPerMTok: 9, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    const b = syntheticCandidate({ providerId: 'openai', modelId: 'b', tier: 'cheap', reasoning: 'basic', cost: { inputPerMTok: 0.1, outputPerMTok: 9, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    expect(won(signals(), [a, b]).modelId).toBe('b')
  })

  it('prefers a cheaper TIER even when the pricier tier has a lower headline rate', () => {
    const cheapTier = syntheticCandidate({ providerId: 'gemini', modelId: 'cheap-tier', tier: 'cheap', reasoning: 'basic', cost: { inputPerMTok: 5, outputPerMTok: 5, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    expect(won(signals(), [cheapTier, INCUMBENT_PREMIUM]).modelId).toBe('cheap-tier')
  })
})

describe('capability is a hard filter — it beats price', () => {
  it('the CHEAPEST model loses when it cannot call tools', () => {
    const d = won(signals({ taskClass: 'tool_dialogue', needsTools: true }))
    expect(d.modelId).not.toBe(TOOLLESS_CHEAPEST.modelId)
    expect(d.modelId).toBe(CHEAP_FAST.modelId)
  })

  it('the CHEAPEST model loses when it is unavailable', () => {
    // UNAVAILABLE_CHEAPEST is cheaper than everything and fully capable.
    expect(won(signals()).modelId).not.toBe(UNAVAILABLE_CHEAPEST.modelId)
  })

  it('excludes models without vision for a vision task', () => {
    const d = won(signals({ taskClass: 'vision', needsVision: true }))
    expect(d.modelId).toBe(MEDIUM_ALLROUND.modelId)
  })

  it('excludes models that cannot stream when streaming is required', () => {
    const noStream = syntheticCandidate({ providerId: 'gemini', modelId: 'no-stream', tier: 'cheap', reasoning: 'basic', streaming: false, cost: { inputPerMTok: 0.01, outputPerMTok: 0.01, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    expect(won(signals({ needsStreaming: true }), [noStream, CHEAP_FAST]).modelId).toBe(CHEAP_FAST.modelId)
  })

  it('excludes models without structured output when it is required', () => {
    const noJson = syntheticCandidate({ providerId: 'gemini', modelId: 'no-json', tier: 'cheap', reasoning: 'basic', structuredOutput: false, cost: { inputPerMTok: 0.01, outputPerMTok: 0.01, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    expect(won(signals({ needsStructuredOutput: true }), [noJson, CHEAP_FAST]).modelId).toBe(CHEAP_FAST.modelId)
  })

  it('excludes models whose context window cannot hold the request', () => {
    const small = syntheticCandidate({ providerId: 'gemini', modelId: 'small-ctx', tier: 'cheap', reasoning: 'basic', contextWindow: 8_000, cost: { inputPerMTok: 0.01, outputPerMTok: 0.01, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    expect(won(signals({ approxInputTokens: 60_000 }), [small, CHEAP_FAST]).modelId).toBe(CHEAP_FAST.modelId)
  })

  it('excludes models whose output ceiling is below what was asked for', () => {
    const shortOut = syntheticCandidate({ providerId: 'gemini', modelId: 'short-out', tier: 'cheap', reasoning: 'basic', maxOutputTokens: 512, cost: { inputPerMTok: 0.01, outputPerMTok: 0.01, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    expect(won(signals({ maxOutputTokens: 4_096 }), [shortOut, CHEAP_FAST]).modelId).toBe(CHEAP_FAST.modelId)
  })

  it('excludes a model that does not hold the response language', () => {
    // Vietnamese-first product: an English-only model is ineligible for a
    // Vietnamese turn no matter how cheap it is.
    const enOnly = syntheticCandidate({ providerId: 'gemini', modelId: 'en-only', tier: 'cheap', reasoning: 'basic', languages: ['en'], cost: { inputPerMTok: 0.01, outputPerMTok: 0.01, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    expect(won(signals({ lang: 'vi' }), [enOnly, CHEAP_FAST]).modelId).toBe(CHEAP_FAST.modelId)
    expect(won(signals({ lang: 'en' }), [enOnly, CHEAP_FAST]).modelId).toBe('en-only')
  })

  it('excludes models that do not declare support for the task class', () => {
    const narrow = syntheticCandidate({ providerId: 'gemini', modelId: 'narrow', tier: 'cheap', reasoning: 'basic', supportedTaskClasses: ['extraction'], cost: { inputPerMTok: 0.01, outputPerMTok: 0.01, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    expect(won(signals({ taskClass: 'conversational' }), [narrow, CHEAP_FAST]).modelId).toBe(CHEAP_FAST.modelId)
  })
})

describe('the premium tier is earned, never assumed', () => {
  it('an ordinary turn does NOT reach the incumbent premium model', () => {
    const d = won(signals({ taskClass: 'tool_dialogue', needsTools: true }))
    expect(d.tier).toBe('cheap')
    expect(d.providerId).not.toBe('claude')
  })

  it('PLANNING alone does not select premium — medium complexity stays medium', () => {
    const d = won(signals({ taskClass: 'planning', complexity: 'medium', needsTools: true, needsStreaming: true, latencyBudget: 'interactive' }))
    expect(d.modelId).toBe(MEDIUM_ALLROUND.modelId)
    expect(d.tier).toBe('medium')
    expect(d.reasonCode).toBe('CHEAPEST_ELIGIBLE')
  })

  it('premium is selected when — and only when — the reasoning floor demands it', () => {
    const d = won(signals({ taskClass: 'planning', complexity: 'high', needsTools: true, needsStreaming: true, latencyBudget: 'interactive' }))
    expect(d.tier).toBe('premium')
    expect(d.reasonCode).toBe('PREMIUM_REASONING_REQUIRED')
  })

  it('elevated risk raises the floor above what complexity alone would allow', () => {
    const routine = won(signals({ complexity: 'low', risk: 'routine' }))
    const elevated = won(signals({ complexity: 'low', risk: 'elevated' }))
    expect(routine.modelId).toBe(TOOLLESS_CHEAPEST.modelId)
    expect(elevated.modelId).toBe(MEDIUM_ALLROUND.modelId)
    expect(elevated.reasonCode).toBe('ELEVATED_RISK_FLOOR')
  })

  it('maps complexity to a reasoning floor, not to a vendor', () => {
    expect(requiredReasoning('low', 'routine')).toBe('basic')
    expect(requiredReasoning('medium', 'routine')).toBe('standard')
    expect(requiredReasoning('high', 'routine')).toBe('advanced')
    expect(requiredReasoning('low', 'elevated')).toBe('standard')
    expect(requiredReasoning('high', 'elevated')).toBe('advanced')
  })
})

describe('latency budget', () => {
  it('an interactive turn excludes slow models', () => {
    const d = won(signals({ complexity: 'high', latencyBudget: 'interactive' }))
    expect(d.modelId).not.toBe(PREMIUM_REASONER.modelId)
    expect(d.modelId).toBe(INCUMBENT_PREMIUM.modelId)
  })

  it('a batch job may use a slow model when it is the cheapest that qualifies', () => {
    const cheapSlow = syntheticCandidate({ providerId: 'gemini', modelId: 'cheap-slow', tier: 'cheap', reasoning: 'advanced', latencyClass: 'slow', cost: { inputPerMTok: 0.01, outputPerMTok: 0.01, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    expect(won(signals({ complexity: 'high', latencyBudget: 'batch' }), [cheapSlow, INCUMBENT_PREMIUM]).modelId).toBe('cheap-slow')
  })
})

describe('routing is NOT length-based', () => {
  it('input size alone never changes the decision while both fit the window', () => {
    const small = won(signals({ approxInputTokens: 50 }))
    const large = won(signals({ approxInputTokens: 90_000 }))
    expect(large.modelId).toBe(small.modelId)
    expect(large.tier).toBe(small.tier)
    expect(large.reasonCode).toBe(small.reasonCode)
  })
})

describe('no eligible model — the router refuses rather than defaulting to premium', () => {
  const impossible = signals({ needsVision: true, needsTools: true, complexity: 'high', latencyBudget: 'interactive' })

  it('returns ok:false, not a premium model', () => {
    const r = route(impossible, [CHEAP_FAST, TOOLLESS_CHEAPEST])
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.reasonCode).toBe('NO_ELIGIBLE_MODEL')
    expect(r.consideredCount).toBe(2)
  })

  it('never silently substitutes the incumbent when nothing qualifies', () => {
    const r = route(signals({ taskClass: 'vision', needsVision: true }), [CHEAP_FAST, TOOLLESS_CHEAPEST])
    expect(r.ok).toBe(false)
  })

  it('returns ok:false for an empty fleet rather than inventing a provider', () => {
    const r = route(signals(), [])
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.consideredCount).toBe(0)
  })
})

describe('fallback policy', () => {
  it('is capped at exactly one hop', () => {
    expect(won(signals()).fallbackPolicy.maxHops).toBe(1)
    expect(won(signals()).fallbackPolicy.chain.length).toBeLessThanOrEqual(1)
  })

  it('names a DIFFERENT provider than the primary', () => {
    const d = won(signals())
    for (const id of d.fallbackPolicy.chain) expect(id).not.toBe(d.providerId)
  })

  it('skips a same-provider runner-up — a sibling model does not survive its provider being down', () => {
    // The previous assertion passes vacuously against the default fleet, where
    // the runner-up is a different provider anyway. This fixture makes the two
    // cheapest models SIBLINGS, so dropping the same-provider filter is
    // observable. (Found by mutation MP08 surviving.)
    const cost = (i: number, o: number) => ({ inputPerMTok: i, outputPerMTok: o, cacheReadPerMTok: null, cacheWritePerMTok: null })
    const siblingA = syntheticCandidate({ providerId: 'gemini', modelId: 'sib-a', tier: 'cheap', reasoning: 'basic', cost: cost(0.1, 0.1) })
    const siblingB = syntheticCandidate({ providerId: 'gemini', modelId: 'sib-b', tier: 'cheap', reasoning: 'basic', cost: cost(0.2, 0.2) })
    const other = syntheticCandidate({ providerId: 'openai', modelId: 'other', tier: 'cheap', reasoning: 'basic', cost: cost(0.3, 0.3) })

    const d = won(signals(), [siblingA, siblingB, other])
    expect(d.modelId).toBe('sib-a')
    expect(d.fallbackPolicy.chain).toEqual(['openai'])
  })

  it('offers nothing when every other eligible model shares the primary\'s provider', () => {
    const cost = (i: number) => ({ inputPerMTok: i, outputPerMTok: i, cacheReadPerMTok: null, cacheWritePerMTok: null })
    const a = syntheticCandidate({ providerId: 'gemini', modelId: 'only-a', tier: 'cheap', reasoning: 'basic', cost: cost(0.1) })
    const b = syntheticCandidate({ providerId: 'gemini', modelId: 'only-b', tier: 'cheap', reasoning: 'basic', cost: cost(0.2) })
    expect(won(signals(), [a, b]).fallbackPolicy.chain).toEqual([])
  })

  it('only offers a fallback that satisfies the same capability requirements', () => {
    // Tools required: the toolless model must never appear as a fallback.
    const d = won(signals({ taskClass: 'tool_dialogue', needsTools: true }))
    const byProvider = new Map(FLEET.map(c => [c.providerId, c]))
    for (const id of d.fallbackPolicy.chain) {
      expect(byProvider.get(id)?.toolCalling, `${id} offered as fallback but cannot call tools`).toBe(true)
    }
  })

  it('offers no fallback when only one provider qualifies', () => {
    expect(won(signals(), [CHEAP_FAST]).fallbackPolicy.chain).toEqual([])
  })

  it('excludes models marked ineligible for fallback', () => {
    const noFb = syntheticCandidate({ providerId: 'openai', modelId: 'no-fb', tier: 'cheap', reasoning: 'basic', fallbackEligible: false, cost: { inputPerMTok: 0.5, outputPerMTok: 0.5, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    expect(won(signals(), [CHEAP_FAST, noFb]).fallbackPolicy.chain).toEqual([])
  })

  it('retries only on availability, never on a malformed request', () => {
    expect(won(signals()).fallbackPolicy.retryOn).toBe('availability')
  })
})

describe('determinism', () => {
  it('same signals and fleet produce a byte-identical decision, 500 times', () => {
    const s = signals({ taskClass: 'planning', complexity: 'medium', needsTools: true })
    const first = JSON.stringify(route(s, FLEET))
    for (let i = 0; i < 500; i++) expect(JSON.stringify(route(s, FLEET))).toBe(first)
  })

  it('is independent of candidate ORDER', () => {
    const s = signals({ taskClass: 'tool_dialogue', needsTools: true })
    const forward = route(s, FLEET)
    const reversed = route(s, [...FLEET].reverse())
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward))
  })

  it('does not mutate the candidate list it was given', () => {
    const fleet = [...FLEET]
    const before = fleet.map(c => c.modelId)
    route(signals(), fleet)
    expect(fleet.map(c => c.modelId)).toEqual(before)
  })
})

describe('reason codes and confidence', () => {
  it('emits only codes from the closed set', () => {
    const cases: RoutingSignals[] = [
      signals(),
      signals({ complexity: 'high' }),
      signals({ risk: 'elevated' }),
      signals({ taskClass: 'tool_dialogue', needsTools: true }),
      signals({ taskClass: 'vision', needsVision: true }),
    ]
    for (const s of cases) {
      const r = route(s, FLEET)
      expect(REASON_CODES).toContain(r.ok ? r.decision.reasonCode : r.reasonCode)
    }
  })

  it('reports ONLY_ELIGIBLE when exactly one candidate survives', () => {
    const d = won(signals(), [CHEAP_FAST])
    expect(d.reasonCode).toBe('ONLY_ELIGIBLE')
    expect(d.eligibleCount).toBe(1)
  })

  it('is `certain` when the winner is strictly cheaper than the runner-up', () => {
    expect(won(signals()).confidence).toBe('certain')
  })

  it('is `heuristic` when a tie had to be broken by model id', () => {
    const twinA = syntheticCandidate({ providerId: 'gemini', modelId: 'twin-a', tier: 'cheap', reasoning: 'basic', cost: { inputPerMTok: 0.1, outputPerMTok: 0.1, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    const twinB = syntheticCandidate({ providerId: 'openai', modelId: 'twin-b', tier: 'cheap', reasoning: 'basic', cost: { inputPerMTok: 0.1, outputPerMTok: 0.1, cacheReadPerMTok: null, cacheWritePerMTok: null } })
    const d = won(signals(), [twinA, twinB])
    expect(d.modelId).toBe('twin-a')
    expect(d.confidence).toBe('heuristic')
  })

  it('reports how many candidates were considered and how many survived', () => {
    const d = won(signals({ taskClass: 'tool_dialogue', needsTools: true }))
    expect(d.consideredCount).toBe(FLEET.length)
    expect(d.eligibleCount).toBeLessThan(FLEET.length)
    expect(d.eligibleCount).toBeGreaterThan(0)
  })
})

describe('security boundary (P1)', () => {
  it('securityVerdict cannot change which model is selected', () => {
    const clean = JSON.stringify(route(signals({ securityVerdict: 'clean' }), FLEET))
    for (const v of ['suspicious', 'blocked'] as const) {
      expect(JSON.stringify(route(signals({ securityVerdict: v }), FLEET))).toBe(clean)
    }
  })

  it('the decision echoes only derived signals — no free text field exists on it', () => {
    const d = won(signals())
    const stringFields = Object.entries(d).filter(([, v]) => typeof v === 'string').map(([k]) => k)
    expect(stringFields.sort()).toEqual(
      ['complexity', 'modelId', 'providerId', 'reasonCode', 'risk', 'taskClass', 'tier', 'confidence'].sort(),
    )
  })
})
