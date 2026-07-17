import { createAnthropic } from '@ai-sdk/anthropic'
import type { CoreMessage } from 'ai'
import type { ProviderCapabilities } from '../capabilities'
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

// Matches the model's actual, audited behavior — every capability the chat
// route and other call sites exercise (streaming, tool calls, forced
// toolChoice via prepareStep, image input, JSON-shaped replies, prompt
// caching) already works today.
const CLAUDE_CAPABILITIES: ProviderCapabilities = {
  streaming: true,
  tools: true,
  forcedToolChoice: true,
  vision: true,
  jsonMode: true,
  promptCaching: true,
}

export function createClaudeProvider(overrides: ModelOverrides): AIProvider {
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
  })

  return {
    id: 'claude',

    capabilities: CLAUDE_CAPABILITIES,

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
    decorateMessages: (messages: CoreMessage[]) =>
      messages.map((m) =>
        m.role === 'system'
          ? { ...m, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } } }
          : m,
      ),
  }
}
