// ── The model-facing place payload — stage 1 of the two-stage card design ────
//
// Cost optimization item 4 (2026-09-18) cut the model's copy to the decision set (≤5 rows) with
// every field those rows carried. Item 2 (2026-09-19, owner design) turns that around: the model
// must see EVERY retrieved row — code picking the five by rating would be the rating-ranked
// behaviour item 1 removed, only hidden — but in COMPACT form: identity, the evidence a pick is
// argued with (rating + count, price band, distance, today's hours, open-now, category, the
// review-attribute summary on the shortlist), and the few URL fields the CTA rules read
// (`maps_link`, `booking_links`, `website_uri`, `review_actions[0]`) so the model can never be
// tempted to invent one. Everything the CARD renders on its own and the model never argues with
// — address, phone, the 7-day hours object, coordinates, photos, capability booleans, the other
// review actions — stays out. Measured on GATE A payloads: 8 compact rows ≈ 5.9k chars vs the
// old 5 rich rows ≈ 8.4k (−2.5k chars ≈ −780 tokens per tool turn).
//
// Stage 2 is the model's reply: the venues it names become the three cards above the fold
// (streamEnrichment.ts `pickedRecs`, liveView `picked` / `shown`); the rest stay in the payload.

/** Row fields the model reads. Order is the order they are emitted (name first). */
const ROW_KEEP = [
  // Identity + the facts a follow-up asks for by name ("ở đâu?", "số điện thoại?") — the model
  // answers those from the row when the prior prose never stated them.
  'name', 'place_id', 'address', 'phone',
  // Rating under every provider's spelling (Serper: rating_value/rating_count; Google/OSM rows:
  // rating/user_ratings_total/review_count), price, distance, hours, category, stated attributes.
  'google_rating', 'rating_value', 'rating_count', 'rating', 'user_ratings_total', 'review_count',
  'price_range_text', 'price_range', 'price_level', 'price',
  'distance_km', 'open_now', 'opening_hours', 'place_types', 'cuisine', 'attributes', 'stars',
  'tappy_rating', 'tappy_rating_count',
  // The URL fields the CTA and review-link rules read; nothing else the model could invent from.
  'maps_link', 'booking_links', 'website_uri', 'has_tiktok_review',
] as const

/** The provider caps a place search at 10 rows; the model reads at most that many. */
export const MODEL_ROWS_MAX = 10

function compactRow(row: unknown): unknown {
  if (!row || typeof row !== 'object') return row
  const x = row as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of ROW_KEEP) if (x[k] !== undefined && x[k] !== null && x[k] !== '') out[k] = x[k]
  // Item 6: the formatted `google_rating` ("4.7⭐ (659 đánh giá Google Maps)") is what the model
  // cites; the numeric twins beside it are for the ranker and the guards, which read the FULL row.
  if (typeof out.google_rating === 'string' && out.google_rating) { delete out.rating_value; delete out.rating_count }
  // Rule 18b reads `review_actions[0]` when the user asks for a review link; one entry, three fields.
  const ra = Array.isArray(x.review_actions) ? x.review_actions[0] as Record<string, unknown> | undefined : undefined
  if (ra && typeof ra.url === 'string') out.review_actions = [{ kind: ra.kind, url: ra.url, attributed: ra.attributed === true }]
  return out
}

/**
 * @param key the array the rows live in: `results` (search_places) or `hotel_list` (get_hotel_prices)
 * @param opts.rendersCard the client renders the decision card — the model is told not to write the
 *   aggregate Maps link, so the link itself need not travel (item 6).
 */
export function trimPlacesForModel(result: unknown, key: 'results' | 'hotel_list' = 'results', opts: { rendersCard?: boolean } = {}): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result
  const r = result as Record<string, unknown>
  const rows = r[key]
  if (!Array.isArray(rows) || rows.length === 0) return result
  const shortlist = Array.isArray(r._tappy_shortlist) ? (r._tappy_shortlist as Array<{ id?: unknown; name?: unknown }>) : []
  const keepIds = new Set(shortlist.map(s => String(s.id ?? '')).filter(Boolean))
  const keepNames = new Set(shortlist.map(s => String(s.name ?? '')).filter(Boolean))
  const shortlisted = (x: Record<string, unknown>) =>
    keepIds.has(String(x.place_id ?? x.maps_link ?? x.name ?? '')) || keepNames.has(String(x.name ?? ''))
  // Shortlist members first (a member can sit past the top rows when earlier rows failed the
  // evidence threshold), then the engine's order — every row, compact.
  const members = rows.filter(row => shortlisted(row as Record<string, unknown>))
  const others = rows.filter(row => !shortlisted(row as Record<string, unknown>))
  const all = [...members, ...others].slice(0, MODEL_ROWS_MAX)
  const total = rows.length
  const top: Record<string, unknown> = { ...r }
  if (opts.rendersCard) delete top.google_maps_search
  return {
    ...top,
    [key]: all.map(compactRow),
    results_note: total > all.length
      ? `Hien thi ${all.length}/${total} ket qua (rut gon: chi cac truong de chon); the (card) cua user co day du.`
      : `Day la TOAN BO ${all.length} ket qua, rut gon (chi cac truong de chon); the (card) cua user hien anh/dia chi/SDT/nut hanh dong.`,
  }
}
