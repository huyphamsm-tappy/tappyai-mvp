import { generateText, streamText, type CoreMessage } from 'ai'
import { getProvider } from './registry'
import type { AIGenerateOptions, AIStreamOptions, AIVisionOptions } from './types'

// ── AI capability layer ──────────────────────────────────────────────────────
// The single entry point for every model call in the app (routes, libs, crons).
// Callers express intent (role + prompt/messages/tools); WHICH vendor serves it
// is resolved behind getProvider(). Return values are the AI SDK's neutral
// result objects (result.text, result.toDataStreamResponse(), …) — no caller
// ever sees a vendor response format.

/** Normalize system/prompt/messages into one list and let the active provider
 * apply its (semantically transparent) request shaping. The system prompt is
 * deliberately delivered as a leading system MESSAGE so providers can attach
 * per-message options to it — see ClaudeProvider.decorateMessages. */
function buildMessages(opts: { system?: string; prompt?: string; messages?: CoreMessage[] }): CoreMessage[] {
  const messages: CoreMessage[] = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  if (opts.messages) messages.push(...opts.messages)
  if (opts.prompt) messages.push({ role: 'user', content: opts.prompt })
  const provider = getProvider()
  return provider.decorateMessages ? provider.decorateMessages(messages) : messages
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
    return generateText({
      model: getProvider().model(opts.role ?? 'fast'),
      messages: buildMessages(opts),
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    })
  },

  /** Streaming generation with optional multi-step tool calling. Returns the
   * AI SDK stream result (use .toDataStreamResponse() for HTTP streaming). */
  stream(opts: AIStreamOptions) {
    return streamText({
      model: getProvider().model(opts.role ?? 'smart'),
      messages: buildMessages(opts),
      maxTokens: opts.maxTokens,
      maxSteps: opts.maxSteps,
      tools: opts.tools,
      onFinish: opts.onFinish,
      abortSignal: opts.abortSignal,
      // @ts-ignore — experimental_prepareStep exists in the AI SDK at runtime but is missing from this version's types; do not remove
      experimental_prepareStep: opts.prepareStep,
    })
  },

  /** Image + instruction → text (OCR, image analysis). */
  vision(opts: AIVisionOptions) {
    return generateText({
      model: getProvider().model(opts.role ?? 'vision'),
      messages: buildMessages({
        messages: [{
          role: 'user',
          content: [
            { type: 'image', image: opts.image, ...(opts.mimeType ? { mimeType: opts.mimeType } : {}) },
            { type: 'text', text: opts.prompt },
          ],
        }],
      }),
      maxTokens: opts.maxTokens,
    })
  },
}
