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

// ── Default provider = OpenAI / GPT-6 Luna (owner 30/09, URGENT: the Anthropic account is out of credit and will not
// be topped up; Luna ships to production with the Phase 7 release). EVERY role is served by the OpenAI adapter unless
// LLM_PROVIDER=claude is set, which restores the Phase 7 Haiku behaviour byte for byte (no Claude code is removed).
// The LLM_FAST_MODEL / … overrides above name CLAUDE ids and are read only for the Claude provider; the Luna model id
// can be overridden with LLM_LUNA_MODEL (all roles) or LLM_<ROLE>_MODEL for consult / intent / plan.
function lunaOverridesFromEnv(): Partial<Record<ModelRole, string>> {
  const all = process.env.LLM_LUNA_MODEL
  const roles: ModelRole[] = ['fast', 'smart', 'planning', 'vision', 'consult', 'intent', 'plan']
  const out: Partial<Record<ModelRole, string>> = {}
  for (const r of roles) out[r] = (r === 'consult' || r === 'intent' || r === 'plan' ? process.env[`LLM_${r.toUpperCase()}_MODEL`] : undefined) ?? all
  return out
}

let provider: AIProvider | null = null

/** The configured default provider id (claude | openai | …). Default: openai (GPT-6 Luna). */
export function defaultProviderId(env: Record<string, string | undefined> = process.env): ProviderId {
  return ((env.LLM_PROVIDER ?? '').trim() || 'openai').toLowerCase() as ProviderId
}

export function getProvider(): AIProvider {
  if (provider) return provider

  const id = defaultProviderId()
  switch (id) {
    case 'claude':
      provider = createClaudeProvider(modelOverridesFromEnv())
      return provider
    case 'openai':
      openaiProvider ??= createOpenAIProvider(lunaOverridesFromEnv())
      provider = openaiProvider
      return provider
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
  // Luna is the default provider: every role is served by it (the per-role switches below only matter under claude).
  if (defaultProviderId() === 'openai') return getProvider().isConfigured() ? 'openai' : null
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
 * HAIKU_FALLBACK (default OFF — owner 30/09: the Anthropic account has no credit). OFF: a failed / silent Luna call is
 * retried ONCE on Luna, and a second failure surfaces as the call's error (the chat route turns it into its friendly
 * error message; other callers already fail open). ON (=1, and the Claude adapter configured): Claude is the fallback.
 */
export function haikuFallbackEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.HAIKU_FALLBACK ?? '').trim().toLowerCase()
  return v === '1' || v === 'on' || v === 'true'
}

/** First-part / whole-call waits before the one retry. Stream: until the first part. Generate: the whole answer. */
function waitsFor(role: ModelRole): { firstPartMs: number; generateMs: number } {
  const ms = Number(process.env[`LLM_${role.toUpperCase()}_TIMEOUT_MS`])
  if (Number.isFinite(ms) && ms > 0) return { firstPartMs: ms, generateMs: Math.max(ms, 8000) }
  // A reasoning plan thinks before its first part. 25 s, not 30: replay 30/09 a medium trip plan hit 30 s twice and the
  // fallback then ended at 50–53 s. Low effort (the default now) measured max 20 s for the whole plan.
  if (role === 'plan') return { firstPartMs: 25000, generateMs: 30000 }
  if (role === 'consult' || role === 'intent') return { firstPartMs: 8000, generateMs: 8000 }
  // fast / smart / planning / vision: a long single-shot answer (Viết content, translate, scam analysis) is not cut short.
  return { firstPartMs: 15000, generateMs: 40000 }
}

/**
 * The model for a role. A fresh routed model per call (the adapter keeps a per-call usage sink on it).
 * `structured` asks for the vendor's strict JSON-schema mode where it has one.
 */
export function modelForRole(role: ModelRole, opts: { structured?: boolean } = {}): LanguageModelV1 {
  if (routedTo(role) !== 'openai') return getProvider().model(role)
  const primary = opts.structured ? openaiProvider!.structuredModel(role) : openaiProvider!.model(role)
  const retry = opts.structured ? openaiProvider!.structuredModel(role) : openaiProvider!.model(role)
  const claudeAdapter = haikuFallbackEnabled() ? (defaultProviderId() === 'claude' ? getProvider() : (claudeProvider ??= createClaudeProvider(modelOverridesFromEnv()))) : null
  const claude = claudeAdapter?.isConfigured() ? claudeAdapter.model(role) : null
  return withFallback(primary, claude ?? retry, { ...waitsFor(role), label: role, fallbackKind: claude ? 'haiku' : 'luna_retry' })
}

let claudeProvider: AIProvider | null = null

/** Test hook: forget the routed provider so env changes take effect. */
export function resetRoutingForTests(): void { openaiProvider = null; provider = null; claudeProvider = null }
