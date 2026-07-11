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
  decorateMessages?(messages: CoreMessage[]): CoreMessage[]
}
