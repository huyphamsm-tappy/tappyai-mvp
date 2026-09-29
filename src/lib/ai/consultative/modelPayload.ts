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
  // Row flags the hard-constraint gate vouches from (A.3: the gate reads THIS copy).
  'has_delivery', 'has_order',
  'tappy_rating', 'tappy_rating_count',
  // Phase 7 group 3: the constraint filter marks a row with no provider band when a budget was
  // stated, so the model says "chưa xác nhận giá" for THAT row instead of "trong tầm giá".
  '_tappy_price_unconfirmed',
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
  // Item 6 tried to drop the numeric twins beside the formatted `google_rating` — REVERTED the same
  // day: the stream-side grounding guard reads rating evidence from the tool-result frame the
  // SDK emits, i.e. THIS copy, not the full row. Without them every "5⭐ (100 đánh giá)" pick
  // sentence lost its evidence and was cut (measured smoke68: P2, E1, F8 lost the pick).
  // Rule 18b reads `review_actions[0]` when the user asks for a review link; one entry, three fields.
  const ra = Array.isArray(x.review_actions) ? x.review_actions[0] as Record<string, unknown> | undefined : undefined
  if (ra && typeof ra.url === 'string') out.review_actions = [{ kind: ra.kind, url: ra.url, attributed: ra.attributed === true }]
  return out
}

/**
 * @param key the array the rows live in: `results` (search_places) or `hotel_list` (get_hotel_prices)
 * @param opts.rendersCard the client renders the decision card — the model is told not to write the
 *   aggregate Maps link, so the link itself need not travel (item 6).
 * @param opts.modelChooses Consultative V1 (1.4, owner 2026-09-19): the model reads the rows in the
 *   PROVIDER's order with no `_tappy_shortlist` and no `_tappy_ranking`, and chooses itself. Off
 *   (the pre-V1 product, byte-identical): shortlist members first, both engine fields travel.
 */
export function trimPlacesForModel(result: unknown, key: 'results' | 'hotel_list' = 'results', opts: { rendersCard?: boolean; modelChooses?: boolean; consultTop?: number } = {}): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result
  const r = result as Record<string, unknown>
  const rows = r[key]
  if (!Array.isArray(rows) || rows.length === 0) return result
  const total = rows.length
  const top: Record<string, unknown> = { ...r }
  if (opts.rendersCard) delete top.google_maps_search
  if (opts.consultTop) {
    /**
     * Consult V2 (owner 29/09, design): CODE chooses and ranks; the model gets ONLY the top candidates
     * (1 main + ≤ 2 others) with the fields a pick is argued with, and writes the words. The engine's
     * order is the shortlist first, then the ranked rest; `_tappy_ranking` (the engine's pick) travels.
     * The full set stays on the server (cards, "còn N", the chat-session state for "xem thêm" / "bác").
     */
    const sl = Array.isArray(r._tappy_shortlist) ? (r._tappy_shortlist as Array<{ id?: unknown; name?: unknown }>) : []
    const ids = new Set(sl.map(s => String(s.id ?? '')).filter(Boolean))
    const names = new Set(sl.map(s => String(s.name ?? '')).filter(Boolean))
    const isSl = (x: Record<string, unknown>) => ids.has(String(x.place_id ?? x.maps_link ?? x.name ?? '')) || names.has(String(x.name ?? ''))
    const ordered = [...rows.filter(x => isSl(x as Record<string, unknown>)), ...rows.filter(x => !isSl(x as Record<string, unknown>))]
    const chosen = ordered.slice(0, opts.consultTop)
    delete top._tappy_shortlist
    return {
      ...top,
      [key]: chosen.map(consultRow),
      results_note: `${chosen.length} ung vien DA XEP HANG boi he thong (ung vien 1 = lua chon chinh${r._tappy_ranking ? ', xem _tappy_ranking' : ''}); ${Math.max(0, total - chosen.length)} ung vien khac giu o he thong (the/card va "xem thêm"). Chi viet ve cac ung vien nay.`,
    }
  }
  if (opts.modelChooses) {
    /**
     * 🚨 THE MODEL'S ORDER IS THE PROVIDER'S ORDER, AND IT GETS NO PRE-MADE PICK (owner decision
     * 2026-09-19, T8). Until today the copy put the `_tappy_shortlist` members first and carried
     * the shortlist and `_tappy_ranking` (the engine's rating-first Pick) — so the model read
     * "row 0 = best_overall" and echoed it: a 5⭐/138 guest house for "resort … sang chút". Both
     * fields stay on the server result (card emphasis, backstop sentence, evidence gap); they do
     * not travel to the model, whose job in the two-stage design is to choose among ALL rows.
     */
    const all = rows.slice(0, MODEL_ROWS_MAX)
    delete top._tappy_shortlist
    delete top._tappy_ranking
    return {
      ...top,
      [key]: all.map(compactRow),
      results_note: total > all.length
        ? `Hien thi ${all.length}/${total} ket qua theo thu tu nha cung cap, KHONG phai thu tu uu tien (rut gon: chi cac truong de chon); the (card) cua user co day du.`
        : `Day la TOAN BO ${all.length} ket qua theo thu tu nha cung cap, KHONG phai thu tu uu tien — ban tu chon cho dung tinh huong (rut gon: chi cac truong de chon); the (card) cua user hien anh/dia chi/SDT/nut hanh dong.`,
    }
  }
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
  return {
    ...top,
    [key]: all.map(compactRow),
    results_note: total > all.length
      ? `Hien thi ${all.length}/${total} ket qua (rut gon: chi cac truong de chon); the (card) cua user co day du.`
      : `Day la TOAN BO ${all.length} ket qua, rut gon (chi cac truong de chon); the (card) cua user hien anh/dia chi/SDT/nut hanh dong.`,
  }
}

/**
 * The consult model's row (owner 29/09): name, rating + count, the REAL price band, a short address, today's
 * hours, open-now, distance and 1–2 evidenced highlights. The rating/count numerics stay: the stream guards
 * read the pick's evidence from this copy.
 */
function consultRow(row: unknown): unknown {
  if (!row || typeof row !== 'object') return row
  const x = row as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of ['name', 'google_rating', 'rating_value', 'rating_count', 'rating', 'user_ratings_total', 'review_count',
    'price_range_text', 'price_level', '_tappy_price_unconfirmed', 'opening_hours', 'open_now', 'distance_km', 'has_delivery'] as const) {
    if (x[k] !== undefined && x[k] !== null && x[k] !== '') out[k] = x[k]
  }
  if (typeof x.address === 'string') out.address = x.address.split(',').slice(0, 2).join(',').trim()
  if (Array.isArray(x.attributes)) out.highlights = (x.attributes as unknown[]).slice(0, 2)
  else if (x.attributes && typeof x.attributes === 'object') out.highlights = Object.entries(x.attributes as Record<string, unknown>).slice(0, 2).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`.slice(0, 120))
  return out
}
