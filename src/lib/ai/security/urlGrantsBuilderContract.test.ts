// @vitest-environment node
// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
//
// Owner decision (b), closeout round 2: the URL grant contract is checked against the REAL builders, not hand-written fixtures. Each
// provenance branch of searchProducts (tools/shopping.ts) and getHotelPrices (tools/travel.ts) runs with its providers mocked, and every
// URL of the real result must get exactly the grant its provenance earns -- granted AND refused:
//   P1 /shopping answered: a Google Shopping listing link (intermediary) -> source; a merchant product page (isMerchantProductPage) -> action
//   P2 a shopping row the same seller's page replaced -> action (it IS the merchant page); a row nobody replaced -> source
//   P3 organic fallback: a deny-list-only web row -> source; a direct / organic merchant product page -> action (LIMIT: by URL pattern);
//      shopping_results[] of the fallback -> by the same predicate
//   H2 OTA hotel page of the site: search, H3 raw area web rows, H4 DuckDuckGo rows -> all source (hotel search_results[].link)
// A URL the builder drops (search / category page, news host, OTA listing) must not appear at all.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  shopping: [] as Array<unknown[] | null>,
  search: (_q: string): Array<{ title: string; link: string; snippet: string }> | null => [],
  osm: [] as Array<Record<string, unknown>>,
  ddg: [] as Array<{ title: string; link: string; snippet: string }>,
}))
vi.mock('@/lib/ai/tools/common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/common')>()),
  getCache: () => null, setCache: () => undefined, fetchPlacePhotosByName: async () => [],
  serperShopping: async () => (h.shopping.length ? h.shopping.shift() : []),
  serperSearch: async (q: string) => h.search(q),
  webSearch: async () => ({ results: h.ddg }),
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/food')>()),
  searchPlacesOSM: async () => ({ results: h.osm }),
}))
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()), serperPlaces: async () => [] }))

import { searchProducts } from '@/lib/ai/tools/shopping'
import { getHotelPrices } from '@/lib/ai/tools/travel'
import { urlsFromToolResult } from './urlGrants'

const Q = 'ốp lưng UAG iPhone 17 Pro Max'
const row = (title: string, link: string) => ({ title, link, snippet: '' })
const grants = (tool: string, result: unknown) => Object.fromEntries(urlsFromToolResult(tool, result).map(g => [g.url, `${g.grant}:${g.field}`]))
/** Every URL-looking string anywhere in the result (to prove a dropped URL is really gone). */
const allStrings = (v: unknown): string[] => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(allStrings) : v && typeof v === 'object' ? Object.values(v).flatMap(allStrings) : []

beforeEach(() => { h.shopping = []; h.search = () => []; h.osm = []; h.ddg = [] })

describe('search_products: grants follow the provenance of each real row', () => {
  it('P1/P2 /shopping answered: Google listing links are SOURCE, merchant product pages are ACTION, marketplace searches stay ACTION', async () => {
    h.shopping = [[
      { title: 'Ốp lưng UAG iPhone 17 Pro Max Monarch', link: 'https://www.google.com/shopping/product/111', source: 'Shopee', price: 590000 },
      { title: 'Ốp lưng UAG iPhone 17 Pro Max Plyo', link: 'https://www.google.com/shopping/product/222', source: 'Điện Máy Lạ', price: 450000 },
    ]]
    h.search = q => q.includes('site:cellphones.com.vn') ? [
      row('Ốp lưng UAG iPhone 17 Pro Max Monarch - Shopee', 'https://shopee.vn/Op-lung-UAG-Monarch-i.11.22'),
      row('Ốp lưng UAG iPhone 17 Pro Max Pathfinder', 'https://cellphones.com.vn/op-lung-uag-iphone-17-pro-max-pathfinder.html'),
      row('Ốp lưng UAG', 'https://cellphones.com.vn/phu-kien/op-lung/uag.html'),
    ] : []
    const r = await searchProducts(Q, 'vi', { merchantLinks: true })
    const g = grants('search_products', r)
    const rowLinks = ((r as { search_results?: Array<{ link: string }> }).search_results ?? []).map(x => x.link)
    // The same seller's page replaced the Monarch listing (P2) -- it appears once, as the merchant page.
    expect(rowLinks.filter(l => l === 'https://shopee.vn/Op-lung-UAG-Monarch-i.11.22')).toHaveLength(1)
    expect(g['https://shopee.vn/Op-lung-UAG-Monarch-i.11.22']).toBe('action:search_results[].link')
    expect(g['https://cellphones.com.vn/op-lung-uag-iphone-17-pro-max-pathfinder.html']).toBe('action:search_results[].link')
    expect(g['https://www.google.com/shopping/product/222']).toBe('source:search_results[].link')
    if (rowLinks.includes('https://www.google.com/shopping/product/111')) expect(g['https://www.google.com/shopping/product/111']).toBe('source:search_results[].link')
    expect(allStrings(r)).not.toContain('https://cellphones.com.vn/phu-kien/op-lung/uag.html')
    const links = (r as { links?: Array<{ url: string }> }).links ?? []
    expect(links.length).toBeGreaterThan(0)
    for (const l of links) expect(g[l.url]).toBe('action:links[].url')
  })

  it('P3 organic fallback: deny-list-only web rows are SOURCE; direct and organic merchant product pages are ACTION (LIMIT: URL pattern)', async () => {
    h.shopping = [[]]
    h.search = q => q.endsWith(' gia Shopee Tiki Lazada') ? [
      row('Đánh giá ốp lưng UAG iPhone 17 Pro Max', 'https://reviewphone.vn/danh-gia-op-lung-uag-iphone-17-pro-max'),
      row('Ốp lưng UAG iPhone 17 Pro Max Plasma', 'https://shopee.vn/Op-lung-UAG-Plasma-i.33.44'),
      row('Ốp lưng UAG iPhone 17 Pro Max giảm giá', 'https://vnexpress.net/op-lung-uag-1.html'),
    ] : q.includes('(site:shopee.vn OR site:tiki.vn OR site:lazada.vn)') ? [
      row('Ốp lưng UAG iPhone 17 Pro Max Civilian', 'https://tiki.vn/op-lung-uag-iphone-17-pro-max-p999.html'),
    ] : q.endsWith(' shop website địa chỉ facebook') ? [row('UAG Việt Nam', 'https://uagvn.example/lien-he')] : []
    const r = await searchProducts(Q, 'vi', { merchantLinks: true })
    const g = grants('search_products', r)
    expect(g['https://reviewphone.vn/danh-gia-op-lung-uag-iphone-17-pro-max']).toBe('source:search_results[].link')
    expect(g['https://shopee.vn/Op-lung-UAG-Plasma-i.33.44']).toBe('action:search_results[].link')
    expect(g['https://tiki.vn/op-lung-uag-iphone-17-pro-max-p999.html']).toBe('action:search_results[].link')
    expect(g['https://uagvn.example/lien-he']).toBe('source:shop_info_results[].link')
    expect(allStrings(r)).not.toContain('https://vnexpress.net/op-lung-uag-1.html')
  })

  it('P3 shopping_results[] of the fallback: Google listing links are SOURCE, a merchant product page is ACTION', async () => {
    h.shopping = [null, [
      { title: 'Ốp lưng UAG iPhone 17 Pro Max Essential', link: 'https://www.google.com/shopping/product/333', source: 'Shop Lạ', price: 300000 },
      { title: 'Ốp lưng UAG iPhone 17 Pro Max Essential', link: 'https://www.lazada.vn/products/op-lung-uag-essential-i555.html', source: 'Lazada', price: 320000 },
    ]]
    h.search = q => q.endsWith(' gia Shopee Tiki Lazada') ? [row('Ốp lưng UAG iPhone 17 Pro Max', 'https://reviewphone.vn/op-lung-uag')] : []
    const r = await searchProducts(Q, 'vi', { merchantLinks: true })
    const g = grants('search_products', r)
    expect(g['https://www.google.com/shopping/product/333']).toBe('source:shopping_results[].link')
    expect(g['https://www.lazada.vn/products/op-lung-uag-essential-i555.html']).toBe('action:shopping_results[].link')
  })
})

describe('get_hotel_prices: search_results[].link is a SOURCE reference on every branch', () => {
  it('H2 + H3: OTA hotel pages (site: search and area search) and a non-OTA web row are SOURCE; the OSM row map link is ACTION; an OTA listing is dropped', async () => {
    h.osm = [{ name: 'Khách sạn Biển Xanh', address: 'Đà Nẵng', maps_link: 'https://maps.google.com/?q=16.06,108.22' }]
    h.search = q => q.includes('gia phong dem nay') ? [
      row('Top 10 khách sạn gần biển Đà Nẵng', 'https://dulichdanang.vn/top-10-khach-san-gan-bien'),
      row('Khách sạn ở Đà Nẵng', 'https://www.booking.com/searchresults.html?ss=Da+Nang'),
      row('Biển Xanh Hotel - Agoda', 'https://www.agoda.com/vi-vn/bien-xanh-hotel/hotel/da-nang-vn.html'),
    ] : q.startsWith('"Khách sạn Biển Xanh"') ? [row('Biển Xanh Hotel', 'https://www.booking.com/hotel/vn/bien-xanh.html')] : []
    const r = await getHotelPrices('Đà Nẵng', undefined, undefined, undefined, 'vi')
    const g = grants('get_hotel_prices', r)
    expect(g).toEqual({
      'https://www.booking.com/hotel/vn/bien-xanh.html': 'source:search_results[].link',
      'https://dulichdanang.vn/top-10-khach-san-gan-bien': 'source:search_results[].link',
      'https://www.agoda.com/vi-vn/bien-xanh-hotel/hotel/da-nang-vn.html': 'source:search_results[].link',
      'https://maps.google.com/?q=16.06,108.22': 'action:hotel_list[].maps_link',
    })
    expect(allStrings(r)).not.toContain('https://www.booking.com/searchresults.html?ss=Da+Nang')
  })

  it('H4: unfiltered DuckDuckGo rows (every other search empty) are SOURCE', async () => {
    h.ddg = [row('Khách sạn Đà Nẵng giá rẻ', 'https://ddg-hotels.example/da-nang')]
    const r = await getHotelPrices('Đà Nẵng', undefined, undefined, undefined, 'vi')
    expect(grants('get_hotel_prices', r)).toEqual({ 'https://ddg-hotels.example/da-nang': 'source:search_results[].link' })
  })
})
