import { generateText, streamText, type CoreMessage } from 'ai'
import { getProvider } from './registry'
import type { AIProvider, UsageMetrics } from './provider'
import type { AIGenerateOptions, AIStreamOptions, AIVisionOptions, ProviderId } from './types'
import { observeRouting } from './routing/shadow'
import { estimateMessageTokens } from './routing/signals'

// ── Router binding point ─────────────────────────────────────────────────────
// The router is evaluated HERE — once per call, inside the capability layer —
// so all 14 call sites get routing without any of them learning a vendor name.
//
// P1 is SHADOW ONLY: `observe` records what the router would have chosen and
// changes nothing. The provider that serves the request is still the one the
// registry resolves. There is no code path in P1 that applies a decision, and
// LLM_ROUTER_ENABLED is read nowhere — a flag that cannot be honoured cannot be
// switched on by accident (asserted by architecture.test.ts).
//
// The decision is passed ALONGSIDE the request and never rendered into it:
// nothing routing-related reaches systemShared, system, or messages, so the
// prompt-cache prefix proven in P0 is untouched.
function observe(
  method: 'generate' | 'stream' | 'vision',
  provider: AIProvider,
  modelId: string,
  messages: CoreMessage[],
  opts: AIGenerateOptions & { tools?: unknown },
): void {
  observeRouting({
    method,
    hasTools: opts.tools !== undefined,
    approxInputTokens: estimateMessageTokens(messages),
    maxTokens: opts.maxTokens,
    hints: opts.routing,
    actual: { providerId: provider.id as ProviderId, modelId },
  })
}

// ── AI capability layer ──────────────────────────────────────────────────────
// The single entry point for every model call in the app (routes, libs, crons).
// Callers express intent (role + prompt/messages/tools); WHICH vendor serves it
// is resolved behind getProvider(). Return values are the AI SDK's neutral
// result objects (result.text, result.toDataStreamResponse(), …) — no caller
// ever sees a vendor response format.

/** Normalize system/prompt/messages into one list and let the active provider
 * apply its (semantically transparent) request shaping. The system prompt is
 * deliberately delivered as a leading system MESSAGE so providers can attach
 * per-message options to it — see ClaudeProvider.decorateMessages.
 *
 * `systemShared` is emitted as its OWN leading system message, ahead of
 * `system`. Two consecutive system messages stay one logical system prompt to
 * the model, but they reach the provider as two separately addressable
 * segments — which is what lets an adapter treat the stable one differently
 * from the request-shaped one. Splitting is inert for providers that don't.
 *
 * The provider is passed IN rather than resolved here. This function used to
 * call getProvider() itself, so every AI call resolved a provider TWICE — once
 * to shape the messages, once to pick the model. A process-wide singleton made
 * those two the same object by accident; nothing guarantees it once the
 * registry is keyed. A request could then be shaped for one vendor and sent to
 * another — Anthropic cache_control markers on a payload bound elsewhere —
 * with no error to show for it. */
function buildMessages(
  provider: AIProvider,
  opts: { systemShared?: string; system?: string; prompt?: string; messages?: CoreMessage[] },
): CoreMessage[] {
  const messages: CoreMessage[] = []
  if (opts.systemShared) messages.push({ role: 'system', content: opts.systemShared })
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  if (opts.messages) messages.push(...opts.messages)
  if (opts.prompt) messages.push({ role: 'user', content: opts.prompt })
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

  /**
   * Prompt-cache counters for one finished generation step, in neutral terms.
   * Callers hand over whatever the AI SDK gave them and never learn which
   * vendor shape it had. `null` means "not reported", which is NOT the same as
   * `0` — see UsageMetrics.
   *
   * Resolves the ACTIVE provider, which is correct while one provider serves a
   * whole request. When P1 lets the router pick per request, the resolved
   * provider will be threaded here instead.
   */
  usageMetrics(step: unknown): UsageMetrics {
    return getProvider().usageMetrics(step)
  },

  /** Single-shot text generation (no tools, no streaming). */
  generate(opts: AIGenerateOptions) {
    const provider = getProvider()
    const model = provider.model(opts.role ?? 'fast')
    const messages = buildMessages(provider, opts)
    observe('generate', provider, model.modelId, messages, opts)
    return generateText({
      model,
      messages,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    })
  },

  /** Streaming generation with optional multi-step tool calling. Returns the
   * AI SDK stream result (use .toDataStreamResponse() for HTTP streaming). */
  stream(opts: AIStreamOptions) {
    const provider = getProvider()
    const model = provider.model(opts.role ?? 'smart')
    const messages = buildMessages(provider, opts)
    observe('stream', provider, model.modelId, messages, opts)
    return streamText({
      model,
      messages,
      maxTokens: opts.maxTokens,
      maxSteps: opts.maxSteps,
      tools: opts.tools,
      // Only ever set on a D3 decision turn, and only alongside maxSteps:1 —
      // see the contract note on AIStreamOptions.toolChoice.
      ...(opts.toolChoice ? { toolChoice: opts.toolChoice } : {}),
      onFinish: opts.onFinish,
      abortSignal: opts.abortSignal,
    })
  },

  /** Image + instruction → text (OCR, image analysis). */
  vision(opts: AIVisionOptions) {
    const provider = getProvider()
    const model = provider.model(opts.role ?? 'vision')
    const messages = buildMessages(provider, {
      messages: [{
        role: 'user',
        content: [
          { type: 'image', image: opts.image, ...(opts.mimeType ? { mimeType: opts.mimeType } : {}) },
          { type: 'text', text: opts.prompt },
        ],
      }],
    })
    observe('vision', provider, model.modelId, messages, opts)
    return generateText({
      model,
      messages,
      maxTokens: opts.maxTokens,
    })
  },
}
