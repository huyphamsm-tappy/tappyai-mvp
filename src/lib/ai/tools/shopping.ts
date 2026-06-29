import { getCache, setCache, serperSearch } from './common'

export async function searchProducts(query: string) {
  const cacheKey = 'products:' + query.toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const links = [
    { name: 'Shopee', url: 'https://shopee.vn/search?keyword=' + encodeURIComponent(query) },
    { name: 'Tiki', url: 'https://tiki.vn/search?q=' + encodeURIComponent(query) },
    { name: 'Lazada', url: 'https://www.lazada.vn/catalog/?q=' + encodeURIComponent(query) },
  ]

  let result: unknown
  try {
    const [searchResultsRaw, directResults, shopInfoResults] = await Promise.all([
      serperSearch(query + ' gia Shopee Tiki Lazada'),
      serperSearch(query + ' (site:shopee.vn OR site:tiki.vn OR site:lazada.vn)'),
      serperSearch(query + ' shop website địa chỉ facebook tiktok'),
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

    let searchResults: Array<{ title: string; link: string; snippet: string }> | undefined = searchResultsRaw || undefined
    if (directProductLinks.length > 0) {
      const seen = new Set<string>()
      searchResults = [...directProductLinks, ...(searchResults || [])].filter(r => {
        if (seen.has(r.link)) return false
        seen.add(r.link)
        return true
      }).slice(0, 8)
    }

    const tiktokShopLink = 'https://www.tiktok.com/search?q=' + encodeURIComponent(query)

    if (searchResults && searchResults.length > 0) {
      result = {
        query,
        source: 'Google Search (Serper)',
        search_results: searchResults,
        shop_info_results: shopInfoResults || [],
        links,
        tiktok_shop_link: tiktokShopLink,
        note: 'Gia tham khao tu ket qua tim kiem hien tai, co the da thay doi theo thoi gian va phien ban san pham - bam link de xem gia chinh xac va mua hang.'
      }
    } else {
      result = {
        note: 'Tim "' + query + '" tren cac san thuong mai dien tu Viet Nam',
        links,
        shop_info_results: shopInfoResults || [],
        tiktok_shop_link: tiktokShopLink,
      }
    }
  } catch {
    result = { note: 'Tim "' + query + '" tren cac san thuong mai dien tu Viet Nam', links }
  }
  setCache(cacheKey, result, 15 * 60 * 1000) // cache 15 phut
  return result
}
