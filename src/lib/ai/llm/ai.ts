import { generateText, streamText, type CoreMessage, type LanguageModelV1 } from 'ai'
import type { CapabilityKey } from './capabilities'
import type { AIProvider } from './provider'
import { getProvider } from './registry'
import { resolveModel } from './router'
import { emitTelemetry, generateRequestId } from './telemetry'
import type { AIGenerateOptions, AIStreamOptions, AIVisionOptions } from './types'

// ── AI capability layer ──────────────────────────────────────────────────────
// The single entry point for every model call in the app (routes, libs, crons).
// Callers express intent (role + prompt/messages/tools + the capabilities that
// intent implies); WHICH vendor serves it is resolved behind resolveModel()
// (router.ts), which consults the Provider Policy + Capability Registry. With
// only Claude installed and no per-role env override, this always resolves to
// the same provider/model getProvider().model(role) resolved to before the
// Router existed — see docs/ai-platform/SPRINT_1_ARCHITECTURE_FOUNDATION.md §9.
// Return values are the AI SDK's neutral result objects (result.text,
// result.toDataStreamResponse(), …) — no caller ever sees a vendor response format.
//
// resolveModel() can throw synchronously (unknown/uninstalled provider, or —
// Sprint 3 — UnsupportedCapabilityError). This is not new exposure: the
// pre-Sprint-2 code already called getProvider().model(role) directly, which
// could already throw synchronously for an unknown provider id. Every one of
// the 14 call sites already wraps its AI.* call in a try/catch (verified
// during the Sprint 3 audit), so this is unreachable-but-safe today — Claude
// declares every capability every call site needs (golden.test.ts).

/** Normalize system/prompt/messages into one list and let the resolved provider
 * apply its (semantically transparent) request shaping. The system prompt is
 * deliberately delivered as a leading system MESSAGE so providers can attach
 * per-message options to it — see ClaudeProvider.decorateMessages. */
function buildMessages(opts: { system?: string; prompt?: string; messages?: CoreMessage[] }, provider: AIProvider): CoreMessage[] {
  const messages: CoreMessage[] = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  if (opts.messages) messages.push(...opts.messages)
  if (opts.prompt) messages.push({ role: 'user', content: opts.prompt })
  return provider.decorateMessages ? provider.decorateMessages(messages) : messages
}

function modelIdOf(model: LanguageModelV1): string {
  return model.modelId ?? 'unknown'
}

function errorCodeOf(err: unknown): string {
  return err instanceof Error ? err.name : 'UnknownError'
}

/** Resolves via the Router, emitting a telemetry event and re-throwing the
 * SAME error object unchanged on failure (never swallowed) — so a resolution
 * failure is observable without altering what the caller sees. */
function resolveWithTelemetry(
  method: 'generate' | 'stream' | 'vision',
  role: Parameters<typeof resolveModel>[0],
  requiredCaps: CapabilityKey[],
  requestId: string,
  startedAt: number,
) {
  try {
    return resolveModel(role, requiredCaps)
  } catch (err) {
    emitTelemetry({
      requestId, role, capability: requiredCaps, provider: 'unknown', model: 'unknown',
      latencyMs: Date.now() - startedAt, inputTokens: null, outputTokens: null, estimatedCost: null,
      success: false, errorCode: errorCodeOf(err), retryCount: 0, method,
    })
    throw err
  }
}

export const AI = {
  /** Which provider is active (telemetry/debug only — never branch on this). */
  providerId(): string {
    return getProvider().id
  },

  /** True when the active provider's credentials are configured. */
  isConfigured(): boolean {
    return getProvider().isConfigured()
  },

  /** Single-shot text generation (no tools, no streaming). */
  generate(opts: AIGenerateOptions) {
    const role = opts.role ?? 'fast'
    const requiredCaps: CapabilityKey[] = []
    const requestId = generateRequestId()
    const startedAt = Date.now()
    const { provider, model } = resolveWithTelemetry('generate', role, requiredCaps, requestId, startedAt)
    const result = generateText({
      model,
      messages: buildMessages(opts, provider),
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    })
    result.then(
      (res) => emitTelemetry({
        requestId, role, capability: requiredCaps, provider: provider.id, model: modelIdOf(model),
        latencyMs: Date.now() - startedAt, inputTokens: res.usage?.promptTokens ?? null,
        outputTokens: res.usage?.completionTokens ?? null, estimatedCost: null, success: true,
        errorCode: null, retryCount: 0, method: 'generate', finishReason: res.finishReason ?? null,
      }),
      (err) => emitTelemetry({
        requestId, role, capability: requiredCaps, provider: provider.id, model: modelIdOf(model),
        latencyMs: Date.now() - startedAt, inputTokens: null, outputTokens: null, estimatedCost: null,
        success: false, errorCode: errorCodeOf(err), retryCount: 0, method: 'generate',
      }),
    )
    return result
  },

  /** Streaming generation with optional multi-step tool calling. Returns the
   * AI SDK stream result (use .toDataStreamResponse() for HTTP streaming). */
  stream(opts: AIStreamOptions) {
    const role = opts.role ?? 'smart'
    const requiredCaps: CapabilityKey[] = ['streaming']
    if (opts.tools) requiredCaps.push('tools')
    if (opts.prepareStep) requiredCaps.push('forcedToolChoice')
    const requestId = generateRequestId()
    const startedAt = Date.now()
    const { provider, model } = resolveWithTelemetry('stream', role, requiredCaps, requestId, startedAt)
    return streamText({
      model,
      messages: buildMessages(opts, provider),
      maxTokens: opts.maxTokens,
      maxSteps: opts.maxSteps,
      tools: opts.tools,
      onFinish: async (result) => {
        emitTelemetry({
          requestId, role, capability: requiredCaps, provider: provider.id, model: modelIdOf(model),
          latencyMs: Date.now() - startedAt, inputTokens: result.usage?.promptTokens ?? null,
          outputTokens: result.usage?.completionTokens ?? null, estimatedCost: null, success: true,
          errorCode: null, retryCount: 0, method: 'stream', finishReason: result.finishReason ?? null,
        })
        if (opts.onFinish) await opts.onFinish(result)
      },
      abortSignal: opts.abortSignal,
      // @ts-ignore — experimental_prepareStep exists in the AI SDK at runtime but is missing from this version's types; do not remove
      experimental_prepareStep: opts.prepareStep,
    })
  },

  /** Image + instruction → text (OCR, image analysis). */
  vision(opts: AIVisionOptions) {
    const role = opts.role ?? 'vision'
    const requiredCaps: CapabilityKey[] = ['vision']
    const requestId = generateRequestId()
    const startedAt = Date.now()
    const { provider, model } = resolveWithTelemetry('vision', role, requiredCaps, requestId, startedAt)
    const result = generateText({
      model,
      messages: buildMessages({
        messages: [{
          role: 'user',
          content: [
            { type: 'image', image: opts.image, ...(opts.mimeType ? { mimeType: opts.mimeType } : {}) },
            { type: 'text', text: opts.prompt },
          ],
        }],
      }, provider),
      maxTokens: opts.maxTokens,
    })
    result.then(
      (res) => emitTelemetry({
        requestId, role, capability: requiredCaps, provider: provider.id, model: modelIdOf(model),
        latencyMs: Date.now() - startedAt, inputTokens: res.usage?.promptTokens ?? null,
        outputTokens: res.usage?.completionTokens ?? null, estimatedCost: null, success: true,
        errorCode: null, retryCount: 0, method: 'vision', finishReason: res.finishReason ?? null,
      }),
      (err) => emitTelemetry({
        requestId, role, capability: requiredCaps, provider: provider.id, model: modelIdOf(model),
        latencyMs: Date.now() - startedAt, inputTokens: null, outputTokens: null, estimatedCost: null,
        success: false, errorCode: errorCodeOf(err), retryCount: 0, method: 'vision',
      }),
    )
    return result
  },
}
