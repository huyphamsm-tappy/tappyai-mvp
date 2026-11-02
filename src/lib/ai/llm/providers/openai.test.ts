import { describe, it, expect } from 'vitest'
import { effortForCall, lunaCallOptions, openaiCallCost, reasoningEffortFor } from './openai'

describe('Luna adapter (PHIÊN LUNA 30/09)', () => {
  it('a call with function tools goes at none (the API refuses tools with any other effort); a tool-less call keeps the role effort', () => {
    expect(effortForCall('medium', { mode: { type: 'regular', tools: [{ name: 'search_places' }] } })).toBe('none')
    expect(effortForCall('medium', { mode: { type: 'regular', tools: [] } })).toBe('medium')
    expect(effortForCall('high', { mode: { type: 'regular' } })).toBe('high')
    expect(effortForCall('medium', { mode: { type: 'object-json' } })).toBe('medium')
  })

  it('always sends an explicit effort; unset or unknown → none (never the vendor default medium)', () => {
    expect(reasoningEffortFor('consult', {})).toBe('none')
    expect(reasoningEffortFor('consult', { LLM_CONSULT_REASONING: 'low' })).toBe('low')
    expect(reasoningEffortFor('intent', { LLM_INTENT_REASONING: 'LOW ' })).toBe('low')
    expect(reasoningEffortFor('consult', { LLM_CONSULT_REASONING: 'turbo' })).toBe('none')
  })

  it('reshapes the call for a reasoning model: max_completion_tokens, no sampling settings, explicit effort', () => {
    const o = lunaCallOptions({ maxTokens: 600, temperature: 0, topP: 1, providerMetadata: { anthropic: { x: 1 } } as Record<string, Record<string, unknown>> }, 'low')
    expect(o.maxTokens).toBeUndefined()
    expect(o.temperature).toBeUndefined()
    expect(o.topP).toBeUndefined()
    expect(o.providerMetadata?.openai).toEqual({ reasoningEffort: 'low', maxCompletionTokens: 600 })
    expect(o.providerMetadata?.anthropic).toEqual({ x: 1 })
  })

  it('prices a call at list price: cached input at $0.01/M, reasoning tokens inside output at $0.50/M', () => {
    const c = openaiCallCost('gpt-6-luna', { prompt_tokens: 10_000, completion_tokens: 1_000, prompt_tokens_details: { cached_tokens: 4_000 }, completion_tokens_details: { reasoning_tokens: 300 } })!
    // 6000 × 0.10 + 4000 × 0.01 + 1000 × 0.50 = 600 + 40 + 500 = 1140 per 1e6
    expect(c.usd).toBeCloseTo(0.00114, 7)
    expect(c.reasoningTokens).toBe(300)
    expect(c.cachedInputTokens).toBe(4000)
    expect(c.provider).toBe('openai')
  })

  it('prices reported cache-write tokens at $0.125/M when the usage carries them', () => {
    const c = openaiCallCost('gpt-6-luna', { prompt_tokens: 2_000, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 1_000 } })!
    expect(c.usd).toBeCloseTo((1000 * 0.10 + 1000 * 0.125) / 1e6, 9)
  })

  it('an unknown model id is not priced (never a silent $0)', () => {
    expect(openaiCallCost('some-other-model', { prompt_tokens: 1 })).toBeNull()
  })
})
