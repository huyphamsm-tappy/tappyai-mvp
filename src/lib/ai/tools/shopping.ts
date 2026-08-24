import { getCache, setCache, serperSearch, serperShopping, fetchPlacePhotosByName } from './common'
import { filterShoppingResults } from './shoppingValidity'
import { parseProductSpecs, parseVndPrice } from '@/lib/ai/productSpecs'
import { messages } from '@/lib/ai/messages'
import { productsCacheKey } from './cacheKeys'

export async function searchProducts(query: string, lang = 'vi') {
  const cacheKey = productsCacheKey(query, lang)
  const cached = getCache(cacheKey)
  if (cached) return cached

  const links = [
    { name: 'Shopee', url: 'https://shopee.vn/search?keyword=' + encodeURIComponent(query) },
    { name: 'Tiki', url: 'https://tiki.vn/search?q=' + encodeURIComponent(query) },
    { name: 'Lazada', url: 'https://www.lazada.vn/catalog/?q=' + encodeURIComponent(query) },
  ]

  let result: unknown

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
    const rows = await serperShopping(query, 20)
    if (rows && rows.length > 0) {
      const search_results = rows.map(r => {
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
  } catch {
    // fall through to the web-search path below
  }

  try {
    // Structured product candidates come from Serper's /shopping endpoint, where
    // price/source/productId are the provider's OWN fields. The three organic
    // queries below are kept unchanged as the fallback and as the source of the
    // shop-info/direct-link enrichment the prompt rules already depend on —
    // removing them would change shipped behaviour beyond this task's scope.
    const [shoppingRecords, searchResultsRaw, directResults, shopInfoResults] = await Promise.all([
      serperShopping(query),
      serperSearch(query + ' gia Shopee Tiki Lazada'),
      serperSearch(query + ' (site:shopee.vn OR site:tiki.vn OR site:lazada.vn)'),
      serperSearch(query + ' shop website địa chỉ facebook'),
    ])

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
      const photoLists = await Promise.all(searchResults.map(r => fetchPlacePhotosByName(r.link, r.title, 3, 'shopping')))
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
      result = {
        note: messages.shopping.fallbackNote(lang, query),
        links,
        shop_info_results: shopInfoResults || [],
      }
    }
  } catch {
    result = { note: messages.shopping.fallbackNote(lang, query), links }
  }
  setCache(cacheKey, result, 15 * 60 * 1000) // cache 15 phut
  return result
}
