import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai'
import type { ModelRole, ReasoningEffort } from '../types'
import type { AIProvider, CallCost } from '../provider'

// ── OpenAI adapter (GPT-6 Luna) — owner 2026-09-30, "PHIÊN LUNA" ─────────────────────────────────
// THE ONLY file allowed to import @ai-sdk/openai, name an OpenAI model id or read OPENAI_API_KEY.
// It serves only the roles the registry routes here (LLM_<ROLE>_PROVIDER=openai); every other role and
// every failure stays on the default provider (registry.ts wraps this model in a fallback).
//
// What the SDK (1.3.24) does not do for an id it does not know:
//   1. `gpt-6-luna` is a reasoning model, but the SDK only recognises o* / gpt-5* ids, so it would send
//      `max_tokens` (rejected by reasoning models) and a temperature. lunaCallOptions() reshapes the call.
//   2. Reasoning effort MUST be explicit — the model's default is `medium`, which costs reasoning tokens on
//      every turn. It is sent on every request from LLM_<ROLE>_REASONING (default `none`).
//   3. Every call is priced here (cached input, cache writes, output INCLUDING reasoning tokens). The SDK does
//      not surface cache writes; the probe (scripts/consult/luna/probe.mjs) showed Luna bills almost all uncached
//      input as cache writes, so uncached input is priced at the cache-write rate ($0.125/M).

const DEFAULT_MODEL = 'gpt-6-luna'

/** List prices, USD per 1M tokens (developers.openai.com/api/docs/models/gpt-6-luna, read 2026-09-30). */
const PRICES: Array<[RegExp, { in: number; cachedIn: number; cacheWrite: number; out: number }]> = [
  [/^gpt-6-luna/, { in: 0.10, cachedIn: 0.01, cacheWrite: 0.125, out: 0.50 }],
]

const EFFORTS: readonly ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh']

export function reasoningEffortFor(role: ModelRole, env: Record<string, string | undefined> = process.env): ReasoningEffort {
  const v = (env[`LLM_${role.toUpperCase()}_REASONING`] ?? '').trim().toLowerCase() as ReasoningEffort
  if (EFFORTS.includes(v)) return v
  // Owner 30/09: travel plans on low (medium measured up to 56–61 s with a fallback; low max 20 s). A plan call that
  // carries tools (non-travel plans) is sent at none by effortForCall — the API refuses tools with any other effort.
  return role === 'plan' ? 'low' : 'none'
}

export interface RawUsage {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number; cache_creation_tokens?: number } | null
  completion_tokens_details?: { reasoning_tokens?: number } | null
}

/** USD of one call from the vendor's own usage object. Prompt tokens INCLUDE cached ones (OpenAI semantics). */
export function openaiCallCost(modelId: string, u: RawUsage | null | undefined): CallCost | null {
  if (!u) return null
  const p = PRICES.find(([re]) => re.test(modelId))?.[1]
  if (!p) return null
  const prompt = u.prompt_tokens ?? 0
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0
  const cacheWrite = u.prompt_tokens_details?.cache_write_tokens ?? u.prompt_tokens_details?.cache_creation_tokens ?? 0
  const out = u.completion_tokens ?? 0
  const fresh = Math.max(0, prompt - cached - cacheWrite)
  const usd = (fresh * p.in + cached * p.cachedIn + cacheWrite * p.cacheWrite + out * p.out) / 1e6
  return {
    provider: 'openai', model: modelId,
    inputTokens: prompt, cachedInputTokens: cached, cacheWriteTokens: cacheWrite,
    outputTokens: out, reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
    usd: Math.round(usd * 1e7) / 1e7,
  }
}

/**
 * Call options for a reasoning model the SDK does not recognise (see header, points 1 + 2): the output cap goes
 * out as `max_completion_tokens`, sampling settings are dropped, and the effort is always explicit. Done on the
 * SDK's own call options (its `providerMetadata.openai` channel) — the adapter opens no socket of its own.
 */
export function lunaCallOptions<T extends { maxTokens?: number; temperature?: number; topP?: number; providerMetadata?: Record<string, Record<string, unknown>> }>(opts: T, effort: ReasoningEffort): T {
  const openaiMeta = { ...(opts.providerMetadata?.openai ?? {}), reasoningEffort: effort, ...(opts.maxTokens != null ? { maxCompletionTokens: opts.maxTokens } : {}) }
  return { ...opts, maxTokens: undefined, temperature: undefined, topP: undefined, providerMetadata: { ...(opts.providerMetadata ?? {}), openai: openaiMeta } }
}

/** The SDK's parsed usage → the vendor usage shape priced above (cache-write tokens are not surfaced by SDK 1.3.x). */
function usageOf(usage: { promptTokens: number; completionTokens: number } | undefined, meta: Record<string, Record<string, unknown>> | undefined): RawUsage | undefined {
  if (!usage) return undefined
  const o = meta?.openai ?? {}
  return {
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    // Probe 30/09 (scripts/consult/luna/probe.mjs, raw usage): gpt-6-luna reports nearly EVERY uncached input token
    // as a cache write (2,428 of 2,431 on a cold call; 24 of 27 on a warm one). The SDK drops that field, so the
    // uncached input is priced as cache writes ($0.125/M) — at worst a slight over-count, never an under-count.
    prompt_tokens_details: (() => {
      const cached = typeof o.cachedPromptTokens === 'number' ? o.cachedPromptTokens : 0
      return { cached_tokens: cached, cache_write_tokens: Math.max(0, usage.promptTokens - cached) }
    })(),
    completion_tokens_details: { reasoning_tokens: typeof o.reasoningTokens === 'number' ? o.reasoningTokens : 0 },
  }
}

/** The effort actually sent: a call carrying function tools goes at 'none' — the only effort the API accepts with tools. */
export function effortForCall(effort: ReasoningEffort, opts: { mode?: { type?: string; tools?: unknown[] } }): ReasoningEffort {
  return opts.mode?.type === 'regular' && Array.isArray(opts.mode.tools) && opts.mode.tools.length > 0 ? 'none' : effort
}

/**
 * One model per (role, effort). The wrapper adds the priced call to the finish part / generate result as
 * `providerMetadata.tappy.cost` (read by the route — a neutral key, no vendor name needed downstream).
 */
function lunaModel(modelId: string, effort: ReasoningEffort, apiKey: string, structured: boolean): LanguageModelV1 {
  // 'strict': the SDK default 'compatible' omits stream_options.include_usage → a stream reports no usage.
  // parallelToolCalls:false — owner rule 30/09 "at most ONE targeted extra search": replay TRAVEL-1 t2 fired flights +
  // restaurants in parallel on both steps and ended on tool calls with no text (1 of 75 Luna turns).
  // The API rejects parallel_tool_calls on a request with no tools (replay 30/09: every tool-less call fell back), so the
  // setting lives on a second model used only when the call carries tools.
  const provider = createOpenAI({ apiKey, compatibility: 'strict' })
  const plain = provider.chat(modelId, { structuredOutputs: structured })
  const oneTool = provider.chat(modelId, { structuredOutputs: structured, parallelToolCalls: false })
  const hasTools = (opts: { mode?: { type?: string; tools?: unknown[] } }) => opts.mode?.type === 'regular' && Array.isArray(opts.mode.tools) && opts.mode.tools.length > 0
  const inner = plain
  // The bounded agent (src/lib/ai/agent) asks for parallel read-only calls: its final step never carries tools, so the old "ended on a tool call"
  // failure that motivated one-tool-per-step cannot happen there. Every other caller keeps one call per step.
  const parallelAsked = (opts: { providerMetadata?: Record<string, Record<string, unknown>> }) => opts.providerMetadata?.tappy?.parallelTools === true
  const pick = (opts: { mode?: { type?: string; tools?: unknown[] }; providerMetadata?: Record<string, Record<string, unknown>> }) => (hasTools(opts) && !parallelAsked(opts) ? oneTool : plain)
  // The API refuses function tools with any effort but 'none' on /chat/completions (replay 30/09: every medium plan call
  // with tools fell back). A call that carries tools runs at 'none'; the effort actually sent is logged with the cost.
  const effortFor = (opts: { mode?: { type?: string; tools?: unknown[] } }): ReasoningEffort => effortForCall(effort, opts)
  const withCost = (usage: { promptTokens: number; completionTokens: number } | undefined, meta: Record<string, Record<string, unknown>> | undefined, sent: ReasoningEffort) => {
    const cost = openaiCallCost(modelId, usageOf(usage, meta))
    return cost ? { ...(meta ?? {}), tappy: { cost: { ...cost, effort: sent } as unknown as Record<string, unknown> } } : meta
  }
  return {
    ...inner,
    specificationVersion: 'v1',
    provider: inner.provider,
    modelId: inner.modelId,
    defaultObjectGenerationMode: inner.defaultObjectGenerationMode,
    supportsStructuredOutputs: structured,
    // 🔑 SSRF (imageUrlSsrfGuardrail.test.ts): the SDK model answers this through a prototype GETTER, which the spread
    // above drops. Undefined reads as false and the SDK would then DOWNLOAD user-supplied image URLs from our server.
    supportsImageUrls: inner.supportsImageUrls,
    async doGenerate(opts) {
      const sent = effortFor(opts as never)
      const r = await pick(opts as never).doGenerate(lunaCallOptions(opts as never, sent))
      return { ...r, providerMetadata: withCost(r.usage, r.providerMetadata as never, sent) as never }
    },
    async doStream(opts) {
      const sent = effortFor(opts as never)
      const r = await pick(opts as never).doStream(lunaCallOptions(opts as never, sent))
      const stream = r.stream.pipeThrough(new TransformStream<LanguageModelV1StreamPart, LanguageModelV1StreamPart>({
        transform(part, c) {
          if (part.type === 'finish') c.enqueue({ ...part, providerMetadata: withCost(part.usage, part.providerMetadata as never, sent) as never })
          else c.enqueue(part)
        },
      }))
      return { ...r, stream }
    },
  }
}

export function createOpenAIProvider(overrides: Partial<Record<ModelRole, string>>): AIProvider & { structuredModel(role: ModelRole): LanguageModelV1; effort(role: ModelRole): ReasoningEffort } {
  const key = () => process.env.OPENAI_API_KEY ?? ''
  const id = (role: ModelRole) => overrides[role] ?? DEFAULT_MODEL
  return {
    id: 'openai',
    isConfigured: () => !!process.env.OPENAI_API_KEY,
    model: (role) => lunaModel(id(role), reasoningEffortFor(role), key(), false),
    structuredModel: (role) => lunaModel(id(role), reasoningEffortFor(role), key(), true),
    effort: (role) => reasoningEffortFor(role),
  }
}
