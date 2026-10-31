import { createOpenAI } from '@ai-sdk/openai'
import { APICallError } from 'ai'
import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai'
import type { ModelRole, ReasoningEffort } from '../types'
import type { AIProvider, CallCost } from '../provider'
import { currentMarks } from '@/lib/ai/latency/marks'
import { currentBudget, REQUEST_LIMITS, reasoningHeadroomTokens } from '@/lib/ai/budget/requestBudget'
import { safePostResponse } from '@/lib/security/safePost'

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
 * BENCH_SPEND_GATE: the largest USD one call can cost, from token UPPER BOUNDS (input tokens, output cap — reasoning included). Input is priced at
 * the dearest input rate (cache write, above the plain and cached rates), i.e. NO cache is assumed. Null for an id with no list price: a call that
 * cannot be priced cannot be bounded, so the gate does not let it through.
 */
export function openaiWorstCaseCallUsd(modelId: string, inputTokens: number, outputTokens: number): number | null {
  const p = PRICES.find(([re]) => re.test(modelId))?.[1]
  if (!p || !Number.isFinite(inputTokens) || !Number.isFinite(outputTokens) || inputTokens < 0 || outputTokens < 0) return null
  return (inputTokens * Math.max(p.in, p.cacheWrite) + outputTokens * p.out) / 1e6
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

/**
 * The effort actually sent. On /chat/completions a call carrying function tools goes at 'none' — the only effort that API accepts with tools.
 * PROTOTYPE (scratch, 18/10): on the Responses API function tools and reasoning work together (probe 18/10: effort none/low/medium/high all
 * accepted with function tools, reasoning items returned, usage.output_tokens_details.reasoning_tokens > 0), so the effort is sent as configured.
 */
export function effortForCall(effort: ReasoningEffort, opts: { mode?: { type?: string; tools?: unknown[] } }, api: 'chat' | 'responses' = 'chat'): ReasoningEffort {
  if (api === 'responses') return effort
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
    // audit servers only (TAPPY_AUDIT_TRACE=1, never in production): every chat-completions call's cost in the log, like the Responses calls'
    // `tappyai_llm_call` — the structured calls (understanding, gap check, item names) were otherwise priced but never logged (retrieval-v5 cổng 2)
    if (cost && process.env.TAPPY_AUDIT_TRACE === '1') { try { console.log(JSON.stringify({ type: 'tappyai_llm_call', served_api: 'chat', structured, model: modelId, effort: sent, status: 'ok', usd: cost.usd, inTok: cost.inputTokens, cachedIn: cost.cachedInputTokens, outTok: cost.outputTokens })) } catch { /* log only */ } }
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

// ═══ RESPONSES API PROTOTYPE — scratch copy only (owner-approved experiment, 18/10/2026) ═══════════════════════════════════════
// Switch: LLM_OPENAI_API=responses. Default (unset) = today's Chat Completions path, byte for byte. Only the `regular` mode (the agent loop's
// tool steps and its final answer) goes to /v1/responses; object modes (extract / structured) stay on the chat model and are logged as such.
//
// Contract verified by live probe 18/10 (resp-proto/probe-responses.mjs, spend $0.0009):
//   · reasoning.effort none | low | medium | high accepted WITH function tools; `store:false` + include:['reasoning.encrypted_content'] returns
//     `reasoning` output items (id, summary, encrypted_content) before the function_call they led to; usage.output_tokens_details.reasoning_tokens counts them.
//   · The API accepts a replay with the reasoning items, without them, with or without ids — replaying them is the documented way to keep the
//     model's reasoning across tool rounds when nothing is stored server-side, so this adapter replays them (from an in-process map keyed by call_id).
// Safety: the process has a HARD spend cap (LLM_RESPONSES_PROCESS_BUDGET_USD, required); every call is logged as `tappyai_llm_call` with the API that
// served it; nothing here logs prompts, reasoning content, headers or the key. Streaming is emulated from a non-streamed response (documented limit).

type CallOpts = Parameters<LanguageModelV1['doGenerate']>[0]
type GenerateResult = Awaited<ReturnType<LanguageModelV1['doGenerate']>>
type RespItem = Record<string, unknown>

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
/**
 * C2 test seam: LLM_RESPONSES_BASE_URL=http://127.0.0.1:<port> points the adapter at a LOCAL mock upstream (end-to-end latency/streaming tests without spending money).
 * Honoured ONLY for a loopback host over http — anything else is ignored, so a mistaken value can never send the API key to another machine.
 */
export function responsesUrl(env: Record<string, string | undefined> = process.env): string {
  const base = (env.LLM_RESPONSES_BASE_URL ?? '').trim()
  if (!base) return OPENAI_RESPONSES_URL
  try {
    const u = new URL(base)
    if (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]')) return `${u.origin}/v1/responses`
  } catch { /* fall through */ }
  return OPENAI_RESPONSES_URL
}
const RESPONSES_URL = responsesUrl()
export const responsesEnabled = (env: Record<string, string | undefined> = process.env): boolean => (env.LLM_OPENAI_API ?? '').trim().toLowerCase() === 'responses'

// ── reasoning replay (store:false) ────────────────────────────────────────────────────────────────────────────
const REPLAY_TTL_MS = 30 * 60 * 1000
const REPLAY_MAX = 2000
const replayStore = new Map<string, { reasoning: RespItem[]; at: number }>()
function rememberReasoning(callIds: string[], reasoning: RespItem[], now = Date.now()): void {
  if (!reasoning.length || !callIds.length) return
  for (const id of callIds) replayStore.set(id, { reasoning, at: now })
  if (replayStore.size > REPLAY_MAX) for (const k of replayStore.keys()) { if (replayStore.size <= REPLAY_MAX * 0.8) break; replayStore.delete(k) } // oldest first (Map keeps insertion order)
}

// ── process budget (hard stop, in-process, independent of any proxy) ───────────────────────────────────────────
const FORECAST_USD = 0.02
export const UNKNOWN_CALL_USD = 0.02
let procSpendUsd = 0
let inflight = 0
export class ResponsesBudgetError extends Error { constructor(m: string) { super(m); this.name = 'ResponsesBudgetError' } }
export function responsesProcessSpend(): number { return procSpendUsd }
export function __resetResponsesStateForTests(): void { replayStore.clear(); procSpendUsd = 0; inflight = 0 }
function reserveBudget(env: Record<string, string | undefined> = process.env): void {
  const cap = Number(env.LLM_RESPONSES_PROCESS_BUDGET_USD)
  if (!(cap > 0)) throw new ResponsesBudgetError('responses_budget_not_configured: set LLM_RESPONSES_PROCESS_BUDGET_USD (> 0)')
  // The reservation per in-flight call. Default 0.02 USD = the worst single agent step (a long prompt plus reasoning); a small probe may lower it.
  const forecast = Number(env.LLM_RESPONSES_FORECAST_USD) > 0 ? Number(env.LLM_RESPONSES_FORECAST_USD) : FORECAST_USD
  if (procSpendUsd + (inflight + 1) * forecast > cap) throw new ResponsesBudgetError(`responses_budget_exhausted: spent ${procSpendUsd.toFixed(4)} + ${inflight + 1} in flight x ${forecast} > cap ${cap}`)
  inflight++
}

// ── request building (exported for tests) ─────────────────────────────────────────────────────────────────────
export function promptToResponsesInput(prompt: CallOpts['prompt'], now = Date.now()): { instructions: string; input: RespItem[]; replayed: number; warnings: string[] } {
  const instructions: string[] = []; const input: RespItem[] = []; const warnings: string[] = []; let replayed = 0
  for (const m of prompt) {
    if (m.role === 'system') { instructions.push(m.content); continue }
    if (m.role === 'user') {
      const parts: RespItem[] = []
      for (const p of m.content) {
        if (p.type === 'text') parts.push({ type: 'input_text', text: p.text })
        else if (p.type === 'image') parts.push({ type: 'input_image', image_url: p.image instanceof URL ? p.image.toString() : `data:${p.mimeType ?? 'image/jpeg'};base64,${Buffer.from(p.image).toString('base64')}` })
        else warnings.push(`unsupported user part: ${p.type}`)
      }
      if (parts.length) input.push({ role: 'user', content: parts })
      continue
    }
    if (m.role === 'assistant') {
      const text = m.content.flatMap(p => (p.type === 'text' ? [p.text] : [])).join('')
      const calls = m.content.flatMap(p => (p.type === 'tool-call' ? [p] : []))
      const seen = new Set<string>(); const reasoning: RespItem[] = []
      for (const c of calls) {
        const r = replayStore.get(c.toolCallId)
        if (!r || now - r.at > REPLAY_TTL_MS) continue
        for (const it of r.reasoning) { const id = String(it.id ?? ''); if (id && !seen.has(id) && typeof it.encrypted_content === 'string') { seen.add(id); reasoning.push({ type: 'reasoning', id, summary: Array.isArray(it.summary) ? it.summary : [], encrypted_content: it.encrypted_content }) } }
      }
      replayed += reasoning.length
      input.push(...reasoning)
      if (text) input.push({ role: 'assistant', content: [{ type: 'output_text', text }] })
      for (const c of calls) input.push({ type: 'function_call', call_id: c.toolCallId, name: c.toolName, arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args ?? {}) })
      continue
    }
    if (m.role === 'tool') for (const r of m.content) input.push({ type: 'function_call_output', call_id: r.toolCallId, output: r.isError ? JSON.stringify({ error: r.result ?? null }) : typeof r.result === 'string' ? r.result : JSON.stringify(r.result ?? null) })
  }
  return { instructions: instructions.join('\n\n'), input, replayed, warnings }
}

/** C2_REASONING_HEADROOM_TOKENS: extra output tokens for reasoning (0 = off, max 8000). One reader, shared with the request budget. */
export { reasoningHeadroomTokens }

export function buildResponsesRequest(modelId: string, effort: ReasoningEffort, opts: CallOpts, now = Date.now()): { body: Record<string, unknown>; replayed: number; warnings: string[] } {
  const { instructions, input, replayed, warnings } = promptToResponsesInput(opts.prompt, now)
  const body: Record<string, unknown> = { model: modelId, input, store: false, reasoning: { effort }, include: ['reasoning.encrypted_content'] }
  if (instructions) body.instructions = instructions
  // C2_REASONING_HEADROOM_TOKENS (C2 Phase 3): on the Responses API the reasoning tokens count INSIDE max_output_tokens, so an answer budget
  // sized for visible text (1500) was eaten by reasoning in 23/24 cut calls of benchmark C. With reasoning on, the limit gets this headroom on top.
  // C2_REQUEST_BUDGET: under a request ledger every generation is capped at 4 000 output tokens, reasoning and text TOGETHER (the API has one cap).
  if (opts.maxTokens != null) body.max_output_tokens = Math.min(opts.maxTokens + (effort !== 'none' ? reasoningHeadroomTokens() : 0), currentBudget() ? REQUEST_LIMITS.maxOutputPerCall : Infinity)
  const mode = opts.mode
  if (mode.type === 'regular') {
    const fn = (mode.tools ?? []).filter(t => t.type === 'function')
    for (const t of mode.tools ?? []) if (t.type !== 'function') warnings.push(`unsupported tool: ${t.type}`)
    if (fn.length) {
      body.tools = fn.map(t => ({ type: 'function', name: t.name, description: t.description ?? '', parameters: t.parameters, strict: false }))
      body.parallel_tool_calls = (opts.providerMetadata as Record<string, Record<string, unknown>> | undefined)?.tappy?.parallelTools === true
      const tc = mode.toolChoice
      if (tc) body.tool_choice = tc.type === 'tool' ? { type: 'function', name: tc.toolName } : tc.type
    }
  }
  return { body, replayed, warnings }
}

// ── response parsing (exported for tests) ─────────────────────────────────────────────────────────────────────
export interface ParsedResponses {
  text: string
  toolCalls: Array<{ toolCallType: 'function'; toolCallId: string; toolName: string; args: string }>
  finishReason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'other'
  usage: RawUsage | undefined
  reasoningItems: RespItem[]
  itemTypes: string[]
}
/** The Responses usage → the vendor shape priced by openaiCallCost. Output tokens already INCLUDE reasoning tokens (billed once, at the output rate). */
export function usageOfResponses(u: unknown): RawUsage | undefined {
  const x = u as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } } | null | undefined
  if (!x || typeof x.input_tokens !== 'number' || typeof x.output_tokens !== 'number') return undefined
  const cached = x.input_tokens_details?.cached_tokens ?? 0
  // Same conservative rule as the chat adapter: uncached input is priced at the cache-write rate (an over-count, never an under-count).
  return { prompt_tokens: x.input_tokens, completion_tokens: x.output_tokens, prompt_tokens_details: { cached_tokens: cached, cache_write_tokens: Math.max(0, x.input_tokens - cached) }, completion_tokens_details: { reasoning_tokens: x.output_tokens_details?.reasoning_tokens ?? 0 } }
}
export function parseResponsesBody(j: Record<string, unknown>): ParsedResponses {
  const status = String(j.status ?? 'completed')
  if (status === 'failed' || status === 'cancelled') throw new Error(`responses_${status}: ${String((j.error as { message?: string } | null)?.message ?? 'no detail').slice(0, 200)}`)
  const out = Array.isArray(j.output) ? (j.output as RespItem[]) : []
  let text = ''; const toolCalls: ParsedResponses['toolCalls'] = []; const reasoningItems: RespItem[] = []
  for (const it of out) {
    if (it.type === 'message') for (const c of (Array.isArray(it.content) ? (it.content as RespItem[]) : [])) { if (c.type === 'output_text') text += String(c.text ?? ''); else if (c.type === 'refusal') text += String(c.refusal ?? '') }
    else if (it.type === 'function_call') toolCalls.push({ toolCallType: 'function', toolCallId: String(it.call_id), toolName: String(it.name), args: typeof it.arguments === 'string' && it.arguments ? it.arguments : '{}' })
    else if (it.type === 'reasoning') reasoningItems.push(it)
  }
  const reason = String((j.incomplete_details as { reason?: string } | null)?.reason ?? '')
  const finishReason: ParsedResponses['finishReason'] = status === 'incomplete' ? (reason === 'content_filter' ? 'content-filter' : 'length') : toolCalls.length > 0 ? 'tool-calls' : 'stop'
  return { text, toolCalls, finishReason, usage: usageOfResponses(j.usage), reasoningItems, itemTypes: out.map(o => String(o.type)) }
}

const scrub = (s: string): string => s.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]').slice(0, 300)

/** One POST to /v1/responses. Errors are APICallError (statusCode + retryable like the SDK's), never carrying the key, headers or request body. */
async function postResponses(apiKey: string, body: Record<string, unknown>, external: AbortSignal | undefined): Promise<{ status: number; json: Record<string, unknown> }> {
  const timeoutMs = Number(process.env.LLM_RESPONSES_TIMEOUT_MS) > 0 ? Number(process.env.LLM_RESPONSES_TIMEOUT_MS) : 60_000
  if (external?.aborted) throw (external.reason ?? new Error('aborted'))
  const ctrl = new AbortController(); let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctrl.abort() }, timeoutMs)
  const onExternal = () => ctrl.abort()
  external?.addEventListener('abort', onExternal, { once: true })
  try {
    const res = await safePostResponse(RESPONSES_URL, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal })
    const raw = await res.text()
    let json: Record<string, unknown> | null = null
    try { json = JSON.parse(raw) as Record<string, unknown> } catch { /* not json */ }
    if (!res.ok) {
      const detail = scrub(String((json?.error as { message?: string } | undefined)?.message ?? raw))
      throw new APICallError({ message: `OpenAI Responses HTTP ${res.status}: ${detail}`, url: RESPONSES_URL, requestBodyValues: {}, statusCode: res.status, responseBody: detail, isRetryable: res.status === 408 || res.status === 409 || res.status === 429 || res.status >= 500 })
    }
    if (!json) throw new APICallError({ message: 'OpenAI Responses: malformed JSON body', url: RESPONSES_URL, requestBodyValues: {}, statusCode: res.status, isRetryable: false })
    return { status: res.status, json }
  } catch (e) {
    if (e instanceof APICallError) throw e
    if (timedOut) throw new Error(`responses_timeout_${timeoutMs}ms`)
    if (external?.aborted) throw (external.reason ?? e)
    throw new Error(`responses_network_error: ${scrub(String((e as Error)?.message ?? e))}`)
  } finally { clearTimeout(timer); external?.removeEventListener('abort', onExternal) }
}

function logCall(o: Record<string, unknown>): void { try { console.log(JSON.stringify({ type: 'tappyai_llm_call', served_provider: 'openai', ...o })) } catch { /* logging must never break a call */ } }

async function responsesGenerate(modelId: string, effort: ReasoningEffort, apiKey: string, role: string, opts: CallOpts): Promise<GenerateResult> {
  reserveBudget()
  const t0 = Date.now()
  const { body, replayed, warnings } = buildResponsesRequest(modelId, effort, opts)
  const mk = currentMarks()
  mk?.mark('upstream_call_start', { role, effort, streamed: false })
  try {
    const { json } = await postResponses(apiKey, body, opts.abortSignal)
    const p = parseResponsesBody(json)
    // C2 latency marks: this adapter does NOT stream (the whole answer arrives at once), so there is no upstream first delta to mark — `streamed:false` says so.
    mk?.mark('upstream_call_end', { role, finish: p.finishReason, out_tokens: p.usage?.completion_tokens ?? null, reasoning_tokens: p.usage?.completion_tokens_details?.reasoning_tokens ?? null, streamed: false })
    rememberReasoning(p.toolCalls.map(c => c.toolCallId), p.reasoningItems)
    const cost = p.usage ? openaiCallCost(modelId, p.usage) : null
    const usd = cost?.usd ?? UNKNOWN_CALL_USD
    procSpendUsd += usd
    logCall({ role, served_api: 'responses', model: modelId, effort, status: 'ok', ms: Date.now() - t0, inTok: p.usage?.prompt_tokens ?? null, outTok: p.usage?.completion_tokens ?? null, reasoningTok: p.usage?.completion_tokens_details?.reasoning_tokens ?? null, cachedTok: p.usage?.prompt_tokens_details?.cached_tokens ?? null, usd, costUnknown: !cost, toolCalls: p.toolCalls.length, replayedReasoning: replayed, finish: p.finishReason, items: p.itemTypes.join(',') })
    const tappyCost = { ...(cost ?? { provider: 'openai', model: modelId, inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, usd }), effort, api: 'responses', replayedReasoningItems: replayed, ...(cost ? {} : { costUnknown: true }) }
    return {
      text: p.text || undefined, toolCalls: p.toolCalls.length ? p.toolCalls : undefined, finishReason: p.finishReason,
      usage: { promptTokens: p.usage?.prompt_tokens ?? 0, completionTokens: p.usage?.completion_tokens ?? 0 },
      rawCall: { rawPrompt: { items: (body.input as unknown[]).length }, rawSettings: { model: modelId, effort, api: 'responses' } },
      response: { id: typeof json.id === 'string' ? json.id : undefined, modelId: typeof json.model === 'string' ? json.model : undefined },
      warnings: warnings.map(message => ({ type: 'other' as const, message })),
      providerMetadata: { tappy: { cost: tappyCost } } as never,
    }
  } catch (e) {
    // A request the API refused (4xx) was not billed; a timeout, 5xx or network failure may have been: counted at a quarter of the forecast.
    const refused = e instanceof APICallError && (e.statusCode ?? 0) >= 400 && (e.statusCode ?? 0) < 500
    const charged = refused ? 0 : UNKNOWN_CALL_USD / 4
    mk?.mark('upstream_call_error', { role, http: e instanceof APICallError ? e.statusCode ?? null : null })
    procSpendUsd += charged
    logCall({ role, served_api: 'responses', model: modelId, effort, status: 'error', usd: charged, ms: Date.now() - t0, http: e instanceof APICallError ? e.statusCode ?? null : null, error: scrub(String((e as Error)?.message ?? e)).slice(0, 160), replayedReasoning: replayed })
    throw e
  } finally { inflight = Math.max(0, inflight - 1) }
}

// ── TAPPY_ANSWER_V4 · the hosted web search (owner 19/10 night: "đổi bộ máy tra cứu") ─────────────────────────────────────────────────────────
// ONE Responses call with OpenAI's hosted `web_search` tool — the engine the parity reference used (it won every lookup question of the V4 round)
// — returning what it found as text plus its url_citation sources. Same key, same in-process spend cap, same `tappyai_llm_call` log as every other
// call; the search fee is added at the listed price per search call. Never logs the instructions, the input, the answer or the key.
/** Listed price of one hosted web_search call (pricing page, reasoning models). */
export const HOSTED_SEARCH_USD = 0.01

export interface HostedSearchSource { url: string; title: string; quotes: string[] }
export interface HostedSearchResult { text: string; sources: HostedSearchSource[]; searches: number; usd: number; incomplete: string | null }

/**
 * Parses a hosted-search response: the answer text with every citation span replaced by a source marker `{{SRC:n}}` (n = index in `sources`),
 * each cited URL with the sentences that cite it, and the number of search calls.
 */
export function parseHostedSearch(j: Record<string, unknown>): Omit<HostedSearchResult, 'usd'> {
  const out = Array.isArray(j.output) ? (j.output as RespItem[]) : []
  const searches = out.filter(o => o.type === 'web_search_call').length
  let text = ''
  const sources: HostedSearchSource[] = []
  const indexOf = new Map<string, number>()
  for (const it of out) {
    if (it.type !== 'message') continue
    for (const c of (Array.isArray(it.content) ? (it.content as RespItem[]) : [])) {
      if (c.type !== 'output_text') continue
      let t = String(c.text ?? '')
      const cleanUrl = (u: unknown) => String(u).replace(/([?&])utm_source=openai(&|$)/, (_m, p: string, q: string) => (q ? p : '')).replace(/[?&]$/, '')
      const anns = (Array.isArray(c.annotations) ? (c.annotations as RespItem[]) : [])
        .filter(a => a.type === 'url_citation' && typeof a.url === 'string' && typeof a.start_index === 'number' && typeof a.end_index === 'number')
        .sort((a, b) => (a.start_index as number) - (b.start_index as number))
      // sources numbered in READING order (the first cited is S1) …
      for (const a of anns) { const url = cleanUrl(a.url); if (!indexOf.has(url)) { indexOf.set(url, sources.length); sources.push({ url, title: typeof a.title === 'string' ? a.title.slice(0, 200) : '', quotes: [] }) } }
      // … markers inserted right to left, so the earlier indices stay valid
      for (const a of [...anns].reverse()) {
        const k = indexOf.get(cleanUrl(a.url))!
        const start = a.start_index as number, end = a.end_index as number
        // the sentence the citation belongs to: from the previous sentence end / line break up to the citation
        const before = t.slice(0, start)
        const from = Math.max(before.lastIndexOf('\n'), before.search(/[.!?]\s[^.!?\n]*$/)) + 1
        const q = before.slice(from).replace(/\{\{SRC:\d+\}\}/g, '').trim()
        if (q.length >= 8 && sources[k].quotes.length < 8 && !sources[k].quotes.includes(q)) sources[k].quotes.push(q.slice(0, 500))
        t = `${t.slice(0, start).replace(/[ \t]+$/, '')} {{SRC:${k}}}${t.slice(end)}`
      }
      text += t
    }
  }
  const status = String(j.status ?? 'completed')
  const incomplete = status === 'incomplete' ? String((j.incomplete_details as { reason?: string } | null)?.reason ?? 'incomplete') : null
  return { text: text.trim(), sources, searches, incomplete }
}

export async function hostedWebSearch(o: { instructions: string; input: string; effort?: ReasoningEffort; country?: string; maxSearches?: number; maxOutputTokens?: number; signal?: AbortSignal; model?: string }): Promise<HostedSearchResult> {
  const apiKey = process.env.OPENAI_API_KEY ?? ''
  if (!apiKey) throw new Error('hosted_search_not_configured')
  reserveBudget()
  const t0 = Date.now()
  const modelId = o.model ?? DEFAULT_MODEL
  const effort = o.effort ?? 'low'
  const body: Record<string, unknown> = {
    model: modelId, instructions: o.instructions, input: o.input, store: false,
    reasoning: { effort }, max_output_tokens: o.maxOutputTokens ?? 2_000,
    tools: [{ type: 'web_search', user_location: { type: 'approximate', country: (o.country ?? 'VN').slice(0, 2).toUpperCase() } }],
    ...(o.maxSearches ? { max_tool_calls: o.maxSearches } : {}),
  }
  try {
    const { json } = await postResponses(apiKey, body, o.signal)
    const p = parseHostedSearch(json)
    const usage = usageOfResponses(json.usage)
    const cost = usage ? openaiCallCost(modelId, usage) : null
    const usd = Math.round(((cost?.usd ?? UNKNOWN_CALL_USD) + p.searches * HOSTED_SEARCH_USD) * 1e7) / 1e7
    procSpendUsd += usd
    logCall({ role: 'web_research', served_api: 'responses', model: modelId, effort, status: 'ok', ms: Date.now() - t0, inTok: usage?.prompt_tokens ?? null, outTok: usage?.completion_tokens ?? null, searches: p.searches, sources: p.sources.length, usd, costUnknown: !cost, incomplete: p.incomplete })
    return { ...p, usd }
  } catch (e) {
    const refused = e instanceof APICallError && (e.statusCode ?? 0) >= 400 && (e.statusCode ?? 0) < 500
    const charged = refused ? 0 : UNKNOWN_CALL_USD / 4
    procSpendUsd += charged
    logCall({ role: 'web_research', served_api: 'responses', model: modelId, effort, status: 'error', usd: charged, ms: Date.now() - t0, http: e instanceof APICallError ? e.statusCode ?? null : null, error: scrub(String((e as Error)?.message ?? e)).slice(0, 160) })
    throw e
  } finally { inflight = Math.max(0, inflight - 1) }
}

// ── C2_STREAM_ADAPTER=1 (P2 layer 2, default OFF): a REAL streamed call (stream:true, server-sent events) ─────────────────────────────────────
// Text deltas leave as they arrive (`response.output_text.delta`); tool calls, reasoning items (for the store:false replay), the finish reason
// and the usage come from the terminal event's full response body (`response.completed` / `response.incomplete`), parsed by the SAME
// parseResponsesBody as the non-streamed call — so a streamed call ends exactly as a generated one would. A provider `error` event, a
// `response.failed`, a broken connection or a stream that ends without a terminal event becomes an `error` part (never a silent success).
// Cancelling the stream (client gone) aborts the upstream request at once. Same process budget, same cost / call log, same latency marks plus
// `upstream_first_delta` (the true TTFT of the model's text).
export const streamAdapterOn = (): boolean => (process.env.C2_STREAM_ADAPTER ?? '').trim() === '1'

/** Splits an SSE byte stream into `{event, data}` records (data JSON-parsed; unparsable records are skipped). Exported for tests. */
export function sseRecords(): TransformStream<string, { event: string; data: Record<string, unknown> }> {
  let buf = ''
  const flushRecord = (raw: string, c: TransformStreamDefaultController<{ event: string; data: Record<string, unknown> }>) => {
    let event = 'message'; const data: string[] = []
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    if (!data.length) return
    try { c.enqueue({ event, data: JSON.parse(data.join('\n')) as Record<string, unknown> }) } catch { /* not JSON: skipped */ }
  }
  return new TransformStream({
    transform(chunk, c) {
      buf += chunk
      let i
      while ((i = buf.search(/\r?\n\r?\n/)) >= 0) { const m = buf.match(/\r?\n\r?\n/)!; flushRecord(buf.slice(0, i), c); buf = buf.slice(i + m[0].length) }
    },
    flush(c) { if (buf.trim()) flushRecord(buf, c) },
  })
}

async function responsesStream(modelId: string, effort: ReasoningEffort, apiKey: string, role: string, opts: CallOpts): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
  reserveBudget()
  const t0 = Date.now()
  const built = buildResponsesRequest(modelId, effort, opts)
  const body: Record<string, unknown> = { ...built.body, stream: true }
  const mk = currentMarks()
  mk?.mark('upstream_call_start', { role, effort, streamed: true })
  const timeoutMs = Number(process.env.LLM_RESPONSES_TIMEOUT_MS) > 0 ? Number(process.env.LLM_RESPONSES_TIMEOUT_MS) : 60_000
  const ctrl = new AbortController(); let timedOut = false
  const timer = setTimeout(() => { timedOut = true; ctrl.abort() }, timeoutMs)
  const external = opts.abortSignal
  const onExternal = () => ctrl.abort()
  if (external?.aborted) { clearTimeout(timer); inflight = Math.max(0, inflight - 1); throw (external.reason ?? new Error('aborted')) }
  external?.addEventListener('abort', onExternal, { once: true })
  let settled = false
  const finishBook = (o: { ok: boolean; usd: number; extra: Record<string, unknown> }) => {
    if (settled) return
    settled = true
    clearTimeout(timer); external?.removeEventListener('abort', onExternal)
    procSpendUsd += o.usd; inflight = Math.max(0, inflight - 1)
    logCall({ role, served_api: 'responses', streamed: true, model: modelId, effort, status: o.ok ? 'ok' : 'error', ms: Date.now() - t0, usd: o.usd, replayedReasoning: built.replayed, ...o.extra })
  }
  let res: Response
  try {
    res = await safePostResponse(RESPONSES_URL, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body), signal: ctrl.signal })
  } catch (e) {
    const msg = timedOut ? `responses_timeout_${timeoutMs}ms` : external?.aborted ? 'aborted' : `responses_network_error: ${scrub(String((e as Error)?.message ?? e))}`
    mk?.mark('upstream_call_error', { role, http: null })
    finishBook({ ok: false, usd: UNKNOWN_CALL_USD / 4, extra: { error: msg.slice(0, 160) } })
    if (external?.aborted) throw (external.reason ?? e)
    throw new Error(msg)
  }
  if (!res.ok || !res.body) {
    const raw = await res.text().catch(() => '')
    let detail = raw
    try { detail = String((JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw) } catch { /* raw */ }
    detail = scrub(detail)
    mk?.mark('upstream_call_error', { role, http: res.status })
    const refused = res.status >= 400 && res.status < 500
    finishBook({ ok: false, usd: refused ? 0 : UNKNOWN_CALL_USD / 4, extra: { http: res.status, error: detail.slice(0, 160) } })
    throw new APICallError({ message: `OpenAI Responses HTTP ${res.status}: ${detail}`, url: RESPONSES_URL, requestBodyValues: {}, statusCode: res.status, responseBody: detail, isRetryable: res.status === 408 || res.status === 409 || res.status === 429 || res.status >= 500 })
  }
  const records = res.body.pipeThrough(new TextDecoderStream()).pipeThrough(sseRecords()).getReader()
  let textSent = ''
  let deltas = 0
  const stream = new ReadableStream<LanguageModelV1StreamPart>({
    start(c) { c.enqueue({ type: 'response-metadata', modelId, timestamp: new Date() }) },
    async pull(c) {
      for (;;) {
        let n: ReadableStreamReadResult<{ event: string; data: Record<string, unknown> }>
        try { n = await records.read() } catch (e) {
          mk?.mark('upstream_call_error', { role, http: null, mid_stream: true })
          finishBook({ ok: false, usd: UNKNOWN_CALL_USD / 4, extra: { error: timedOut ? `responses_timeout_${timeoutMs}ms` : external?.aborted ? 'aborted' : 'stream_broken', mid_stream: true, deltas } })
          c.enqueue({ type: 'error', error: new Error(timedOut ? `responses_timeout_${timeoutMs}ms` : 'responses_stream_broken') }); c.close(); return
        }
        if (n.done) {
          // ended without a terminal event: never reported as success
          mk?.mark('upstream_call_error', { role, http: null, mid_stream: true })
          finishBook({ ok: false, usd: UNKNOWN_CALL_USD / 4, extra: { error: 'stream_ended_without_completion', mid_stream: true, deltas } })
          c.enqueue({ type: 'error', error: new Error('responses_stream_ended_without_completion') }); c.close(); return
        }
        const { data } = n.value
        const type = String(data.type ?? n.value.event)
        if (type === 'response.output_text.delta' && typeof data.delta === 'string' && data.delta) {
          if (!deltas) mk?.markOnce('upstream_first_delta', { role })
          deltas++; textSent += data.delta
          c.enqueue({ type: 'text-delta', textDelta: data.delta }); return
        }
        if (type === 'error' || type === 'response.failed') {
          const msg = scrub(String((data.error as { message?: string } | undefined)?.message ?? (data.response as { error?: { message?: string } } | undefined)?.error?.message ?? data.message ?? 'provider error'))
          mk?.mark('upstream_call_error', { role, http: null, mid_stream: true })
          finishBook({ ok: false, usd: UNKNOWN_CALL_USD / 4, extra: { error: msg.slice(0, 160), mid_stream: true, deltas } })
          c.enqueue({ type: 'error', error: new Error(`responses_failed: ${msg}`) }); c.close(); return
        }
        if (type === 'response.completed' || type === 'response.incomplete') {
          let p: ParsedResponses
          try { p = parseResponsesBody((data.response ?? {}) as Record<string, unknown>) } catch (e) {
            finishBook({ ok: false, usd: UNKNOWN_CALL_USD / 4, extra: { error: scrub(String((e as Error).message)).slice(0, 160), deltas } })
            c.enqueue({ type: 'error', error: e }); c.close(); return
          }
          // text the provider reported but never streamed as deltas (should not happen) still reaches the caller, after what was streamed
          if (p.text.length > textSent.length && p.text.startsWith(textSent)) c.enqueue({ type: 'text-delta', textDelta: p.text.slice(textSent.length) })
          for (const t of p.toolCalls) c.enqueue({ type: 'tool-call', ...t })
          rememberReasoning(p.toolCalls.map(x => x.toolCallId), p.reasoningItems)
          const cost = p.usage ? openaiCallCost(modelId, p.usage) : null
          const usd = cost?.usd ?? UNKNOWN_CALL_USD
          mk?.mark('upstream_call_end', { role, finish: p.finishReason, out_tokens: p.usage?.completion_tokens ?? null, reasoning_tokens: p.usage?.completion_tokens_details?.reasoning_tokens ?? null, streamed: true, deltas })
          finishBook({ ok: true, usd, extra: { inTok: p.usage?.prompt_tokens ?? null, outTok: p.usage?.completion_tokens ?? null, reasoningTok: p.usage?.completion_tokens_details?.reasoning_tokens ?? null, cachedTok: p.usage?.prompt_tokens_details?.cached_tokens ?? null, costUnknown: !cost, toolCalls: p.toolCalls.length, finish: p.finishReason, deltas, items: p.itemTypes.join(',') } })
          const tappyCost = { ...(cost ?? { provider: 'openai', model: modelId, inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, usd }), effort, api: 'responses', streamed: true, replayedReasoningItems: built.replayed, ...(cost ? {} : { costUnknown: true }) }
          c.enqueue({ type: 'finish', finishReason: p.finishReason, usage: { promptTokens: p.usage?.prompt_tokens ?? 0, completionTokens: p.usage?.completion_tokens ?? 0 }, providerMetadata: { tappy: { cost: tappyCost } } as never })
          c.close(); return
        }
        // response.created / output_item.* / *.done / function_call_arguments.delta: the terminal body carries everything they say
      }
    },
    async cancel(reason) {
      ctrl.abort()
      try { await records.cancel(reason) } catch { /* already closed */ }
      mk?.mark('upstream_call_error', { role, http: null, cancelled: true })
      finishBook({ ok: false, usd: UNKNOWN_CALL_USD / 4, extra: { error: 'cancelled', deltas } })
    },
  })
  return { stream, rawCall: { rawPrompt: { items: (body.input as unknown[]).length }, rawSettings: { model: modelId, effort, api: 'responses', stream: true } }, warnings: built.warnings.map(message => ({ type: 'other' as const, message })) }
}

/** Chunks a finished answer into stream parts. The Responses call is NOT streamed (prototype limit): first byte = last byte. */
function streamOf(r: GenerateResult): { stream: ReadableStream<LanguageModelV1StreamPart>; rawCall: GenerateResult['rawCall']; warnings: GenerateResult['warnings'] } {
  const stream = new ReadableStream<LanguageModelV1StreamPart>({
    start(c) {
      c.enqueue({ type: 'response-metadata', id: r.response?.id, modelId: r.response?.modelId, timestamp: new Date() })
      const text = r.text ?? ''
      for (let i = 0; i < text.length; i += 160) c.enqueue({ type: 'text-delta', textDelta: text.slice(i, i + 160) })
      for (const t of r.toolCalls ?? []) c.enqueue({ type: 'tool-call', ...t })
      c.enqueue({ type: 'finish', finishReason: r.finishReason, usage: r.usage, providerMetadata: r.providerMetadata })
      c.close()
    },
  })
  return { stream, rawCall: r.rawCall, warnings: r.warnings }
}

/** 31/10: the call asked for the Responses API itself (AIStreamOptions.thinkEffort → providerMetadata.tappy.api), whatever LLM_OPENAI_API says. */
const thinkAsked = (o: { providerMetadata?: Record<string, Record<string, unknown>> }): boolean => o.providerMetadata?.tappy?.api === 'responses'

/**
 * 31/10 (mode "Suy nghĩ"): the Chat Completions model, except for a regular call that asked for the Responses API (thinkAsked) - that one call
 * goes to the Responses model (reasoning WITH tools, streamed) at the effort it asked for. Every other call is the chat model, byte for byte.
 */
function chatOrThinkModel(modelId: string, effort: ReasoningEffort, apiKey: string, role: string): LanguageModelV1 {
  const chat = lunaModel(modelId, effort, apiKey, false)
  let think: LanguageModelV1 | null = null
  const thinkModel = () => (think ??= responsesModel(modelId, effort, apiKey, false, role))
  // the Responses path needs its process spend cap (reserveBudget refuses every call without it): no cap configured → the chat model, as before
  const routed = (o: CallOpts) => o.mode?.type === 'regular' && thinkAsked(o as never) && Number(process.env.LLM_RESPONSES_PROCESS_BUDGET_USD) > 0
  return {
    ...chat,
    specificationVersion: 'v1',
    provider: chat.provider,
    modelId: chat.modelId,
    defaultObjectGenerationMode: chat.defaultObjectGenerationMode,
    supportsStructuredOutputs: false,
    supportsImageUrls: chat.supportsImageUrls, // 🔑 SSRF: carried explicitly, same as the chat wrapper
    doGenerate: opts => (routed(opts) ? thinkModel().doGenerate(opts) : chat.doGenerate(opts)),
    doStream: opts => (routed(opts) ? thinkModel().doStream(opts) : chat.doStream(opts)),
  }
}

function responsesModel(modelId: string, effort: ReasoningEffort, apiKey: string, structured: boolean, role: string): LanguageModelV1 {
  const chat = lunaModel(modelId, effort, apiKey, structured)
  const regular = (o: CallOpts) => o.mode?.type === 'regular'
  // C2_TOOL_ROUND_EFFORT: a per-step effort the caller set (AI.step `effort`) wins over the role's effort for this call only.
  const stepEffort = (o: CallOpts): ReasoningEffort | null => {
    const e = (o.providerMetadata as Record<string, Record<string, unknown>> | undefined)?.tappy?.effort
    return e === 'none' || e === 'low' || e === 'medium' || e === 'high' ? e : null
  }
  const sent = (o: CallOpts) => effortForCall(stepEffort(o) ?? effort, o as never, 'responses')
  return {
    ...chat,
    specificationVersion: 'v1',
    provider: 'openai.responses',
    modelId: chat.modelId,
    defaultObjectGenerationMode: chat.defaultObjectGenerationMode,
    supportsStructuredOutputs: structured,
    supportsImageUrls: chat.supportsImageUrls, // 🔑 SSRF: carried explicitly, same as the chat wrapper
    async doGenerate(opts) {
      if (!regular(opts)) { logCall({ role, served_api: 'chat', model: modelId, status: 'delegated', reason: 'object mode' }); return chat.doGenerate(opts) }
      return responsesGenerate(modelId, sent(opts), apiKey, role, opts)
    },
    async doStream(opts) {
      if (!regular(opts)) { logCall({ role, served_api: 'chat', model: modelId, status: 'delegated', reason: 'object mode' }); return chat.doStream(opts) }
      // C2_STREAM_ADAPTER: a real SSE stream; off → the finished answer chunked (first byte = last byte), unchanged.
      // 31/10: a call that asked for the Responses API itself (mode "Suy nghĩ", thinkAsked) is always really streamed.
      if (streamAdapterOn() || thinkAsked(opts)) return responsesStream(modelId, sent(opts), apiKey, role, opts)
      return streamOf(await responsesGenerate(modelId, sent(opts), apiKey, role, opts))
    },
  }
}

export function createOpenAIProvider(overrides: Partial<Record<ModelRole, string>>): AIProvider & { structuredModel(role: ModelRole): LanguageModelV1; effort(role: ModelRole): ReasoningEffort } {
  const key = () => process.env.OPENAI_API_KEY ?? ''
  const id = (role: ModelRole) => overrides[role] ?? DEFAULT_MODEL
  return {
    id: 'openai',
    isConfigured: () => !!process.env.OPENAI_API_KEY,
    model: (role) => (responsesEnabled() ? responsesModel(id(role), reasoningEffortFor(role), key(), false, role) : chatOrThinkModel(id(role), reasoningEffortFor(role), key(), role)),
    structuredModel: (role) => lunaModel(id(role), reasoningEffortFor(role), key(), true),
    effort: (role) => reasoningEffortFor(role),
  }
}
