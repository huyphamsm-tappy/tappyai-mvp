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
  /** Per-step control (e.g. forced tool choice). Passed to the AI SDK's
   * experimental_prepareStep — kept loosely typed because this AI SDK
   * version ships the option at runtime without type definitions. */
  prepareStep?: (options: { stepNumber: number }) => unknown | Promise<unknown>
  onFinish?: Parameters<typeof streamText>[0]['onFinish']
}

export interface AIVisionOptions {
  role?: ModelRole
  /** Base64 string, URL, or raw bytes — normalized by the AI SDK. */
  image: string | URL | Uint8Array | ArrayBuffer
  mimeType?: string
  prompt: string
  maxTokens?: number
}
