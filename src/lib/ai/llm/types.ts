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
 */
export type ModelRole = 'fast' | 'smart' | 'planning' | 'vision'

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
   * How many times the SDK may re-send a failed request. `2` means up to three
   * attempts in total.
   *
   * ── Why this is an option at all (P2 cost safeguard) ─────────────────────
   * It was never passed anywhere, so every call ran at the AI SDK's own default
   * — which is 2. That is a defensible number, but it was not a DECISION: it
   * was a default nobody had read, sitting under the most expensive call in the
   * product. A provider 5xx therefore multiplies input tokens by three, and
   * nothing in the telemetry can see it: `llmCalls` counts STEPS, not attempts,
   * and `usage` reports only the attempt that succeeded. So a retry storm looks
   * exactly like ordinary traffic on the cost dashboard, at three times the
   * price.
   *
   * Naming it changes no behaviour today and is not meant to. What it changes
   * is that the ceiling is now reviewable, and an SDK upgrade that moves the
   * default cannot move our spend without a diff — the same class of silent
   * drift the removed `prepareStep` note in this file describes.
   */
  maxRetries?: number
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
