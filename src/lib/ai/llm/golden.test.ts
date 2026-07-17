import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { describe, it, expect } from 'vitest'
import { getProvider, getProviderById } from './registry'
import { resolveModel } from './router'
import { resolveProviderId } from './policy'
import { validateAIConfig, ConfigValidationError, assertNoDuplicates } from './configValidation'
import {
  ALL_CAPABILITY_KEYS,
  assertCapabilities,
  hasCapabilities,
  UnsupportedCapabilityError,
  type ProviderCapabilities,
} from './capabilities'
import { KNOWN_PROVIDER_IDS } from './config'
import { calculateCost } from './costCalculator'
import { PRICING_CATALOG, PRICING_CATALOG_VERSION, findPricing } from './pricingCatalog'
import { CAPABILITY_COST_POLICY } from './capabilityCostPolicy'
import { BUDGET_TIERS } from './budgetTiers'
import type { ModelRole } from './types'

const moduleSource = (relPath: string): string => readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8')

// Strips comments before a source-text architecture check runs, so a doc
// comment ILLUSTRATING a forbidden pattern (e.g. "never write
// `if (provider === 'claude')`") isn't mistaken for the pattern itself.
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

// ── Golden regression suite — the AI platform's "no behavior change" proof ──
// Runs fully offline: constructing a LanguageModelV1 wrapper never calls the
// network; only an actual generate/stream/vision call would.

const ROLES: ModelRole[] = ['fast', 'smart', 'planning', 'vision']

describe('AI Router — resolves identically to the pre-Router direct path', () => {
  it('resolves the same model id as getProvider().model(role), for every role', () => {
    for (const role of ROLES) {
      expect(resolveModel(role).model.modelId).toBe(getProvider().model(role).modelId)
    }
  })

  it('resolves the same provider id as getProvider(), for every role', () => {
    for (const role of ROLES) {
      expect(resolveModel(role).provider.id).toBe(getProvider().id)
    }
  })

  it('requiring every declared capability still resolves (Claude declares all true)', () => {
    for (const role of ROLES) {
      const { provider, model } = resolveModel(role, ALL_CAPABILITY_KEYS)
      expect(provider.id).toBe(getProvider().id)
      expect(model.modelId).toBe(getProvider().model(role).modelId)
    }
  })

  it('requiring each individual capability, one at a time, resolves correctly for every role', () => {
    for (const role of ROLES) {
      for (const cap of ALL_CAPABILITY_KEYS) {
        expect(() => resolveModel(role, [cap])).not.toThrow()
      }
    }
  })

  it('with no per-role env override, the Policy names exactly the global default — no candidate list', () => {
    for (const role of ROLES) {
      expect(resolveProviderId(role)).toBe(getProvider().id)
    }
  })

  it('providerId() and isConfigured() are unchanged (still the plain active provider, not role-scoped)', () => {
    expect(getProvider().id).toBe('claude')
    expect(getProvider().isConfigured()).toBe(!!process.env.ANTHROPIC_API_KEY)
  })
})

describe('AI Router purity (Step 1)', () => {
  it('is a plain synchronous function with no hidden async/retry behavior', () => {
    // resolveModel must return synchronously (no Promise) — a Router that
    // retried or fell back across a network call would need to be async.
    const result = resolveModel('fast')
    expect(result).not.toBeInstanceOf(Promise)
  })

  it('reads no environment variables of its own — same result across repeated calls with unrelated env noise', () => {
    process.env.SOME_UNRELATED_VAR = 'noise'
    const before = resolveModel('fast').model.modelId
    delete process.env.SOME_UNRELATED_VAR
    const after = resolveModel('fast').model.modelId
    expect(after).toBe(before)
  })
})

describe('Capability Registry — unsupported capability throws, never downgrades (Step 2)', () => {
  const fakeCaps = (overrides: Partial<ProviderCapabilities> = {}): ProviderCapabilities => ({
    streaming: true, tools: true, forcedToolChoice: true, vision: true, jsonMode: true, promptCaching: true,
    ...overrides,
  })

  it('assertCapabilities throws UnsupportedCapabilityError listing every missing capability', () => {
    const caps = fakeCaps({ vision: false, tools: false })
    try {
      assertCapabilities('fake-provider', 'planning', caps, ['vision', 'tools', 'streaming'])
      expect.unreachable('expected assertCapabilities to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedCapabilityError)
      const err = e as UnsupportedCapabilityError
      expect(err.providerId).toBe('fake-provider')
      expect(err.role).toBe('planning')
      expect(err.missing).toEqual(['vision', 'tools'])
    }
  })

  it('assertCapabilities does not throw when every required capability is present', () => {
    expect(() => assertCapabilities('fake-provider', 'fast', fakeCaps(), ['streaming', 'vision'])).not.toThrow()
  })

  it('hasCapabilities is a non-throwing predicate matching assertCapabilities', () => {
    const caps = fakeCaps({ jsonMode: false })
    expect(hasCapabilities(caps, ['jsonMode'])).toBe(false)
    expect(hasCapabilities(caps, ['streaming'])).toBe(true)
  })

  it('the real Claude adapter declares every capability the 14 audited call sites need', () => {
    const caps = getProvider().capabilities
    // streaming + tools + forcedToolChoice: chat route's AI.stream (maxSteps, prepareStep, tools)
    // vision: scan (OCR) + contentProcessor thumbnail enrichment
    // jsonMode: viet-content / memoryService / contentProcessor all prompt for JSON replies
    // promptCaching: chat route's large system prompt via decorateMessages
    for (const cap of ALL_CAPABILITY_KEYS) expect(caps[cap]).toBe(true)
  })

  it('ALL_CAPABILITY_KEYS stays in sync with the real adapter\'s declared keys (catches drift)', () => {
    const declaredKeys = Object.keys(getProvider().capabilities).sort()
    expect(declaredKeys).toEqual([...ALL_CAPABILITY_KEYS].sort())
  })
})

describe('Config Validation fails correctly (Step 3)', () => {
  it('the real, unmodified production config is valid (no production routing changes)', () => {
    // Under `vitest run`, NODE_ENV=test, and @next/env's loadEnvConfig
    // deliberately excludes .env.local for NODE_ENV=test (the same dotenv/
    // Next.js convention Jest follows: personal dev secrets shouldn't leak
    // into test runs). ANTHROPIC_API_KEY lives only in .env.local, so it is
    // genuinely absent here — this is a test-environment fact, not a
    // production one (next build / next dev load it fine, confirmed
    // separately). Supply a placeholder ONLY if the real one isn't already
    // present, so this test exercises the actual validation logic (every
    // structural rule: known provider, known per-role overrides, sane model
    // overrides, no duplicates) without depending on secret-loading
    // conventions, and without ever touching/logging a real credential.
    const hadKey = process.env.ANTHROPIC_API_KEY
    if (!hadKey) process.env.ANTHROPIC_API_KEY = 'test-only-placeholder-value'
    try {
      expect(() => validateAIConfig()).not.toThrow()
    } finally {
      if (!hadKey) delete process.env.ANTHROPIC_API_KEY
    }
  })

  it('rejects an unknown LLM_PROVIDER', () => {
    const original = process.env.LLM_PROVIDER
    process.env.LLM_PROVIDER = 'not-a-real-provider'
    try {
      expect(() => validateAIConfig()).toThrow(ConfigValidationError)
      try { validateAIConfig() } catch (e) { expect((e as ConfigValidationError).reason).toBe('unknown_provider') }
    } finally {
      if (original === undefined) delete process.env.LLM_PROVIDER
      else process.env.LLM_PROVIDER = original
    }
  })

  it('rejects an unknown per-role LLM_PROVIDER_<ROLE> override', () => {
    const original = process.env.LLM_PROVIDER_VISION
    process.env.LLM_PROVIDER_VISION = 'not-a-real-provider'
    try {
      expect(() => validateAIConfig()).toThrow(ConfigValidationError)
      try { validateAIConfig() } catch (e) { expect((e as ConfigValidationError).reason).toBe('unknown_provider') }
    } finally {
      if (original === undefined) delete process.env.LLM_PROVIDER_VISION
      else process.env.LLM_PROVIDER_VISION = original
    }
  })

  it('rejects an empty/whitespace-only model override', () => {
    const original = process.env.LLM_FAST_MODEL
    process.env.LLM_FAST_MODEL = '   '
    try {
      expect(() => validateAIConfig()).toThrow(ConfigValidationError)
      try { validateAIConfig() } catch (e) { expect((e as ConfigValidationError).reason).toBe('invalid_model_override') }
    } finally {
      if (original === undefined) delete process.env.LLM_FAST_MODEL
      else process.env.LLM_FAST_MODEL = original
    }
  })

  it('rejects a provider referenced by config but missing credentials', () => {
    const original = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      expect(() => validateAIConfig()).toThrow(ConfigValidationError)
      try { validateAIConfig() } catch (e) { expect((e as ConfigValidationError).reason).toBe('missing_provider') }
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original
    }
  })

  it('assertNoDuplicates throws on a repeated entry and passes on the real config arrays', () => {
    expect(() => assertNoDuplicates(['a', 'b', 'a'], 'test item')).toThrow(ConfigValidationError)
    expect(() => assertNoDuplicates(KNOWN_PROVIDER_IDS, 'provider id')).not.toThrow()
    expect(() => assertNoDuplicates(ALL_CAPABILITY_KEYS, 'capability key')).not.toThrow()
  })

  it('getProviderById throws a clear error for a recognized-but-not-installed provider', () => {
    expect(() => getProviderById('openai')).toThrow(/no adapter installed/)
  })
})

describe('Gemini adapter (Sprint 4 — staging only, no production traffic)', () => {
  it('loads correctly via the Registry', () => {
    const gemini = getProviderById('gemini')
    expect(gemini.id).toBe('gemini')
  })

  it('resolves a model for every role without throwing', () => {
    const gemini = getProviderById('gemini')
    for (const role of ROLES) {
      expect(() => gemini.model(role)).not.toThrow()
      expect(typeof gemini.model(role).modelId).toBe('string')
    }
  })

  it('reports vision support correctly', () => {
    expect(getProviderById('gemini').capabilities.vision).toBe(true)
  })

  it('reports tool support (incl. forced tool choice) correctly', () => {
    const caps = getProviderById('gemini').capabilities
    expect(caps.tools).toBe(true)
    expect(caps.forcedToolChoice).toBe(true)
  })

  it('honestly declares NO prompt-caching support (a real capability gap vs Claude)', () => {
    expect(getProviderById('gemini').capabilities.promptCaching).toBe(false)
  })

  it('isConfigured() reflects GEMINI_API_KEY presence, same pattern as Claude', () => {
    const original = process.env.GEMINI_API_KEY
    try {
      delete process.env.GEMINI_API_KEY
      expect(getProviderById('gemini').isConfigured()).toBe(false)
      process.env.GEMINI_API_KEY = 'test-only-placeholder'
      expect(getProviderById('gemini').isConfigured()).toBe(true)
    } finally {
      if (original === undefined) delete process.env.GEMINI_API_KEY
      else process.env.GEMINI_API_KEY = original
    }
  })

  it('capability validation works: requiring promptCaching from Gemini throws UnsupportedCapabilityError', () => {
    // The first real (non-fake) provider in this codebase that can actually
    // exercise the Capability Registry's throw path — Claude declares every
    // capability true, so Sprint 3's throw test needed a synthetic stub.
    const gemini = getProviderById('gemini')
    expect(() => assertCapabilities(gemini.id, 'smart', gemini.capabilities, ['promptCaching'])).toThrow(UnsupportedCapabilityError)
    // Every other capability it DOES declare still passes.
    expect(() => assertCapabilities(gemini.id, 'smart', gemini.capabilities, ['streaming', 'tools', 'forcedToolChoice', 'vision', 'jsonMode'])).not.toThrow()
  })
})

describe('LLM_PROVIDER_OVERRIDE — staging-only escape hatch (Sprint 4)', () => {
  const withEnv = (vars: Record<string, string | undefined>, fn: () => void) => {
    const originals: Record<string, string | undefined> = {}
    for (const k of Object.keys(vars)) originals[k] = process.env[k]
    try {
      for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
      fn()
    } finally {
      for (const [k, v] of Object.entries(originals)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    }
  }

  it('Router resolves to Gemini for every role when the override is set (non-production)', () => {
    withEnv({ LLM_PROVIDER_OVERRIDE: 'gemini', VERCEL_ENV: undefined, NODE_ENV: 'test' }, () => {
      for (const role of ROLES) {
        expect(resolveProviderId(role)).toBe('gemini')
        expect(resolveModel(role).provider.id).toBe('gemini')
      }
    })
  })

  it('is IGNORED when VERCEL_ENV=production, even if set — Claude stays default', () => {
    withEnv({ LLM_PROVIDER_OVERRIDE: 'gemini', VERCEL_ENV: 'production' }, () => {
      for (const role of ROLES) {
        expect(resolveProviderId(role)).toBe('claude')
        expect(resolveModel(role).provider.id).toBe('claude')
      }
    })
  })

  it('is IGNORED when NODE_ENV=production (no VERCEL_ENV), even if set — Claude stays default', () => {
    withEnv({ LLM_PROVIDER_OVERRIDE: 'gemini', VERCEL_ENV: undefined, NODE_ENV: 'production' }, () => {
      expect(resolveProviderId('fast')).toBe('claude')
    })
  })

  it('Vercel Preview (VERCEL_ENV=preview) is treated as staging, not production — override applies', () => {
    withEnv({ LLM_PROVIDER_OVERRIDE: 'gemini', VERCEL_ENV: 'preview' }, () => {
      expect(resolveProviderId('fast')).toBe('gemini')
    })
  })

  it('with no override set, production routing is completely unchanged — Claude for every role', () => {
    withEnv({ LLM_PROVIDER_OVERRIDE: undefined }, () => {
      for (const role of ROLES) {
        expect(resolveProviderId(role)).toBe('claude')
        expect(resolveModel(role).provider.id).toBe('claude')
        expect(resolveModel(role).model.modelId).toBe(getProvider().model(role).modelId)
      }
    })
  })

  it('config validation catches an unknown LLM_PROVIDER_OVERRIDE value', () => {
    withEnv({ LLM_PROVIDER_OVERRIDE: 'not-a-real-provider' }, () => {
      expect(() => validateAIConfig()).toThrow(ConfigValidationError)
      try { validateAIConfig() } catch (e) { expect((e as ConfigValidationError).reason).toBe('unknown_provider') }
    })
  })

  it('config validation flags Gemini as missing_provider when overridden-to without credentials', () => {
    withEnv({ LLM_PROVIDER_OVERRIDE: 'gemini', GEMINI_API_KEY: undefined }, () => {
      expect(() => validateAIConfig()).toThrow(ConfigValidationError)
      try { validateAIConfig() } catch (e) { expect((e as ConfigValidationError).reason).toBe('missing_provider') }
    })
  })

  it('config validation passes once Gemini is overridden-to WITH credentials', () => {
    withEnv({ LLM_PROVIDER_OVERRIDE: 'gemini', GEMINI_API_KEY: 'test-only-placeholder' }, () => {
      expect(() => validateAIConfig()).not.toThrow()
    })
  })
})

describe('Pricing Catalog (Sprint 5, Step 2)', () => {
  it('loads correctly and contains entries for both Claude models actually in use', () => {
    expect(PRICING_CATALOG.length).toBeGreaterThan(0)
    expect(findPricing('claude', 'claude-haiku-4-5')).toBeDefined()
    expect(findPricing('claude', 'claude-haiku-4-5-20251001')).toBeDefined()
  })

  it('every catalog entry has the full Pricing Contract shape', () => {
    for (const entry of PRICING_CATALOG) {
      expect(entry.provider).toBe('claude')
      expect(typeof entry.model).toBe('string')
      expect(typeof entry.inputTokenPrice).toBe('number')
      expect(typeof entry.outputTokenPrice).toBe('number')
      expect(entry.currency).toBe('USD')
      expect(typeof entry.effectiveDate).toBe('string')
    }
  })

  it('has no entries for Gemini — the "empty placeholder" the brief calls for', () => {
    expect(PRICING_CATALOG.some(p => p.provider === 'gemini')).toBe(false)
  })

  it('PRICING_CATALOG_VERSION is a non-empty string', () => {
    expect(typeof PRICING_CATALOG_VERSION).toBe('string')
    expect(PRICING_CATALOG_VERSION.length).toBeGreaterThan(0)
  })
})

describe('Cost Calculator (Sprint 5, Step 3)', () => {
  it('is deterministic — identical input always yields identical output', () => {
    const input = { provider: 'claude', model: 'claude-haiku-4-5', inputTokens: 1000, outputTokens: 500 }
    const a = calculateCost(input)
    const b = calculateCost({ ...input })
    const c = calculateCost({ ...input })
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('computes a plausible, positive cost for a known Claude model', () => {
    const cost = calculateCost({ provider: 'claude', model: 'claude-haiku-4-5', inputTokens: 1_000_000, outputTokens: 1_000_000 })
    expect(cost).toBeGreaterThan(0)
    // 1M input @ $1/M + 1M output @ $5/M = $6, per the current catalog entry.
    expect(cost).toBe(6)
  })

  it('returns undefined for an unknown MODEL (known provider)', () => {
    expect(calculateCost({ provider: 'claude', model: 'not-a-real-model', inputTokens: 100, outputTokens: 100 })).toBeUndefined()
  })

  it('returns undefined for an unknown PROVIDER (e.g. Gemini — no catalog entry yet)', () => {
    expect(calculateCost({ provider: 'gemini', model: 'gemini-2.5-flash', inputTokens: 100, outputTokens: 100 })).toBeUndefined()
  })

  it('returns undefined for a completely unrecognized provider string, never throws', () => {
    expect(() => calculateCost({ provider: 'not-a-real-provider', model: 'x', inputTokens: 1, outputTokens: 1 })).not.toThrow()
    expect(calculateCost({ provider: 'not-a-real-provider', model: 'x', inputTokens: 1, outputTokens: 1 })).toBeUndefined()
  })

  it('cached tokens are clamped to inputTokens and never produce a negative cost', () => {
    const cost = calculateCost({ provider: 'claude', model: 'claude-haiku-4-5', inputTokens: 100, outputTokens: 0, cachedInputTokens: 999_999 })
    expect(cost).toBeGreaterThanOrEqual(0)
  })

  it('contains no hardcoded provider-specific branching (source-text check, per the Owner Architecture Principle)', () => {
    const src = stripComments(moduleSource('./costCalculator.ts'))
    expect(src).not.toMatch(/===\s*['"]claude['"]/)
    expect(src).not.toMatch(/===\s*['"]gemini['"]/)
    expect(src).not.toMatch(/===\s*['"]openai['"]/)
  })
})

describe('Telemetry cost fields (Sprint 5, Step 4)', () => {
  it('AI.* calls never throw due to cost computation (verified via the exported calculator directly)', () => {
    // ai.ts's costFields() helper is not exported (internal), so this proves
    // the piece it depends on can never be the source of a throw: every
    // input shape it's called with (real usage numbers, or nulls when usage
    // is missing) either returns a number or undefined, never throws.
    expect(() => calculateCost({ provider: 'claude', model: 'claude-haiku-4-5', inputTokens: 0, outputTokens: 0 })).not.toThrow()
    expect(() => calculateCost({ provider: 'unknown', model: 'unknown', inputTokens: 0, outputTokens: 0 })).not.toThrow()
  })
})

describe('Budget Tiers + Capability Cost Policy — metadata only (Sprint 5, Steps 5-6)', () => {
  it('BUDGET_TIERS contains exactly the five documented tiers', () => {
    expect(BUDGET_TIERS).toEqual(['LOW', 'MEDIUM', 'HIGH', 'PREMIUM', 'ENTERPRISE'])
  })

  it('CAPABILITY_COST_POLICY covers every ModelRole with a valid tier', () => {
    const roles: ModelRole[] = ['fast', 'smart', 'planning', 'vision']
    for (const role of roles) {
      expect(BUDGET_TIERS).toContain(CAPABILITY_COST_POLICY[role])
    }
  })
})

describe('Router/Policy ignore the Cost Policy entirely (Sprint 5, Step 8 — the key regression guard)', () => {
  it('router.ts does not import any cost/budget/pricing module (static source check)', () => {
    const src = moduleSource('./router.ts')
    for (const forbidden of ['capabilityCostPolicy', 'budgetTiers', 'costCalculator', 'pricingCatalog', 'CAPABILITY_COST_POLICY', 'BudgetTier']) {
      expect(src).not.toContain(forbidden)
    }
  })

  it('policy.ts does not import any cost/budget/pricing module (static source check)', () => {
    const src = moduleSource('./policy.ts')
    for (const forbidden of ['capabilityCostPolicy', 'budgetTiers', 'costCalculator', 'pricingCatalog', 'CAPABILITY_COST_POLICY', 'BudgetTier']) {
      expect(src).not.toContain(forbidden)
    }
  })

  it('mutating the Cost Policy at runtime has zero effect on resolveModel()\'s output', () => {
    const roles: ModelRole[] = ['fast', 'smart', 'planning', 'vision']
    const before = roles.map(r => resolveModel(r).provider.id)
    const original = { ...CAPABILITY_COST_POLICY }
    try {
      // Deliberately corrupt the policy table to prove nothing reads it.
      CAPABILITY_COST_POLICY.fast = 'ENTERPRISE'
      CAPABILITY_COST_POLICY.vision = 'LOW'
      const after = roles.map(r => resolveModel(r).provider.id)
      expect(after).toEqual(before)
    } finally {
      Object.assign(CAPABILITY_COST_POLICY, original)
    }
  })

  it('production routing remains completely unchanged after this sprint — Claude for every role', () => {
    const roles: ModelRole[] = ['fast', 'smart', 'planning', 'vision']
    for (const role of roles) {
      expect(resolveModel(role).provider.id).toBe('claude')
      expect(resolveModel(role).model.modelId).toBe(getProvider().model(role).modelId)
    }
  })
})
