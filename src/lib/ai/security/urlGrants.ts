// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
//
// ── P0-3 trust boundary (G2 package 1): which URL a reply may publish, and why ──────────────────────────────────────────────────────
//
// Before: the egress allowlist was (1) every URL in the assistant messages the CLIENT sent back and (2) every URL found anywhere in the
// raw JSON text of a tool result. Measured offline (harness): a forged assistant message, or a URL written inside a third-party price
// snippet, made the model's copy of that URL reach the client. And a link the egress had removed was stored in the session's `pick` /
// `shown` and came back into a later prompt.
//
// After (P0 review closeout, owner decision 16/10):
//   - a URL is granted only from a field the TOOL CONTRACT below names for THAT tool -- a key name, a scheme or a host is never enough;
//     an unknown tool, or a field not in its contract, grants nothing. A URL inside prose (snippet, description, page text) never;
//   - each field grants one of two rights:
//       'action' -- the URL may be published anywhere a link may go (prose, CTA buttons, plan links) and is recorded in the session so a
//                   later turn may show it again: code-built links (maps, OTA / marketplace searches, CCP deeplinks) and provider
//                   fields of the venue / offer itself (Places website, booking pages, a merchant's own product page);
//       'source' -- a SOURCE REFERENCE only: the link of a search / news / page result. It may be cited in this turn's prose (the
//                   citation renderer and the prose egress use the same allowlist), but it is NOT valid in an action block (CTA,
//                   plan link) and is NOT recorded for later turns. LIMITATION: inside prose the egress cannot tell a citation link
//                   from an action-like link, so a source URL written as a plain markdown link in this turn's text is kept;
//   - names stored in the session (`pick`, `shown`, `cards`, `rejected`) carry no URL at all.
//
// The contract was built from the tool inventory of 16/10 (route.ts tools, agent v1 / v2 registries, every result builder); paths are
// written on the object the tool returns ("[]" = any array element). A field a prompt rule names but no current builder emits (the
// hotel result's top-level `booking_link` / `agoda_link`, promptBuilder rule 13) grants nothing -- 902f383 (A3.3, 2026-09-20) stopped
// emitting them on purpose (search / homepage depth) and the prompt rule was not updated.

//
// Closeout round 6 (owner decisions, PROPOSAL): a third right and row-checked rules.
//   'turn'   -- an action for THIS turn only, never recorded in the session (a later turn cannot reuse it): TikTok reviews (the state
//               cannot bind a URL to the venue it reviews) and hotel Commerce Links of get_hotel_prices `search_results[]`.
//   A rule may read the ROW that holds the field (GrantContext) and grant nothing at all (null): a field name is never the proof.
//     - TikTok: a post URL attributed by the server to the row that carries it (food.ts `attributeTikTok`); the entity is returned so
//       a card shows it only on that venue. The batch discovery link is a source reference.
//     - order links: exactly the GrabFood search the builder makes for that row (platformLinks/food.ts `grabFoodSearchUrl`).
//     - hotel Commerce Link: exactly the handoff CCP builds from that row's own link (ccp/handoffProvenance.ts).

import { isMerchantProductPage } from '@/lib/links/productPage'
import { isTikTokHost, isTikTokPostUrl } from '@/lib/links/tiktokReview'
import { grabFoodSearchUrl } from '@/lib/platformLinks/food'
import { isRowCanonicalHandoff } from '@/lib/ccp/handoffProvenance'
import { searchTemplates } from '@/lib/ccp/adapters'
import { searchEngineTemplates } from '@/lib/ccp/searchEngines'

export type UrlGrant = 'action' | 'turn' | 'source'

/** The URL as the server will accept it, or null: http(s) only, a real host name, no user / password, no IP literal, bounded length. */
export function grantableUrl(raw: string): string | null {
  const s = raw.trim()
  if (s.length < 10 || s.length > 2048 || /\s/.test(s)) return null
  let u: URL
  try { u = new URL(s) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password) return null
  const host = u.hostname.toLowerCase()
  // Gate 2 S5, L1 (PROPOSAL): "www.tiktok.com." is the same site as "www.tiktok.com" but escapes every exact host comparison.
  if (host.endsWith('.')) return null
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return null
  return s
}

/**
 * A field's right: fixed, or decided per URL when ONE field carries rows of different provenance. The function must be the very
 * predicate the builder itself applies to keep such a row (one shared definition), never a new heuristic of this file.
 */
/** The objects from the tool result down to the one holding the field (`stack[stack.length - 1]`), arrays skipped. */
export interface GrantContext { readonly stack: ReadonlyArray<Record<string, unknown>> }
/** A rule's answer: a right, a right bound to an entity (the venue a TikTok post reviews), or no grant at all. */
type GrantDecision = UrlGrant | { grant: UrlGrant; entity: string } | null
type GrantRule = UrlGrant | ((url: string, ctx: GrantContext) => GrantDecision)
type Contract = Readonly<Record<string, GrantRule>>

const up = (ctx: GrantContext, n: number): Record<string, unknown> | undefined => ctx.stack[ctx.stack.length - 1 - n]
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

/** TikTok post on a row that the server attributed it to (`has_tiktok_review` + the row's own `tiktok_review_url`). */
const tiktokOfRow = (url: string, row: Record<string, unknown> | undefined): GrantDecision => {
  const name = str(row?.name)
  return row && name && row.has_tiktok_review === true && row.tiktok_review_url === url && isTikTokPostUrl(url) ? { grant: 'turn', entity: name } : null
}
/** `results[].tiktok_review_url`: the field sits on the row itself. */
const tiktokReviewField = (url: string, ctx: GrantContext): GrantDecision => tiktokOfRow(url, up(ctx, 0))
/** `results[].review_actions[].url`: a TikTok URL there obeys the TikTok rule of its row; the code-built others stay action. */
const reviewActionField = (url: string, ctx: GrantContext): GrantDecision => (isTikTokHost(url) ? tiktokOfRow(url, up(ctx, 1)) : 'action')
/** `results[].order_links[].url`: exactly the GrabFood search the builder makes for this row (city from the result, else address). */
const orderLinkField = (url: string, ctx: GrantContext): GrantDecision => {
  const row = up(ctx, 1), result = up(ctx, 2)
  const name = str(row?.name)
  if (!name) return null
  const candidates = [grabFoodSearchUrl(name, undefined, str(result?.location)), grabFoodSearchUrl(name, str(row?.address)), grabFoodSearchUrl(name)]
  return candidates.includes(url) ? 'action' : null
}
/** get_hotel_prices `search_results[].commerce_links[].url`: the handoff CCP builds from the SAME row's link -- this turn only. */
const hotelRowCommerceLink = (url: string, ctx: GrantContext): GrantDecision =>
  isRowCanonicalHandoff(url, up(ctx, 0)?.providerId, up(ctx, 1)?.link) ? 'turn' : null

/**
 * search_products `search_results[].link` / `shopping_results[].link` (owner decision 16/10 (b)): the builder (tools/shopping.ts) puts
 * rows of three provenances in this one field (a chat_state replay re-serves the same rows) -- a merchant's own product page (kept
 * only when `isMerchantProductPage`), a Google Shopping listing link (a google.com intermediary unless the same seller's page replaced
 * it), and an organic web result that only passed the deny-list validity bar (shoppingValidity.ts: not news/social, not a
 * search/category path, relevant title). Only the first is proven to be the product's own page, so only it is an action; the rest are
 * source references.
 */
const productOfferLink = (url: string): UrlGrant => (isMerchantProductPage(url) ? 'action' : 'source')

const PLACES: Contract = {
  'results[].maps_link': 'action', // code-built Google Maps link (cid / place_id / coordinates)
  'results[].website_uri': 'action', // Places / OSM listing website of the venue
  'results[].booking_links[]': 'action', // Places booking pages of the venue
  'results[].review_actions[].url': reviewActionField, // code-built (maps / website copy, YouTube search); a TikTok post: round 6 rule
  'google_maps_search': 'action', // code-built maps search
  'results[].order_links[].url': orderLinkField, // round 6: the row's own GrabFood search only
  'results[].platform_links[].url': 'action', // code-built (platformLinks/*.ts)
  'results[].tiktok_review_url': tiktokReviewField, // round 6: attributed post, this turn only, bound to the row's venue
  'tiktok_discovery_url': 'source', // round 6: the batch "related videos" link reviews no venue
  'results[].commerce_links[].url': 'action', // CCP-validated deep links (commerce.ts)
  'price_search_results[].link': 'source', // a web result about prices
  'travel_editorial[].url': 'source', // VnExpress article
}
const HOTELS: Contract = {
  'hotel_list[].maps_link': 'action', 'hotel_list[].website_uri': 'action', 'hotel_list[].booking_links[]': 'action',
  'hotel_list[].commerce_links[].url': 'action', // CCP-validated deep links (round 6: inventory only, unchanged)
  'search_results[].commerce_links[].url': hotelRowCommerceLink, // round 6: CCP handoff of the same row's link, this turn only
  // Owner decision 16/10 (b): a SOURCE until a data contract proves a detail / booking page. travel.ts fills this field with the OTA
  // hotel pages of the site: searches (isSpecificOtaHotelPage) AND the raw rows of the area web search, where only OTA listing pages are
  // dropped (any other host passes), AND -- when that search is empty -- unfiltered DuckDuckGo results.
  'search_results[].link': 'source',
  'booking_links[].url': 'action', 'booking_links[]': 'action', // OTA / CCP / realtime booking pages
  'realtime_results[].booking_url': 'action', 'price_search_results[].link': 'action', // realtime provider booking URL
  'travel_editorial[].url': 'source',
}
const WEB: Contract = {
  'results[].link': 'source', 'pages[].url': 'source', 'travel_editorial[].url': 'source',
  'search_url': 'action', // code-built search page
  'event_links[].url': 'action', 'film_links[].url': 'action', // CCP-resolved ticket / film pages
}
const prefixed = (prefix: string, c: Contract): Contract => Object.fromEntries(Object.entries(c).map(([k, v]) => [`${prefix}.${k}`, v]))

export const TOOL_URL_CONTRACT: Readonly<Record<string, Contract>> = {
  search_places: PLACES,
  get_hotel_prices: HOTELS,
  get_flight_prices: { 'booking_links[].url': 'action', 'booking_links[]': 'action', 'realtime_results[].booking_url': 'action', 'price_search_results[].link': 'action' },
  search_products: {
    'search_results[].link': productOfferLink, 'shopping_results[].link': productOfferLink,
    'links[].url': 'action', // marketplace search templates (buildShoppingLinks, code-built)
    'search_results[].commerce_links[].url': 'action', // CCP-validated deep links
    'shop_info_results[].link': 'source',
    ...prefixed('fallback', WEB), // agent v2 withProductFallback: a research web_search result
  },
  // TAPPY_ANSWER_V4 hosted web search (answerV4/hostedResearch): `sources[].url` = the url_citation annotations OpenAI's hosted search returned —
  // source pages to cite (never action links). Without this grant the citation step dropped every [S#] of a hosted lookup in silence (measured:
  // acceptance round 19/10, 0 source links in the lookup answers, judges marked them "unsourced").
  web_search: { ...WEB, 'sources[].url': 'source' },
  read_page: { 'pages[].url': 'source' },
  // RETRIEVAL_V5 serves get_news with the web research (retrievalV5/research.ts): its search rows and the pages it read are SOURCE links like a
  // web_search's (cổng 2 lần 1, u02 / u22: pages read, 0 source links — their [S#] were dropped because these fields had no grant).
  get_news: { 'articles[].link': 'source', 'sources[].url': 'source', 'results[].link': 'source', 'pages[].url': 'source', ...prefixed('fallback', WEB) },
  get_weather: { search_url: 'action' },
  get_gold_price: { search_url: 'action' },
  get_transport_options: {
    'vexere_link': 'action', 'train_booking_link': 'action', 'apps[].link': 'action',
    'bus_search_results[].link': 'source', 'train_search_results[].link': 'source', 'travel_editorial[].url': 'source',
  },
  get_now_showing: { 'film_links[].url': 'action', 'results[].link': 'source', '_tappy_films.sources[].url': 'source' },
  get_movie_showtimes: { 'film_links[].url': 'action', 'results[].link': 'source', '_tappy_movie.sources[].url': 'source' },
  get_trip_data: { ...prefixed('hotels', HOTELS), ...prefixed('attractions', PLACES), ...prefixed('food', PLACES), ...prefixed('landmarks_web', WEB) },
}

const WHOLE_URL = /^https?:\/\/\S+$/i

/**
 * Gate 2 S5, D-S5-6 (PROPOSAL): links the SERVER builds from an approved template, outside any tool result, and records as grants when
 * they were sent. The exception to "a URL is granted only from a contract field" is written here, with the host each field may carry:
 *   server:directions       -- the directions appendix (directionsAppendix.ts): https://www.google.com/maps/... only;
 *   server:search:<id>      -- the product-search appendix: the host of provider <id>'s registry template (marketplace / engine lists);
 *   server:card-search      -- a search / directions action of the place card (action authority): a registry template host, Google
 *   server:card-directions     (www / maps) or YouTube (www / m).
 */
export const SERVER_BUILT_FIELDS: readonly string[] = ['server:directions', 'server:search:', 'server:card-search', 'server:card-directions']

const hostOf = (u: string): string | null => { try { return new URL(u).hostname.toLowerCase() } catch { return null } }
const templateHosts = (): Map<string, string> => {
  const m = new Map<string, string>()
  for (const t of [...searchTemplates(), ...searchEngineTemplates()]) { const h = hostOf(t.template.replace('{q}', 'x')); if (h) m.set(t.providerId, h) }
  return m
}
const CARD_EXTRA_HOSTS = ['www.google.com', 'maps.google.com', 'www.youtube.com', 'm.youtube.com']

/** True when `url` is a grantable https URL on the host the server-built `field` may carry (SERVER_BUILT_FIELDS). */
export function serverBuiltAllowed(field: string, url: string): boolean {
  const g = grantableUrl(url)
  if (!g || !g.toLowerCase().startsWith('https://')) return false
  const u = new URL(g)
  const host = u.hostname.toLowerCase()
  if (field === 'server:directions') return host === 'www.google.com' && u.pathname.startsWith('/maps/')
  if (field.startsWith('server:search:')) { const h = templateHosts().get(field.slice('server:search:'.length)); return !!h && h === host }
  if (field === 'server:card-search' || field === 'server:card-directions') return CARD_EXTRA_HOSTS.includes(host) || [...templateHosts().values()].includes(host)
  return false
}

/**
 * The URLs a tool result grants under TOOL_URL_CONTRACT, with the field path and the right. Only a string that is a single URL, at a
 * path the tool's contract names, passing `grantableUrl`. Bounded walk (depth, count) — a hostile result cannot make it expensive.
 */
export function urlsFromToolResult(toolName: string | null | undefined, result: unknown): Array<{ url: string; field: string; grant: UrlGrant; entity?: string }> {
  const contract = toolName ? TOOL_URL_CONTRACT[toolName] : undefined
  if (!contract) return []
  const out: Array<{ url: string; field: string; grant: UrlGrant; entity?: string }> = []
  const walk = (v: unknown, path: string, depth: number, stack: ReadonlyArray<Record<string, unknown>>) => {
    if (depth > 12 || out.length >= 400) return
    if (typeof v === 'string') {
      const rule = contract[path]
      if (rule && WHOLE_URL.test(v.trim())) {
        const g = grantableUrl(v)
        if (!g) return
        // Gate 2 S5, L2 (PROPOSAL): a row rule that throws (encodeURIComponent on a lone surrogate) grants nothing -- it must never
        // take the whole turn down with it.
        let d: GrantDecision
        try { d = typeof rule === 'function' ? rule(g, { stack }) : rule } catch { d = null }
        if (d === null) return
        if (typeof d === 'string') out.push({ url: g, field: path, grant: d })
        else out.push({ url: g, field: path, grant: d.grant, entity: d.entity })
      }
      return
    }
    if (Array.isArray(v)) { for (const x of v) walk(x, `${path}[]`, depth + 1, stack); return }
    if (v && typeof v === 'object') {
      const here = [...stack, v as Record<string, unknown>]
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, path ? `${path}.${k}` : k, depth + 1, here)
    }
  }
  walk(result, '', 0, [])
  return out
}

const MD_LINK = /!?\[([^\]\n]{0,200})\]\((?:[^()\s]|\([^()\s]*\))*\)/g
const BARE_URL = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi

/** A name as the session may store it: link labels kept, every URL removed; null when nothing is left. */
export function linkFreeName(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const out = s.replace(MD_LINK, '$1').replace(BARE_URL, ' ').replace(/\s+/g, ' ').trim()
  return out || null
}
