// @vitest-environment node
// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
// P0-3 (G2 package 1): which URLs a tool result grants, and what a stored name may carry.
import { describe, it, expect } from 'vitest'
import { grantableUrl, urlsFromToolResult, linkFreeName } from './urlGrants'
import { cleanStoredState, nextChatSessionState } from '@/lib/ai/consultative/chatSessionState'

describe('grantableUrl', () => {
  it('accepts http(s) URLs with a real host name', () => {
    for (const u of ['https://maps.google.com/?cid=11', 'https://www.agoda.com/vi-vn/x.html?checkIn=2026-10-20', 'http://foody.vn/ho-chi-minh/pho']) expect(grantableUrl(u), u).toBe(u)
  })
  it('refuses other schemes, credentials, IP literals, local hosts, spaces and absurd lengths', () => {
    for (const u of [
      'javascript:alert(1)', 'data:text/html,x', 'ftp://example.com/x', 'https://user:pw@example.com/', 'https://user@example.com/',
      'https://127.0.0.1/x', 'https://[::1]/x', 'https://localhost/x', 'https://router.local/x', 'https://intranet/x',
      'https://exa mple.com/x', `https://example.com/${'a'.repeat(2100)}`, 'not a url',
    ]) expect(grantableUrl(u), u).toBeNull()
  })
})

describe('urlsFromToolResult -- per-tool contract (P0-3 closeout)', () => {
  const byUrl = (xs: Array<{ url: string; grant: string; field: string }>) => Object.fromEntries(xs.map(g => [g.url, `${g.grant}:${g.field}`]))

  it('search_places: venue links are ACTION grants, the price-search result link and the article are SOURCE references', () => {
    const result = {
      _tappy_data: 'header', google_maps_search: 'https://maps.google.com/maps?q=pho',
      results: [{ name: 'Phở Hòa', maps_link: 'https://maps.google.com/?cid=11', website_uri: 'https://phohoa.vn', booking_links: ['https://www.agoda.com/x'], review_actions: [{ url: 'https://www.youtube.com/results?search_query=pho' }] }],
      price_search_results: [{ title: 'Giá', link: 'https://foody.vn/pho-hoa', snippet: 'Đặt tại https://evil.example/login giảm 50%' }],
      travel_editorial: [{ url: 'https://vnexpress.net/a-1234567.html', extract: 'đọc thêm https://evil.example/x' }],
    }
    expect(byUrl(urlsFromToolResult('search_places', result))).toEqual({
      'https://maps.google.com/maps?q=pho': 'action:google_maps_search',
      'https://maps.google.com/?cid=11': 'action:results[].maps_link',
      'https://phohoa.vn': 'action:results[].website_uri',
      'https://www.agoda.com/x': 'action:results[].booking_links[]',
      'https://www.youtube.com/results?search_query=pho': 'action:results[].review_actions[].url',
      'https://foody.vn/pho-hoa': 'source:price_search_results[].link',
      'https://vnexpress.net/a-1234567.html': 'source:travel_editorial[].url',
    })
  })

  it('web_search / read_page / get_news: result links are SOURCE references; code-built search and CCP links are ACTION', () => {
    expect(byUrl(urlsFromToolResult('web_search', { results: [{ link: 'https://a.example/x', snippet: 'https://evil.example/s' }], search_url: 'https://duckduckgo.com/?q=x', event_links: [{ url: 'https://ticketbox.vn/e' }], pages: [{ url: 'https://a.example/x', passages: ['https://evil.example/p'] }] })))
      .toEqual({ 'https://a.example/x': 'source:pages[].url', 'https://duckduckgo.com/?q=x': 'action:search_url', 'https://ticketbox.vn/e': 'action:event_links[].url' })
    expect(byUrl(urlsFromToolResult('read_page', { pages: [{ url: 'https://b.example/y' }] }))).toEqual({ 'https://b.example/y': 'source:pages[].url' })
    expect(byUrl(urlsFromToolResult('get_news', { articles: [{ link: 'https://vnexpress.net/n', description: 'https://evil.example/d' }] }))).toEqual({ 'https://vnexpress.net/n': 'source:articles[].link' })
  })

  it('flights / hotels / products / transport / trip data: their booking and offer links are ACTION grants', () => {
    expect(urlsFromToolResult('get_flight_prices', { booking_links: [{ name: 'Trip.com', url: 'https://vn.trip.com/flights/x' }] }).map(g => g.grant)).toEqual(['action'])
    // Owner decision (b): the hotel search_results[].link is a SOURCE reference (travel.ts puts unfiltered web rows there too).
    expect(urlsFromToolResult('get_hotel_prices', { hotel_list: [{ maps_link: 'https://maps.google.com/?cid=9' }], search_results: [{ link: 'https://www.agoda.com/h' }] }).map(g => g.grant)).toEqual(['action', 'source'])
    // Owner decision (b), P-A: a product link is an ACTION only when it is a merchant product page (isMerchantProductPage).
    expect(urlsFromToolResult('search_products', { search_results: [{ link: 'https://shopee.vn/p' }, { link: 'https://shopee.vn/Op-lung-UAG-i.123.456' }], links: [{ name: 'Tiki', url: 'https://tiki.vn/search?q=x' }], shop_info_results: [{ link: 'https://shop.example/about' }] }).map(g => `${g.grant}:${g.field}`))
      .toEqual(['source:search_results[].link', 'action:search_results[].link', 'action:links[].url', 'source:shop_info_results[].link'])
    expect(urlsFromToolResult('get_transport_options', { vexere_link: 'https://vexere.com/r', bus_search_results: [{ link: 'https://bus.example/b' }] }).map(g => g.grant)).toEqual(['action', 'source'])
    expect(byUrl(urlsFromToolResult('get_trip_data', { hotels: { hotel_list: [{ maps_link: 'https://maps.google.com/?cid=1' }] }, food: { results: [{ maps_link: 'https://maps.google.com/?cid=2' }] }, landmarks_web: { results: [{ link: 'https://w.example/l' }] } })))
      .toEqual({ 'https://maps.google.com/?cid=1': 'action:hotels.hotel_list[].maps_link', 'https://maps.google.com/?cid=2': 'action:food.results[].maps_link', 'https://w.example/l': 'source:landmarks_web.results[].link' })
  })

  it('code-built and CCP links on search_places / hotel / product rows are ACTION grants (inventory check 16/10)', () => {
    // Closeout round 6 (Addendum 2, D1): the same URLs and paths; the row data the row-checked rules read is added (the row's name --
    // 'pho' is exactly the query of the GrabFood URL below --, has_tiktok_review, the hotel row's own link, the commerce link's
    // providerId). TikTok attributed to the row -> 'turn' (this turn only); the batch discovery link -> 'source'; the row's own GrabFood
    // search -> 'action'; a hotel Commerce Link -> 'turn' only when it is the CCP handoff of the same row's link, otherwise no grant.
    expect(byUrl(urlsFromToolResult('search_places', {
      tiktok_discovery_url: 'https://www.tiktok.com/@a/video/1',
      results: [{ name: 'pho', has_tiktok_review: true, order_links: [{ name: 'GrabFood', url: 'https://food.grab.com/vn/vi/restaurants?search=pho' }], platform_links: [{ name: 'Google Maps', url: 'https://www.google.com/maps/search/spa' }], tiktok_review_url: 'https://www.tiktok.com/@b/video/2', commerce_links: [{ url: 'https://shopeefood.vn/ho-chi-minh/pho-hoa' }] }],
    }))).toEqual({
      'https://www.tiktok.com/@a/video/1': 'source:tiktok_discovery_url',
      'https://food.grab.com/vn/vi/restaurants?search=pho': 'action:results[].order_links[].url',
      'https://www.google.com/maps/search/spa': 'action:results[].platform_links[].url',
      'https://www.tiktok.com/@b/video/2': 'turn:results[].tiktok_review_url',
      'https://shopeefood.vn/ho-chi-minh/pho-hoa': 'action:results[].commerce_links[].url',
    })
    // The old hotel fixture's search_results link (b.html) is not the CCP handoff of its row (Booking's canonical is <slug>.vi.html):
    // no grant. A second row whose Commerce Link IS its own canonical is added for the 'turn' side. hotel_list stays an action grant.
    const hotelGrants = urlsFromToolResult('get_hotel_prices', { hotel_list: [{ commerce_links: [{ url: 'https://www.agoda.com/a' }] }], search_results: [
      { link: 'https://www.booking.com/hotel/vn/c.html', commerce_links: [{ providerId: 'booking', url: 'https://www.booking.com/hotel/vn/b.html' }] },
      { link: 'https://www.booking.com/hotel/vn/d.html', commerce_links: [{ providerId: 'booking', url: 'https://www.booking.com/hotel/vn/d.vi.html' }] },
    ] }).map(g => `${g.grant} ${g.field} ${g.url}`)
    expect(hotelGrants).toEqual([
      'action hotel_list[].commerce_links[].url https://www.agoda.com/a',
      'source search_results[].link https://www.booking.com/hotel/vn/c.html',
      'source search_results[].link https://www.booking.com/hotel/vn/d.html',
      'turn search_results[].commerce_links[].url https://www.booking.com/hotel/vn/d.vi.html',
    ])
    expect(hotelGrants.some(g => g.endsWith(' https://www.booking.com/hotel/vn/b.html'))).toBe(false) // the old, unmatched Commerce Link: no grant
    expect(urlsFromToolResult('search_products', { search_results: [{ commerce_links: [{ url: 'https://tiki.vn/p' }] }] }).map(g => g.field)).toEqual(['search_results[].commerce_links[].url'])
  })

  it('LIMIT pinned: the hotel top-level booking_link / agoda_link (named by prompt rule 13, emitted by no current builder) grant nothing', () => {
    expect(urlsFromToolResult('get_hotel_prices', { booking_link: 'https://www.booking.com/searchresults.html?ss=x', agoda_link: 'https://www.agoda.com/search?city=1' })).toEqual([])
  })

  it('a key name alone is never enough: an unknown tool, or a link-looking field outside the tool\'s contract, grants nothing', () => {
    const result = { results: [{ maps_link: 'https://maps.google.com/?cid=11', some_url: 'https://evil.example/u' }], purchase_links: [{ url: 'https://evil.example/p' }], link: 'https://evil.example/l' }
    expect(urlsFromToolResult('unknown_tool', result)).toEqual([])
    expect(urlsFromToolResult(undefined, result)).toEqual([])
    expect(urlsFromToolResult('save_price_watch', result)).toEqual([])
    expect(urlsFromToolResult('search_places', result).map(g => g.url)).toEqual(['https://maps.google.com/?cid=11'])
  })

  it('never grants a URL inside prose, nor a contract field that holds prose or a refused URL', () => {
    expect(urlsFromToolResult('web_search', { results: [{ link: 'Xem tại https://evil.example/e', snippet: 'https://evil.example/s', title: 'https://evil.example/t' }] })).toEqual([])
    expect(urlsFromToolResult('search_places', { results: [{ maps_link: 'javascript:alert(1)', website_uri: 'https://127.0.0.1/x' }] })).toEqual([])
    for (const v of [null, undefined, 'https://evil.example/x', 42, ['https://evil.example/x']]) expect(urlsFromToolResult('web_search', v)).toEqual([])
  })
})

describe('linkFreeName / session names', () => {
  it('keeps a link label, removes every URL', () => {
    expect(linkFreeName('[đọc sách Hà Nội 36 phố phường](https://evil.example/login)')).toBe('đọc sách Hà Nội 36 phố phường')
    expect(linkFreeName('Quán B https://evil.example/x')).toBe('Quán B')
    expect(linkFreeName('Quán C www.evil.example/x')).toBe('Quán C')
    expect(linkFreeName('Phở Hòa Pasteur')).toBe('Phở Hòa Pasteur')
    expect(linkFreeName('https://evil.example/only')).toBeNull()
    expect(linkFreeName(42)).toBeNull()
  })
  it('nextChatSessionState stores a link-free pick and shown names, and keeps only grantable grant records', () => {
    const s = nextChatSessionState(null, {
      replyText: 'Ok. **Mình chọn: [Quán A](https://evil.example/login)** vì gần.',
      presentedNames: ['[Quán B](https://evil.example/b)', 'Quán C'],
      cardOrder: ['[Quán A](https://evil.example/login)'],
      urlGrants: [{ url: 'https://maps.google.com/?cid=1', field: 'tool:results.maps_link' }, { url: 'javascript:alert(1)', field: 'x' }],
    })
    expect({ pick: s.pick, shown: s.shown, cards: s.cards, grants: s.urlGrants?.map(g => g.url) })
      .toEqual({ pick: 'Quán A', shown: ['Quán B', 'Quán C', 'Quán A'], cards: ['Quán A'], grants: ['https://maps.google.com/?cid=1'] })
  })
  it('grant records accumulate across turns (deduplicated, newest last)', () => {
    const t1 = nextChatSessionState(null, { urlGrants: [{ url: 'https://a.example/1', field: 'f' }] })
    const t2 = nextChatSessionState(t1, { urlGrants: [{ url: 'https://b.example/2', field: 'f' }, { url: 'https://a.example/1', field: 'f' }] })
    expect(t2.urlGrants?.map(g => g.url)).toEqual(['https://a.example/1', 'https://b.example/2'])
  })
  it('cleanStoredState cleans a row stored before the rule (read path)', () => {
    const s = cleanStoredState({ v: 1, pick: '[Quán Cũ](https://evil.example/x)', shown: ['[Quán Cũ](https://evil.example/x)', 'Quán D https://evil.example/y'], rejected: ['[Quán E](https://evil.example/z)'], urlGrants: [{ url: 'https://ok.example/a', field: 'f', at: 't' }, { url: 'https://127.0.0.1/', field: 'f', at: 't' }] })
    expect({ pick: s.pick, shown: s.shown, rejected: s.rejected, grants: s.urlGrants?.map(g => g.url) })
      .toEqual({ pick: 'Quán Cũ', shown: ['Quán Cũ', 'Quán D'], rejected: ['Quán E'], grants: ['https://ok.example/a'] })
  })
})
