import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Provider registry (P0) ───────────────────────────────────────────────────
//
// The registry used to memoise ONE provider for the lifetime of the process:
//
//   let provider: AIProvider | null = null
//   if (provider) return provider          // ← whoever asked first won forever
//
// That is correct while exactly one provider exists and structurally fatal the
// moment a second one does: the second caller silently receives the FIRST
// caller's provider. No error, no log — a request routed to Gemini would be
// served by Claude, and the telemetry would agree with the lie.
//
// P0 replaces it with a per-id lazy cache. Behaviour with only Claude
// registered is unchanged: one instance, created on first use, reused after.
//
// These tests re-import the module per case (vi.resetModules) because the cache
// is module state — testing it any other way tests the previous test's leftovers.

const ORIGINAL_ENV = { ...process.env }

async function freshRegistry() {
  vi.resetModules()
  return import('./registry')
}

beforeEach(() => {
  vi.resetModules()
  delete process.env.LLM_PROVIDER
  delete process.env.LLM_FAST_MODEL
  delete process.env.LLM_SMART_MODEL
  delete process.env.LLM_PLANNING_MODEL
  delete process.env.LLM_VISION_MODEL
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('default provider selection', () => {
  it('defaults to claude when LLM_PROVIDER is unset', async () => {
    const { getProvider } = await freshRegistry()
    expect(getProvider().id).toBe('claude')
  })

  it('honours LLM_PROVIDER', async () => {
    process.env.LLM_PROVIDER = 'claude'
    const { getProvider } = await freshRegistry()
    expect(getProvider().id).toBe('claude')
  })

  it('is case-insensitive, as before', async () => {
    process.env.LLM_PROVIDER = 'CLAUDE'
    const { getProvider } = await freshRegistry()
    expect(getProvider().id).toBe('claude')
  })
})

describe('per-id caching', () => {
  it('returns one stable instance for repeated calls (no re-construction)', async () => {
    const { getProvider } = await freshRegistry()
    expect(getProvider()).toBe(getProvider())
  })

  it('resolves the default and its explicit id to the SAME instance', async () => {
    const { getProvider } = await freshRegistry()
    expect(getProvider('claude')).toBe(getProvider())
  })

  it('gives a fresh cache after a module reset (no cross-test leakage)', async () => {
    const a = (await freshRegistry()).getProvider()
    const b = (await freshRegistry()).getProvider()
    expect(a).not.toBe(b)
    expect(a.id).toBe(b.id)
  })
})

describe('an id is never served by a different provider', () => {
  // The defect the singleton had. Asking for a provider that has no adapter
  // must FAIL LOUDLY — never silently hand back whichever one was built first.
  it.each(['openai', 'gemini', 'grok', 'deepseek'] as const)(
    'throws for the recognized-but-uninstalled %s, even after claude was built',
    async (id) => {
      const { getProvider } = await freshRegistry()
      expect(getProvider().id).toBe('claude')   // warm the cache first
      expect(() => getProvider(id)).toThrow(/no adapter installed/i)
    },
  )

  it('names the missing adapter and where to put it', async () => {
    const { getProvider } = await freshRegistry()
    expect(() => getProvider('gemini')).toThrow(/providers\/gemini\.ts/)
  })

  it('rejects an unknown id with the supported list', async () => {
    const { getProvider } = await freshRegistry()
    expect(() => getProvider('llama' as never)).toThrow(/unknown/i)
    expect(() => getProvider('llama' as never)).toThrow(/claude/)
  })

  it('rejects an unknown default from LLM_PROVIDER', async () => {
    process.env.LLM_PROVIDER = 'not-a-provider'
    const { getProvider } = await freshRegistry()
    expect(() => getProvider()).toThrow(/unknown/i)
  })
})

describe('laziness', () => {
  it('constructs nothing at import time', async () => {
    process.env.LLM_PROVIDER = 'not-a-provider'
    // An invalid default must not blow up on import — only on use. Anything
    // eager here would take the whole app down at boot over a typo.
    await expect(freshRegistry()).resolves.toBeDefined()
  })

  it('does not construct a provider that was never asked for', async () => {
    const { getProvider, registeredProviderIds } = await freshRegistry()
    expect(registeredProviderIds()).toEqual([])
    getProvider('claude')
    expect(registeredProviderIds()).toEqual(['claude'])
  })
})

describe('per-role model overrides still come from env', () => {
  it('applies LLM_FAST_MODEL to the fast role only', async () => {
    process.env.LLM_FAST_MODEL = 'override-fast-1'
    const { getProvider } = await freshRegistry()
    const p = getProvider()
    expect(p.model('fast').modelId).toBe('override-fast-1')
    expect(p.model('smart').modelId).not.toBe('override-fast-1')
  })

  it('falls planning back to LLM_SMART_MODEL, as before', async () => {
    process.env.LLM_SMART_MODEL = 'override-smart-1'
    const { getProvider } = await freshRegistry()
    expect(getProvider().model('planning').modelId).toBe('override-smart-1')
  })

  it('prefers an explicit LLM_PLANNING_MODEL over the smart fallback', async () => {
    process.env.LLM_SMART_MODEL = 'override-smart-1'
    process.env.LLM_PLANNING_MODEL = 'override-planning-1'
    const { getProvider } = await freshRegistry()
    expect(getProvider().model('planning').modelId).toBe('override-planning-1')
  })
})
