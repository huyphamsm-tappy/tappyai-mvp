import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClaudeProvider } from './claude'
import type { CoreMessage } from 'ai'

// ── Claude adapter (P0) ──────────────────────────────────────────────────────
// This file lives INSIDE the vendor zone, so it is the one test allowed to name
// Anthropic, model ids, and cache_control. See ../architecture.test.ts.

const ORIGINAL_ENV = { ...process.env }
afterEach(() => { process.env = { ...ORIGINAL_ENV } })

const PINNED = 'claude-haiku-4-5-20251001'

describe('model resolution', () => {
  const p = createClaudeProvider({})

  // The `fast` role used to resolve to the FLOATING alias 'claude-haiku-4-5'
  // while the other three used the pinned snapshot. Two id strings for what is
  // meant to be one model is two problems: the alias can move under us without
  // a deploy, and a prompt cache is keyed per model — so `fast` and `smart`
  // could not share a cached prefix even when the bytes were identical.
  it.each(['fast', 'smart', 'planning', 'vision'] as const)(
    'pins %s to the dated snapshot',
    (role) => {
      expect(p.model(role).modelId).toBe(PINNED)
    },
  )

  it('resolves every role to one id, so one cache lineage is possible', () => {
    const ids = new Set((['fast', 'smart', 'planning', 'vision'] as const).map(r => p.model(r).modelId))
    expect(ids.size).toBe(1)
  })

  it('lets an override win per role', () => {
    const o = createClaudeProvider({ fast: 'custom-fast-1' })
    expect(o.model('fast').modelId).toBe('custom-fast-1')
    expect(o.model('smart').modelId).toBe(PINNED)
  })

  it('falls back to the default when an override is undefined', () => {
    const o = createClaudeProvider({ fast: undefined })
    expect(o.model('fast').modelId).toBe(PINNED)
  })
})

describe('identity and configuration', () => {
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY })

  it('reports its id', () => {
    expect(createClaudeProvider({}).id).toBe('claude')
  })

  it('is unconfigured without a key and configured with one', () => {
    expect(createClaudeProvider({}).isConfigured()).toBe(false)
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    expect(createClaudeProvider({}).isConfigured()).toBe(true)
  })

  it('does not need a key to construct (resolution is lazy)', () => {
    expect(() => createClaudeProvider({}).model('smart')).not.toThrow()
  })
})

describe('usageMetrics — the provider-neutral cache-counter boundary', () => {
  const p = createClaudeProvider({})

  it('reads both counters from a step', () => {
    const step = { providerMetadata: { anthropic: { cacheReadInputTokens: 11056, cacheCreationInputTokens: 0 } } }
    expect(p.usageMetrics(step)).toEqual({ cacheReadTokens: 11056, cacheCreationTokens: 0 })
  })

  // The distinction the chat route's telemetry depends on: null means "this
  // provider reported nothing", 0 means "it reported zero". Collapsing them
  // makes "caching is off" indistinguishable from "caching missed", which is
  // exactly the question the cost work exists to answer.
  it('reports 0 as 0, not as absent', () => {
    const step = { providerMetadata: { anthropic: { cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } } }
    expect(p.usageMetrics(step)).toEqual({ cacheReadTokens: 0, cacheCreationTokens: 0 })
  })

  it('reports absent metadata as null, not 0', () => {
    expect(p.usageMetrics({})).toEqual({ cacheReadTokens: null, cacheCreationTokens: null })
    expect(p.usageMetrics({ providerMetadata: {} })).toEqual({ cacheReadTokens: null, cacheCreationTokens: null })
  })

  it('reports a partially populated step per-counter', () => {
    const step = { providerMetadata: { anthropic: { cacheReadInputTokens: 42 } } }
    expect(p.usageMetrics(step)).toEqual({ cacheReadTokens: 42, cacheCreationTokens: null })
  })

  it('treats a non-numeric or null counter as absent', () => {
    const step = { providerMetadata: { anthropic: { cacheReadInputTokens: null, cacheCreationInputTokens: 'many' } } }
    expect(p.usageMetrics(step)).toEqual({ cacheReadTokens: null, cacheCreationTokens: null })
  })

  it('survives junk without throwing — telemetry must never break a reply', () => {
    for (const junk of [undefined, null, 0, 'step', [], { providerMetadata: null }]) {
      expect(() => p.usageMetrics(junk)).not.toThrow()
      expect(p.usageMetrics(junk)).toEqual({ cacheReadTokens: null, cacheCreationTokens: null })
    }
  })
})

describe('decorateMessages — prompt-cache breakpoint (unchanged by P0)', () => {
  const p = createClaudeProvider({})
  const cc = { anthropic: { cacheControl: { type: 'ephemeral' } } }

  it('marks the FIRST system message only, so the breakpoint lands between the two segments', () => {
    const msgs: CoreMessage[] = [
      { role: 'system', content: 'SHARED' },
      { role: 'system', content: 'DYNAMIC' },
      { role: 'user', content: 'hi' },
    ]
    const out = p.decorateMessages!(msgs) as Array<CoreMessage & { providerOptions?: unknown }>
    expect(out[0].providerOptions).toEqual(cc)
    expect(out[1].providerOptions).toBeUndefined()
    expect(out[2].providerOptions).toBeUndefined()
  })

  it('marks a lone system message', () => {
    const out = p.decorateMessages!([{ role: 'system', content: 'ONLY' }]) as Array<CoreMessage & { providerOptions?: unknown }>
    expect(out[0].providerOptions).toEqual(cc)
  })

  it('changes nothing when there is no system message', () => {
    const msgs: CoreMessage[] = [{ role: 'user', content: 'hi' }]
    expect(p.decorateMessages!(msgs)).toEqual(msgs)
  })

  it('preserves order, content and count', () => {
    const msgs: CoreMessage[] = [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ]
    const out = p.decorateMessages!(msgs)
    expect(out).toHaveLength(4)
    expect(out.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(out.map(m => m.content)).toEqual(['S', 'u1', 'a1', 'u2'])
  })

  it('does not mutate the caller\'s array', () => {
    const msgs: CoreMessage[] = [{ role: 'system', content: 'S' }]
    p.decorateMessages!(msgs)
    expect(msgs[0]).not.toHaveProperty('providerOptions')
  })

  it('is idempotent in effect — a second pass still marks exactly one message', () => {
    const msgs: CoreMessage[] = [
      { role: 'system', content: 'SHARED' },
      { role: 'system', content: 'DYNAMIC' },
    ]
    const twice = p.decorateMessages!(p.decorateMessages!(msgs)) as Array<CoreMessage & { providerOptions?: unknown }>
    expect(twice.filter(m => m.providerOptions !== undefined)).toHaveLength(1)
    expect(twice[0].providerOptions).toEqual(cc)
  })
})
