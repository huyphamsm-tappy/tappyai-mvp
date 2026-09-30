import type { AIProvider } from './provider'
import type { ModelOverrides, ProviderId } from './types'
import type { LanguageModelV1 } from 'ai'
import type { ModelRole } from './types'
import { createClaudeProvider } from './providers/claude'
import { createOpenAIProvider } from './providers/openai'
import { withFallback } from './fallback'

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

// ── Per-role routing (owner 2026-09-30, "PHIÊN LUNA") ────────────────────────────────────────────
//   LLM_CONSULT_PROVIDER=openai   the `consult` role (consultation answer turns) is served by the OpenAI
//   LLM_INTENT_PROVIDER=openai    adapter (GPT-6 Luna); `intent` = the structured read of the user's turn.
//   LLM_<ROLE>_REASONING          none | low | medium | high — always sent explicitly (default none).
//   LLM_<ROLE>_TIMEOUT_MS         no first stream part within this → the default provider answers (8000).
// Unset (the default) → the role resolves on the default provider exactly like every other role. A routed
// role whose credentials are missing also stays on the default provider. Every routed call carries the
// default provider's model as its fallback (fallback.ts).

type RoutedRole = Extract<ModelRole, 'consult' | 'intent' | 'plan'>
let openaiProvider: ReturnType<typeof createOpenAIProvider> | null = null

function routedTo(role: ModelRole): 'openai' | null {
  if (role !== 'consult' && role !== 'intent' && role !== 'plan') return null
  const v = (process.env[`LLM_${role.toUpperCase()}_PROVIDER`] ?? '').trim().toLowerCase()
  if (v !== 'openai') return null
  openaiProvider ??= createOpenAIProvider({ consult: process.env.LLM_CONSULT_MODEL, intent: process.env.LLM_INTENT_MODEL, plan: process.env.LLM_PLAN_MODEL })
  return openaiProvider.isConfigured() ? 'openai' : null
}

/** Which vendor + effort serves a role right now (telemetry only — never branch business logic on it). */
export function roleServing(role: ModelRole): { provider: string; effort: string | null } {
  if (routedTo(role) === 'openai') return { provider: 'openai', effort: openaiProvider!.effort(role as RoutedRole) }
  return { provider: getProvider().id, effort: null }
}

/**
 * The model for a role. A fresh routed model per call (the adapter keeps a per-call usage sink on it).
 * `structured` asks for the vendor's strict JSON-schema mode where it has one.
 */
export function modelForRole(role: ModelRole, opts: { structured?: boolean } = {}): LanguageModelV1 {
  const base = getProvider().model(role)
  if (routedTo(role) !== 'openai') return base
  const primary = opts.structured ? openaiProvider!.structuredModel(role) : openaiProvider!.model(role)
  const ms = Number(process.env[`LLM_${role.toUpperCase()}_TIMEOUT_MS`])
  // A reasoning plan thinks before its first part: a longer default wait for role `plan` (still under the route's budget).
  return withFallback(primary, base, { firstPartMs: Number.isFinite(ms) && ms > 0 ? ms : role === 'plan' ? 25000 : 8000, label: role })
}

/** Test hook: forget the routed provider so env changes take effect. */
export function resetRoutingForTests(): void { openaiProvider = null; provider = null }
