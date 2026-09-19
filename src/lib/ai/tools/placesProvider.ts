// ── PLACES PROVIDER — an explicit setting, never "is a key present" ─────────────────────────────
//
// Until 2026-09-19 the place pipeline was Google Places (New) → Serper /maps → OSM, and the first
// step ran whenever GOOGLE_PLACES_API_KEY existed. So adding or removing that one secret in Vercel
// silently switched the production data pipeline — different row fields, different prices, a
// different cost (~$32 vs ~$3 per 1 000) — while every measurement of V3 (guards, evals, cost) was
// taken on Serper-first, because the audit key is API-restricted and 403s. Provider selection is a
// product decision, so it is a named config with a documented default that matches what was
// measured. A key's presence never changes behaviour again; with `serper` the Google call is not
// made even when a valid key is present.
//
//   PLACES_PROVIDER=serper  (default) Serper /maps → OSM. What V3 was measured on.
//   PLACES_PROVIDER=google  Google Places (New) → Serper /maps → OSM (the pre-2026-09-19 chain).
//   PLACES_PROVIDER=osm     OSM only (the no-paid-provider fallback, for tests and emergencies).
//
// An unknown value is a configuration error: it is logged once and treated as the default.

export type PlacesProvider = 'serper' | 'google' | 'osm'

export const PLACES_PROVIDER_DEFAULT: PlacesProvider = 'serper'

let warned: string | null = null

export function placesProvider(env: Record<string, string | undefined> = process.env): PlacesProvider {
  const raw = (env.PLACES_PROVIDER ?? '').trim().toLowerCase()
  if (raw === '') return PLACES_PROVIDER_DEFAULT
  if (raw === 'serper' || raw === 'google' || raw === 'osm') return raw
  if (warned !== raw) {
    warned = raw
    console.error(JSON.stringify({ type: 'tappyai_config_error', setting: 'PLACES_PROVIDER', value: raw.slice(0, 20), fallback: PLACES_PROVIDER_DEFAULT }))
  }
  return PLACES_PROVIDER_DEFAULT
}

/** Test hook: forget the "warned once" state. */
export function __resetPlacesProviderWarning(): void { warned = null }
