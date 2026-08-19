import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Capability layer (P0) ────────────────────────────────────────────────────
//
// ai.ts used to resolve the provider TWICE per call: once inside
// buildMessages() to run decorateMessages, and once at the streamText/
// generateText call site to resolve the model. With a process-wide singleton
// those two were guaranteed to be the same object, so nothing broke. Under a
// per-id registry — and later a per-request router — they are not guaranteed,
// and a request could be SHAPED for one vendor and SENT to another: Anthropic
// cache_control markers on a payload bound for Gemini.
//
// The mock below returns a FRESH provider on every getProvider() call, so a
// second resolution is observable instead of theoretical: the decoration tag
// and the model tag stop matching.

const h = vi.hoisted(() => {
  let seq = 0
  const providers: Array<Record<string, unknown>> = []
  const make = () => {
    const instance = ++seq
    const p = {
      id: `test-${instance}`,
      instance,
      isConfigured: vi.fn(() => true),
      model: vi.fn((role: string) => ({ modelId: `model-${role}`, instance })),
      usageMetrics: vi.fn(() => ({ cacheReadTokens: 7, cacheCreationTokens: 11 })),
      capabilities: vi.fn(() => []),
      decorateMessages: vi.fn((msgs: Array<Record<string, unknown>>) =>
        msgs.map(m => ({ ...m, decoratedBy: instance }))),
    }
    providers.push(p)
    return p
  }
  return {
    providers,
    reset: () => { seq = 0; providers.length = 0 },
    getProvider: vi.fn(() => make()),
    generateText: vi.fn(async (opts: Record<string, unknown>) => ({ text: 'ok', opts })),
    streamText: vi.fn((opts: Record<string, unknown>) => ({ opts })),
  }
})

// modelRegistry imports from this same module, so the mock must be faithful to
// its whole surface — a missing export shows up as a swallowed shadow failure,
// not a loud one.
vi.mock('./registry', () => ({
  getProvider: h.getProvider,
  SUPPORTED_PROVIDER_IDS: ['claude'],
  defaultProviderId: () => 'claude',
}))
vi.mock('ai', () => ({ generateText: h.generateText, streamText: h.streamText }))

import { AI } from './ai'

type Call = { model: { modelId: string; instance: number }; messages: Array<Record<string, unknown>> } & Record<string, unknown>
const lastGenerate = () => h.generateText.mock.calls.at(-1)![0] as unknown as Call
const lastStream = () => h.streamText.mock.calls.at(-1)![0] as unknown as Call

beforeEach(() => {
  vi.clearAllMocks()
  h.reset()
})

describe('the provider is resolved exactly once per call', () => {
  it('generate resolves once', async () => {
    await AI.generate({ prompt: 'hi' })
    expect(h.getProvider).toHaveBeenCalledTimes(1)
    expect(h.providers).toHaveLength(1)
  })

  it('stream resolves once', () => {
    AI.stream({ prompt: 'hi' })
    expect(h.getProvider).toHaveBeenCalledTimes(1)
    expect(h.providers).toHaveLength(1)
  })

  it('vision resolves once', async () => {
    await AI.vision({ image: 'data', prompt: 'what is this' })
    expect(h.getProvider).toHaveBeenCalledTimes(1)
    expect(h.providers).toHaveLength(1)
  })
})

describe('one provider shapes AND serves the request', () => {
  it('generate: the decorator and the model are the same instance', async () => {
    await AI.generate({ system: 'S', prompt: 'hi' })
    const { model, messages } = lastGenerate()
    expect(messages.every(m => m.decoratedBy === model.instance)).toBe(true)
  })

  it('stream: the decorator and the model are the same instance', () => {
    AI.stream({ systemShared: 'SH', system: 'S', prompt: 'hi' })
    const { model, messages } = lastStream()
    expect(messages.every(m => m.decoratedBy === model.instance)).toBe(true)
  })

  it('vision: the decorator and the model are the same instance', async () => {
    await AI.vision({ image: 'data', prompt: 'what is this' })
    const { model, messages } = lastGenerate()
    expect(messages.every(m => m.decoratedBy === model.instance)).toBe(true)
  })
})

describe('message assembly is unchanged', () => {
  it('emits systemShared, then system, then history, then prompt', async () => {
    await AI.generate({
      systemShared: 'SHARED',
      system: 'DYNAMIC',
      messages: [{ role: 'user', content: 'earlier' }],
      prompt: 'now',
    })
    expect(lastGenerate().messages.map(m => [m.role, m.content])).toEqual([
      ['system', 'SHARED'],
      ['system', 'DYNAMIC'],
      ['user', 'earlier'],
      ['user', 'now'],
    ])
  })

  it('omits absent segments rather than emitting empties', async () => {
    await AI.generate({ prompt: 'only' })
    expect(lastGenerate().messages).toHaveLength(1)
  })

  it('passes messages through untouched when a provider has no decorator', async () => {
    h.getProvider.mockImplementationOnce(() => ({
      id: 'bare', instance: 99,
      isConfigured: vi.fn(() => true),
      model: vi.fn((role: string) => ({ modelId: `model-${role}`, instance: 99 })),
      usageMetrics: vi.fn(() => ({ cacheReadTokens: null, cacheCreationTokens: null })),
    }) as never)
    await AI.generate({ system: 'S', prompt: 'hi' })
    expect(lastGenerate().messages).toEqual([
      { role: 'system', content: 'S' },
      { role: 'user', content: 'hi' },
    ])
  })
})

describe('role defaults are unchanged', () => {
  it('generate defaults to fast', async () => {
    await AI.generate({ prompt: 'hi' })
    expect(lastGenerate().model.modelId).toBe('model-fast')
  })

  it('stream defaults to smart', () => {
    AI.stream({ prompt: 'hi' })
    expect(lastStream().model.modelId).toBe('model-smart')
  })

  it('vision defaults to vision', async () => {
    await AI.vision({ image: 'd', prompt: 'p' })
    expect(lastGenerate().model.modelId).toBe('model-vision')
  })

  it('an explicit role wins', () => {
    AI.stream({ role: 'planning', prompt: 'hi' })
    expect(lastStream().model.modelId).toBe('model-planning')
  })
})

describe('stream options are forwarded unchanged', () => {
  it('forwards maxTokens, maxSteps, tools, onFinish and abortSignal', () => {
    const onFinish = vi.fn()
    const ac = new AbortController()
    const tools = { a: {} }
    AI.stream({ prompt: 'hi', maxTokens: 3072, maxSteps: 5, tools: tools as never, onFinish: onFinish as never, abortSignal: ac.signal })
    const c = lastStream()
    expect(c.maxTokens).toBe(3072)
    expect(c.maxSteps).toBe(5)
    expect(c.tools).toBe(tools)
    expect(c.onFinish).toBe(onFinish)
    expect(c.abortSignal).toBe(ac.signal)
  })

  it('leaves tools undefined for a no-tool turn', () => {
    AI.stream({ prompt: 'hi', maxSteps: 1 })
    expect(lastStream().tools).toBeUndefined()
  })
})

describe('usageMetrics delegates to the active provider', () => {
  it('returns what the provider reports', () => {
    expect(AI.usageMetrics({ any: 'step' })).toEqual({ cacheReadTokens: 7, cacheCreationTokens: 11 })
  })

  it('resolves the provider once', () => {
    AI.usageMetrics({})
    expect(h.getProvider).toHaveBeenCalledTimes(1)
  })

  it('hands the step to the provider verbatim', () => {
    const step = { providerMetadata: { whatever: true } }
    AI.usageMetrics(step)
    expect(h.providers[0].usageMetrics).toHaveBeenCalledWith(step)
  })
})

describe('router binding — shadow only, never applied (P1)', () => {
  const SHADOW = 'LLM_ROUTER_SHADOW'
  afterEach(() => { delete process.env[SHADOW] })

  it('emits nothing and resolves one provider when shadow is off', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await AI.generate({ prompt: 'hi' })
    expect(log).not.toHaveBeenCalled()
    expect(h.getProvider).toHaveBeenCalledTimes(1)
  })

  it('evaluates the router exactly ONCE per call when shadow is on', async () => {
    process.env[SHADOW] = '1'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await AI.generate({ prompt: 'hi' })
    const shadow = log.mock.calls.filter(c => String(c[0]).includes('tappyai_routing_shadow'))
    expect(shadow).toHaveLength(1)
  })

  it('does NOT change which model serves the request', async () => {
    process.env[SHADOW] = '1'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await AI.generate({ prompt: 'hi', role: 'smart' })
    expect(lastGenerate().model.modelId).toBe('model-smart')
  })

  it('reports the model that ACTUALLY served the request', async () => {
    process.env[SHADOW] = '1'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await AI.generate({ prompt: 'hi', role: 'planning' })
    const rec = JSON.parse(log.mock.calls.find(c => String(c[0]).includes('tappyai_routing_shadow'))![0] as string)
    expect(rec.actualModel).toBe('model-planning')
  })

  it('never lets routing metadata reach the prompt', async () => {
    process.env[SHADOW] = '1'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await AI.generate({ systemShared: 'SH', system: 'S', prompt: 'hi', routing: { task: 'planning', risk: 'elevated' } })
    for (const m of lastGenerate().messages) {
      expect(Object.keys(m).sort()).toEqual(['content', 'decoratedBy', 'role'])
      expect(JSON.stringify(m)).not.toMatch(/planning|elevated|routing|tier|reasonCode/i)
    }
  })

  it('carries the caller\'s job hints into the decision', async () => {
    process.env[SHADOW] = '1'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await AI.generate({ prompt: 'hi', routing: { task: 'extraction', risk: 'elevated' } })
    const rec = JSON.parse(log.mock.calls.find(c => String(c[0]).includes('tappyai_routing_shadow'))![0] as string)
    expect(rec.taskClass).toBe('extraction')
    expect(rec.risk).toBe('elevated')
  })

  it('a shadow failure cannot break the call', async () => {
    process.env[SHADOW] = '1'
    vi.spyOn(console, 'log').mockImplementation(() => { throw new Error('boom') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(AI.generate({ prompt: 'hi' })).resolves.toBeDefined()
  })
})

describe('providerId and isConfigured still resolve once each', () => {
  it('providerId', () => {
    expect(AI.providerId()).toBe('test-1')
    expect(h.getProvider).toHaveBeenCalledTimes(1)
  })

  it('isConfigured', () => {
    expect(AI.isConfigured()).toBe(true)
    expect(h.getProvider).toHaveBeenCalledTimes(1)
  })
})
