import type { CoreMessage, LanguageModelV1 } from 'ai'
import type { ModelRole } from './types'
import type { ModelCapabilities } from './routing/types'

// ── Provider adapter contract ────────────────────────────────────────────────
// One adapter per vendor, living in providers/<id>.ts. An adapter is the ONLY
// code allowed to import a vendor SDK, know model ids, read vendor credentials,
// or apply vendor-specific optimizations. The capability layer (ai.ts) drives
// all actual calls through the AI SDK's neutral LanguageModelV1 interface, so a
// new provider is just: resolve roles → models, plus optional request shaping.

/**
 * Prompt-cache accounting for ONE generation step, in provider-neutral terms.
 *
 * `null` means "this provider reported nothing" and is deliberately distinct
 * from `0`, which means "it reported zero". Collapsing the two would make
 * "caching is off or unsupported" indistinguishable from "caching missed" —
 * the exact question the cost work exists to answer.
 */
export interface UsageMetrics {
  cacheReadTokens: number | null
  cacheCreationTokens: number | null
}

export interface AIProvider {
  readonly id: string

  /** True when this provider's credentials are present in the environment. */
  isConfigured(): boolean

  /** Resolve a semantic model role to a concrete AI-SDK language model. */
  model(role: ModelRole): LanguageModelV1

  /**
   * Extract cache counters from one step of a finished generation.
   *
   * Every vendor reports these under its own key and its own field names, so
   * this is the seam that keeps that shape out of business logic. Callers hand
   * over whatever the AI SDK gave them; adapters must tolerate junk and never
   * throw — a telemetry read must not be able to break a reply.
   */
  usageMetrics(step: unknown): UsageMetrics

  /**
   * Capability + cost metadata for every model this adapter can resolve.
   *
   * It lives on the ADAPTER, not in a central table, because model ids, context
   * windows, cache minimums and published rates are vendor knowledge — the same
   * reason `model()` and `usageMetrics()` live here. The routing layer
   * aggregates these and adds runtime availability; it never edits them and
   * never branches on a vendor name.
   *
   * Only models whose metadata has been VERIFIED against the vendor's own
   * documentation may be returned. An unverified rate is worse than no entry:
   * the router would spend real money against an invented number.
   */
  capabilities(): readonly ModelCapabilities[]

  /**
   * Optional vendor-specific request shaping, applied to the final message
   * list right before the call (e.g. Anthropic prompt-cache breakpoints).
   * Must be semantically transparent: same conversation in, same answer out.
   */
  decorateMessages?(messages: CoreMessage[]): CoreMessage[]
}
