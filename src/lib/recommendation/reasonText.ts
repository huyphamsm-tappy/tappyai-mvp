import { formatVndShort, type PriceLocale } from '@/lib/format/vndPrice'

// ── The engine's reason, said in the reader's language ──────────────────────
//
// 🚨 WHAT THIS REPLACES. `rank.ts` builds each reason's `detail` as English prose
// assembled from the evidence — "rated 4.9", "1500 reviews", "15900000 VND" —
// and the shopping card printed it verbatim. A Vietnamese user read
// "· rated 4.9 · 1500 reviews · 15900000 VND" under a heading that said
// "Nên chọn", raw integer and all.
//
// The fix is at the source: `Reason` now carries `params` alongside `detail`, so
// the reason travels as DATA and the wording is chosen here, once, from the
// dictionaries every other label already uses.
//
// 🔑 THE FALLBACK IS THE OLD BEHAVIOUR, DELIBERATELY. A reason with no params (a
// free-text one like "chuyên Apple"), an attribute no dictionary covers, or a
// marker persisted before `params` existed all resolve to `evidence` — the exact
// string that shipped before. Nothing can render empty because of this module.

/** The shape both the shopping view and the ranking payload already produce. */
export interface KeyedReason {
  attribute: string
  evidence: string
  params?: Record<string, string | number>
}

type Translate = (key: string, vars?: Record<string, string>) => string

/** `translate` returns the key itself when nothing is defined for it. */
const defined = (t: Translate, key: string, vars?: Record<string, string>): string | null => {
  const out = t(key, vars)
  return out === key ? null : out
}

const count = (n: number, locale: string) => n.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')

/**
 * One reason, localised.
 *
 * Numbers are formatted for the locale — a price through the same
 * `formatVndShort` the prices on the card use, so "15900000 VND" and the price
 * line beside it can never disagree about what that number is.
 */
export function reasonText(r: KeyedReason, t: Translate, locale: string): string {
  const p = r.params ?? {}
  const loc = locale === 'vi' ? 'vi' : 'en'
  switch (r.attribute) {
    case 'rating':
      if (typeof p.value === 'number') return defined(t, 'reason.rating', { value: String(p.value) }) ?? r.evidence
      break
    case 'reviewCount':
      if (typeof p.count === 'number') return defined(t, 'reason.reviewCount', { count: count(p.count, loc) }) ?? r.evidence
      break
    case 'price':
      if (typeof p.priceVnd === 'number') {
        const price = formatVndShort(p.priceVnd, loc as PriceLocale)
        if (price) return defined(t, 'reason.price', { price }) ?? r.evidence
      }
      break
    case 'distance':
      if (typeof p.km === 'number') return defined(t, 'reason.distance', { km: String(p.km) }) ?? r.evidence
      break
    case 'stars':
      if (typeof p.stars === 'number') return defined(t, 'reason.stars', { stars: String(p.stars) }) ?? r.evidence
      break
    case 'eta':
      if (typeof p.minutes === 'number') return defined(t, 'reason.eta', { minutes: String(p.minutes) }) ?? r.evidence
      break
    case 'directPage':
      return defined(t, 'reason.directPage') ?? r.evidence
  }
  // Amenity booleans ("has wifi" / "no wifi") and anything else a domain adds.
  if (typeof p.attribute === 'string') {
    const positive = !r.evidence.startsWith('no ')
    return defined(t, `reason.${positive ? 'has' : 'no'}.${p.attribute}`) ?? r.evidence
  }
  return r.evidence
}

/** Several reasons, joined the way the card shows them. */
export function reasonList(reasons: readonly KeyedReason[], t: Translate, locale: string): string[] {
  return reasons.map(r => reasonText(r, t, locale)).filter(s => s.trim().length > 0)
}
