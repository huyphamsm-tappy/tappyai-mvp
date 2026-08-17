import { describe, it, expect } from 'vitest'
import { getWeather, getGoldPrice } from '@/lib/ai/tools/weather'
import { getNews } from '@/lib/ai/tools/food'
import { webSearch } from '@/lib/ai/tools/common'
import { searchProducts } from '@/lib/ai/tools/shopping'
import { getTransportOptions, getHotelPrices } from '@/lib/ai/tools/travel'
import { classifyIntent, detectForcedTool, detectLang, detectLocationIntent } from '@/lib/ai/intent'

// ── Domain matrix probe (Workstream A) ───────────────────────────────────────
//
//   TAPPY_MEASURE=1 MEASURE_OUT=<file> npx vitest run src/lib/ai/__measure__/domainMatrix.test.ts
//
// Hits the REAL tools over the REAL network. No fixtures. Skipped by default because it is
// network-dependent and would be flaky in CI — same convention as the other __measure__ probes.
//
// Only the tools whose upstream needs NO credential are exercised here, because those are the
// only ones that can produce honest local evidence on this machine:
//   get_weather      wttr.in
//   get_gold_price   vang.today
//   get_news         VnExpress / Tuoi Tre / Dan Tri RSS
//   web_search       Serper, falling back to html.duckduckgo.com when SERPER_API_KEY is absent
//   search_products  deterministic Shopee/Tiki/Lazada link builders (+ Serper when present)
//   transport/hotel  OpenStreetMap / Nominatim (Travelpayouts and Serper add data when keyed)
//
// search_places is deliberately NOT asserted here: without GOOGLE_PLACES_API_KEY it falls through
// to Overpass, which returned 0 rows on this machine, so a local result would say nothing about
// the production contract.

const MEASURE = process.env.TAPPY_MEASURE === '1'

const isHttps = (v: unknown) => typeof v === 'string' && /^https:\/\//.test(v)
const arr = (v: unknown) => (Array.isArray(v) ? v : [])

describe.skipIf(!MEASURE)('domain matrix — real tools, real network', () => {
  it('measures every credential-free domain', async () => {
    const out: Record<string, unknown> = {}

    // ── intent signals ───────────────────────────────────────────────────────
    // NOT routing. detectForcedTool feeds memory gating (route.ts:106/155) and telemetry
    // (:468) ONLY — it never reaches the model and never restricts the tool set. Actual tool
    // choice is the model's, at the SDK default toolChoice:'auto'. Recorded here to show which
    // phrasings the Vietnamese-only regexes recognise, not to judge whether a turn routes right.
    // The one thing that DOES gate the toolset is locationIntent: 'offline' removes
    // search_products entirely (route.ts:340).
    const routing = [
      { q: 'Thời tiết Hà Nội hôm nay thế nào?', want: 'get_weather', lang: 'vi' },
      { q: 'What is the weather in Hanoi today?', want: 'get_weather', lang: 'en' },
      { q: 'Giá vàng SJC hôm nay', want: 'get_gold_price', lang: 'vi' },
      { q: 'Tin tức mới nhất', want: 'get_news', lang: 'vi' },
      { q: 'Mua tai nghe bluetooth ở đâu rẻ', want: 'search_products', lang: 'vi' },
      { q: 'Giá phòng khách sạn Đà Nẵng', want: 'get_hotel_prices', lang: 'vi' },
      { q: 'Vé xe khách từ Hà Nội đến Hải Phòng', want: 'get_transport_options', lang: 'vi' },
      { q: 'Vé máy bay Hà Nội đi Đà Nẵng', want: 'get_flight_prices', lang: 'vi' },
      { q: 'Quán cà phê ngon ở Quận 1', want: 'search_places', lang: 'vi' },
    ].map(c => ({
      query: c.q.slice(0, 28),
      expectedTool: c.want,
      forcedTool: detectForcedTool(c.q),
      forcedToolMatchesDomain: detectForcedTool(c.q) === c.want,
      productsToolAvailable: detectLocationIntent(c.q) !== 'offline',
      intent: classifyIntent(c.q),
      lang: detectLang(c.q),
      langOk: detectLang(c.q) === c.lang,
      locationIntent: detectLocationIntent(c.q),
    }))
    out.routing = routing

    // ── weather ──────────────────────────────────────────────────────────────
    const w = await getWeather('Hà Nội') as Record<string, unknown>
    out.get_weather = {
      ok: !w?.error, keys: Object.keys(w ?? {}).sort(),
      hasTemp: w?.temperature != null || w?.temp_c != null,
      error: w?.error ?? null,
    }

    // ── gold ─────────────────────────────────────────────────────────────────
    const g = await getGoldPrice('vi') as Record<string, unknown>
    out.get_gold_price = {
      ok: !g?.error, keys: Object.keys(g ?? {}).sort(),
      rowCount: arr(g?.prices).length || arr(g?.results).length,
      error: g?.error ?? null,
    }

    // ── news ─────────────────────────────────────────────────────────────────
    // `query` is z.string() (required) in the tool schema, so the SDK never lets the model omit
    // it — passing one here matches what production can actually produce.
    const n = await getNews('kinh tế', 'vi') as Record<string, unknown>
    const items = arr(n?.articles).length ? arr(n?.articles) : arr(n?.results)
    out.get_news = {
      ok: !n?.error, keys: Object.keys(n ?? {}).sort(), count: items.length,
      allHaveLink: items.length > 0 && items.every((a: Record<string, unknown>) => isHttps(a.link ?? a.url)),
      error: n?.error ?? null,
    }

    // ── web search (DuckDuckGo fallback when Serper is absent) ───────────────
    const s = await webSearch('ty gia usd hom nay') as Record<string, unknown>
    out.web_search = {
      ok: !s?.error, source: s?.source ?? null, count: arr(s?.results).length,
      hasSearchUrl: isHttps(s?.search_url), error: s?.error ?? null,
    }

    // ── products ─────────────────────────────────────────────────────────────
    const p = await searchProducts('tai nghe bluetooth', 'vi') as Record<string, unknown>
    const links = arr(p?.links)
    out.search_products = {
      ok: !p?.error, keys: Object.keys(p ?? {}).sort(),
      linkCount: links.length,
      linkHosts: Array.from(new Set(links.map((l: Record<string, unknown>) => { try { return new URL(String(l.url)).hostname.replace(/^www\./, '') } catch { return null } }).filter(Boolean))),
      allHttps: links.length > 0 && links.every((l: Record<string, unknown>) => isHttps(l.url)),
      searchResultCount: arr(p?.search_results).length,
    }

    // ── transport ────────────────────────────────────────────────────────────
    const t = await getTransportOptions('Hà Nội', 'Hải Phòng', 'intercity') as Record<string, unknown>
    out.get_transport_options = {
      ok: !t?.error, keys: Object.keys(t ?? {}).sort(),
      hasBookingLink: isHttps(t?.vexere_link) || isHttps(t?.train_booking_link),
      busResults: arr(t?.bus_search_results).length,
      error: t?.error ?? null,
    }

    // ── hotel ────────────────────────────────────────────────────────────────
    const h = await getHotelPrices('Đà Nẵng') as Record<string, unknown>
    out.get_hotel_prices = {
      ok: !h?.error, keys: Object.keys(h ?? {}).sort(),
      searchResults: arr(h?.search_results).length,
      hotelList: arr(h?.hotel_list).length,
      hasBookingLink: isHttps(h?.booking_link) || isHttps(h?.agoda_link),
      error: h?.error ?? null,
    }

    const dest = process.env.MEASURE_OUT
    if (dest) (await import('node:fs')).writeFileSync(dest, JSON.stringify(out, null, 2))
    console.log('DOMAIN_MATRIX ' + JSON.stringify(out))
    // The real invariant: every credential-free tool answers over the network without erroring.
    for (const k of ['get_weather', 'get_gold_price', 'get_news', 'web_search', 'search_products', 'get_hotel_prices']) {
      expect((out[k] as { ok: boolean }).ok, k).toBe(true)
    }
    // get_transport_options is deliberately excluded: its bus/train lookup goes through Serper,
    // so with no SERPER_API_KEY it returns `error` BY DESIGN while still handing back the
    // vexere/train booking links. That degraded shape is the documented no-key path, not a fault.
    expect((out.get_transport_options as { hasBookingLink: boolean }).hasBookingLink).toBe(true)
  }, 240_000)
})
