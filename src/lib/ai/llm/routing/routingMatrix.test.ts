import { describe, it, expect } from 'vitest'
import { route, requiredReasoning } from './router'
import { deriveSignals } from './signals'
import { syntheticCandidate } from './__fixtures__/syntheticCandidates'
import type { ModelCandidate, ReasonCode, Tier } from './types'
import type { SignalInput } from './signals'

// ── STEP 5: the task routing matrix ──────────────────────────────────────────
//
// The whole policy, stated once as a table, against a realistic three-tier
// fleet. This is the artefact that answers "what would actually happen" for
// every task class — and the one that would go red if someone quietly turned
// the policy back into `if planning → premium`.
//
// It runs on SYNTHETIC providers on purpose: the real fleet has one model, so
// against it every row would collapse to ONLY_ELIGIBLE and prove nothing.

const cost = (i: number, o: number) => ({ inputPerMTok: i, outputPerMTok: o, cacheReadPerMTok: null, cacheWritePerMTok: null })

const CHEAP = syntheticCandidate({
  providerId: 'deepseek', modelId: 'fleet-cheap', tier: 'cheap',
  reasoning: 'basic', latencyClass: 'fast', vision: false, cost: cost(0.10, 0.40),
})
const MEDIUM = syntheticCandidate({
  providerId: 'gemini', modelId: 'fleet-medium', tier: 'medium',
  reasoning: 'standard', latencyClass: 'standard', cost: cost(0.60, 2.00),
})
const PREMIUM = syntheticCandidate({
  providerId: 'claude', modelId: 'fleet-premium', tier: 'premium',
  reasoning: 'advanced', latencyClass: 'standard', cost: cost(3.00, 15.00),
})
const FLEET: readonly ModelCandidate[] = [CHEAP, MEDIUM, PREMIUM]

interface Row {
  name: string
  input: SignalInput
  floor: 'basic' | 'standard' | 'advanced'
  eligible: string[]
  winner: string
  tier: Tier
  reason: ReasonCode
  fallback: string[]
}

const MATRIX: readonly Row[] = [
  {
    name: 'A conversational · low · routine',
    input: { method: 'stream', hasTools: false, approxInputTokens: 400, maxTokens: 300 },
    floor: 'basic', eligible: ['fleet-cheap', 'fleet-medium', 'fleet-premium'],
    winner: 'fleet-cheap', tier: 'cheap', reason: 'CHEAPEST_ELIGIBLE', fallback: ['gemini'],
  },
  {
    name: 'B tool_dialogue · medium · routine',
    input: { method: 'stream', hasTools: true, approxInputTokens: 8000, maxTokens: 3072 },
    floor: 'standard', eligible: ['fleet-medium', 'fleet-premium'],
    winner: 'fleet-medium', tier: 'medium', reason: 'CHEAPEST_ELIGIBLE', fallback: ['claude'],
  },
  {
    name: 'C planning · high · routine',
    input: { method: 'stream', hasTools: true, approxInputTokens: 8000, maxTokens: 4096, hints: { task: 'planning' } },
    floor: 'advanced', eligible: ['fleet-premium'],
    winner: 'fleet-premium', tier: 'premium', reason: 'PREMIUM_REASONING_REQUIRED', fallback: [],
  },
  {
    name: 'D extraction · low · routine',
    input: { method: 'generate', hasTools: false, approxInputTokens: 800, maxTokens: 500, hints: { task: 'extraction' } },
    floor: 'basic', eligible: ['fleet-cheap', 'fleet-medium', 'fleet-premium'],
    winner: 'fleet-cheap', tier: 'cheap', reason: 'CHEAPEST_ELIGIBLE', fallback: ['gemini'],
  },
  {
    name: 'E short_generation · low · routine',
    input: { method: 'generate', hasTools: false, approxInputTokens: 350, maxTokens: 150 },
    floor: 'basic', eligible: ['fleet-cheap', 'fleet-medium', 'fleet-premium'],
    winner: 'fleet-cheap', tier: 'cheap', reason: 'CHEAPEST_ELIGIBLE', fallback: ['gemini'],
  },
  {
    name: 'F vision · medium · routine',
    input: { method: 'vision', hasTools: false, approxInputTokens: 200, maxTokens: 512 },
    floor: 'standard', eligible: ['fleet-medium', 'fleet-premium'],
    winner: 'fleet-medium', tier: 'medium', reason: 'CHEAPEST_ELIGIBLE', fallback: ['claude'],
  },
  {
    name: 'G conversational · low · ELEVATED risk',
    input: { method: 'stream', hasTools: false, approxInputTokens: 400, maxTokens: 300, hints: { risk: 'elevated' } },
    floor: 'standard', eligible: ['fleet-medium', 'fleet-premium'],
    winner: 'fleet-medium', tier: 'medium', reason: 'ELEVATED_RISK_FLOOR', fallback: ['claude'],
  },
  {
    name: 'H chat image turn · vision required via hint',
    input: { method: 'stream', hasTools: true, approxInputTokens: 5000, maxTokens: 1024, hints: { needsVision: true } },
    floor: 'standard', eligible: ['fleet-medium', 'fleet-premium'],
    winner: 'fleet-medium', tier: 'medium', reason: 'CHEAPEST_ELIGIBLE', fallback: ['claude'],
  },
]

describe.each(MATRIX.map(r => [r.name, r] as const))('%s', (_name, row) => {
  const signals = deriveSignals(row.input)
  const outcome = route(signals, FLEET)
  if (!outcome.ok) throw new Error(`${row.name}: expected a decision, got ${outcome.reasonCode}`)
  const d = outcome.decision

  it('applies the expected quality floor', () => {
    expect(requiredReasoning(signals.complexity, signals.risk)).toBe(row.floor)
  })

  it('narrows to the expected eligible set', () => {
    expect(d.eligibleCount).toBe(row.eligible.length)
  })

  it('selects the cheapest eligible model', () => {
    expect(d.modelId).toBe(row.winner)
    expect(d.tier).toBe(row.tier)
  })

  it('explains itself with the expected reason code', () => {
    expect(d.reasonCode).toBe(row.reason)
  })

  it('offers the expected bounded fallback', () => {
    expect(d.fallbackPolicy.chain).toEqual(row.fallback)
    expect(d.fallbackPolicy.chain.length).toBeLessThanOrEqual(1)
  })
})

// ── The two rules the Owner called out by name ───────────────────────────────

describe('planning is NOT automatically the premium vendor', () => {
  it('drops to medium the moment a medium model clears the floor', () => {
    // Same planning task; the only change is that the mid-tier model can reason
    // at `advanced`. If planning were hard-wired to premium this would not move.
    const strongerMedium = { ...MEDIUM, reasoning: 'advanced' as const }
    const signals = deriveSignals({ method: 'stream', hasTools: true, approxInputTokens: 8000, maxTokens: 4096, hints: { task: 'planning' } })
    const r = route(signals, [CHEAP, strongerMedium, PREMIUM])
    expect(r.ok && r.decision.modelId).toBe('fleet-medium')
    expect(r.ok && r.decision.tier).toBe('medium')
  })

  it('reaches premium only because nothing cheaper meets the floor', () => {
    const signals = deriveSignals({ method: 'stream', hasTools: true, approxInputTokens: 8000, hints: { task: 'planning' } })
    const r = route(signals, FLEET)
    expect(r.ok && r.decision.reasonCode).toBe('PREMIUM_REASONING_REQUIRED')
    expect(r.ok && r.decision.eligibleCount).toBe(1)
  })
})

describe('simple work never reaches the premium vendor when something cheaper qualifies', () => {
  it.each(['extraction', 'short_generation', 'conversational'] as const)('%s stays on the cheap tier', (task) => {
    const r = route(deriveSignals({ method: 'generate', hasTools: false, approxInputTokens: 500, hints: { task } }), FLEET)
    expect(r.ok && r.decision.tier).toBe('cheap')
    expect(r.ok && r.decision.providerId).not.toBe('claude')
  })
})
