import type { BookingContext, RealtimeProviderId } from './types'

// ── Destination name → each provider's OWN location id ───────────────────────────────────────────────────────────────────────────
//
// The realtime APIs take numeric ids, never a destination name, and the ids are NOT shared: Booking's city id ≠ Agoda's ≠ Trip.com's.
// So every provider has its own namespace (BookingContext.providerRefs.<provider> / constraints.providerRefs.<provider>) and an id is
// used ONLY for the provider it belongs to. Nothing is guessed: a destination with no known id yields no ref, and that provider is
// answered by the dynamic deeplink instead.
//
// Two sources, in order:
//   1. VERIFIED_IDS — ids confirmed against the provider itself, with provenance below. Small by design; add a row only with evidence.
//   2. a LocateFn port — filled once a provider grants API access (Booking locations endpoint, Agoda hotel-data file); the resolver calls it
//      only for providers that are READY and only when the table has no id. Until then the port is absent and nothing is looked up.

export type ProviderRefs = NonNullable<BookingContext['providerRefs']>

/** Resolve a destination name to a provider's ids (an API lookup). Must not throw; null = unknown. */
export type LocateFn = (provider: RealtimeProviderId, destination: string) => Promise<{ cityRef?: string; propertyRefs?: string[] } | null>

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '')

/**
 * Verified provider ids by folded destination name ("dalat" = Đà Lạt / Da Lat / Dalat).
 *   agoda / Đà Lạt = 15932 — read from the redirect of Agoda's own partner link generator (partners.agoda.com, tools/textLink,
 *   hotel "The Luxe Hotel Da Lat" → …/search?…&selectedproperty=4942635&city=15932), opened live on 06/10/2026.
 * Booking.com has NO verified id yet: its city ids come from the Demand API locations endpoint (access pending).
 *
 *   agoda / the rest (30/10/2026): read from each city's OWN public page, https://www.agoda.com/vi-vn/city/<slug>.html, field
 *   `defaultSearchURL":"/vi-vn/search?city=<id>` (one city= per page). Đà Lạt read the same way gives 15932, the id verified above.
 *   Evidence and slugs: D:/TappyAI-review-artifacts/agoda/city-ids-20261030.md. Quy Nhơn and Hải Phòng: no page found, so no row.
 */
const agoda = (cityRef: string) => ({ agoda: { cityRef } })
const VERIFIED_IDS: Readonly<Record<string, Partial<Record<RealtimeProviderId, { cityRef: string }>>>> = {
  dalat: agoda('15932'),
  hanoi: agoda('2758'),
  hochiminh: agoda('13170'), tphochiminh: agoda('13170'), thanhphohochiminh: agoda('13170'), hochiminhcity: agoda('13170'), saigon: agoda('13170'),
  danang: agoda('16440'),
  hoian: agoda('16552'),
  nhatrang: agoda('2679'),
  phuquoc: agoda('17188'),
  hue: agoda('3738'),
  sapa: agoda('17160'),
  halong: agoda('17182'),
  vungtau: agoda('17190'),
  phanthiet: agoda('16264'),
  cantho: agoda('16079'),
  ninhbinh: agoda('17245'),
}

export function verifiedRefsFor(destination: string | undefined): ProviderRefs | undefined {
  if (!destination) return undefined
  const row = VERIFIED_IDS[fold(destination)]
  return row ? { ...row } : undefined
}

/** Merge the refs the caller already holds with the verified table (the caller's win). Pure. */
export function mergeRefs(existing: BookingContext['providerRefs'], verified: ProviderRefs | undefined): ProviderRefs | undefined {
  if (!existing && !verified) return undefined
  const out: ProviderRefs = { ...(verified ?? {}) }
  for (const [p, v] of Object.entries(existing ?? {})) out[p as RealtimeProviderId] = { ...(out[p as RealtimeProviderId] ?? {}), ...v }
  return out
}
