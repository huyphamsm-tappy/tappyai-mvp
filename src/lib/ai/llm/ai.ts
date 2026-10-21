import { generateObject, generateText, streamText, type CoreMessage } from 'ai'
import type { z } from 'zod'
import { decoratorFor, getProvider, modelForRole, roleServing, usesAnthropicAgentModel } from './registry'
import type { ModelRole } from './types'
import { repairToolCall } from './toolCallRepair'
import type { AIGenerateOptions, AIStepOptions, AIStreamOptions, AIVisionOptions } from './types'

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
 * from the request-shaped one. Splitting is inert for providers that don't. */
function buildMessages(opts: { systemShared?: string; system?: string; prompt?: string; messages?: CoreMessage[]; cacheHistory?: boolean }, call?: { role: ModelRole; agentRuntime?: boolean }): CoreMessage[] {
  const messages: CoreMessage[] = []
  if (opts.systemShared) messages.push({ role: 'system', content: opts.systemShared })
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  if (opts.messages) messages.push(...opts.messages)
  if (opts.prompt) messages.push({ role: 'user', content: opts.prompt })
  // AGENT_MODEL=haiku55: an agent-runtime call is shaped for the model that serves it (registry.decoratorFor); every other
  // call — and every call with the flag unset — gets the default provider's shaping, as before.
  if (call && usesAnthropicAgentModel(call.role, call)) return decoratorFor(call.role, call)!(messages, { cacheHistory: opts.cacheHistory })
  const provider = getProvider()
  return provider.decorateMessages ? provider.decorateMessages(messages, { cacheHistory: opts.cacheHistory }) : messages
}

/** AGENT_MODEL=haiku55: no SDK-level retry on the Anthropic agent model (a failed paid call is not repeated). undefined = SDK default. */
const retriesFor = (role: ModelRole, agentRuntime?: boolean): number | undefined => (usesAnthropicAgentModel(role, { agentRuntime }) ? 0 : undefined)

export const AI = {
  /** Which provider is active (telemetry/debug only — never branch on this). */
  providerId(): string {
    return getProvider().id
  },

  /** True when the active provider's credentials are configured. */
  isConfigured(): boolean {
    return getProvider().isConfigured()
  },

  /** Which vendor + reasoning effort serves a role (telemetry/cost labels only — never branch on this). */
  serving: roleServing,

  /** Single-shot text generation (no tools, no streaming). */
  generate(opts: AIGenerateOptions) {
    return generateText({
      model: modelForRole(opts.role ?? 'fast', { budgetKind: opts.budgetKind }),
      messages: buildMessages(opts),
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      maxRetries: opts.maxRetries,
    })
  },

  /**
   * ONE model step for the bounded agent loop (src/lib/ai/agent/loop.ts). Tools arrive WITHOUT execute: the SDK returns the model's tool calls
   * (arguments validated against the schema, shape mistakes repaired) and runs nothing — the agent executes them under its budget.
   */
  step(opts: AIStepOptions) {
    const role = opts.role ?? 'consult'
    return generateText({
      model: modelForRole(role, { agentRuntime: opts.agentRuntime, budgetKind: opts.budgetKind }),
      messages: buildMessages(opts, { role, agentRuntime: opts.agentRuntime }),
      maxRetries: retriesFor(role, opts.agentRuntime),
      maxTokens: opts.maxTokens,
      maxSteps: 1,
      tools: opts.tools,
      abortSignal: opts.abortSignal,
      ...((opts.parallelTools && opts.tools) || opts.effort ? { providerOptions: { tappy: { ...(opts.parallelTools && opts.tools ? { parallelTools: true } : {}), ...(opts.effort ? { effort: opts.effort } : {}) } } } : {}),
      experimental_repairToolCall: repairToolCall as never,
    })
  },

  /** Streaming generation with optional multi-step tool calling. Returns the
   * AI SDK stream result (use .toDataStreamResponse() for HTTP streaming). */
  stream(opts: AIStreamOptions) {
    return streamText({
      model: modelForRole(opts.role ?? 'smart', { budgetKind: opts.budgetKind }),
      messages: buildMessages(opts),
      // Undefined leaves the SDK default in place, so every existing caller is unchanged; the chat route names it explicitly.
      maxRetries: opts.maxRetries,
      maxTokens: opts.maxTokens,
      maxSteps: opts.maxSteps,
      tools: opts.tools,
      onFinish: opts.onFinish,
      onChunk: opts.onChunk,
      onError: opts.onError,
      onStepFinish: opts.onStepFinish,
      abortSignal: opts.abortSignal,
      // A shape mistake in the model's tool arguments (null, number-as-string…) is repaired from
      // the tool's own schema instead of ending the stream (toolCallRepair.ts; every repair logged).
      experimental_repairToolCall: repairToolCall as never,
    })
  },

  /**
   * Structured output: the model returns an object matching `schema` (vendor strict JSON-schema mode where
   * available, tool mode otherwise). Throws when the output does not validate — callers fail open.
   */
  extract<T>(opts: AIGenerateOptions & { schema: z.ZodType<T>; schemaName?: string; abortSignal?: AbortSignal }) {
    const role = opts.role ?? 'intent'
    return generateObject({
      abortSignal: opts.abortSignal,
      model: modelForRole(role, { structured: true, agentRuntime: opts.agentRuntime, budgetKind: opts.budgetKind }),
      schema: opts.schema,
      schemaName: opts.schemaName,
      messages: buildMessages(opts, { role, agentRuntime: opts.agentRuntime }),
      maxRetries: retriesFor(role, opts.agentRuntime),
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    })
  },

  /** Image + instruction → text (OCR, image analysis). */
  vision(opts: AIVisionOptions) {
    return generateText({
      model: modelForRole(opts.role ?? 'vision'),
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
