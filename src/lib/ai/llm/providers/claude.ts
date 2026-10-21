import { createAnthropic } from '@ai-sdk/anthropic'
import type { CoreMessage, LanguageModelV1, LanguageModelV1StreamPart } from 'ai'
import type { AIProvider, CallCost } from '../provider'
import type { ModelOverrides, ModelRole } from '../types'
import { agentTransport, type FetchLike } from './anthropicTransport'

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
  consult:  'claude-haiku-4-5-20251001',
  intent:   'claude-haiku-4-5-20251001',
  plan:     'claude-haiku-4-5-20251001',
  agent:    'claude-haiku-4-5-20251001',
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
    //
    // SECOND BREAKPOINT — the last user message (cost optimization, 2026-09-18).
    // A tool turn is two requests: step 1 (system + history + user → tool call)
    // and step 2 (the same prefix + the tool call + its result → the reply).
    // With only the system breakpoint, step 2 re-pays the whole request-shaped
    // system segment (measured 3.3k–5k tokens) and the history at the uncached
    // rate. Marking the last user message caches the prefix that ENDS there, so
    // step 2 reads it at 10% of the price; the write premium (+25% on that
    // segment, once) is smaller than the read saving whenever the turn has a
    // second step. A one-step turn pays the premium and gains nothing — accepted:
    // ~65% of measured turns call a tool. Anthropic allows four breakpoints, so
    // the two never conflict, and responses stay identical either way.
    decorateMessages: claudeDecorateMessages,
  }
}

/** The two cache breakpoints described above (first system message, last user message). Shared by the agent model. */
export function claudeDecorateMessages(messages: CoreMessage[], opts?: { cacheHistory?: boolean }): CoreMessage[] {
  let marked = false
  const lastUser = opts?.cacheHistory === false ? -1 : messages.reduce((idx, m, i) => (m.role === 'user' ? i : idx), -1)
  return messages.map((m, i) => {
    if (i === lastUser) {
      return { ...m, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } } }
    }
    if (m.role !== 'system' || marked) return m
    marked = true
    return { ...m, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } } }
  })
}

// ── Agent runtime model: Claude Haiku 5.5 (AGENT_MODEL=haiku55, owner 2026-10-11) ──────────────────────────────────────
// Chosen by registry.ts for the agent runtime's calls when AGENT_MODEL=haiku55; Luna stays the default. Thinking is off
// (anthropicTransport.ts says why); the prompt and tools are the runtime's own, unchanged; prompt caching is the two
// breakpoints above (Anthropic renders tools → system → messages, so the first-system breakpoint caches the tool
// definitions and the static system block together; the per-turn system block and the data block sit after it).
export const HAIKU55_MODEL_ID = 'claude-haiku-5-5'

/**
 * List prices, USD per million tokens — platform.claude.com/docs/en/about-claude/pricing (read 2026-10-11).
 * Claude Haiku 5.5 has two rate cards chosen by the request's PROMPT length (input + cache reads + cache writes):
 *   ≤ 100,000 tokens: input $0.10 · 5-min cache write $0.125 · cache read $0.01 · output $0.50
 *   > 100,000 tokens: input $0.50 · 5-min cache write $0.625 · cache read $0.05 · output $2.50
 * Only the 5-minute cache is used (the SDK's `ephemeral` marker carries no ttl).
 */
interface Rates { in: number; cacheWrite: number; cacheRead: number; out: number }
const CLAUDE_PRICES: Array<[RegExp, { tierAbove?: number; low: Rates; high?: Rates }]> = [
  [/^claude-haiku-5-5/, { tierAbove: 100_000, low: { in: 0.10, cacheWrite: 0.125, cacheRead: 0.01, out: 0.50 }, high: { in: 0.50, cacheWrite: 0.625, cacheRead: 0.05, out: 2.50 } }],
]

/** Anthropic usage semantics: `input` is the UNCACHED input only; cache reads and writes are reported beside it. */
export interface AnthropicUsage { input: number; cacheRead: number; cacheWrite: number; output: number }

/** USD of one Anthropic call at list price, or null for a model with no price row. */
export function claudeCallCost(modelId: string, u: AnthropicUsage): CallCost | null {
  const row = CLAUDE_PRICES.find(([re]) => re.test(modelId))?.[1]
  if (!row) return null
  const prompt = u.input + u.cacheRead + u.cacheWrite
  const r = row.high && row.tierAbove != null && prompt > row.tierAbove ? row.high : row.low
  const usd = (u.input * r.in + u.cacheWrite * r.cacheWrite + u.cacheRead * r.cacheRead + u.output * r.out) / 1e6
  return {
    provider: 'anthropic', model: modelId, effort: 'thinking_off',
    inputTokens: prompt, cachedInputTokens: u.cacheRead, cacheWriteTokens: u.cacheWrite,
    outputTokens: u.output, reasoningTokens: 0,
    usd: Math.round(usd * 1e7) / 1e7,
  }
}

/** True when the agent model can be called (the key is present). Never reveals the key. */
export const anthropicConfigured = (): boolean => !!process.env.ANTHROPIC_API_KEY

/** The NAME of the variable to set (for the config log and the error line) — never its value. */
export const AGENT_MODEL_KEY_NAME = 'ANTHROPIC_API_KEY'

const usageFrom = (usage: { promptTokens: number; completionTokens: number } | undefined, meta: Record<string, Record<string, unknown>> | undefined): AnthropicUsage => {
  const a = meta?.anthropic ?? {}
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return { input: usage?.promptTokens ?? 0, cacheRead: num(a.cacheReadInputTokens), cacheWrite: num(a.cacheCreationInputTokens), output: usage?.completionTokens ?? 0 }
}

/** One log line per priced call: model, tokens in/out, cache read/write, USD (never prompt text, never the key). */
function logCost(c: CallCost, label: string): void {
  console.log(JSON.stringify({ type: 'tappyai_agent_model_cost', label, model: c.model, tokens_in: c.inputTokens - c.cachedInputTokens - c.cacheWriteTokens, tokens_out: c.outputTokens, cache_read: c.cachedInputTokens, cache_write: c.cacheWriteTokens, usd: c.usd }))
}

/** A failed call, logged by status and vendor error type only (the response body can echo the request; it is not logged). */
function logError(e: unknown, label: string): void {
  const err = e as { statusCode?: number; responseBody?: string; name?: string }
  let kind: string | null = null
  try { kind = (JSON.parse(err.responseBody ?? '') as { error?: { type?: string } }).error?.type ?? null } catch { kind = null }
  console.warn(JSON.stringify({ type: 'tappyai_agent_model_error', label, model: HAIKU55_MODEL_ID, status: err.statusCode ?? null, error_type: kind, name: err.name ?? null }))
}

/**
 * The agent runtime's Claude Haiku 5.5 model. Prices every call into `providerMetadata.tappy.cost` (the neutral key the
 * route and the runtime trace already read) and logs it. `fetchImpl` is for tests only.
 */
export function createHaiku55AgentModel(o: { label?: string; fetchImpl?: FetchLike } = {}): LanguageModelV1 {
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
    fetch: agentTransport(HAIKU55_MODEL_ID, o.fetchImpl) as never,
  })
  const inner = anthropic(HAIKU55_MODEL_ID)
  const label = o.label ?? 'agent'
  const withCost = (usage: { promptTokens: number; completionTokens: number } | undefined, meta: Record<string, Record<string, unknown>> | undefined) => {
    const cost = claudeCallCost(HAIKU55_MODEL_ID, usageFrom(usage, meta))
    if (!cost) return meta
    logCost(cost, label)
    return { ...(meta ?? {}), tappy: { ...((meta?.tappy as Record<string, unknown>) ?? {}), cost: cost as unknown as Record<string, unknown> } }
  }
  return {
    ...inner,
    specificationVersion: 'v1',
    provider: inner.provider,
    modelId: inner.modelId,
    defaultObjectGenerationMode: inner.defaultObjectGenerationMode,
    supportsStructuredOutputs: inner.supportsStructuredOutputs,
    // 🔑 SSRF (imageUrlSsrfGuardrail.test.ts): a prototype getter on the SDK model, lost by the spread above.
    supportsImageUrls: inner.supportsImageUrls,
    async doGenerate(opts) {
      try {
        const r = await inner.doGenerate(opts)
        return { ...r, providerMetadata: withCost(r.usage, r.providerMetadata as never) as never }
      } catch (e) { logError(e, label); throw e }
    },
    async doStream(opts) {
      try {
        const r = await inner.doStream(opts)
        const stream = r.stream.pipeThrough(new TransformStream<LanguageModelV1StreamPart, LanguageModelV1StreamPart>({
          transform(part, c) { c.enqueue(part.type === 'finish' ? { ...part, providerMetadata: withCost(part.usage, part.providerMetadata as never) as never } : part) },
        }))
        return { ...r, stream }
      } catch (e) { logError(e, label); throw e }
    },
  }
}
