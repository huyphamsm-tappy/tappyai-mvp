import { findPricing } from './pricingCatalog'

// ── Cost Calculator ───────────────────────────────────────────────────────────
// A pure function: (provider, model, token counts) -> an estimated USD cost,
// or undefined when this provider/model has no Pricing Catalog entry. Never
// throws. Deterministic — no I/O, no clock, no randomness, no routing, no
// provider switching, no telemetry, no logging. See ADR-014.
//
// OWNER ARCHITECTURE PRINCIPLE: this file must never contain hardcoded
// provider-specific pricing logic (no `if (provider === 'claude') {...}`
// branches). Every provider/model is priced through the SAME formula below,
// driven entirely by pricingCatalog.ts's data — the only provider-aware step
// is the catalog lookup itself, which is generic.
export interface CostCalculatorInput {
  // A plain string, matching AIProvider.id's own declared type (provider.ts) —
  // not the narrower ProviderId union, since that's what's actually available
  // at this function's real caller (ai.ts) without an unnecessary cast.
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  /** Subset of `inputTokens` served from the provider's cache. Clamped to
   * [0, inputTokens] — never allowed to imply more cached tokens than total. */
  cachedInputTokens?: number
}

const TOKENS_PER_PRICE_UNIT = 1_000_000

export function calculateCost(input: CostCalculatorInput): number | undefined {
  const pricing = findPricing(input.provider, input.model)
  if (!pricing) return undefined

  const cachedTokens = Math.max(0, Math.min(input.cachedInputTokens ?? 0, input.inputTokens))
  const nonCachedInputTokens = input.inputTokens - cachedTokens

  const inputCost = (nonCachedInputTokens / TOKENS_PER_PRICE_UNIT) * pricing.inputTokenPrice
  // No distinct cached rate in the catalog for this entry -> price cached
  // tokens at the plain input rate (see pricingCatalog.ts's cachedInputPrice
  // comment: over-estimates, never under-estimates, an unconfirmed discount).
  const cachedCost = (cachedTokens / TOKENS_PER_PRICE_UNIT) * (pricing.cachedInputPrice ?? pricing.inputTokenPrice)
  const outputCost = (input.outputTokens / TOKENS_PER_PRICE_UNIT) * pricing.outputTokenPrice

  return inputCost + cachedCost + outputCost
}
