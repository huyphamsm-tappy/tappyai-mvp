import type { AIProvider } from './provider'
import type { ProviderId } from './types'
import { createClaudeProvider } from './providers/claude'
import { defaultProviderId, modelOverridesFromEnv } from './config'

// ── Provider Registry — the single place a provider is instantiated ─────────
// Env vars this reads are documented in config.ts.
//
// Adding a provider = one adapter file + one case below. Grok and DeepSeek
// expose OpenAI-compatible APIs, so their adapters are @ai-sdk/openai with a
// custom baseURL; Gemini uses @ai-sdk/google. No business code changes.

// One memoized instance per provider id (not just the active one) — the
// Router (router.ts) may try several candidate ids per call, and each must
// only ever be constructed once. A failed instantiation (unsupported/unknown
// id) is never cached, so it re-throws the same way on every call, exactly
// like the single-provider version this replaces.
const providers = new Map<ProviderId, AIProvider>()

function instantiateProvider(id: ProviderId): AIProvider {
  switch (id) {
    case 'claude':
      return createClaudeProvider(modelOverridesFromEnv())
    case 'openai':
    case 'gemini':
    case 'grok':
    case 'deepseek':
      // Recognized extension points — adapter not installed yet.
      throw new Error(
        `[ai] LLM_PROVIDER="${id}" is supported by the architecture but has no adapter installed. ` +
        `Create src/lib/ai/llm/providers/${id}.ts implementing AIProvider and register it here.`,
      )
    default:
      throw new Error(
        `[ai] Unknown LLM_PROVIDER "${id}". Supported: claude, openai, gemini, grok, deepseek.`,
      )
  }
}

export function getProviderById(id: ProviderId): AIProvider {
  let provider = providers.get(id)
  if (!provider) {
    provider = instantiateProvider(id)
    providers.set(id, provider)
  }
  return provider
}

/** The globally active provider — resolved from LLM_PROVIDER (default 'claude'). */
export function getProvider(): AIProvider {
  return getProviderById(defaultProviderId())
}
