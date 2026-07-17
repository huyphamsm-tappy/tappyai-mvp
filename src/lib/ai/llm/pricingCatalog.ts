import type { ModelPricing } from './pricing'

// ── Pricing Catalog ──────────────────────────────────────────────────────────
// The ONLY place actual price numbers live. A plain, replaceable data array —
// updating a price, or adding a new priced model, never requires touching
// costCalculator.ts or any other logic. See ADR-013.
//
// OWNER ARCHITECTURE PRINCIPLE: this catalog is NOT source of truth. Prices
// below are best-effort figures for Claude's Haiku tier, caveated by
// `effectiveDate` — verify against https://www.anthropic.com/pricing (or the
// relevant vendor's current pricing page) before using these for a real
// financial decision. Nothing in production computes a real bill from these
// numbers yet; Sprint 5 is foundation-only (telemetry logs an ESTIMATE, nothing
// is persisted or invoiced from it).
//
// cachedInputPrice is deliberately omitted for both entries below: Anthropic's
// prompt-cache "hit" rate is a real, distinct, cheaper tier (this codebase's
// own ClaudeProvider.decorateMessages already uses prompt caching — see
// providers/claude.ts), but its exact current discount isn't confirmed here.
// Omitting it means the Cost Calculator prices cached tokens at the plain
// inputTokenPrice, which OVER-estimates rather than under-estimates real
// spend — the safe direction for an unconfirmed number. Add cachedInputPrice
// once the real cache-hit rate is confirmed; that is a pure data change here,
// nothing else needs to know.
//
// Only the two Claude model ids ACTUALLY IN USE today
// (providers/claude.ts's DEFAULT_MODELS) have entries. Gemini (installed,
// Sprint 4, staging-only, zero production traffic) intentionally has NO
// entries — looking up its pricing correctly returns undefined (see
// costCalculator's tests), which IS the "empty placeholder" this sprint's
// brief calls for. Adding real Gemini pricing later is a pure data change:
// append an entry here.
export const PRICING_CATALOG: ModelPricing[] = [
  {
    provider: 'claude',
    model: 'claude-haiku-4-5',
    inputTokenPrice: 1,
    outputTokenPrice: 5,
    currency: 'USD',
    effectiveDate: '2026-07-17',
  },
  {
    provider: 'claude',
    model: 'claude-haiku-4-5-20251001',
    inputTokenPrice: 1,
    outputTokenPrice: 5,
    currency: 'USD',
    effectiveDate: '2026-07-17',
  },
]

// Tag for whatever's currently in PRICING_CATALOG above — threaded through to
// telemetry (ai.ts) as `pricingVersion`, so a cost estimate logged today can
// be told apart from one computed after a future price update. Bump this
// string whenever PRICING_CATALOG's values change.
export const PRICING_CATALOG_VERSION = '2026-07-17'

export function findPricing(provider: string, model: string): ModelPricing | undefined {
  return PRICING_CATALOG.find(p => p.provider === provider && p.model === model)
}
