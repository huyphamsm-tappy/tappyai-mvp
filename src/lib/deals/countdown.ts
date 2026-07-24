// Promo countdown from a deal's endAt. Owner rule:
//   > 24h  → "X days left"     → { kind: 'days', days }
//   <= 24h → "🔥 Ending Soon"  → { kind: 'soon' }
//   no endAt / already expired → { kind: 'none' }
// Pure + now-injectable so it's unit-testable and reusable across platforms.

export type PromoCountdown =
  | { kind: 'none' }
  | { kind: 'soon' }
  | { kind: 'days'; days: number }

export function promoCountdown(endAtIso: string | null | undefined, nowMs: number): PromoCountdown {
  if (!endAtIso) return { kind: 'none' }
  const endMs = Date.parse(endAtIso)
  if (Number.isNaN(endMs)) return { kind: 'none' }
  const hoursLeft = (endMs - nowMs) / 3_600_000
  if (hoursLeft <= 0) return { kind: 'none' } // expired (RLS also hides these)
  if (hoursLeft <= 24) return { kind: 'soon' }
  return { kind: 'days', days: Math.max(1, Math.round(hoursLeft / 24)) }
}
