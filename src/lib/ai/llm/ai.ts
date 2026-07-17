import { generateText, streamText, type CoreMessage, type LanguageModelV1 } from 'ai'
import type { CapabilityKey } from './capabilities'
import type { AIProvider } from './provider'
import { getProvider } from './registry'
import { resolveModel } from './router'
import { emitTelemetry } from './telemetry'
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
    const { provider, model } = resolveModel(role)
    const startedAt = Date.now()
    const result = generateText({
      model,
      messages: buildMessages(opts, provider),
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    })
    result.then(
      (res) => emitTelemetry({
        event: 'ai_call', method: 'generate', providerId: provider.id, role, model: modelIdOf(model),
        capabilities: [], ok: true, elapsedMs: Date.now() - startedAt,
        promptTokens: res.usage?.promptTokens ?? null, completionTokens: res.usage?.completionTokens ?? null,
        totalTokens: res.usage?.totalTokens ?? null, finishReason: res.finishReason ?? null,
      }),
      () => emitTelemetry({
        event: 'ai_call', method: 'generate', providerId: provider.id, role, model: modelIdOf(model),
        capabilities: [], ok: false, elapsedMs: Date.now() - startedAt,
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
    const { provider, model } = resolveModel(role, requiredCaps)
    const startedAt = Date.now()
    return streamText({
      model,
      messages: buildMessages(opts, provider),
      maxTokens: opts.maxTokens,
      maxSteps: opts.maxSteps,
      tools: opts.tools,
      onFinish: async (result) => {
        emitTelemetry({
          event: 'ai_call', method: 'stream', providerId: provider.id, role, model: modelIdOf(model),
          capabilities: requiredCaps, ok: true, elapsedMs: Date.now() - startedAt,
          promptTokens: result.usage?.promptTokens ?? null, completionTokens: result.usage?.completionTokens ?? null,
          totalTokens: result.usage?.totalTokens ?? null, finishReason: result.finishReason ?? null,
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
    const { provider, model } = resolveModel(role, ['vision'])
    const startedAt = Date.now()
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
        event: 'ai_call', method: 'vision', providerId: provider.id, role, model: modelIdOf(model),
        capabilities: ['vision'], ok: true, elapsedMs: Date.now() - startedAt,
        promptTokens: res.usage?.promptTokens ?? null, completionTokens: res.usage?.completionTokens ?? null,
        totalTokens: res.usage?.totalTokens ?? null, finishReason: res.finishReason ?? null,
      }),
      () => emitTelemetry({
        event: 'ai_call', method: 'vision', providerId: provider.id, role, model: modelIdOf(model),
        capabilities: ['vision'], ok: false, elapsedMs: Date.now() - startedAt,
      }),
    )
    return result
  },
}
