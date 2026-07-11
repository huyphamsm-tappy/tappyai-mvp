import type { AIProvider } from './provider'
import type { ModelOverrides, ProviderId } from './types'
import { createClaudeProvider } from './providers/claude'

// ── Provider registry — the single place a provider is instantiated ─────────
//
// Configuration (all optional; defaults in parentheses):
//   LLM_PROVIDER        which adapter to use: claude | openai | gemini | grok
//                       | deepseek                                  (claude)
//   LLM_FAST_MODEL      model id for the 'fast' role      (provider default)
//   LLM_SMART_MODEL     model id for the 'smart' role     (provider default)
//   LLM_PLANNING_MODEL  model id for the 'planning' role  (falls back to
//                       LLM_SMART_MODEL, then provider default)
//   LLM_VISION_MODEL    model id for the 'vision' role    (provider default)
//
// Credentials stay per-vendor (e.g. ANTHROPIC_API_KEY) and are read only
// inside the matching adapter in providers/*.
//
// Adding a provider = one adapter file + one case below. Grok and DeepSeek
// expose OpenAI-compatible APIs, so their adapters are @ai-sdk/openai with a
// custom baseURL; Gemini uses @ai-sdk/google. No business code changes.

function modelOverridesFromEnv(): ModelOverrides {
  return {
    fast: process.env.LLM_FAST_MODEL,
    smart: process.env.LLM_SMART_MODEL,
    planning: process.env.LLM_PLANNING_MODEL ?? process.env.LLM_SMART_MODEL,
    vision: process.env.LLM_VISION_MODEL,
  }
}

let provider: AIProvider | null = null

export function getProvider(): AIProvider {
  if (provider) return provider

  const id = (process.env.LLM_PROVIDER ?? 'claude').toLowerCase() as ProviderId
  switch (id) {
    case 'claude':
      provider = createClaudeProvider(modelOverridesFromEnv())
      return provider
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
