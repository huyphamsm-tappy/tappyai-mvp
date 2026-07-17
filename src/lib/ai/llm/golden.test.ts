import { describe, it, expect } from 'vitest'
import { getProvider } from './registry'
import { resolveModel } from './router'
import type { ModelRole } from './types'
import type { CapabilityKey } from './capabilities'

// ── Golden regression test — proves the Sprint-2 foundation is inert ────────
// Per docs/ai-platform/SPRINT_1_ARCHITECTURE_FOUNDATION.md §9 point 6: for
// every role, the Router's resolved model id must equal what the pre-Router
// code (getProvider().model(role)) resolved to. If this passes, the whole
// "no behavior change" proof is mechanically verified, not just asserted.
// Runs fully offline — constructing a LanguageModelV1 wrapper does not call
// the network; only an actual generate/stream/vision call would.

const ROLES: ModelRole[] = ['fast', 'smart', 'planning', 'vision']
const ALL_CAPS: CapabilityKey[] = ['streaming', 'tools', 'forcedToolChoice', 'vision', 'jsonMode', 'promptCaching']

describe('AI platform foundation — no behavior change', () => {
  it('router resolves the same model id as the pre-Router direct path, for every role', () => {
    for (const role of ROLES) {
      const before = getProvider().model(role).modelId
      const after = resolveModel(role).model.modelId
      expect(after).toBe(before)
    }
  })

  it('router resolves the same provider id as getProvider(), for every role', () => {
    for (const role of ROLES) {
      expect(resolveModel(role).provider.id).toBe(getProvider().id)
    }
  })

  it('requiring every declared capability still resolves to the same provider (Claude declares all true)', () => {
    for (const role of ROLES) {
      const { provider, model } = resolveModel(role, ALL_CAPS)
      expect(provider.id).toBe(getProvider().id)
      expect(model.modelId).toBe(getProvider().model(role).modelId)
    }
  })

  it('providerId() and isConfigured() are unchanged (still the plain active provider, not role-scoped)', () => {
    expect(getProvider().id).toBe('claude')
    expect(getProvider().isConfigured()).toBe(!!process.env.ANTHROPIC_API_KEY)
  })

  it('with no per-role env override, the Policy yields exactly one candidate (today\'s single-provider shape)', async () => {
    const { resolveCandidates } = await import('./policy')
    for (const role of ROLES) {
      expect(resolveCandidates(role)).toEqual(['claude'])
    }
  })

  it('Claude adapter declares every capability the 14 audited call sites actually need', () => {
    const caps = getProvider().capabilities
    // streaming + tools + forcedToolChoice: chat route's AI.stream (maxSteps, prepareStep, tools)
    // vision: scan (OCR) + contentProcessor thumbnail enrichment
    // jsonMode: viet-content / memoryService / contentProcessor all prompt for JSON replies
    // promptCaching: chat route's large system prompt via decorateMessages
    expect(caps.streaming).toBe(true)
    expect(caps.tools).toBe(true)
    expect(caps.forcedToolChoice).toBe(true)
    expect(caps.vision).toBe(true)
    expect(caps.jsonMode).toBe(true)
    expect(caps.promptCaching).toBe(true)
  })
})
