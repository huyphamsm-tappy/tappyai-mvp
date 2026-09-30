import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai'

// ── Routed model with a fallback (owner 2026-09-30, "PHIÊN LUNA") ──────────────────────────────────────────────
// Fallback = ONE retry on Luna by default (the Anthropic account has no credit; HAIKU_FALLBACK=1 makes it Claude).
// A second failure is the call's error: nothing else is tried.
// Provider-neutral: wraps two AI-SDK models. The primary serves the call; the fallback serves it when the
// primary throws before answering, returns an error as its FIRST stream part, or sends nothing within
// `firstPartMs`. Once the primary has streamed a part the call is committed to it (the client may already
// hold its bytes) — a later error surfaces normally, as it would without routing.
//
// Every fallback is logged (`tappyai_llm_fallback`) and marked on the finish part's metadata
// (`tappy.fellBack`), so the per-turn cost names the vendor that actually answered.

export interface FallbackOptions {
  /** No first stream part within this many ms → fallback. */
  firstPartMs: number
  /** No generate result within this many ms → fallback (default: firstPartMs). */
  generateMs?: number
  label: string
  /** What the fallback is, for the log line: a Luna retry or the Claude model. */
  fallbackKind?: 'luna_retry' | 'haiku'
}

function log(label: string, reason: string, primary: LanguageModelV1, ms: number, kind?: string) {
  console.warn(JSON.stringify({ type: 'tappyai_llm_fallback', role: label, primary: `${primary.provider}:${primary.modelId}`, fallback: kind ?? null, reason: reason.slice(0, 200), ms }))
}

const timeout = <T,>(ms: number): { p: Promise<T>; clear: () => void } => {
  let t: ReturnType<typeof setTimeout> | undefined
  const p = new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`first_part_timeout_${ms}ms`)), ms) })
  return { p, clear: () => clearTimeout(t) }
}

const markFellBack = (meta: unknown) => ({ ...((meta as Record<string, unknown>) ?? {}), tappy: { ...(((meta as Record<string, unknown>)?.tappy as Record<string, unknown>) ?? {}), fellBack: true } })

export function withFallback(primary: LanguageModelV1, fallback: LanguageModelV1, o: FallbackOptions): LanguageModelV1 {
  return {
    ...primary,
    specificationVersion: 'v1',
    provider: primary.provider,
    modelId: primary.modelId,
    defaultObjectGenerationMode: primary.defaultObjectGenerationMode,
    supportsStructuredOutputs: primary.supportsStructuredOutputs,
    // 🔑 SSRF: carried explicitly — a getter on the SDK model is lost by the spread (imageUrlSsrfGuardrail.test.ts).
    supportsImageUrls: primary.supportsImageUrls,
    async doGenerate(opts) {
      const t0 = Date.now()
      const t = timeout<never>(o.generateMs ?? o.firstPartMs)
      try {
        return await Promise.race([primary.doGenerate(opts), t.p])
      } catch (e) {
        if (opts.abortSignal?.aborted) throw e
        log(o.label, e instanceof Error ? e.message : String(e), primary, Date.now() - t0, o.fallbackKind)
        const r = await fallback.doGenerate(opts)
        return { ...r, providerMetadata: markFellBack(r.providerMetadata) as never }
      } finally { t.clear() }
    },
    async doStream(opts) {
      const t0 = Date.now()
      const t = timeout<never>(o.firstPartMs)
      const viaFallback = async (reason: string) => {
        log(o.label, reason, primary, Date.now() - t0, o.fallbackKind)
        const r = await fallback.doStream(opts)
        const stream = r.stream.pipeThrough(new TransformStream<LanguageModelV1StreamPart, LanguageModelV1StreamPart>({
          transform(part, c) { c.enqueue(part.type === 'finish' ? { ...part, providerMetadata: markFellBack(part.providerMetadata) as never } : part) },
        }))
        return { ...r, stream }
      }
      try {
        const r = await Promise.race([primary.doStream(opts), t.p])
        const reader = r.stream.getReader()
        const first = await Promise.race([reader.read(), t.p])
        t.clear()
        if (first.done || first.value.type === 'error') {
          reader.releaseLock()
          const why = first.done ? 'empty_stream' : String((first.value as { error?: unknown }).error ?? 'error_part')
          return viaFallback(why)
        }
        const stream = new ReadableStream<LanguageModelV1StreamPart>({
          start(c) { c.enqueue(first.value) },
          async pull(c) {
            const n = await reader.read()
            if (n.done) c.close(); else c.enqueue(n.value)
          },
          cancel(reason) { return reader.cancel(reason) },
        })
        return { ...r, stream }
      } catch (e) {
        t.clear()
        if (opts.abortSignal?.aborted) throw e
        return viaFallback(e instanceof Error ? e.message : String(e))
      }
    },
  }
}
