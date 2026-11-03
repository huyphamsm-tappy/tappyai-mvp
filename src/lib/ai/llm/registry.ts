import type { AIProvider } from './provider'
import type { ModelOverrides, ProviderId } from './types'
import type { CoreMessage, LanguageModelV1 } from 'ai'
import type { ModelRole } from './types'
import { AGENT_MODEL_KEY_NAME, anthropicConfigured, claudeDecorateMessages, createClaudeProvider, createHaiku55AgentModel } from './providers/claude'
import { createOpenAIProvider } from './providers/openai'
import { withFallback } from './fallback'
import { meteredModel } from '../budget/meteredModel'
import type { BudgetKind } from '../budget/requestBudget'

// ── Provider registry — the single place a provider is instantiated ─────────
//
// Configuration (all optional; defaults in parentheses):
//   LLM_PROVIDER        which adapter to use: claude | openai | gemini | grok
//                       | deepseek       (openai = GPT-6 Luna since 30/09; claude = Phase 7 rollback)
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
  const roles: ModelRole[] = ['fast', 'smart', 'planning', 'vision', 'consult', 'intent', 'plan', 'agent']
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
  if (servesAgentModel(role) && agentModelChoice() === 'haiku55' && anthropicConfigured()) return { provider: 'anthropic', effort: 'thinking_off' }
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
  // generateMs 45 s (was 30 s): a full trip plan is ONE non-streamed call — 2,879 output tokens took 24.1 s (local UAT 14/10/2026,
  // Quy Nhơn 3 ngày), so a 30 s cut-and-retry throws away a plan that was about to arrive.
  if (role === 'plan') return { firstPartMs: 25000, generateMs: 45000 }
  // Phase 8 runtime step (TAPPY_AGENT=2): a tool-choosing step or the final answer. doGenerate is not streamed, so this wait is the WHOLE
  // answer, not its first token: 45 s = the runtime's own step timeout (limits.ts stepTimeoutMs), i.e. no cut-and-retry inside a step.
  // Was 25 s: a step that writes the trip plan needs ~25–30 s; it was aborted at 25 s, the retry started from zero and the step died at
  // 45 s — 45 s lost, and the turn ended in the fallback line (local UAT 14/10/2026, 2 of 2 Quy Nhơn plans). A failed call (error, not
  // slowness) is still retried at once (fallback.ts abortPrimaryOnTimeout).
  if (role === 'agent') return { firstPartMs: 45000, generateMs: 45000 }
  if (role === 'consult' || role === 'intent') return { firstPartMs: 8000, generateMs: 8000 }
  // fast / smart / planning / vision: a long single-shot answer (Viết content, translate, scam analysis) is not cut short.
  return { firstPartMs: 15000, generateMs: 40000 }
}

/**
 * The model for a role. A fresh routed model per call (the adapter keeps a per-call usage sink on it).
 * `structured` asks for the vendor's strict JSON-schema mode where it has one.
 */
export function modelForRole(role: ModelRole, opts: { structured?: boolean; agentRuntime?: boolean; budgetKind?: BudgetKind; claudeModel?: 'haiku55' } = {}): LanguageModelV1 {
  // C2_REQUEST_BUDGET (budget/meteredModel.ts): every concrete upstream model is metered separately (primary, retry, fallback). Outside a
  // request ledger, or with the flag unset, the meter calls straight through, so the resolution below is unchanged.
  const kind: BudgetKind = opts.budgetKind ?? 'main'
  // 03/11: ONE call that asked for Claude Haiku 5.5 (Deep Research's writer, AIStreamOptions.claudeModel) gets it when the key is present, metered like the others
  if (opts.claudeModel === 'haiku55' && anthropicConfigured()) return meteredModel(createHaiku55AgentModel({ label: role }), role, kind)
  if (servesAgentModel(role, opts) && agentModelChoice() === 'haiku55') return meteredModel(agentModel(role, opts), role, kind)
  return defaultModelForRole(role, { structured: opts.structured }, kind)
}

/** The model a role gets with AGENT_MODEL unset — exactly the pre-flag resolution. */
function defaultModelForRole(role: ModelRole, opts: { structured?: boolean } = {}, kind: BudgetKind = 'main'): LanguageModelV1 {
  if (routedTo(role) !== 'openai') return meteredModel(getProvider().model(role), role, kind)
  const primary = meteredModel(opts.structured ? openaiProvider!.structuredModel(role) : openaiProvider!.model(role), role, kind)
  const retry = meteredModel(opts.structured ? openaiProvider!.structuredModel(role) : openaiProvider!.model(role), `${role}:retry`, kind)
  const claudeAdapter = haikuFallbackEnabled() ? (defaultProviderId() === 'claude' ? getProvider() : (claudeProvider ??= createClaudeProvider(modelOverridesFromEnv()))) : null
  const claude = claudeAdapter?.isConfigured() ? meteredModel(claudeAdapter.model(role), `${role}:fallback`, kind) : null
  return withFallback(primary, claude ?? retry, { ...waitsFor(role), label: role, fallbackKind: claude ? 'haiku' : 'luna_retry', abortPrimaryOnTimeout: role === 'agent' })
}

let claudeProvider: AIProvider | null = null

// ── Agent runtime model choice (owner 2026-10-11) ───────────────────────────────────────────────────────────────────
//   AGENT_MODEL=luna (default; unset or any other value) — every call resolves exactly as before.
//   AGENT_MODEL=haiku55 — the agent runtime's calls go to Claude Haiku 5.5 (providers/claude.ts createHaiku55AgentModel):
//     every role-`agent` call (steps, answer-before-lookup check, task tracker, decision record) and the runtime's final
//     step when it runs as role `plan` (marked `agentRuntime` by the runtime). Prompt, tools, guards: unchanged.
//   AGENT_MODEL_FALLBACK=luna — an Anthropic call that fails (error, quota, timeout) is answered once by Luna. Unset: no
//     fallback and no retry — the failure surfaces and the runtime ends the turn with its short error line.
// A missing Anthropic key under haiku55 is logged by NAME (`tappyai_agent_model_config`) and then behaves like a
// failed call (Luna with the fallback flag, the error line without it). The key itself is never read here.
export type AgentModelChoice = 'luna' | 'haiku55'

export function agentModelChoice(env: Record<string, string | undefined> = process.env): AgentModelChoice {
  return (env.AGENT_MODEL ?? '').trim().toLowerCase() === 'haiku55' ? 'haiku55' : 'luna'
}

export function agentModelFallbackToLuna(env: Record<string, string | undefined> = process.env): boolean {
  return (env.AGENT_MODEL_FALLBACK ?? '').trim().toLowerCase() === 'luna'
}

/** Whether a call belongs to the agent runtime: role `agent`, or a runtime call that says so (its final `plan` step). */
function servesAgentModel(role: ModelRole, opts: { agentRuntime?: boolean } = {}): boolean {
  return role === 'agent' || opts.agentRuntime === true
}

/** True when this call will be served by the Anthropic agent model (ai.ts: cache breakpoints and no SDK retry). */
export function usesAnthropicAgentModel(role: ModelRole, opts: { agentRuntime?: boolean } = {}): boolean {
  return servesAgentModel(role, opts) && agentModelChoice() === 'haiku55'
}

/** The message decorator for a call: Anthropic cache breakpoints on the agent model, the default provider's otherwise. */
export function decoratorFor(role: ModelRole, opts: { agentRuntime?: boolean } = {}): ((m: CoreMessage[], o?: { cacheHistory?: boolean }) => CoreMessage[]) | undefined {
  if (usesAnthropicAgentModel(role, opts)) return claudeDecorateMessages
  const p = getProvider()
  return p.decorateMessages ? (m, o) => p.decorateMessages!(m, o) : undefined
}

/** A model whose every call fails with a fixed, key-free message (haiku55 without its key, no fallback). */
function unconfiguredModel(like: LanguageModelV1): LanguageModelV1 {
  const fail = () => Promise.reject(new Error(`agent_model_unconfigured: set ${AGENT_MODEL_KEY_NAME} (AGENT_MODEL=haiku55)`))
  return { ...like, specificationVersion: 'v1', provider: 'anthropic.messages', modelId: 'unconfigured', supportsImageUrls: like.supportsImageUrls, doGenerate: fail, doStream: fail }
}

/** Exported for tests: the agent model from its parts. `haiku` / `luna` are factories so nothing is built that is not used. */
export function buildAgentModel(d: { configured: boolean; fallbackToLuna: boolean; haiku: () => LanguageModelV1; luna: () => LanguageModelV1; waits: { firstPartMs: number; generateMs: number }; label: string }): LanguageModelV1 {
  if (!d.configured) {
    console.warn(JSON.stringify({ type: 'tappyai_agent_model_config', agent_model: 'haiku55', missing: AGENT_MODEL_KEY_NAME, fallback: d.fallbackToLuna ? 'luna' : null }))
    return d.fallbackToLuna ? d.luna() : unconfiguredModel(d.luna())
  }
  const haiku = d.haiku()
  if (!d.fallbackToLuna) return haiku
  return withFallback(haiku, d.luna(), { ...d.waits, label: d.label, fallbackKind: 'luna', abortPrimaryOnTimeout: true })
}

function agentModel(role: ModelRole, opts: { structured?: boolean }): LanguageModelV1 {
  return buildAgentModel({
    configured: anthropicConfigured(),
    fallbackToLuna: agentModelFallbackToLuna(),
    haiku: () => createHaiku55AgentModel({ label: role }),
    luna: () => defaultModelForRole(role, opts),
    waits: waitsFor(role),
    label: role,
  })
}

/** True when a Claude model can be called (the key is present). Never reveals the key. */
export const claudeWriterAvailable = (): boolean => anthropicConfigured()

/** Test hook: forget the routed provider so env changes take effect. */
export function resetRoutingForTests(): void { openaiProvider = null; provider = null; claudeProvider = null }
