import type { ProviderSignal } from '../types'
import type { BrandMatch } from '../directory/brandMatch'
import { IMPERSONATION_WEIGHTS } from '../config'

export const IMPERSONATION_SOURCE = 'impersonation'

/**
 * Turn a brand classification into a signal the risk engine already knows how to consume.
 *
 * ============================================================================
 * WHY A SIGNAL AND NOT A SPECIAL CASE IN calculateRisk — B01
 * ============================================================================
 * The engines take `ProviderSignal[]` and nothing else. Expressed as one more signal, the
 * impersonation finding flows into `calculateRisk` (score), `buildEvidence` (the user-visible
 * report) and `getRecommendedActions` (via the level) with no branch added to any of them — and
 * anything added later inherits it for free. The alternative, threading a `brandMatch` argument
 * through three engines, would have given every one of them a second way to be wrong.
 *
 * It is `status: 'completed'` because it genuinely did complete: this determination needs no
 * network, so unlike the real providers it cannot time out, and marking it anything else would
 * exclude it from scoring — `calculateRisk` sums completed signals only.
 *
 * 🚨 It is NOT registered in `PROVIDER_MAX_WEIGHTS`, so it moves the score and leaves confidence
 * untouched. See the note there; that is the difference between adding a signal and diluting the
 * fail-closed guard.
 */
export function impersonationSignal(match: BrandMatch): ProviderSignal | null {
  if (match.kind === 'BRAND_IMPERSONATION' && match.entity && match.evidence) {
    const { entity, evidence } = match
    const weight = IMPERSONATION_WEIGHTS[entity.category] ?? 40
    // Money and identity are the categories where being wrong costs the user their account, so
    // they are the ones allowed to reach HIGH unaided.
    const financial = entity.category === 'bank' || entity.category === 'government' || entity.category === 'ewallet'
    return {
      provider: IMPERSONATION_SOURCE,
      status: 'completed',
      finding: 'BRAND_IMPERSONATION',
      severity: financial ? 'critical' : 'warning',
      weight,
      detail:
        `This domain uses the name "${entity.brand}" but is not one of its official domains ` +
        `(${evidence.officialDomains.join(', ')}).`,
      raw: {
        brand: entity.brand,
        category: entity.category,
        matchedIn: evidence.matchedIn,
        rule: evidence.rule,
        registrable: evidence.registrable,
        officialDomains: evidence.officialDomains,
        idn: evidence.idn,
      },
    }
  }

  if (match.kind === 'EXACT_OFFICIAL_MATCH' && match.entity) {
    // Weight 0 — this changes no score. It is emitted so that "we checked, and this IS the real
    // domain" appears in the evidence report as a stated finding rather than as silence, which is
    // also what makes the official-domain case assertable in a test.
    return {
      provider: IMPERSONATION_SOURCE,
      status: 'completed',
      finding: 'OFFICIAL_DOMAIN',
      severity: 'safe',
      weight: 0,
      detail: `Verified official domain for ${match.entity.brand}.`,
      raw: { brand: match.entity.brand, category: match.entity.category },
    }
  }

  return null
}
