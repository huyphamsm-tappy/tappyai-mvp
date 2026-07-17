import type { ProviderId } from './types'

// ── Provider Pricing Contract ────────────────────────────────────────────────
// Describes what ONE provider/model combination costs, so the Cost Calculator
// (costCalculator.ts) can turn a token count into an estimated dollar amount.
// This is a data SHAPE only — no pricing values live here, and nothing here
// fetches or computes a price. See pricingCatalog.ts for the actual numbers,
// and ADR-013.
//
// OWNER ARCHITECTURE PRINCIPLE: pricing data is NOT source of truth. This
// contract, and every value that implements it, is a replaceable
// configuration layer — a real invoice or a vendor's published pricing page
// is the actual source of truth. Updating a price must only ever require
// editing pricingCatalog.ts's data, never this interface or the calculator's
// logic.
export interface ModelPricing {
  provider: ProviderId
  model: string

  // All price fields are in `currency` per 1,000,000 tokens (the unit every
  // major vendor — Anthropic, OpenAI, Google — publishes prices in). Fixing
  // the unit here, once, avoids a per-entry "is this per-token or
  // per-million" ambiguity in the Cost Calculator.
  inputTokenPrice: number
  outputTokenPrice: number

  /** Price for tokens served from the provider's own prompt/context cache, if
   * it has a distinct rate for them. Omitted (not zero) when the model has no
   * separately-priced cache tier — the Cost Calculator then prices cached
   * tokens at `inputTokenPrice` instead, which over-estimates rather than
   * under-estimates their real cost. See costCalculator.ts. */
  cachedInputPrice?: number

  currency: string

  /** ISO date this price was last confirmed against the vendor's published
   * pricing. NOT a guarantee the price is still current — see the Owner
   * Architecture Principle above. */
  effectiveDate: string
}
