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
//
// ── Why every role is PINNED to the same dated snapshot (P1-4) ───────────────
// `fast` used to carry the floating alias 'claude-haiku-4-5'. That was two
// defects in one string:
//
//   1. The vendor can repoint an alias with no deploy on our side, so the model
//      serving production could change without a diff.
//   2. A prompt cache is keyed PER MODEL ID. `fast` and `smart` therefore could
//      not share a cached prefix even when the bytes were byte-identical — and
//      they routinely are: route.ts picks `fast` for a short FIRST message
//      (isSimpleQuery), which is the most common opening turn of a
//      conversation, and it is built from the same ~11k-token `shared` prefix
//      buildSystem() gives every tool turn. That turn paid a cache WRITE at
//      1.25x on a lineage the next turn (role `smart`) could never read back.
//
// Roles stay a ROUTING concept — they are free to diverge the day the fleet has
// more than one tier. Today they deliberately resolve to one model, and the
// invariant that matters is that roles resolving to the same model use the
// SAME identifier string. modelIdentity.test.ts holds both properties.
const DEFAULT_MODELS: Record<ModelRole, string> = {
  fast:     'claude-haiku-4-5-20251001',
  smart:    'claude-haiku-4-5-20251001',
  planning: 'claude-haiku-4-5-20251001',
  vision:   'claude-haiku-4-5-20251001',
}

/** The resolved default model id per role. Exported for the identity test, which
 *  must assert on the SHIPPED table rather than a copy that can drift from it. */
export const CLAUDE_DEFAULT_MODELS: Readonly<Record<ModelRole, string>> = DEFAULT_MODELS

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
