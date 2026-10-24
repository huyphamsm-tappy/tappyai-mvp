// ── C2 P2 · the provider-level meter of the request budget (requestBudget.ts) ──────────────────────────────────────────────────────────────────
//
// Wraps ONE concrete upstream model (the primary, the Luna retry, the Claude fallback — each separately, below the fallback wrapper), so every
// request that actually goes upstream reserves before it starts and is charged with the provider's real usage afterwards. A fallback therefore
// counts as a second call, as it costs one. Outside a request ledger (flag off, crons, tests) the wrapper calls straight through, byte for byte.
//
// Under the ledger it also caps every generation at max_output_tokens 4 000 (REQUEST_LIMITS.maxOutputPerCall) — reasoning + text together.

import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai'
import { APICallError } from 'ai'
import { currentBudget, estimateTokens, promptChars, reasoningHeadroomTokens, requestBudgetOn, RequestBudgetError, REQUEST_LIMITS, type ActualUsage, type BudgetKind, type Ticket } from './requestBudget'
import { benchSpendGateOn, reserveSpend, utf8Bytes, type SpendHandle, type SpendSettleDetail } from './spendGate'
import { INPUT_TOKEN_OVERHEAD, worstCaseLlmCallUsd } from '../llm/pricing'

type CallOpts = Parameters<LanguageModelV1['doGenerate']>[0]

/** The real usage of a finished call: the adapter's priced `tappy.cost` when present, else the SDK usage (all input treated as uncached). */
export function usageFrom(usage: { promptTokens?: number; completionTokens?: number } | undefined, meta: unknown): ActualUsage {
  const c = ((meta as { tappy?: { cost?: Record<string, unknown> } } | undefined)?.tappy?.cost ?? null) as { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number; reasoningTokens?: number; usd?: number } | null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const input = num(c?.inputTokens) ?? num(usage?.promptTokens) ?? 0
  const output = num(c?.outputTokens) ?? num(usage?.completionTokens) ?? 0
  return { inputTokens: input, cachedInputTokens: num(c?.cachedInputTokens) ?? 0, outputTokens: output, reasoningTokens: num(c?.reasoningTokens), usd: num(c?.usd) }
}

/** The tokens of a finished call, for the injected spend gate only (the benchmark records them; nothing is logged here). */
const settleDetailOf = (u: ActualUsage): SpendSettleDetail => ({
  tokensIn: u.inputTokens, tokensOut: u.outputTokens, cachedIn: u.cachedInputTokens, ...(typeof u.reasoningTokens === 'number' ? { reasoning: u.reasoningTokens } : {}),
})

const billedUnknown = (e: unknown): boolean => !(e instanceof APICallError && (e.statusCode ?? 0) >= 400 && (e.statusCode ?? 0) < 500)

function capped(opts: CallOpts): CallOpts {
  const cap = REQUEST_LIMITS.maxOutputPerCall
  return { ...opts, maxTokens: Math.min(opts.maxTokens ?? cap, cap) }
}

/** The output this call may really produce: its cap plus the reasoning headroom the Responses adapter adds — never above the per-call cap. */
function outputCap(o: CallOpts): number {
  return Math.min(REQUEST_LIMITS.maxOutputPerCall, (o.maxTokens ?? REQUEST_LIMITS.maxOutputPerCall) + reasoningHeadroomTokens())
}

function reserveFor(opts: CallOpts, label: string, kind: BudgetKind): { ticket: Ticket; opts: CallOpts } | null {
  const b = currentBudget()
  if (!b) return null
  const o = capped(opts)
  const tools = o.mode?.type === 'regular' ? o.mode.tools : undefined
  const t = b.reserve(label, kind, estimateTokens(promptChars(o.prompt, tools)), outputCap(o))
  if (!t) throw new RequestBudgetError(`request_budget_exhausted: ${label}`, kind)
  return { ticket: t, opts: o }
}

/**
 * Every concrete upstream model passes through here (registry.ts wraps the primary, the retry and the fallback separately). Two independent
 * layers, both OFF by default, so with both flags unset this returns the model itself:
 *   · C2_REQUEST_BUDGET — the token/time ledger of a consult_v3 request (below, `ledgerModel`);
 *   · BENCH_SPEND_GATE  — a hard USD gate asked BEFORE each call is sent (`spendGated`, further down). Read when the model is resolved for a call.
 */
export function meteredModel(model: LanguageModelV1, label: string, kind: BudgetKind = 'main'): LanguageModelV1 {
  const base = ledgerModel(model, label, kind)
  return benchSpendGateOn() ? spendGated(base, label) : base
}

function ledgerModel(model: LanguageModelV1, label: string, kind: BudgetKind = 'main'): LanguageModelV1 {
  // Flag off: the model itself, untouched (no wrapper, no spread — the default configuration is byte-for-byte what it was).
  if (!requestBudgetOn()) return model
  return {
    ...model,
    specificationVersion: 'v1',
    provider: model.provider,
    modelId: model.modelId,
    defaultObjectGenerationMode: model.defaultObjectGenerationMode,
    supportsStructuredOutputs: model.supportsStructuredOutputs,
    // 🔑 SSRF: carried explicitly — a getter on the SDK model is lost by the spread (imageUrlSsrfGuardrail.test.ts).
    supportsImageUrls: model.supportsImageUrls,
    ...(typeof model.supportsUrl === 'function' ? { supportsUrl: model.supportsUrl.bind(model) } : {}),
    async doGenerate(opts) {
      const r = reserveFor(opts, label, kind)
      if (!r) return model.doGenerate(opts)
      const b = currentBudget()!
      try {
        const out = await model.doGenerate(r.opts)
        b.settle(r.ticket, usageFrom(out.usage, out.providerMetadata))
        return out
      } catch (e) { b.fail(r.ticket, billedUnknown(e)); throw e }
    },
    async doStream(opts) {
      const r = reserveFor(opts, label, kind)
      if (!r) return model.doStream(opts)
      const b = currentBudget()!
      let res: Awaited<ReturnType<LanguageModelV1['doStream']>>
      try { res = await model.doStream(r.opts) } catch (e) { b.fail(r.ticket, billedUnknown(e)); throw e }
      let settled = false
      const stream = res.stream.pipeThrough(new TransformStream<LanguageModelV1StreamPart, LanguageModelV1StreamPart>({
        transform(part, c) {
          if (part.type === 'finish' && !settled) { settled = true; b.settle(r.ticket, usageFrom(part.usage, part.providerMetadata)) }
          if (part.type === 'error' && !settled) { settled = true; b.fail(r.ticket, billedUnknown((part as { error?: unknown }).error)) }
          c.enqueue(part)
        },
        flush() { if (!settled) { settled = true; b.fail(r.ticket, true) } },
      }))
      // a cancelled stream (client gone) never reaches finish / flush: release its reservation, charge the estimate
      const reader = stream.getReader()
      const guarded = new ReadableStream<LanguageModelV1StreamPart>({
        async pull(c) { const n = await reader.read(); if (n.done) c.close(); else c.enqueue(n.value) },
        cancel(reason) { if (!settled) { settled = true; b.fail(r.ticket, true) } return reader.cancel(reason) },
      })
      return { ...res, stream: guarded }
    },
  }
}

// ── BENCH_SPEND_GATE · the model call is reserved BEFORE it is sent ────────────────────────────────────────────────────────────────────
// Worst case of ONE call = input at the dearest rate with NO cache (tokens <= UTF-8 bytes of everything sent, plus a flat framing allowance) +
// the output cap the call is sent with (reasoning included). The cap sent is the cap priced: an absent or larger cap becomes 4 000 (the same
// per-call ceiling as the request ledger). Each attempt the AI SDK makes (its own retries, the fallback model after a slow primary) arrives here
// as a separate doGenerate / doStream and so holds a reservation of its own. A failure after the request may have left is UNKNOWN (never
// released, never counted as 0); only a call that provably never started gives its reservation back.
/** An image or file part (also inside a tool result): billed by size / detail, not by bytes, so its cost cannot be bounded from the payload. */
function hasMediaPart(prompt: CallOpts['prompt']): boolean {
  const isMedia = (p: unknown): boolean => { const t = (p as { type?: unknown } | null)?.type; return t === 'image' || t === 'file' }
  for (const m of prompt as Array<{ content?: unknown }>) {
    if (!Array.isArray(m.content)) continue
    for (const part of m.content as Array<{ type?: unknown; content?: unknown }>) {
      if (isMedia(part)) return true
      if (part?.type === 'tool-result' && Array.isArray(part.content) && part.content.some(isMedia)) return true
    }
  }
  return false
}

/** `handle` is null only when the flag went OFF between resolving the model and making the call: the call then goes as it always did. */
function spendReserveFor(model: LanguageModelV1, opts: CallOpts, label: string): { handle: SpendHandle | null; opts: CallOpts } {
  const outCap = Math.min(opts.maxTokens ?? REQUEST_LIMITS.maxOutputPerCall, REQUEST_LIMITS.maxOutputPerCall)
  const o: CallOpts = { ...opts, maxTokens: outCap }
  // Everything that travels as text: the prompt, the mode (tools / schema), the response format and the provider options. Media cannot be bounded
  // by bytes (a URL is a short string, a picture costs hundreds of tokens): such a call has NO upper bound and is refused.
  const inputTokens = utf8Bytes({ prompt: o.prompt, mode: o.mode, responseFormat: (o as { responseFormat?: unknown }).responseFormat ?? null, providerMetadata: o.providerMetadata ?? null }) + INPUT_TOKEN_OVERHEAD
  const usd = !hasMediaPart(o.prompt) && Number.isFinite(inputTokens) ? worstCaseLlmCallUsd(model, inputTokens, outCap) : null
  return { handle: reserveSpend(`llm:${label}`, usd), opts: o }
}

/** A failure that happened INSIDE the request ledger before anything was sent is provably not sent; any other failure may have been billed. */
function failedBeforeSend(e: unknown): boolean { return e instanceof RequestBudgetError }

function spendGated(model: LanguageModelV1, label: string): LanguageModelV1 {
  return {
    ...model,
    specificationVersion: 'v1',
    provider: model.provider,
    modelId: model.modelId,
    defaultObjectGenerationMode: model.defaultObjectGenerationMode,
    supportsStructuredOutputs: model.supportsStructuredOutputs,
    // 🔑 SSRF: carried explicitly — a getter on the SDK model is lost by the spread (imageUrlSsrfGuardrail.test.ts).
    supportsImageUrls: model.supportsImageUrls,
    ...(typeof model.supportsUrl === 'function' ? { supportsUrl: model.supportsUrl.bind(model) } : {}),
    async doGenerate(opts) {
      if (opts.abortSignal?.aborted) throw opts.abortSignal.reason ?? new Error('aborted before the call') // nothing reserved, nothing sent
      const r = spendReserveFor(model, opts, label)
      const handle = r.handle
      if (!handle) return model.doGenerate(opts) // the flag went OFF since the model was resolved
      let out: Awaited<ReturnType<LanguageModelV1['doGenerate']>>
      try { out = await model.doGenerate(r.opts) } catch (e) { if (failedBeforeSend(e)) handle.release(); else handle.markUnknown(); throw e }
      const u = usageFrom(out.usage, out.providerMetadata)
      handle.settle(u.usd, settleDetailOf(u)) // null = no usable cost: the gate stops the run
      return out
    },
    async doStream(opts) {
      if (opts.abortSignal?.aborted) throw opts.abortSignal.reason ?? new Error('aborted before the call')
      const r = spendReserveFor(model, opts, label)
      const handle = r.handle
      if (!handle) return model.doStream(opts)
      let res: Awaited<ReturnType<LanguageModelV1['doStream']>>
      try { res = await model.doStream(r.opts) } catch (e) { if (failedBeforeSend(e)) handle.release(); else handle.markUnknown(); throw e }
      let settled = false
      const unknown = () => { if (!settled) { settled = true; handle.markUnknown() } }
      const stream = res.stream.pipeThrough(new TransformStream<LanguageModelV1StreamPart, LanguageModelV1StreamPart>({
        transform(part, c) {
          if (part.type === 'finish' && !settled) { settled = true; const u = usageFrom(part.usage, part.providerMetadata); handle.settle(u.usd, settleDetailOf(u)) }
          else if (part.type === 'error') unknown()
          c.enqueue(part)
        },
        flush() { unknown() }, // the stream ended without a finish part: what was billed is not known
      }))
      const reader = stream.getReader()
      const guarded = new ReadableStream<LanguageModelV1StreamPart>({
        // A source that BREAKS (network reset, abort mid-stream) errors the pipe without calling flush: it is read here, and what was billed is not known.
        async pull(c) { try { const n = await reader.read(); if (n.done) c.close(); else c.enqueue(n.value) } catch (e) { unknown(); throw e } },
        cancel(reason) { unknown(); return reader.cancel(reason) }, // a cancelled stream may have been billed in part
      })
      return { ...res, stream: guarded }
    },
  }
}
