import { describe, it, expect } from 'vitest'
import { getModelCandidates } from './modelRegistry'
import { getProvider } from '../registry'
import { SUPPORTED_PROVIDER_IDS } from '../registry'
import type { ProviderId } from '../types'
import type { TaskClass } from './types'

// ── Capability registry (P1) ─────────────────────────────────────────────────
// The registry AGGREGATES capability metadata that each adapter owns. Model ids
// and vendor facts stay inside providers/ (T9); the registry adds only runtime
// availability. Nothing here decides anything — deciding is the router's job.

const ALL_TASKS: readonly TaskClass[] = [
  'conversational', 'tool_dialogue', 'planning', 'extraction', 'short_generation', 'vision',
]

describe('aggregation', () => {
  it('collects entries from every installed adapter', () => {
    expect(getModelCandidates().length).toBeGreaterThan(0)
  })

  it('a provider with no adapter installed contributes nothing and does NOT throw', () => {
    for (const id of ['openai', 'gemini', 'grok', 'deepseek'] as ProviderId[]) {
      expect(() => getModelCandidates([id])).not.toThrow()
      expect(getModelCandidates([id])).toEqual([])
    }
  })

  it('an unknown provider id is ignored rather than crashing the fleet', () => {
    expect(() => getModelCandidates(['not-a-provider' as ProviderId])).not.toThrow()
    expect(getModelCandidates(['not-a-provider' as ProviderId])).toEqual([])
  })

  it('covers every supported provider id without throwing', () => {
    expect(() => getModelCandidates(SUPPORTED_PROVIDER_IDS)).not.toThrow()
  })

  it('returns a fresh array each call — callers must not be able to poison it', () => {
    const a = getModelCandidates()
    const b = getModelCandidates()
    expect(a).not.toBe(b)
    a.length = 0
    expect(getModelCandidates().length).toBeGreaterThan(0)
  })
})

describe('availability reflects the adapter, not a guess', () => {
  it('marks each candidate available iff its provider reports configured', () => {
    for (const c of getModelCandidates()) {
      expect(c.available).toBe(getProvider(c.providerId).isConfigured())
    }
  })
})

describe('every registered entry carries real, non-invented metadata', () => {
  const entries = getModelCandidates()

  it('has a positive published input and output rate', () => {
    for (const c of entries) {
      expect(c.cost.inputPerMTok, `${c.modelId} input rate`).toBeGreaterThan(0)
      expect(c.cost.outputPerMTok, `${c.modelId} output rate`).toBeGreaterThan(0)
    }
  })

  it('declares a context window and output ceiling', () => {
    for (const c of entries) {
      expect(c.contextWindow).toBeGreaterThan(0)
      expect(c.maxOutputTokens).toBeGreaterThan(0)
    }
  })

  it('declares at least one supported task class, all from the closed set', () => {
    for (const c of entries) {
      expect(c.supportedTaskClasses.length).toBeGreaterThan(0)
      for (const t of c.supportedTaskClasses) expect(ALL_TASKS).toContain(t)
    }
  })

  it('states cache support explicitly, with a minimum when supported', () => {
    for (const c of entries) {
      if (c.promptCache.supported) {
        expect(c.promptCache.minCacheableTokens, `${c.modelId} must state its minimum`).toBeGreaterThan(0)
        expect(c.cost.cacheReadPerMTok).toBeGreaterThan(0)
        expect(c.cost.cacheWritePerMTok).toBeGreaterThan(0)
      } else {
        expect(c.promptCache.minCacheableTokens).toBeNull()
      }
    }
  })

  it('never claims multi-system-message support it has not measured', () => {
    for (const c of entries) {
      expect(['verified', 'unverified', 'unsupported']).toContain(c.multiSystemMessages)
    }
  })

  it('has a unique providerId+modelId key', () => {
    const keys = entries.map(c => `${c.providerId}::${c.modelId}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('the registry agrees with the adapter it describes', () => {
  // If a model id is changed in the adapter but not here, routing telemetry
  // would attribute cost and cache lineage to a model that never ran.
  it('every registered modelId is one the adapter actually resolves', () => {
    for (const c of getModelCandidates()) {
      const provider = getProvider(c.providerId)
      const resolved = (['fast', 'smart', 'planning', 'vision'] as const).map(r => provider.model(r).modelId)
      expect(resolved, `${c.modelId} is registered but no role resolves to it`).toContain(c.modelId)
    }
  })

  it('every model the adapter can resolve is described by a registry entry', () => {
    for (const id of SUPPORTED_PROVIDER_IDS) {
      let provider
      try { provider = getProvider(id) } catch { continue }
      const registered = new Set(getModelCandidates([id]).map(c => c.modelId))
      for (const role of ['fast', 'smart', 'planning', 'vision'] as const) {
        expect(registered, `${id}/${role} resolves to an unregistered model`).toContain(provider.model(role).modelId)
      }
    }
  })
})

describe('the registry holds no routing logic', () => {
  it('exposes data only — no decision function', () => {
    const mod = getModelCandidates()
    for (const c of mod) {
      expect(typeof c).toBe('object')
      for (const v of Object.values(c)) expect(typeof v).not.toBe('function')
    }
  })
})
