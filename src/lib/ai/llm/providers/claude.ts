import { createAnthropic } from '@ai-sdk/anthropic'
import type { CoreMessage } from 'ai'
import type { AIProvider } from '../provider'
import type { ModelOverrides, ModelRole } from '../types'

// ── Claude (Anthropic) adapter ───────────────────────────────────────────────
// THE ONLY file in the codebase allowed to import an Anthropic SDK, mention a
// Claude model id, or read ANTHROPIC_API_KEY. Everything Anthropic-specific —
// beta headers, prompt caching — is contained here.

// Default model per semantic role. Override per-deployment with LLM_*_MODEL
// env vars (resolved in registry.ts and passed in as `overrides`).
const DEFAULT_MODELS: Record<ModelRole, string> = {
  fast:     'claude-haiku-4-5',
  smart:    'claude-haiku-4-5-20251001',
  planning: 'claude-haiku-4-5-20251001',
  vision:   'claude-haiku-4-5-20251001',
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
