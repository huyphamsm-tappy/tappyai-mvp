// ── Model-facing vs server-side tool results ─────────────────────────────────
//
// Place tools return two kinds of thing in one object:
//
//   1. facts the model reasons and writes with — name, address, ratings,
//      maps_link, website_uri, cuisine, opening hours, prices…
//   2. enrichment the model is explicitly FORBIDDEN to write — photos, order
//      links, platform links. The system prompt says so in as many words
//      ("HE THONG TU CHEN, BAN KHONG VIET"), and applyPlaceEnrichmentStreamFilter
//      injects them positionally after generation, stripping any copy the model
//      wrote itself.
//
// Sending (2) into the model is paid context that cannot legally be used, and it
// is the bulk of the payload: gstatic photo URLs run 180–250 chars each and a
// place carries up to three, plus three order links. So the tool hands the model
// only (1) and pushes (2) into a request-scoped collector the stream filter
// reads instead.
//
// Why a collector and not the AI SDK's own hook: experimental_toToolResultContent
// rewrites BOTH the model-facing content and the `result` that reaches the client
// stream (ai@4.3.19 dist lines 1835-1840 / 1930-1935), so it cannot make the two
// differ — which is the entire point here.

// `tiktok_review_url` is system-owned like the rest: the stream filter injects it positionally
// and the model must never write a TikTok URL of its own. The model still learns WHETHER one
// exists, because `has_tiktok_review` (a boolean, not a URL) stays model-facing — that is what
// lets it say "no TikTok review found" truthfully without being able to invent a link.
// `photo_names` joined the list when the widened field mask started carrying Google's photo
// RESOURCE NAMES on the search result. They are not URLs, but they are the raw material for one —
// the model has no legitimate use for them, and three ~90-character resource names per place is
// exactly the paid-context waste this split exists to prevent.
import { capabilitiesOf, type CapabilitySource } from '@/lib/recommendation/capabilities'
import type { CommerceLinkRow } from '@/lib/ccp'
import type { Recommendation } from '@/lib/recommendation/recommendation'
import { admitsProducer, type ProducerSubject } from '@/lib/recommendation/slotAdmission'

// `commerce_links` is the CCP row attachment (owner decision P6-B): Commerce Links the platform
// resolved for the row. Carved for the same reason as `order_links` — the model must never see a
// merchant URL — and replaced in its view by the `has_direct_handoff` capability.
export const ENRICHMENT_KEYS = ['photo_url', 'photo_urls', 'order_links', 'platform_links', 'tiktok_review_url', 'photo_names', 'commerce_links'] as const

export interface PlatformLink { name: string; url: string }

/** A place's enrichment, plus the name needed to match it back to the prose. */
export interface PlaceEnrichment {
  name?: string
  photo_url?: string
  photo_urls?: string[]
  order_links?: PlatformLink[]
  platform_links?: PlatformLink[]
  /** CCP row attachment, carried through so `buildActions` (via the entity builders) can read it. */
  commerce_links?: CommerceLinkRow[]
  tiktok_review_url?: string
  /** Google photo resource names ("places/…/photos/…") — the input to the late photo resolver. */
  photo_names?: string[]
  // Identity from Google Places New (search_places). The late photo resolver
  // (resolvePlacePhotos in tools/common) uses these to fetch official website /
  // Places Details photos when the tool result did not carry any. Copied into
  // the carved enrichment so it reaches resolvePlaces() via collector.places —
  // and STILL remains in the model-facing `rest` payload, so the model can cite
  // website_uri as before.
  place_id?: string
  website_uri?: string
  // Facts about the place itself, carried the SAME way as place_id / website_uri: read off the
  // item without being destructured out of `rest`, so the model still sees and cites them exactly
  // as before. They exist so a client can render a place card from structured values instead of
  // parsing the localized `google_rating` sentence back into numbers. Provider-dependent by
  // nature — Google states rating and review count, OSM states hours, distance and cuisine, and
  // neither states both — so each is optional and an absent value stays absent.
  address?: string
  rating?: number
  review_count?: number
  distance_km?: number
  hours?: string
  attributes?: string[]
  /**
   * Whether the provider that returned this place ranked it against the QUERY TEXT.
   *
   * True for Google Places textSearch, which is given the user's words. False for the OpenStreetMap
   * fallback, which is given only a category and a radius: `searchPlacesOSM` reads the query solely
   * to guess an amenity tag, then asks Overpass for every venue of that tag nearby. Measured on
   * 2026-09-08 — with Google returning 403, "Quán bún bò ngon ở TP.HCM?" came back as Nhà Hàng
   * Jaspas, Nhà Hàng Au Tresor and Nhà Hàng Crazy Buffalo: three real, nearby, correctly-tagged
   * restaurants, and not one of them serves bún bò.
   *
   * Those rows are still useful CONTEXT for the model's prose. What they cannot be is a ranked
   * "Tappy recommends these" card, because nothing in them answers the dish the user asked for.
   * Absent means unknown, and unknown is treated as not text-ranked — a provider must earn the
   * card, not inherit it by omission.
   */
  text_ranked?: boolean
}

/** Request-scoped. One per HTTP request, created in the route and never shared. */
export interface EnrichmentCollector {
  readonly places: PlaceEnrichment[]
  add(items: PlaceEnrichment[]): void
  /**
   * The batch-level TikTok link, if any tool produced one this turn.
   *
   * Deliberately NOT a `PlaceEnrichment`: it belongs to the search, not to a place, and modelling
   * it as one is how it ended up captioned as a restaurant's review in the first place.
   */
  batchTikTokUrl?: string
  setBatchTikTokUrl(url: string | undefined): void
  /**
   * The Phase-9 shopping-decision marker, appended once to the very end of the
   * reply text so it PERSISTS with the message (a tool-result field does not —
   * see synthesisView.renderShoppingMarker). Batch-level like the TikTok URL:
   * one decision per shopping turn, owned by the app, never written by the model.
   */
  shoppingMarker?: string
  setShoppingMarker(marker: string | undefined): void
  /**
   * The turn's canonical recommendations, for the `[TAPPY_PLACES]` block.
   *
   * Held as STRUCTURE rather than a rendered string, unlike `shoppingMarker`:
   * photos resolve late, inside the stream filter, so the marker cannot be
   * serialized until after that. The filter renders it at the same point it
   * folds in the shopping marker.
   */
  placesRecommendations?: Recommendation[]
  /**
   * WHICH SUBJECT owns the card this turn — 'food', 'stay', 'shopping'…
   *
   * Recorded rather than inferred so the trip subdomains stay distinguishable
   * downstream: a plan runs a hotel search AND two place searches, and "which of
   * them is on screen" is otherwise unanswerable after the fact.
   */
  placesProducer?: ProducerSubject
  setPlacesRecommendations(recs: Recommendation[] | undefined, producer: ProducerSubject | null): void
  /**
   * The provider's own map search for this turn, straight off the tool result.
   *
   * The approved composition ends the recommendation block with "see all of these
   * on the map". That destination is the tool's `google_maps_search` /
   * `search_url` - a real URL the provider built - and never one assembled here.
   */
  placesMapsUrl?: string
  setPlacesMapsUrl(url: string | undefined): void
  /**
   * True when THIS request will render the decision as a card.
   *
   * The per-place photo/link block below is injected into the reply text for
   * clients that have no card. When the card is rendering the same photo, the
   * same order links and the same review link, injecting them too is the
   * duplication the approved design forbids - so the injection is skipped for
   * that request only. Native clients never set it and are untouched.
   */
  rendersDecisionCard?: boolean
  setRendersDecisionCard(on: boolean): void
}

/** Tools whose results carry enrichment. Mirrors PLACE_TOOLS in streamEnrichment. */
const PLACE_TOOLS = new Set(['search_places', 'get_hotel_prices', 'search_products'])

const hasEnrichment = (p: PlaceEnrichment) =>
  !!(p.photo_url || (p.photo_urls && p.photo_urls.length > 0) ||
    (p.order_links && p.order_links.length > 0) || (p.platform_links && p.platform_links.length > 0) ||
    (p.commerce_links && p.commerce_links.length > 0) ||
    p.tiktok_review_url || (p.photo_names && p.photo_names.length > 0))

const hasPhoto = (p: PlaceEnrichment) => !!(p.photo_url || (p.photo_urls && p.photo_urls.length > 0))

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Splits one tool result into what the model sees and what the server keeps.
 *
 * Never throws: a malformed or unexpected result is passed through untouched
 * rather than failing the turn — a tool that returned something odd should
 * degrade to "no enrichment", not to "no answer".
 */
export function splitToolResult(
  toolName: string,
  result: unknown,
): { model: unknown; enrichment: PlaceEnrichment[]; batchTikTokUrl?: string } {
  if (!PLACE_TOOLS.has(toolName) || !isRecord(result)) return { model: result, enrichment: [] }

  /**
   * A TikTok result the search found but could NOT tie to any one place.
   *
   * Root-level rather than per-place, because that is exactly what it is: the query was one search
   * for the whole batch. It is carved off like every other link so the model never writes it — and
   * so it can be rendered under wording that says "related video", not "this restaurant's review".
   */
  const { tiktok_discovery_url, ...withoutBatch } = result as Record<string, unknown>
  const batchTikTokUrl = typeof tiktok_discovery_url === 'string' ? tiktok_discovery_url : undefined
  result = withoutBatch

  // search_places carries results[] keyed by `name`; get_hotel_prices and
  // search_products carry search_results[] where `title` stands in for the name.
  // Raw titles read "Hotel Name - City - Booking.com" but the model writes just
  // "Hotel Name", so match on the part before the first " - " — the same rule
  // the stream filter already used when it parsed these frames itself.
  const root = result as Record<string, unknown>
  const listKey = Array.isArray(root.results) ? 'results'
    : Array.isArray(root.search_results) ? 'search_results'
      : null
  if (!listKey) return { model: root, enrichment: [], batchTikTokUrl }

  /**
   * `searchPlaces` states which provider answered: 'Google Maps' for the textSearch path,
   * 'OpenStreetMap' for the amenity-radius fallback. It is a property of the SEARCH, so it is read
   * once here rather than expected on every row.
   */
  const textRanked = root.source === 'Google Maps'

  const items = root[listKey] as unknown[]
  const enrichment: PlaceEnrichment[] = []
  const slimItems = items.map((item) => {
    if (!isRecord(item)) return item
    const { photo_url, photo_urls, order_links, platform_links, tiktok_review_url, photo_names, commerce_links, ...rest } = item as PlaceEnrichment & Record<string, unknown>
    const name = listKey === 'results'
      ? (item.name as string | undefined)
      : String((item.title as string | undefined) ?? '').split(' - ')[0].trim() || undefined
    // Identity fields ride along with enrichment WITHOUT being destructured out
    // of `rest`, so the model still sees place_id / website_uri and the late
    // photo resolver (which reads collector.places) sees them too. Only present
    // on search_places output today; search_products lacks them by construction,
    // so the guard is `typeof x === 'string'` — no fake / inferred values.
    const place_id = typeof (item as { place_id?: unknown }).place_id === 'string'
      ? (item as { place_id: string }).place_id : undefined
    const website_uri = typeof (item as { website_uri?: unknown }).website_uri === 'string'
      ? (item as { website_uri: string }).website_uri : undefined
    // Place facts, same ride-along rule as the identity fields above: typed guards only, never a
    // coerced or inferred value. `cuisine` is OSM's own comma-joined list and becomes attributes.
    const str = (k: string): string | undefined => {
      const v = (item as Record<string, unknown>)[k]
      return typeof v === 'string' && v.trim() !== '' ? v : undefined
    }
    const num = (k: string): number | undefined => {
      const v = (item as Record<string, unknown>)[k]
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined
    }
    const cuisine = str('cuisine')
    const carved: PlaceEnrichment = {
      name, photo_url, photo_urls, order_links, platform_links, tiktok_review_url, photo_names, place_id, website_uri,
      commerce_links: Array.isArray(commerce_links) && commerce_links.length > 0 ? commerce_links : undefined,
      address: str('address'),
      rating: num('rating'),
      review_count: num('review_count'),
      distance_km: num('distance_km'),
      hours: str('opening_hours'),
      attributes: cuisine ? cuisine.split(',').map(c => c.trim()).filter(Boolean) : undefined,
      text_ranked: textRanked,
    }
    if (name && hasEnrichment(carved)) enrichment.push(carved)
    // 🔑 CAPABILITIES REPLACE THE CARVED URLS IN THE MODEL'S VIEW.
    //
    // Carving alone leaves the model knowing less than it needs: it cannot say
    // "you can order this one" without the order links it is forbidden to have.
    // The answer already proven by `has_tiktok_review` is to hand over the
    // BOOLEAN and keep the URL — the model learns what is possible and still
    // cannot write the link. Derived from the same carved values, so a
    // capability can never claim an action the app did not actually build.
    //
    // Derived from the WHOLE item, not from `carved`: `maps_link`, `phone`,
    // `opening_hours` and `has_tiktok_review` stay model-facing and live in
    // `rest`, so reading only the carved half would under-report them.
    return { ...rest, ...capabilitiesOf(item as CapabilitySource) }
  })

  return { model: { ...root, [listKey]: slimItems }, enrichment, batchTikTokUrl }
}

/**
 * Per-request enrichment store.
 *
 * Deliberately a closure over a local array rather than a module-level map:
 * there is no key to collide on, nothing to evict, nothing to clean up, and no
 * way for one request to read another's data or for a warm serverless instance
 * to carry data across invocations. It also survives any number of concurrent
 * requests on the same instance for free.
 */
export function createEnrichmentCollector(turnText = ''): EnrichmentCollector {
  const places: PlaceEnrichment[] = []
  /** Every photo URL already claimed by an earlier entry, so no image is used twice. */
  const claimedPhotos = new Set<string>()

  /**
   * Drops photo URLs another entry already owns.
   *
   * Two shopping listings from the same seller routinely carry the SAME provider image, and two
   * venues occasionally do through a provider glitch. Rendering it under both is worse than
   * rendering it once: it tells the reader the two entries are the same thing, which for a shopping
   * result — where the rows genuinely differ in chip, condition and price — is exactly the false
   * merge this pipeline must never imply. First claimant keeps it; later ones simply go without.
   */
  const claim = (p: PlaceEnrichment): PlaceEnrichment => {
    // Each field is filtered in place. The shape is NOT rewritten — an entry that arrived with
    // `photo_urls` keeps `photo_urls`, even when only one URL survives, because the stream filter
    // and its tests read the two fields separately.
    const take = (url: string | undefined): string | undefined => {
      const u = (url ?? '').trim()
      if (!u || claimedPhotos.has(u)) return undefined
      claimedPhotos.add(u)
      return u
    }
    const out: PlaceEnrichment = { ...p }
    if (out.photo_urls) {
      const kept = out.photo_urls.map(take).filter((u): u is string => !!u)
      if (kept.length > 0) out.photo_urls = kept
      else delete out.photo_urls
    }
    if (out.photo_url) {
      const kept = take(out.photo_url)
      // A `photo_url` already listed in this entry's own `photo_urls` was claimed a line ago;
      // keeping it is correct, so only a URL claimed by a DIFFERENT entry removes it.
      if (kept) out.photo_url = kept
      else if (!p.photo_urls?.includes(out.photo_url)) delete out.photo_url
    }
    return out
  }

  return {
    places,
    batchTikTokUrl: undefined as string | undefined,
    setBatchTikTokUrl(url) {
      // First one wins: a trip plan runs several place searches and the answer carries one
      // "related video" line, not one per search.
      if (url && !this.batchTikTokUrl) this.batchTikTokUrl = url
    },
    placesMapsUrl: undefined as string | undefined,
    setPlacesMapsUrl(url: string | undefined) {
      // First writer wins, like the recommendations above: one search per turn
      // owns the map link, and a later tool must not repoint it.
      if (url && !this.placesMapsUrl) this.placesMapsUrl = url
    },
    rendersDecisionCard: false,
    setRendersDecisionCard(on: boolean) { this.rendersDecisionCard = on },
    placesRecommendations: undefined as Recommendation[] | undefined,
    placesProducer: undefined as ProducerSubject | undefined,
    setPlacesRecommendations(recs, producer) {
      /**
       * 🚨 "FIRST NON-EMPTY SET WINS" WAS NOT ENOUGH, AND THE GAP WAS VISIBLE.
       *
       * That rule is still here — a trip plan runs several place searches and the
       * reply carries one block — but it now runs AFTER an admission check,
       * because on its own it let a producer from a different subject fill a slot
       * that a same-subject producer had just declined by returning nothing.
       * Measured: a flight question rendered eight hotel cards under the sentence
       * "Mình chưa tìm thấy địa điểm nào đủ dữ liệu để giới thiệu cho yêu cầu
       * này". See `slotAdmission.ts` for the full trace.
       *
       * Order matters: admission is judged before emptiness, so a REFUSED
       * producer cannot leave a trace either way.
       */
      if (!admitsProducer(turnText, producer)) return
      if (recs && recs.length > 0 && !this.placesRecommendations) {
        this.placesRecommendations = recs
        this.placesProducer = producer ?? undefined
      }
    },
    shoppingMarker: undefined as string | undefined,
    setShoppingMarker(marker) {
      // First one wins, mirroring the TikTok URL: one shopping decision per turn.
      if (marker && !this.shoppingMarker) this.shoppingMarker = marker
    },
    add(items) {
      for (const raw of items ?? []) {
        const key = (raw?.name || '').trim().toLowerCase()
        if (!key) continue
        const existing = places.find(q => (q.name || '').trim().toLowerCase() === key)
        // Accumulate across EVERY place-tool call — a trip plan runs several
        // searches and each item needs its own photo. If a later call carries a
        // photo for a name we already saw without one, upgrade to it.
        if (!existing) { places.push(claim(raw)); continue }
        // Snapshot identity that Object.assign below could otherwise clobber
        // with an undefined value from the incoming record (its own keys include
        // place_id / website_uri even when the record has no such value).
        const savedPlaceId = existing.place_id
        const savedWebsiteUri = existing.website_uri
        if (!hasPhoto(existing) && hasPhoto(raw)) Object.assign(existing, claim(raw))
        // Identity propagation is INDEPENDENT of hasPhoto — a later frame may
        // carry place_id / website_uri for a name we already saw. Prefer any
        // valid existing value; otherwise fill from incoming. Never overwrite.
        if (!existing.place_id && savedPlaceId) existing.place_id = savedPlaceId
        if (!existing.website_uri && savedWebsiteUri) existing.website_uri = savedWebsiteUri
        if (!existing.place_id && typeof raw.place_id === 'string') existing.place_id = raw.place_id
        if (!existing.website_uri && typeof raw.website_uri === 'string') existing.website_uri = raw.website_uri
      }
    },
  }
}
