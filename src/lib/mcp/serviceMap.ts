// The fixed service allowlist of the Gateway (R13 §25.7, ADR-CONN-002/003/005): each search tool maps to ONE internal service, named here and nowhere else. The Gateway never takes a function,
// table or provider name from a Host, and never touches the database or a provider directly: it calls an injected ServiceAdapter, and a deployment decides which adapters exist.
// Adapters start UNWIRED (NO_ADAPTERS): until one is injected the tool answers PROVIDER_UNAVAILABLE. The real adapters live in defaultDeps.ts and are imported lazily.
//
// Row mappers turn an internal result row into DTO fields. Everything else on the row (internal score, ranking, TVI ids, coordinates, phone numbers) is not copied, and connectorContract.shapeResult
// then enforces the per-tool allowlist, Top-K and byte ceiling a second time. Text from a row is DATA: it is stripped of control/bidi characters and length-bounded, never interpreted.
import type { ToolName } from './connectorContract'

export type SearchToolName = Extract<ToolName, 'search_places' | 'search_restaurants' | 'search_shopping' | 'search_hotels' | 'search_attractions' | 'search_deals' | 'search_clips' | 'search_coach'>
export type ServiceId = 'places.search' | 'shopping.search' | 'hotels.prices' | 'scam.check' | 'deals.search' | 'clips.search' | 'coach.link'

export interface ServiceCall {
  query: string
  /** free-text destination the person gave, if any */
  location?: string
  lat?: number
  lng?: number
  lang: 'vi' | 'en'
  limit: number
  radiusMeters?: number
  placeType?: string
  checkIn?: string
  checkOut?: string
  /** coach route (search_coach): the two places the person named and the day (YYYY-MM-DD) */
  origin?: string
  destination?: string
  departDate?: string
  signal?: AbortSignal
}
export interface ServiceOutput { rows: ReadonlyArray<Record<string, unknown>>; /** the real cost when the adapter knows it; otherwise the reservation stands as the cost */ costUsd?: number }
export type ServiceAdapter = (c: ServiceCall) => Promise<ServiceOutput>
export type ServiceAdapters = Record<ServiceId, ServiceAdapter | null>

export const NO_ADAPTERS: ServiceAdapters = Object.freeze({ 'places.search': null, 'shopping.search': null, 'hotels.prices': null, 'scam.check': null, 'deals.search': null, 'clips.search': null, 'coach.link': null })

export interface ToolServiceEntry { readonly service: ServiceId; readonly placeType?: string; /** the Market Capability Gate vertical */ readonly vertical: string; /** needs a destination (coordinates or a named Vietnamese place) */ readonly needsLocation: boolean }

const entry = (e: ToolServiceEntry): ToolServiceEntry => Object.freeze(e)
export const TOOL_SERVICE: Readonly<Record<SearchToolName, ToolServiceEntry>> = Object.freeze({
  search_places: entry({ service: 'places.search', vertical: 'general', needsLocation: true }),
  search_restaurants: entry({ service: 'places.search', placeType: 'restaurant', vertical: 'food', needsLocation: true }),
  search_attractions: entry({ service: 'places.search', placeType: 'attraction', vertical: 'attractions', needsLocation: true }),
  search_shopping: entry({ service: 'shopping.search', vertical: 'shopping', needsLocation: false }),
  search_hotels: entry({ service: 'hotels.prices', vertical: 'hotels', needsLocation: true }),
  // Vietnamese partner offers and public clips: market-wide data, no destination needed.
  search_deals: entry({ service: 'deals.search', vertical: 'shopping', needsLocation: false }),
  search_clips: entry({ service: 'clips.search', vertical: 'general', needsLocation: false }),
  search_coach: entry({ service: 'coach.link', vertical: 'travel', needsLocation: false }),
})

// ── text and URL hygiene ─────────────────────────────────────────────────────────────────────────────────────────────

// built from code points on purpose: no escape sequences or invisible characters in this source file
const invisible = (c: number): boolean =>
  c < 32 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff

/** Printable text, whitespace collapsed, at most `max` characters; undefined when nothing is left. Pure. */
export function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  let out = ''
  for (const ch of v) if (!invisible(ch.codePointAt(0) as number)) out += ch
  out = out.replace(/\s+/g, ' ').trim().slice(0, max)
  return out === '' ? undefined : out
}

/** An absolute http(s) URL without credentials, as the parser normalises it; otherwise undefined (no javascript:, data:, file:, protocol-relative or unparsable value). Pure. */
export function safeUrl(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length === 0 || v.length > 2000) return undefined
  try {
    const u = new URL(v.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined
    if (u.username || u.password) return undefined
    return u.href
  } catch { return undefined }
}

const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined)
const isRow = (r: unknown): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r)

// ── row mappers ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** serperPlaceToRow shape (src/lib/ai/tools/serperPlaces.ts) → place DTO fields. A row without a name is dropped, never invented. */
export function mapPlaceRow(r: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRow(r)) return null
  const name = cleanText(r.name, 200)
  if (!name) return null
  const types = Array.isArray(r.place_types) ? r.place_types : []
  const km = num(r.distance_km, 0, 20_000)
  return {
    id: cleanText(r.place_id ?? r.id, 100), name, category: cleanText(types[0], 60), address: cleanText(r.address, 250),
    rating: num(r.rating_value, 0, 10), priceLevel: cleanText(r.price_range_text, 60),
    openNow: typeof r.open_now === 'boolean' ? r.open_now : undefined,
    distanceMeters: km === undefined ? undefined : Math.round(km * 1000),
    openingHours: cleanText(r.opening_hours, 120),
    url: safeUrl(r.maps_link) ?? safeUrl(r.website_uri),
  }
}

/** getHotelPrices rows (hotel_list entries or search_results snippets; field names INFERRED from the source, not yet seen on a live result) → hotel DTO fields. */
export function mapHotelRow(r: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRow(r)) return null
  const name = cleanText(r.name ?? r.title, 200)
  if (!name) return null
  return {
    id: cleanText(r.place_id ?? r.id, 100), name, address: cleanText(r.address, 250), rating: num(r.rating_value ?? r.rating, 0, 10), stars: num(r.stars, 0, 5),
    pricePerNight: num(r.price_per_night, 0, 1e9), currency: cleanText(r.currency, 8), url: safeUrl(r.link ?? r.url ?? r.website_uri ?? r.maps_link),
  }
}

/** searchProducts rows (search_results entries: title, link, price, source; INFERRED, not yet seen on a live result) → product DTO fields. */
export function mapProductRow(r: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRow(r)) return null
  const title = cleanText(r.title, 200)
  if (!title) return null
  return {
    id: cleanText(r.id, 100), title, price: typeof r.price === 'number' ? r.price : cleanText(r.price, 60), currency: cleanText(r.currency, 8),
    merchant: cleanText(r.source ?? r.merchant, 80), url: safeUrl(r.link ?? r.url), rating: num(r.rating, 0, 10),
  }
}

const SCAM_VERDICTS: ReadonlySet<string> = new Set(['familiar', 'suspicious', 'unrecognized'])

/** A list of short strings, cleaned, at most `maxItems` of at most `max` characters each; undefined when nothing is left. */
function cleanList(v: unknown, maxItems: number, max: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.map(x => cleanText(x, max)).filter((x): x is string => !!x).slice(0, maxItems)
  return out.length > 0 ? out : undefined
}

/**
 * The Scam Shield link check (adapter row) → check_scam DTO. Only the three PUBLIC verdict states pass (the engine's SAFE/LOW were already turned into "unrecognized" by the adapter; a row that still says
 * anything else is dropped, never shown). The target is the host that was checked: no path, no query. The official site must be an https link without credentials. Text is data, bounded and cleaned.
 */
export function mapScamRow(r: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRow(r)) return null
  const verdict = typeof r.verdict === 'string' ? r.verdict : ''
  const target = cleanText(r.target, 253)
  if (!SCAM_VERDICTS.has(verdict) || !target) return null
  const site = safeUrl(r.official_site)
  return {
    target, verdict, verdictTitle: cleanText(r.verdict_title, 200), summary: cleanText(r.summary, 600), signals: cleanList(r.signals, 6, 200),
    resemblesBrand: cleanText(r.resembles_brand, 80), officialSite: site && site.startsWith('https://') ? site : undefined, officialHotline: cleanText(r.official_hotline, 40),
    nextSteps: cleanList(r.next_steps, 4, 160),
  }
}

const httpsUrl = (v: unknown): string | undefined => { const u = safeUrl(v); return u && u.startsWith('https://') ? u : undefined }

/** getActiveDeals rows (PartnerDeal: what the Deal page shows) → deal DTO. Click counts, affiliate codes and images are not copied; the link must be https. A deal without a title is dropped. */
export function mapDealRow(r: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRow(r)) return null
  const title = cleanText(r.title, 200)
  if (!title) return null
  return {
    id: cleanText(r.id, 100), title, partner: cleanText(r.partnerName, 80), category: cleanText(r.category, 60), description: cleanText(r.description, 300),
    discount: cleanText(r.discountLabel, 60), voucherCode: cleanText(r.voucherCode, 40), endsAt: cleanText(r.endAt, 40), url: httpsUrl(r.officialUrl),
  }
}

const CLIP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A public `reviews` row (clip) → clip DTO. 🚨 The AUTHOR never leaves: no user id, no name, no avatar, no source link, no media file URL. The link is BUILT from the clip id (a uuid, anything else is refused)
 * on Tappy's own address, so a row cannot carry a link to anywhere else. A clip without a place name is dropped. Caption is text data, bounded and cleaned.
 */
export function mapClipRow(r: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRow(r)) return null
  const id = typeof r.id === 'string' && CLIP_ID.test(r.id) ? r.id.toLowerCase() : null
  const title = cleanText(r.place_name, 200)
  if (!id || !title) return null
  return {
    id, title, address: cleanText(r.place_address, 250), caption: cleanText(r.body, 300), thumbnail: httpsUrl(r.thumbnail),
    likes: num(r.like_count, 0, 1e9), comments: num(r.comment_count, 0, 1e9), createdAt: cleanText(r.created_at, 40), url: `https://www.tappyai.com/reviews/${id}`,
  }
}

/** The coach link row (adapter) → DTO: the Vexere route page, the route, the day. https only; a row without a link is dropped. */
export function mapCoachRow(r: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRow(r)) return null
  const url = httpsUrl(r.url)
  const route = cleanText(r.route, 160)
  if (!url || !route) return null
  return { id: cleanText(r.id, 100), title: cleanText(r.title, 200) ?? route, route, departDate: cleanText(r.departDate, 10), merchant: cleanText(r.merchant, 40), url }
}

export const ROW_MAPPER: Readonly<Record<ServiceId, (r: Record<string, unknown>) => Record<string, unknown> | null>> = Object.freeze({
  'places.search': mapPlaceRow, 'shopping.search': mapProductRow, 'hotels.prices': mapHotelRow, 'scam.check': mapScamRow, 'deals.search': mapDealRow, 'clips.search': mapClipRow, 'coach.link': mapCoachRow,
})
