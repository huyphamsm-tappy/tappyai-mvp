import { getCache, setCache, serperSearch, serperShopping, fetchPlacePhotosByName } from './common'
import { filterShoppingResults } from './shoppingValidity'
import { parseProductSpecs, parseVndPrice } from '@/lib/ai/productSpecs'
import { messages } from '@/lib/ai/messages'
import { productsCacheKey } from './cacheKeys'
import { buildShoppingLinks } from '@/lib/platformLinks/shopping'
import { productIdentityMatch } from '@/lib/links/productIdentity'
import { providerOwning } from '@/lib/ccp'
import { getProvider } from '@/lib/ccp/registry'
import { CARDS_SHOWN } from '@/lib/ai/cardCounts'
import { serperHaltedReason } from './serperToolBudget'

/**
 * A marketplace / retailer PRODUCT page (never a search, category or shop page), per host. The
 * patterns are the merchants' own URL grammar, measured 2026-09-28 on the UAT query.
 */
const PRODUCT_PAGE: Array<[RegExp, RegExp]> = [
  [/(^|\.)shopee\.vn$/, /-i\.\d+\.\d+/],
  [/(^|\.)tiki\.vn$/, /-p\d+\.html/],
  [/(^|\.)lazada\.vn$/, /^\/products\//],
  // CellphoneS: a product is ONE slug (`/op-lung-iphone-17-pro-max-uag-….html`); `/phu-kien/…/uag.html` is a category.
  [/(^|\.)cellphones\.com\.vn$/, /^\/[^/]+\.html$/],
]
const MERCHANT_SITES = ['cellphones.com.vn', 'shopee.vn', 'lazada.vn', 'tiki.vn']
const MAX_MERCHANT_ROWS = 6
/**
 * /images lookups one product search may spend on rows with no photo of their own. Evidence for the number: the decision card shows
 * CARDS_SHOWN (3) products and Luna recommends at most 3, so a photo is only ever read for the top rows; the old code spent one call per
 * merchant row (≤ 6) and per organic row (≤ 8) and the ranking then dropped most of them. The /images cost is UNVERIFIED (serperMeter),
 * and the per-tool budget still refuses any call beyond what is left.
 */
export const MAX_PRODUCT_IMAGE_LOOKUPS = CARDS_SHOWN

function isMerchantProductPage(link: string): boolean {
  try {
    const u = new URL(link)
    const host = u.hostname.toLowerCase()
    return PRODUCT_PAGE.some(([h, p]) => h.test(host) && p.test(u.pathname))
  } catch { return false }
}

const foldSeller = (s: string | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
function sameSeller(a: string | undefined, b: string | undefined): boolean {
  const x = foldSeller(a), y = foldSeller(b)
  return !!x && !!y && (x.includes(y) || y.includes(x))
}

/** The merchants' own product pages for the query (one billed search), as rows. */
async function merchantProductRows(query: string): Promise<Array<{ title: string; link: string; source: string; snippet: string; merchant_page: true }>> {
  const found = await serperSearch(`${query} (${MERCHANT_SITES.map(s => `site:${s}`).join(' OR ')})`).catch(() => null)
  const out: Array<{ title: string; link: string; source: string; snippet: string; merchant_page: true }> = []
  for (const r of found ?? []) {
    if (out.length >= MAX_MERCHANT_ROWS || !isMerchantProductPage(r.link)) continue
    const owner = providerOwning(r.link)
    const source = (owner && getProvider(owner)?.merchantName) || new URL(r.link).hostname.replace(/^www\./, '')
    // The page's own title, minus the merchant's trailing brand ("… | Giá rẻ", "… - Shopee").
    const title = r.title.replace(/\s*[|–-]\s*(?:giá rẻ.*|shopee.*|lazada.*|tiki.*|cellphones.*)$/i, '').replace(/\s*\.\.\.$/, '').trim()
    out.push({ title, link: r.link, source, snippet: r.snippet, merchant_page: true })
  }
  return out
}

export async function searchProducts(query: string, lang = 'vi') {
  const cacheKey = productsCacheKey(query, lang)
  const cached = getCache(cacheKey)
  if (cached) return cached

  // The marketplaces' own SEARCH pages, from the CCP registry (owner decision 14 Sep 2026): the
  // model may cite them as "xem thêm lựa chọn"; verified product handoffs ride the rows as
  // `commerce_links` when the platform is enabled.
  const links = buildShoppingLinks(query)

  let result: unknown
  /**
   * `/shopping` ANSWERED, and the answer was "no listings".
   *
   * 🚨 THE SAME REQUEST WAS BOUGHT TWICE (Pass 2, 2026-09-13). The organic
   * fallback below opens with `serperShopping(query)` — the identical body
   * ({q, gl, hl, num: 20}) the block underneath has just sent. When that first
   * call returned an EMPTY array, the second could not change the turn:
   * `hasStructured` is false either way and `shopping_results` is omitted either
   * way. One billed request, zero information.
   *
   * Only a definitive empty answer sets this. A `null` (timeout, non-2xx, no key)
   * leaves it false, so the fallback's attempt still runs exactly as before — a
   * failure is not an answer, and a retry that can succeed is kept.
   */
  let structuredAnsweredEmpty = false

  // ── Shopping listings first ───────────────────────────────────────────────
  // Google Shopping returns a SELLER and a PRICE per row; web search returns
  // articles. Measured on the same query: /search gave a YouTube video, two
  // marketplace tag pages and a market report — nothing a recommendation can
  // rest on — while /shopping gave 40 priced listings from named sellers.
  //
  // ONE call, not the three the web path makes: the extra "gia Shopee Tiki
  // Lazada" and "shop website địa chỉ facebook" variants exist to coax prices
  // and sellers out of web results, and shopping rows already carry both.
  try {
    // UAT 2026-09-28 ("ốp 17 promax uag"): every Google Shopping row links to a google.com
    // INTERMEDIARY and is titled by its variant ("Standout / Đen MagSafe"), so the card had no buy
    // button (A3.3 refuses an intermediary) and the validity bar dropped 19 of 20 rows for not naming
    // the product — no [TAPPY_SHOPPING] card at all, only a loose image. The merchants' OWN product
    // pages, found by one site-scoped query in parallel, carry the full product name and a real URL.
    // Only when /shopping HAS listings: a "no listings" answer falls through to the organic path below,
    // which already searches the marketplaces — a merchant query there would be a second paid search.
    const rows = await serperShopping(query, 20)
    const merchantRows = rows && rows.length > 0 ? await merchantProductRows(query) : []
    if (rows && rows.length > 0) {
      const shoppingRows = (rows ?? []).map(r => {
        const specs = parseProductSpecs(r.title)
        const priceVnd = parseVndPrice(r.price)
        return {
          title: r.title,
          link: r.link,
          price: r.price,                                   // exactly as the seller listed it
          ...(priceVnd !== null ? { price_vnd: priceVnd } : {}),
          ...(r.source ? { source: r.source } : {}),
          ...(r.rating !== undefined ? { rating: r.rating } : {}),
          ...(r.ratingCount !== undefined ? { rating_count: r.ratingCount } : {}),
          ...(r.productId ? { product_id: r.productId } : {}),
          ...(r.imageUrl ? { photo_url: r.imageUrl } : {}),  // ENRICHMENT_KEY — split out by B4
          ...specs,                                          // only what the title actually stated
        }
      })
      // A Shopping row whose link is Google's intermediary takes the merchant's OWN page when the SAME
      // seller lists the same product there (identity both ways) — its price, rating and photo stay
      // the Shopping row's own. A merchant page no row claimed follows as its own (unpriced) row.
      const claimed = new Set<string>()
      for (const s of shoppingRows) {
        if (isMerchantProductPage(s.link)) continue
        const m = merchantRows.find(x => !claimed.has(x.link) && sameSeller(s.source, x.source)
          && productIdentityMatch(s.title, x.title) === 'match' && productIdentityMatch(x.title, s.title) !== 'mismatch')
        if (!m) continue
        claimed.add(m.link)
        s.link = m.link
      }
      const unclaimed = merchantRows.filter(m => !claimed.has(m.link) && !shoppingRows.some(s => s.link === m.link))
      // POST-CREDIT cost control: a merchant row's photo first comes from a Shopping row that is the SAME product (identity both ways —
      // the photo is then certainly the right object, and it costs nothing); only a row with no such photo may spend an /images call,
      // and only for the rows the UI can show (CARDS_SHOWN) — not one call per intermediate row that the ranking then drops.
      const borrowedPhoto = (m: { title: string }): string | undefined => shoppingRows.find(s => s.photo_url
        && productIdentityMatch(s.title, m.title) === 'match' && productIdentityMatch(m.title, s.title) !== 'mismatch')?.photo_url
      const needLookup = new Set(unclaimed.filter(m => !borrowedPhoto(m)).slice(0, MAX_PRODUCT_IMAGE_LOOKUPS).map(m => m.link))
      const withPhotos = await Promise.all(unclaimed.map(async m => {
        const borrowed = borrowedPhoto(m)
        const photos = borrowed ? [borrowed] : needLookup.has(m.link) ? await fetchPlacePhotosByName(m.link, m.title, 1, 'shopping').catch(() => [] as string[]) : []
        return { ...m, ...parseProductSpecs(m.title), ...(photos.length > 0 ? { photo_url: photos[0] } : {}) }
      }))
      const search_results = [...shoppingRows, ...withPhotos]
      result = {
        query,
        source: 'Google Shopping (Serper)',
        search_results,
        links,
        note: messages.shopping.priceDisclaimer(lang),
      }
      setCache(cacheKey, result, 15 * 60 * 1000)
      return result
    }
    structuredAnsweredEmpty = rows !== null
  } catch {
    // fall through to the web-search path below
  }

  try {
    // Structured product candidates come from Serper's /shopping endpoint, where
    // price/source/productId are the provider's OWN fields. The three organic
    // queries below are kept unchanged as the fallback and as the source of the
    // shop-info/direct-link enrichment the prompt rules already depend on —
    // removing them would change shipped behaviour beyond this task's scope.
    // POST-CREDIT cost control (09/10): an ACCOUNT-level failure on the first /shopping call (no credits, bad key) halted this turn's
    // Serper scope — the organic requests below would only be received and refused. Nothing more is sent; the answer says "no product
    // data / provider error" (and is not cached).
    const haltedBy = serperHaltedReason()
    if (haltedBy) return { note: messages.shopping.fallbackNote(lang, query), links, product_data: 'none', provider_status: 'error', halted: haltedBy }
    const [shoppingRecords, searchResultsRaw, directResults] = await Promise.all([
      // Not re-asked when the provider has already said "no listings" — see
      // `structuredAnsweredEmpty`. An empty array here is what that answer was.
      structuredAnsweredEmpty ? Promise.resolve([] as Awaited<ReturnType<typeof serperShopping>>) : serperShopping(query),
      serperSearch(query + ' gia Shopee Tiki Lazada'),
      serperSearch(query + ' (site:shopee.vn OR site:tiki.vn OR site:lazada.vn)'),
    ])
    // The shop-info query ("địa chỉ facebook") is ENRICHMENT of a product that was found — asked only when something was found,
    // never as a third parallel request in a search that returned nothing (it used to be sent every time).
    const foundSomething = (shoppingRecords?.length ?? 0) > 0 || (searchResultsRaw?.length ?? 0) > 0 || (directResults?.length ?? 0) > 0
    const shopInfoResults = foundSomething ? await serperSearch(query + ' shop website địa chỉ facebook') : null

    // Uu tien cac link CU THE den 1 san pham (khong phai trang tim kiem) tren Shopee/Tiki/Lazada
    const directProductLinks = (directResults || []).filter(r => {
      try {
        const u = new URL(r.link)
        const host = u.hostname.replace(/^www\./, '')
        const path = u.pathname.toLowerCase()
        if (host.includes('shopee.vn')) return /-i\.\d+\.\d+/.test(path)
        if (host.includes('tiki.vn')) return /-p\d+\.html/.test(path)
        if (host.includes('lazada.vn')) return path.startsWith('/products/')
        return false
      } catch { return false }
    })

    // Phase 1 — bad input must not become advice. The organic query
    // ("<query> gia Shopee Tiki Lazada") returns news articles, mask promos and
    // generic sale pages for an ambiguous query like "mac pro"; those are not
    // listings and must not reach the model. `directProductLinks` are already
    // validated (they matched a specific product-URL pattern), so only the raw
    // organic rows are put through the validity bar. See shoppingValidity.ts.
    const filteredOrganic = filterShoppingResults(query, searchResultsRaw || [])
    let searchResults: Array<{ title: string; link: string; snippet: string }> | undefined =
      filteredOrganic.length > 0 ? filteredOrganic : undefined
    if (directProductLinks.length > 0) {
      const seen = new Set<string>()
      searchResults = [...directProductLinks, ...filteredOrganic].filter(r => {
        if (seen.has(r.link)) return false
        seen.add(r.link)
        return true
      }).slice(0, 8)
    }

    // search_results has no image field of its own — attach product photos by title, same
    // Serper-image mechanism food.ts/travel.ts already use. Fetch for EVERY entry (already
    // capped at 8 above), not just the first few — the AI doesn't always describe the
    // first array entries, so a "top N" cap left whichever ones it picked imageless.
    if (searchResults && searchResults.length > 0) {
      const photoLists = await Promise.all(searchResults.map(r =>
        (r as { photo_url?: string }).photo_url ? Promise.resolve([] as string[]) : fetchPlacePhotosByName(r.link, r.title, 3, 'shopping')))
      searchResults = searchResults.map((r, idx) =>
        photoLists[idx].length > 0
          ? { ...r, photo_url: photoLists[idx][0], photo_urls: photoLists[idx] }
          : r
      )
    }

    const hasStructured = !!shoppingRecords && shoppingRecords.length > 0

    if (hasStructured || (searchResults && searchResults.length > 0)) {
      result = {
        query,
        source: 'Google Search (Serper)',
        ...(searchResults && searchResults.length > 0 ? { search_results: searchResults } : {}),
        // Structured records live in their OWN field so nothing downstream
        // confuses them with organic results. The consultative normalizer reads
        // only this array; the money guard reads the same records for price
        // verification, which is what activates it.
        ...(hasStructured ? { shopping_results: shoppingRecords } : {}),
        shop_info_results: shopInfoResults || [],
        links,
        note: messages.shopping.priceDisclaimer(lang)
      }
    } else {
      /**
       * POST-UAT B4 (UAT-11/12/23, 2026-10-09): THE MARKETPLACE SEARCH LINKS ARE NOT PRODUCT DATA. With Serper out of credits every
       * call above returned null, and this branch answered `{ note, links, shop_info_results: [] }` — no row key the state classifier
       * knew, so it read SUCCESS and the product fallback never ran. The result now says what it is: no product data, and whether
       * the provider FAILED (every call null: timeout / non-2xx / no key) or genuinely answered "nothing". Neither is cached: a
       * failure must not become 15 minutes of "no products", and an empty answer is cheap to ask again.
       */
      // The organic searches are the broad check; when both failed nothing was really asked (a /shopping "no listings" alone is not enough).
      const providerFailed = searchResultsRaw === null && directResults === null
      result = {
        note: messages.shopping.fallbackNote(lang, query),
        links,
        shop_info_results: shopInfoResults || [],
        product_data: 'none',
        provider_status: providerFailed ? 'error' : 'empty',
      }
      return result
    }
  } catch {
    return { note: messages.shopping.fallbackNote(lang, query), links, product_data: 'none', provider_status: 'error' }
  }
  setCache(cacheKey, result, 15 * 60 * 1000) // cache 15 phut
  return result
}
