import { createAnthropic } from '@ai-sdk/anthropic'
import type { CoreMessage } from 'ai'
import type { AIProvider } from '../provider'
import type { ModelOverrides, ModelRole } from '../types'
import type { ModelCapabilities } from '../routing/types'

// ── Claude (Anthropic) adapter ───────────────────────────────────────────────
// THE ONLY file in the codebase allowed to import an Anthropic SDK, mention a
// Claude model id, or read ANTHROPIC_API_KEY. Everything Anthropic-specific —
// beta headers, prompt caching — is contained here.

// Default model per semantic role. Override per-deployment with LLM_*_MODEL
// env vars (resolved in registry.ts and passed in as `overrides`).
//
// All four roles are PINNED to the same dated snapshot. `fast` used to carry
// the floating alias 'claude-haiku-4-5' instead, which was two defects in one
// string: the alias can be repointed by the vendor with no deploy on our side,
// and a prompt cache is keyed per model id — so `fast` and `smart` could not
// share a cached prefix even when the bytes were byte-identical. Roles are a
// routing concept; today they deliberately resolve to one model.
const DEFAULT_MODELS: Record<ModelRole, string> = {
  fast:     'claude-haiku-4-5-20251001',
  smart:    'claude-haiku-4-5-20251001',
  planning: 'claude-haiku-4-5-20251001',
  vision:   'claude-haiku-4-5-20251001',
}

// Capability + cost metadata for the models this adapter resolves.
//
// Every value below is VERIFIED against Anthropic's published model
// documentation, except `multiSystemMessages`, which is verified by our own
// measurement (P0 cacheProbe: 100% hit rate with the cache breakpoint landing
// between the two system segments — which only works if consecutive system
// messages stay separately addressable).
//
// tier/reasoning are a deliberate, reviewable judgement, not marketing: Haiku
// 4.5 is Anthropic's fast tier. It does reliable multi-tool calling, streaming
// and prompt caching (→ 'medium'), but it is not a deep-reasoning model
// (→ 'standard'). Calling it 'premium' would tell the router the fleet already
// has a top-tier option when it does not.
const CAPABILITIES: readonly ModelCapabilities[] = [
  {
    providerId: 'claude',
    modelId: DEFAULT_MODELS.smart,
    tier: 'medium',
    toolCalling: true,
    vision: true,
    streaming: true,
    structuredOutput: true,
    multiSystemMessages: 'verified',
    promptCache: { supported: true, minCacheableTokens: 4096 },
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    reasoning: 'standard',
    latencyClass: 'fast',
    supportedTaskClasses: [
      'conversational', 'tool_dialogue', 'planning', 'extraction', 'short_generation', 'vision',
    ],
    languages: 'multilingual',
    cost: {
      inputPerMTok: 1.00,
      outputPerMTok: 5.00,
      cacheReadPerMTok: 0.10,   // ×0.1
      cacheWritePerMTok: 1.25,  // ×1.25
    },
    fallbackEligible: true,
  },
]

/** Shape Anthropic reports per step under providerMetadata.anthropic. */
type AnthropicStepMetadata = {
  cacheReadInputTokens?: number | null
  cacheCreationInputTokens?: number | null
}

/** Anthropic omits a counter as often as it zeroes one, and `step` is `unknown`
 *  by contract — so read defensively and map anything non-numeric to null. */
function counter(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

export function createClaudeProvider(overrides: ModelOverrides): AIProvider {
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
  })

  return {
    id: 'claude',

    isConfigured: () => !!process.env.ANTHROPIC_API_KEY,

    model: (role) => anthropic(overrides[role] ?? DEFAULT_MODELS[role]),

    // Per-deployment LLM_*_MODEL overrides can point a role at a model this
    // table does not describe. Rather than publish invented metadata for it,
    // report only the entries whose ids a role actually resolves to — an
    // overridden model is simply absent from the fleet until it is described.
    capabilities: () => {
      const live = new Set(
        (['fast', 'smart', 'planning', 'vision'] as const).map(r => overrides[r] ?? DEFAULT_MODELS[r]),
      )
      return CAPABILITIES.filter(c => live.has(c.modelId))
    },

    // Anthropic reports cache counters per step under providerMetadata.anthropic.
    // Reading that shape is this file's job precisely because the key and the
    // field names are vendor-specific; every other provider spells them
    // differently or not at all. Total prompt size is
    // promptTokens + cacheCreation + cacheRead — `promptTokens` EXCLUDES cached
    // tokens, so it is never "how big was the prompt" on its own.
    usageMetrics: (step) => {
      const meta = (step as { providerMetadata?: { anthropic?: AnthropicStepMetadata } } | null | undefined)
        ?.providerMetadata?.anthropic
      return {
        cacheReadTokens: counter(meta?.cacheReadInputTokens),
        cacheCreationTokens: counter(meta?.cacheCreationInputTokens),
      }
    },

    // Anthropic prompt caching. cacheControl only takes effect when attached to
    // a concrete message object — the AI SDK silently ignores it alongside a
    // top-level `system` string (verified in convertToLanguageModelPrompt: the
    // string-system path never reads provider metadata). The capability layer
    // therefore always delivers the system prompt as a leading system MESSAGE,
    // and this hook pins the cache breakpoint to it, so repeat requests within
    // the cache window get the (large, mostly-static) system prompt at the
    // cached rate. Anthropic ignores the marker on prompts below its minimum
    // cacheable size, so decorating every request is safe. Semantically
    // transparent: responses are identical with or without caching.
    //
    // The marker goes on the FIRST system message only. Anthropic caches the
    // exact prefix ENDING at the marker, so with two system segments (the
    // capability layer emits `systemShared` then `system`) the breakpoint lands
    // between them: the stable segment is cached, and whatever varies per
    // request sits after the boundary where it can no longer invalidate it.
    // Marking the last segment instead would extend the cached prefix over the
    // varying text and defeat the whole thing. Consecutive system messages are
    // mapped by @ai-sdk/anthropic to separate `system` blocks, each carrying its
    // own cache_control, so this is a real breakpoint and not an approximation.
    // With a single system message the behaviour is unchanged.
    decorateMessages: (messages: CoreMessage[]) => {
      let marked = false
      return messages.map((m) => {
        if (m.role !== 'system' || marked) return m
        marked = true
        return { ...m, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } } }
      })
    },
  }
}
