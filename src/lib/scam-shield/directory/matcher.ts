import type { OfficialEntity } from '../types'
import { classifyBrand } from './brandMatch'

export { classifyBrand } from './brandMatch'
export type { BrandMatch, BrandMatchKind } from './brandMatch'

/**
 * The entity a hostname relates to, WITHOUT saying how it relates to it.
 *
 * 🚨 This is the display-facing view, and it is deliberately lossy: it answers "whose official
 * site should we offer a link to", which is the same answer whether the host IS Vietcombank or is
 * pretending to be it. Callers that need to know WHICH — anything touching risk — must use
 * `classifyBrand` and read `kind`.
 *
 * Collapsing those two cases into one return value is what B01 was: the impersonation was
 * detected, handed over as an indistinguishable `OfficialEntity`, and scored as nothing. The
 * function is kept because the "visit the official site" action genuinely does not care, and
 * because deleting it would have churned call sites that were never wrong.
 */
export function findMatchingBrand(
  domain: string,
  directory: OfficialEntity[],
): OfficialEntity | null {
  return classifyBrand(domain, directory).entity
}
