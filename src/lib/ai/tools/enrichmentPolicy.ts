// ── PRODUCT-CARD ENRICHMENT POLICY (owner decision 2026-10-09, after UAT-10) ─────────────────────────────────────────────────────
//
// Measured (uat10-e2e-defects-fixed-2026-10-09): ONE `search_products` call for a criteria/advice question spent the whole 8-credit
// ceiling — the structured /shopping request, a merchant-page search, then five vendor-link searches (`attachCommerceLinks`: two
// products × several marketplaces) that only exist to put buy buttons on cards — and the two verification rounds that followed could
// only be refused.
//
// POLICY (Agent Runtime only; the legacy path is untouched):
//   · purchase-link enrichment is OPT-IN, declared by Luna through the tool's `purchase_links` argument — true only when the user asks
//     where to buy, wants shopping links, or shows clear purchase intent. Advice / criteria / trade-off / comparison → no links.
//     The routing below is pure code on that declared argument: no keyword list, no classifier.
//   · without links a call is: ONE /shopping request (the evidence rows) and, only if /shopping answered nothing, ONE organic search.
//   · with links, the optional part (vendor-link searches) may spend only what is left AFTER a reserve kept for the required
//     verification step — it can never consume the whole turn budget.

import { MAX_PRODUCT_IMAGE_LOOKUPS } from './shopping'
import { MAX_SHOPPING_QUERIES } from './commerce'

export type ProductEnrichment = 'none' | 'links'

/** Credits that optional enrichment must leave unspent in the turn for the verification the answer still needs. */
export const ENRICHMENT_RESERVE_CREDITS = 4

/** Agent runtime: links only when Luna declared purchase intent (`purchase_links === true`). Every other caller keeps the full behaviour. */
export function productEnrichmentFor(o: { agentRuntime: boolean; purchaseLinks?: unknown }): ProductEnrichment {
  if (!o.agentRuntime) return 'links'
  return o.purchaseLinks === true ? 'links' : 'none'
}

/** Credits optional enrichment may spend, given what is left in the turn (Infinity outside a turn scope). */
export function optionalEnrichmentBudget(remainingTurnCredits: number, reserve = ENRICHMENT_RESERVE_CREDITS): number {
  if (!Number.isFinite(remainingTurnCredits)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor(remainingTurnCredits - reserve))
}

/**
 * WORST-CASE credits a `search_products` call may reserve, by mode (cost model of serperMeter.ts: /shopping 2, /search 1, /images 1).
 * Two exclusive paths run inside the tool: STRUCTURED (/shopping answered rows) and FALLBACK (it answered nothing); the vendor-link
 * searches of `attachCommerceLinks` come on top and only in 'links' mode.
 *   none : structured 2 · fallback 2 + 1 organic                                         → total 3, optional 0
 *   links: structured 2 + 1 merchant-page search + ≤ MAX_PRODUCT_IMAGE_LOOKUPS images ·
 *          fallback 2 + 3 organic + 1 shop-info · plus ≤ MAX_SHOPPING_QUERIES vendor-link searches → total 14, optional 8 + images
 */
export function worstCaseSearchProductsCredits(mode: ProductEnrichment): { required: number; optional: number; total: number } {
  const structured = 2 + (mode === 'links' ? 1 + MAX_PRODUCT_IMAGE_LOOKUPS : 0)
  const fallback = mode === 'none' ? 2 + 1 : 2 + 3 + 1
  const vendorLinks = mode === 'links' ? MAX_SHOPPING_QUERIES : 0
  const requiredStructured = 2 + (mode === 'links' ? 1 : 0)
  const required = Math.max(requiredStructured, fallback)
  const total = Math.max(structured, fallback) + vendorLinks
  return { required, optional: total - required, total }
}
