// TVI (R13 §8) · fact types and their freshness policy. Pure.
//
// Freshness is NOT validity and NOT status (R13 §8.3): a fact that is "stale" is one the policy says should be looked at again; it is not thereby wrong, nor expired.
// There is no single half-life for everything: opening hours, prices and an address change at very different speeds. The numbers below are INITIAL DEFAULTS chosen
// by judgement (R13 §21 item 11 says they must be calibrated); they are one table so that calibrating them changes nothing else.

export interface FactTypePolicy {
  /** Stored on every version so a later change of the table never rewrites what a version was judged against. */
  policyId: string
  /** After this many days since the page was read, the fact is STALE (worth re-reading); it stays usable until something refutes it or its validity ends. */
  revalidateAfterDays: number
}

export const FACT_TYPES = {
  opening_hours: { policyId: 'opening_hours.v1', revalidateAfterDays: 30 },
  ticket_price: { policyId: 'ticket_price.v1', revalidateAfterDays: 7 },
  menu_price: { policyId: 'menu_price.v1', revalidateAfterDays: 14 },
  address: { policyId: 'address.v1', revalidateAfterDays: 180 },
  phone: { policyId: 'phone.v1', revalidateAfterDays: 180 },
  permanently_closed: { policyId: 'permanently_closed.v1', revalidateAfterDays: 7 },
  website: { policyId: 'website.v1', revalidateAfterDays: 180 },
} as const satisfies Record<string, FactTypePolicy>

export type KnownFactType = keyof typeof FACT_TYPES

export const isKnownFactType = (t: string): t is KnownFactType => Object.prototype.hasOwnProperty.call(FACT_TYPES, t)

export const policyFor = (t: string): FactTypePolicy | null => (isKnownFactType(t) ? FACT_TYPES[t] : null)

export type Freshness = 'FRESH' | 'STALE' | 'UNKNOWN_TYPE'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * FRESH while inside the policy window counted from `retrievedAt`, STALE after it, UNKNOWN_TYPE when no policy exists for the type (never guessed). A `retrievedAt`
 * in the future (a clock skew) counts as FRESH, never as an error. A date that cannot be read is STALE: when in doubt, look again.
 */
export function freshnessOf(factType: string, retrievedAt: string | Date, now: Date = new Date()): Freshness {
  const p = policyFor(factType)
  if (!p) return 'UNKNOWN_TYPE'
  const t = retrievedAt instanceof Date ? retrievedAt.getTime() : Date.parse(retrievedAt)
  if (Number.isNaN(t)) return 'STALE'
  return now.getTime() - t <= p.revalidateAfterDays * DAY_MS ? 'FRESH' : 'STALE'
}
