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

type CallOpts = Parameters<LanguageModelV1['doGenerate']>[0]

/** The real usage of a finished call: the adapter's priced `tappy.cost` when present, else the SDK usage (all input treated as uncached). */
export function usageFrom(usage: { promptTokens?: number; completionTokens?: number } | undefined, meta: unknown): ActualUsage {
  const c = ((meta as { tappy?: { cost?: Record<string, unknown> } } | undefined)?.tappy?.cost ?? null) as { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number; reasoningTokens?: number; usd?: number } | null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const input = num(c?.inputTokens) ?? num(usage?.promptTokens) ?? 0
  const output = num(c?.outputTokens) ?? num(usage?.completionTokens) ?? 0
  return { inputTokens: input, cachedInputTokens: num(c?.cachedInputTokens) ?? 0, outputTokens: output, reasoningTokens: num(c?.reasoningTokens), usd: num(c?.usd) }
}

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

export function meteredModel(model: LanguageModelV1, label: string, kind: BudgetKind = 'main'): LanguageModelV1 {
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
