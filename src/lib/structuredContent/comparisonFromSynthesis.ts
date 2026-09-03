import type { SynthesisView } from '@/lib/ai/consultative/synthesisView'
import type { ComparisonEntity, ComparisonAttribute } from '@/components/chat/structured/ComparisonBlock'
import { formatVndRange, type PriceLocale } from '@/lib/format/vndPrice'

// ── P4-05 · Comparison, derived from the decision the backend already sent ──
//
// DD-005 required a real end-to-end path, and the plan required preferring impact class A over a
// new backend contract. This is class A: the shopping marker already carries a `SynthesisView` with
// every entity, its price range, its match verdict and the server's recommendation. A comparison is
// a different PRESENTATION of that same payload, so nothing new is requested from the server.
//
// 🚨 IT DERIVES, IT DOES NOT INFER. Every attribute below is a restatement of a field the backend
// supplied, and each one is already shown somewhere in `ShoppingDecision` today:
//
//     Giá        ← priceLow / priceHigh        (ShoppingDecision shows the same range)
//     Khớp       ← matchesRequest              (ShoppingDecision shows the same badge)
//     Nơi bán    ← offers.length               (ShoppingDecision shows the same count)
//
// Nothing is ranked, scored, averaged or guessed here. Deliberately absent: a "cheapest" flag, a
// computed best value, or any attribute that would require the client to form an opinion the
// server did not state.

export interface DerivedComparison {
  entities: ComparisonEntity[]
  attributes: ComparisonAttribute[]
  recommendedKey: string | null
  reason: string | null
}

/** Translation shape this module needs — kept structural so it is trivial to test. */
type T = (key: string, params?: Record<string, string>) => string

/**
 * Projects a synthesis view into a comparison, or null when there is nothing to compare.
 *
 * Returns null below two entities: one option is not a comparison, and offering the control would
 * promise the user a decision aid that cannot exist.
 */
export function comparisonFromSynthesis(
  view: SynthesisView | null,
  t: T,
  locale: string,
): DerivedComparison | null {
  const source = view?.entities ?? []
  if (source.length < 2) return null

  const unknown = t('comparison.unknown')

  const matchLabel = (m: string): string =>
    m === 'khop' ? t('shoppingDecision.matchExact')
      : m === 'khac' ? t('shoppingDecision.matchDifferent')
        : t('shoppingDecision.matchUnknown')

  const entities: ComparisonEntity[] = source.map(e => ({
    key: e.key,
    label: e.config,
    values: {
      // `formatVndRange` already renders an absent range as the caller's "unknown" string, which is
      // the same honesty rule ShoppingDecision applies — never a 0, never a blank.
      price: formatVndRange(e.priceLow, e.priceHigh, locale as PriceLocale, unknown),
      match: matchLabel(e.matchesRequest),
      sellers: e.offers.length > 0
        ? t('shoppingDecision.sellerCount', { count: String(e.offers.length) })
        : null, // no offers is genuinely unknown territory, not "0 sellers"
    },
  }))

  const attributes: ComparisonAttribute[] = [
    { key: 'price', label: t('comparison.attrPrice') },
    { key: 'match', label: t('comparison.attrMatch') },
    { key: 'sellers', label: t('comparison.attrSellers') },
  ]

  // The recommendation, and the reason that must accompany it.
  //
  // DD-005: "a recommendation without a reason is not shipped." That is enforced HERE rather than
  // in the component, so there is no way to render a marked winner with nothing to justify it —
  // the same guard `ShoppingDecision` uses before showing its reason list.
  const recommended = source.find(e => e.recommended) ?? null
  const rec = view?.recommendation ?? null
  const reasons = rec && recommended && rec.entityKey === recommended.key ? rec.reasons : []
  const reason = reasons.length > 0
    ? reasons.map(r => r.evidence).filter(Boolean).join(' · ')
    : null

  return {
    entities,
    attributes,
    recommendedKey: reason ? (recommended?.key ?? null) : null,
    reason,
  }
}
