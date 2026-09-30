import type { CoreMessage, LanguageModelV1 } from 'ai'
import type { ModelRole } from './types'

// ── Provider adapter contract ────────────────────────────────────────────────
// One adapter per vendor, living in providers/<id>.ts. An adapter is the ONLY
// code allowed to import a vendor SDK, know model ids, read vendor credentials,
// or apply vendor-specific optimizations. The capability layer (ai.ts) drives
// all actual calls through the AI SDK's neutral LanguageModelV1 interface, so a
// new provider is just: resolve roles → models, plus optional request shaping.

export interface AIProvider {
  readonly id: string

  /** True when this provider's credentials are present in the environment. */
  isConfigured(): boolean

  /** Resolve a semantic model role to a concrete AI-SDK language model. */
  model(role: ModelRole): LanguageModelV1

  /**
   * Optional vendor-specific request shaping, applied to the final message
   * list right before the call (e.g. Anthropic prompt-cache breakpoints).
   * Must be semantically transparent: same conversation in, same answer out.
   */
  decorateMessages?(messages: CoreMessage[], opts?: { cacheHistory?: boolean }): CoreMessage[]
}

/**
 * One priced model call, attached by an adapter to the call's provider metadata under the neutral key
 * `tappy.cost` (owner 2026-09-30: cost per turn per vendor, reasoning tokens included). Tokens are the
 * vendor's own counts: `inputTokens` INCLUDES cached and cache-write tokens; `outputTokens` INCLUDES
 * reasoning tokens (both are billed at the output rate).
 */
export interface CallCost {
  provider: string
  model: string
  effort?: string
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  outputTokens: number
  reasoningTokens: number
  usd: number
  /** Set by the registry's fallback wrapper when the routed model failed and the default one answered. */
  fellBack?: boolean
}
