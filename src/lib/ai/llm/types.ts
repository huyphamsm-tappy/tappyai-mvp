import type { CoreMessage, streamText } from 'ai'
import type { RoutingHints } from './routing/signals'

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
   * What KIND of job this is — task class, complexity, risk, latency budget.
   *
   * Call sites describe the job; they never name a provider or a model, and
   * there is deliberately no field through which they could. Selection is the
   * router's responsibility, behind this one entry point, so it never gets
   * distributed across call sites.
   *
   * Optional: omitted hints are derived from the call itself (which method,
   * whether tools are present, how large the input is).
   */
  routing?: RoutingHints
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
}

export interface AIStreamOptions extends AIGenerateOptions {
  /** AI-SDK tool set (zod-defined) — provider-neutral by construction. */
  tools?: Parameters<typeof streamText>[0]['tools']
  maxSteps?: number
  /**
   * Force ONE named tool for this request (D3 decision turns only).
   *
   * Narrow amendment to the C2 "no toolChoice" rule, and narrow on purpose: the
   * decision turn hands the model a schema instead of a blank page, so the
   * candidate facts the user reads are rendered by the server rather than
   * written by the model. Nothing else may set it — `recommendationContract`
   * asserts the caller shape.
   *
   * MUST be paired with `maxSteps: 1`. ai@4.3.19 re-applies toolChoice on every
   * step (prepareToolsAndToolChoice runs inside streamStep), so with maxSteps >
   * 1 the model is forced to call the tool again on the follow-up step and the
   * turn ends with finishReason 'tool-calls' and EMPTY text — measured.
   */
  toolChoice?: { type: 'tool'; toolName: string }
  // REMOVED (C2): a `prepareStep` option forwarded as experimental_prepareStep.
  // streamText in ai@4.3.19 does not accept it — only generateText does — so it
  // was silently discarded on every call while its @ts-ignore claimed the
  // opposite. Tool choice therefore runs at the SDK default, 'auto'. If per-step
  // control is ever wanted, add it deliberately against an SDK version whose
  // streamText actually supports it, and re-measure: forcing a tool changes both
  // cost and clarification behaviour.
  onFinish?: Parameters<typeof streamText>[0]['onFinish']
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
