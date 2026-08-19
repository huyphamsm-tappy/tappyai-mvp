import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildShadowRecord, observeRouting, SHADOW_FLAG } from './shadow'
import { route } from './router'
import { deriveSignals } from './signals'
import { FLEET, MEDIUM_ALLROUND } from './__fixtures__/syntheticCandidates'

// ── Shadow mode (P1) ─────────────────────────────────────────────────────────
// The router decides; nothing acts on the decision. This is how we get
// real-world routing telemetry before letting the router touch a user.

const ORIGINAL_ENV = { ...process.env }
beforeEach(() => { delete process.env[SHADOW_FLAG] })
afterEach(() => { process.env = { ...ORIGINAL_ENV }; vi.restoreAllMocks() })

const signals = deriveSignals({ method: 'stream', hasTools: true, approxInputTokens: 1000 })

describe('the record answers every question the owner asked for', () => {
  const rec = buildShadowRecord(signals, route(signals, FLEET), { providerId: 'claude', modelId: 'incumbent-x' })

  it('carries the routing decision', () => {
    expect(rec.type).toBe('tappyai_routing_shadow')
    expect(rec.selectedProvider).toBeTruthy()
    expect(rec.selectedModel).toBeTruthy()
    expect(rec.taskClass).toBe('tool_dialogue')
    expect(rec.complexity).toBeTruthy()
    expect(rec.risk).toBeTruthy()
    expect(rec.reasonCode).toBeTruthy()
    expect(rec.confidence).toBeTruthy()
    expect(rec.costClass).toBeTruthy()
  })

  it('carries what ACTUALLY served the request', () => {
    expect(rec.actualProvider).toBe('claude')
    expect(rec.actualModel).toBe('incumbent-x')
  })

  it('flags disagreement between the router and reality', () => {
    expect(rec.disagreement).toBe(true)
  })

  it('reports agreement when they match', () => {
    // MEDIUM_ALLROUND, not CHEAP_FAST: these signals imply medium complexity,
    // whose reasoning floor a `basic` model does not clear. Picking an
    // ineligible fixture here would have tested nothing.
    const agree = buildShadowRecord(signals, route(signals, [MEDIUM_ALLROUND]), {
      providerId: MEDIUM_ALLROUND.providerId, modelId: MEDIUM_ALLROUND.modelId,
    })
    expect(agree.disagreement).toBe(false)
  })

  it('records a no-decision honestly instead of inventing a provider', () => {
    const none = buildShadowRecord(signals, route(signals, []), { providerId: 'claude', modelId: 'x' })
    expect(none.reasonCode).toBe('NO_ELIGIBLE_MODEL')
    expect(none.selectedProvider).toBeNull()
    expect(none.selectedModel).toBeNull()
    expect(none.disagreement).toBe(true)
  })
})

describe('the record leaks nothing', () => {
  const rec = buildShadowRecord(signals, route(signals, FLEET), { providerId: 'claude', modelId: 'm' })
  const serialized = JSON.stringify(rec)

  it('contains no prompt, message, tool result or user text', () => {
    for (const key of Object.keys(rec)) {
      expect(key).not.toMatch(/text|prompt|message|content|query|memory/i)
    }
  })

  it('contains nothing that looks like a credential', () => {
    expect(serialized).not.toMatch(/sk-|api[_-]?key|secret|token"\s*:\s*"[A-Za-z0-9]{16}/i)
  })

  it('is a flat, machine-readable record — no nested free-form payload', () => {
    for (const v of Object.values(rec)) {
      expect(['string', 'number', 'boolean', 'object']).toContain(typeof v)
      if (typeof v === 'object' && v !== null) expect(Array.isArray(v)).toBe(true)
    }
  })

  it('reports a cost CLASS, not a fabricated dollar figure', () => {
    expect(['cheap', 'medium', 'premium', 'none']).toContain(rec.costClass)
  })
})

describe('observeRouting is off unless explicitly switched on', () => {
  it('emits nothing when the flag is unset', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    observeRouting({ method: 'stream', hasTools: true, approxInputTokens: 100, actual: { providerId: 'claude', modelId: 'm' } })
    expect(log).not.toHaveBeenCalled()
  })

  it('emits exactly one record when the flag is on', () => {
    process.env[SHADOW_FLAG] = '1'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    observeRouting({ method: 'stream', hasTools: true, approxInputTokens: 100, actual: { providerId: 'claude', modelId: 'm' } })
    expect(log).toHaveBeenCalledTimes(1)
    expect(JSON.parse(log.mock.calls[0][0] as string).type).toBe('tappyai_routing_shadow')
  })

  it('treats any value other than "1" as off', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    for (const v of ['0', 'true', 'yes', '']) {
      process.env[SHADOW_FLAG] = v
      observeRouting({ method: 'generate', hasTools: false, approxInputTokens: 10, actual: { providerId: 'claude', modelId: 'm' } })
    }
    expect(log).not.toHaveBeenCalled()
  })
})

describe('observation can never break a reply', () => {
  it('swallows an internal failure and logs it instead of throwing', () => {
    process.env[SHADOW_FLAG] = '1'
    vi.spyOn(console, 'log').mockImplementation(() => { throw new Error('transport exploded') })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      observeRouting({ method: 'stream', hasTools: true, approxInputTokens: 100, actual: { providerId: 'claude', modelId: 'm' } }),
    ).not.toThrow()
    expect(err).toHaveBeenCalled()
  })

  it('never throws on junk input', () => {
    process.env[SHADOW_FLAG] = '1'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => observeRouting({
      method: 'generate', hasTools: false, approxInputTokens: Number.NaN,
      actual: { providerId: 'claude', modelId: '' },
    })).not.toThrow()
  })
})
