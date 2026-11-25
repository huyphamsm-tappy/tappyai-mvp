import type { BookingContext, RealtimeProviderId } from './types'
import agodaCitiesJson from './agodaVietnamCities.json'

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

/**
 * Agoda city ids for Vietnam from Agoda's own Hotel Data File (partner portal → Tools → Hotel Data File), read 14/11/2026: city, country code and city_id per hotel. The file is served by a host that closes
 * the download after about 60 s, so only the first ~29% of it (231,649 hotels, 4,548 of them Vietnamese) could be read: the table is a LOWER BOUND, a city whose hotels all sit later in the file is absent.
 * Every id of VERIFIED_IDS above (read from the public city pages on 30/10) is in it with the same value (proved in locations.agodaCities.test.ts). Regenerate: scripts/agoda (the builder is documented in the
 * handoff); the table drops any name that two cities share, unless one holds 80% of the hotels for it.
 */
export interface AgodaVietnamCity { id: number; name: string; state: string; hotels: number; aliases: string[] }
export const AGODA_VIETNAM_CITIES = agodaCitiesJson as { source: string; rowsRead: number; cities: AgodaVietnamCity[] }

/** A whole-word form of a name: accents and punctuation gone, single spaces. */
const words = (s: string) => ` ${s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim()} `
/** Shortest name that may be found INSIDE a longer text ("quy nhon gan bien"); shorter ones must be the whole text, so "vinh" never matches inside "vịnh Hạ Long". */
const MIN_INSIDE = 5

const EXACT = new Map<string, string>()
const INSIDE: Array<{ w: string; id: string }> = []
for (const c of AGODA_VIETNAM_CITIES.cities) {
  for (const a of c.aliases) {
    EXACT.set(fold(a), String(c.id))
    const w = words(a)
    if (w.trim().length >= MIN_INSIDE) INSIDE.push({ w, id: String(c.id) })
  }
}
INSIDE.sort((a, b) => b.w.length - a.w.length)

/**
 * The Agoda city id of a destination as people and the model write it ("Quy Nhơn", "quy nhơn gần biển", "Phú Quốc, gần biển, 4 người lớn", "tp. hồ chí minh"): the hand-verified table first, then the Hotel Data
 * File table; the whole text, then each comma / bracket separated part, then the longest known name inside it. Null when nothing matches: a name is never guessed.
 */
export function agodaCityIdFor(destination: string | undefined, opts: { skipHand?: boolean } = {}): string | null {
  if (!destination || !destination.trim()) return null
  const parts = [destination, ...destination.split(/[,;()/|]/).map(s => s.trim()).filter(Boolean)]
  for (const p of parts) {
    const f = fold(p)
    if (f.length < 3) continue
    if (!opts.skipHand) { const row = VERIFIED_IDS[f]; if (row?.agoda?.cityRef) return row.agoda.cityRef }
    const hit = EXACT.get(f)
    if (hit) return hit
  }
  for (const p of parts) {
    const w = words(p)
    for (const e of INSIDE) if (w.includes(e.w)) return e.id
  }
  return null
}

export function verifiedRefsFor(destination: string | undefined): ProviderRefs | undefined {
  if (!destination) return undefined
  const id = agodaCityIdFor(destination)
  return id ? agoda(id) : undefined
}

/** Merge the refs the caller already holds with the verified table (the caller's win). Pure. */
export function mergeRefs(existing: BookingContext['providerRefs'], verified: ProviderRefs | undefined): ProviderRefs | undefined {
  if (!existing && !verified) return undefined
  const out: ProviderRefs = { ...(verified ?? {}) }
  for (const [p, v] of Object.entries(existing ?? {})) out[p as RealtimeProviderId] = { ...(out[p as RealtimeProviderId] ?? {}), ...v }
  return out
}
