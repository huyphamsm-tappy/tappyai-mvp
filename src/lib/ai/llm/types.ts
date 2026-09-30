import type { CoreMessage, streamText } from 'ai'

// ── Provider-neutral types for the AI layer ──────────────────────────────────
// Business code imports ONLY from '@/lib/ai/llm'. Nothing here (or anywhere
// outside providers/*) may reference a concrete vendor, SDK, or model id.

/** Known providers. Only ids listed here are accepted from LLM_PROVIDER. */
export type ProviderId = 'claude' | 'openai' | 'gemini' | 'grok' | 'deepseek'

/**
 * Semantic model roles. Business code picks a role for the JOB it has —
 * never a model id. The active provider maps each role to a concrete model
 * (overridable per-deployment via LLM_*_MODEL env, see registry.ts).
 *  - fast:     cheap/low-latency (simple chat turns, extraction, crons)
 *  - smart:    standard quality (main chat, content generation, translate)
 *  - planning: multi-step/agentic turns (itineraries, tool-heavy chats)
 *  - vision:   image understanding (OCR, thumbnail analysis)
 *  - consult:  a consultation answer turn (pick / follow-up / compare / more / reject) — Luna session
 *  - intent:   reading the user's turn into a structured decision (the consult brain) — Luna session
 * `consult` and `intent` resolve to the default provider unless LLM_CONSULT_PROVIDER /
 * LLM_INTENT_PROVIDER route them elsewhere (registry.ts), with the default provider as fallback.
 */
export type ModelRole = 'fast' | 'smart' | 'planning' | 'vision' | 'consult' | 'intent'

/**
 * Reasoning effort for a model that reasons (owner 2026-09-30: always explicit — a vendor default of
 * `medium` bills reasoning tokens on every turn). Set per role with LLM_<ROLE>_REASONING; adapters whose
 * models do not reason ignore it.
 */
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high'

/** Per-role model-id overrides (sourced from env; ids never appear in code). */
export type ModelOverrides = Partial<Record<ModelRole, string>>

export interface AIGenerateOptions {
  role?: ModelRole
  /**
   * The portion of the system prompt that is BYTE-IDENTICAL on every request —
   * no clock, no user, no request-shaped branching. Delivered ahead of
   * `system`, and providers may optimize repeated delivery of it.
   *
   * Callers own the guarantee: put anything that varies in `system` instead.
   * A value that changes between requests is not wrong, just pointless.
   */
  systemShared?: string
  /** Request-specific system instructions. Free to vary per request. */
  system?: string
  /** Convenience: a single user message. Appended after `messages` if both given. */
  prompt?: string
  messages?: CoreMessage[]
  maxTokens?: number
  temperature?: number
  /**
   * false = no cache breakpoint on the last user message. Owner 2026-09-29 (Consult V2): a ONE-step turn
   * pays the +25% write premium on that prefix and never reads it back.
   */
  cacheHistory?: boolean
}

export interface AIStreamOptions extends AIGenerateOptions {
  /** AI-SDK tool set (zod-defined) — provider-neutral by construction. */
  tools?: Parameters<typeof streamText>[0]['tools']
  maxSteps?: number
  // REMOVED (C2): a `prepareStep` option forwarded as experimental_prepareStep.
  // streamText in ai@4.3.19 does not accept it — only generateText does — so it
  // was silently discarded on every call while its @ts-ignore claimed the
  // opposite. Tool choice therefore runs at the SDK default, 'auto'. If per-step
  // control is ever wanted, add it deliberately against an SDK version whose
  // streamText actually supports it, and re-measure: forcing a tool changes both
  // cost and clarification behaviour.
  onFinish?: Parameters<typeof streamText>[0]['onFinish']
  /**
   * Error callback. Fires when the stream carries a terminal error part — a provider/network
   * failure, or an argument-validation rejection the tools could not repair. The route uses it to
   * refund the AI-question quota so a failed answer is not charged (F-015). Provider-neutral: the
   * SDK's own callback, forwarded untouched. (The tools in this codebase catch their own errors and
   * never throw, so a recoverable tool error does not reach here as a terminal failure.)
   */
  onError?: Parameters<typeof streamText>[0]['onError']
  /**
   * Per-chunk callback. Exposed for ONE reason: time-to-first-token cannot be
   * observed anywhere else. `onFinish` fires after generation ends, and the
   * caller's own stream transform sees bytes only after the SDK has already
   * emitted them, so the interval "model request sent → first token back" —
   * the interval production measurement put the entire TTFB variance in — has
   * no other vantage point.
   *
   * Provider-neutral by construction: the SDK's own chunk type, forwarded
   * untouched, exactly like onFinish above.
   */
  onChunk?: Parameters<typeof streamText>[0]['onChunk']
  /**
   * Per-step callback. Diagnostic only, forwarded untouched like onChunk/onFinish.
   * A tool turn is ≥2 provider round-trips inside one stream (the tool-planning
   * step, then the answer step); this is the only vantage point for when the
   * first step ends, which separates "model chose a tool" time from tool latency.
   */
  onStepFinish?: Parameters<typeof streamText>[0]['onStepFinish']
  /** Abort the upstream generation when the caller's request is cancelled
   * (client disconnect). Wire the route's `req.signal` here so a dropped
   * connection stops billing tokens instead of running to completion. */
  abortSignal?: AbortSignal
}

export interface AIVisionOptions {
  role?: ModelRole
  /** Base64 string, URL, or raw bytes — normalized by the AI SDK. */
  image: string | URL | Uint8Array | ArrayBuffer
  mimeType?: string
  prompt: string
  maxTokens?: number
}
