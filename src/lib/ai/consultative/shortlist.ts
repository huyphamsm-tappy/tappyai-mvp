import { SHOPPING_SHORTLIST } from '@/lib/config/product'

/**
 * Trim a ranked shopping result to the decision set the model should write about.
 *
 * ============================================================================
 * WHY THIS TRIMS AND NEVER GROUPS
 * ============================================================================
 * Serper `/shopping` returns up to 40 priced listings for one query, and handing every one to the
 * model made it write about every one: measured 3,646–3,803 characters of reply, ~73% of a
 * 14-second turn spent generating. The ranker has already put the decision-relevant rows first, so
 * the tail only ever made the answer longer.
 *
 * 🚨 The obvious-looking alternative — collapsing rows into "one product, many offers" — is
 * FORBIDDEN here and the reason is measured, not stylistic. On production, one MacBook query
 * returned 40 rows with 40 DISTINCT `product_id`s (the provider's id is per-listing), and those
 * rows mixed M1 Pro with M1 Max and like-new with sealed retail, at 25.8M to 57.99M VND. Merging
 * them would present the cheapest as an offer for a machine it is not — inventing a bargain that
 * does not exist. Rows that survive here are unchanged rows; nothing is merged, and no product
 * identity is inferred.
 *
 * `totalFound` travels with the trimmed array so the reply can say how many listings existed. A
 * shortlist presented as the whole market is its own kind of false claim.
 */
export interface Shortlisted<T> {
  rows: T[]
  /** Total rows before trimming, or null when nothing was trimmed. */
  totalFound: number | null
}

/**
 * @param sorted    rows the ranker ordered, best first
 * @param untouched rows the normalizer skipped — kept only when nothing is trimmed, since an
 *                  unranked row has no claim to a place in a shortlist
 */
export function shortlistShopping<T>(
  sorted: readonly T[],
  untouched: readonly T[] = [],
  limit: number = SHOPPING_SHORTLIST,
): Shortlisted<T> {
  const total = sorted.length + untouched.length
  // A cap that cannot cut anything is not applied, so `totalFound` stays null and the reply has
  // nothing to qualify — the list it received IS everything found.
  if (limit <= 0 || sorted.length <= limit) {
    return { rows: [...sorted, ...untouched], totalFound: null }
  }
  return { rows: sorted.slice(0, limit), totalFound: total }
}
