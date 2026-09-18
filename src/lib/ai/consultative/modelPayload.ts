// ── The model-facing place payload (cost optimization item 4, 2026-09-18) ────
//
// Measured on the audit env: a `search_places` result reaches the model as
// 16–22k characters (≈8–10k tokens, the single largest uncached item of a
// tool turn) — ten rows, each with its 7-day hours object, coordinates and
// fields the model never cites, plus everything the CARD needs. The card is
// built from the FULL result before this runs (`setPlacesRecommendations`),
// the annotation frame comes from the collector, and the ranking / evidence
// gap were computed on the full ranked set — so the model's copy can be the
// decision set only: the rows it MAY recommend (the shortlist, ≤5) plus the
// fields it needs to pick and explain. Nothing the card renders changes.
//
// Kept per row: identity (name, place_id, address, phone, website_uri,
// maps_link, booking_links), the evidence the rulebook cites (google_rating,
// rating_value, rating_count, price_range_text, opening_hours, open_now,
// distance_km, place_types, cuisine/attributes, tappy_* fields, snippets), and
// the capability booleans. Dropped: lat/lng, opening_hours_week, photo fields
// (already carved), and any row past the decision set.

const ROW_DROP = new Set(['lat', 'lng', 'opening_hours_week', 'photo_url', 'photo_urls', 'photo_names', 'thumbnail'])

/** How many rows the model reads when there is no shortlist to go by. */
export const MODEL_ROWS_MAX = 5

/** @param key the array the rows live in: `results` (search_places) or `hotel_list` (get_hotel_prices) */
export function trimPlacesForModel(result: unknown, key: 'results' | 'hotel_list' = 'results'): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result
  const r = result as Record<string, unknown>
  const rows = r[key]
  if (!Array.isArray(rows) || rows.length === 0) return result
  const shortlist = Array.isArray(r._tappy_shortlist) ? (r._tappy_shortlist as Array<{ id?: unknown; name?: unknown }>) : []
  const keepIds = new Set(shortlist.map(s => String(s.id ?? '')).filter(Boolean))
  const keepNames = new Set(shortlist.map(s => String(s.name ?? '')).filter(Boolean))
  // Rows are already in ranked order (the route reorders `results` by candidate identity), so
  // "the first N" is the engine's order. A shortlist member is always kept, wherever it sits.
  const shortlisted = (x: Record<string, unknown>) =>
    keepIds.has(String(x.place_id ?? x.maps_link ?? x.name ?? '')) || keepNames.has(String(x.name ?? ''))
  const limit = Math.max(MODEL_ROWS_MAX, shortlist.length)
  // Shortlist members first (a member can sit past the top five when earlier rows failed the
  // evidence threshold), then the engine's order fills up to the limit.
  const members = rows.filter(row => shortlisted(row as Record<string, unknown>))
  const others = rows.filter(row => !shortlisted(row as Record<string, unknown>))
  const decision = [...members, ...others].slice(0, limit)
  const slim = decision.map(row => {
    const x = row as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(x)) if (!ROW_DROP.has(k)) out[k] = v
    return out
  })
  const total = rows.length
  return {
    ...r,
    [key]: slim,
    // The model is told what it is looking at: the decision set, not the whole search.
    ...(total > slim.length ? { results_note: `Hien thi ${slim.length}/${total} ket qua tot nhat theo engine; cac ket qua khac da co tren the (card) cua user.` } : {}),
  }
}
