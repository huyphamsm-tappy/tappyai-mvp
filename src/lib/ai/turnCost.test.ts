import { describe, it, expect } from 'vitest'
import { turnUsd } from './turnCost'
import { claudeCallCost, HAIKU55_MODEL_ID, SONNET55_MODEL_ID } from './llm/providers/claude'

// H3 (owner 20/11/2026): ONE price table for Claude. `turnUsd` (the per-turn log and ledger figure) used to carry its own generic table (haiku 1/5, sonnet 3/15) that disagreed with the
// real list prices in providers/claude.ts (Haiku 5.5 0.10/0.50, Sonnet 5.5 2/10): a turn logged without a model was priced 10x too high. It now reads the same rows.
describe('turnUsd reads the Claude price rows of providers/claude.ts', () => {
  it('Haiku 5.5: 0.10 in, 0.50 out per million; a turn with no model named is priced as Haiku 5.5', () => {
    // 100.000 prompt tokens is still the low card: 100.000 x 0.10 + 1.000.000 x 0.50 per million = 0.01 + 0.50
    expect(turnUsd({ promptTokens: 100_000, completionTokens: 1_000_000, model: HAIKU55_MODEL_ID })).toBeCloseTo(0.51, 6)
    expect(turnUsd({ promptTokens: 100_000, completionTokens: 1_000_000 })).toBeCloseTo(0.51, 6)
    expect(turnUsd({ promptTokens: 100_000, completionTokens: 1_000_000, model: 'haiku' })).toBeCloseTo(0.51, 6)
  })
  it('Sonnet 5.5: 2 in, 10 out, cache read 0.10, cache write 2.50 per million', () => {
    expect(turnUsd({ promptTokens: 1_000_000, completionTokens: 1_000_000, model: SONNET55_MODEL_ID })).toBeCloseTo(12, 6)
    expect(turnUsd({ promptTokens: 0, completionTokens: 0, cacheReadTokens: 1_000_000, model: 'sonnet' })).toBeCloseTo(0.1, 6)
    expect(turnUsd({ promptTokens: 0, completionTokens: 0, cacheCreationTokens: 1_000_000, model: 'sonnet' })).toBeCloseTo(2.5, 6)
  })
  it('Haiku 5.5 above 100.000 prompt tokens uses its dearer card (0.50 in)', () => {
    expect(turnUsd({ promptTokens: 200_000, completionTokens: 0, model: HAIKU55_MODEL_ID })).toBeCloseTo(0.1, 6)
  })
  it('equals claudeCallCost for the same usage, for both models and a spread of usages (one table, not two that drift)', () => {
    for (const model of [HAIKU55_MODEL_ID, SONNET55_MODEL_ID]) {
      for (const u of [{ input: 5_000, cacheRead: 0, cacheWrite: 0, output: 900 }, { input: 12_345, cacheRead: 80_000, cacheWrite: 31_000, output: 2_222 }, { input: 150_000, cacheRead: 0, cacheWrite: 0, output: 10 }]) {
        const want = claudeCallCost(model, u)!.usd
        const got = turnUsd({ promptTokens: u.input, completionTokens: u.output, cacheReadTokens: u.cacheRead, cacheCreationTokens: u.cacheWrite, model })
        expect(Math.abs(got - want)).toBeLessThanOrEqual(2e-6)
      }
    }
  })
  it('Serper credits are added at the configured price, and Opus keeps its own legacy row (no Opus price row exists in claude.ts)', () => {
    expect(turnUsd({ promptTokens: 0, completionTokens: 0, serperCredits: 10 }, { SERPER_USD_PER_CREDIT: '0.002' })).toBeCloseTo(0.02, 6)
    expect(turnUsd({ promptTokens: 1_000_000, completionTokens: 1_000_000, model: 'opus' })).toBeCloseTo(90, 6)
  })
})
