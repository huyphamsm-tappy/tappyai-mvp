// CCP Phase 8 — live seam probe (verification environment only; read-only).
// Runs attachCommerceLinks with the REAL discovery search and REAL merchant-page
// verification for one venue row, prints the resolved links, and GETs each
// destination read-only to report its HTTP status. Nothing is submitted.
//   npx tsx --env-file=.env.local scripts/ccp-live-probe.ts hotel|spa|activity|delivery|flight|bus|event|film
import { attachCommerceLinks, type RouteHandoffFacts } from '../src/lib/ai/tools/commerce'
import { COMMERCE_LINKS_KEY, type CommerceLinkRow } from '../src/lib/ccp'

const scenario = process.argv[2] ?? 'hotel'
const NOW = new Date()

async function status(url: string): Promise<string> {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } })
    const text = await r.text()
    const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
    const marks = ['Nhập thông tin', 'hotelId', 'Đặt ngay', 'Mua vé', 'Challenge Validation', 'Tôi sẽ đặt', 'Login Required'].filter(m => text.includes(m))
    return `${r.status} ${r.url} · title="${title.slice(0, 80)}" · marks=${marks.join(',') || '-'}`
  } catch (e) { return `ERR ${(e as Error).message}` }
}

async function routeScenario() {
  const flight = scenario === 'flight'
  const result: Record<string, unknown> = flight ? { booking_links: [] } : { type: 'intercity', vexere_link: '' }
  await attachCommerceLinks(flight ? 'get_flight_prices' : 'get_transport_options', result, {
    enabled: true, now: NOW, platform: 'web', locale: 'vi',
    origin: flight ? 'Sài Gòn' : 'Sài Gòn', destination: flight ? 'Hà Nội' : 'Đà Lạt', departDate: '2026-10-10', ...(flight ? { passengers: 2 } : { transportMode: 'intercity' as const }),
  })
  const facts = (result._tappy_commerce as RouteHandoffFacts[] | undefined) ?? []
  const urls = flight ? (result.booking_links as Array<{ name: string; url: string }>).map(l => l.url) : [String(result.vexere_link)]
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i]
    console.log(`\n▶ ${f.merchantName} ${f.kind} L${f.depth} guest L${f.guestDepth} auth=${f.authRequiredAt} assumed=[${f.assumedParams}]`)
    console.log(`  → ${urls[i]}`)
    if (f.limitations.length) console.log(`  limitations: ${f.limitations.join(' | ')}`)
    console.log(`  GET: ${await status(urls[i])}`)
  }
  if (facts.length === 0) console.log('  (no commerce link)')
}

async function main() {
  if (scenario === 'flight' || scenario === 'bus') return routeScenario()
  let toolName: 'search_places' | 'search_products' | 'get_hotel_prices' = 'search_places'
  let result: Record<string, unknown>
  let ctx: Record<string, unknown>
  if (scenario === 'hotel') {
    toolName = 'get_hotel_prices'
    result = { search_results: [
      { title: 'Book Oc Tien Sa Hotel Danang i Da Nang på Agoda.com', link: 'https://www.agoda.com/vi-vn/oc-tien-sa-hotel/hotel/da-nang-vn.html', snippet: '' },
      { title: 'Dai Long Hotel | Hoi An 2026 UPDATED DEALS, HD Photos & Reviews', link: 'https://www.agoda.com/vi-vn/dai-long-hotel/hotel/hoi-an-vn.html', snippet: '' },
      { title: 'Mường Thanh Luxury Đà Nẵng - Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html', snippet: '' },
    ] }
    ctx = { location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12', userTexts: ['Tìm khách sạn ở Đà Nẵng cho 2 người, check-in 10/10/2026, check-out 12/10/2026.'] }
  } else if (scenario === 'delivery') {
    result = { results: [{ name: 'Phở 24 Nguyễn Tri Phương', address: 'Quận 10' }], _tappy_place_domain: 'food', source: 'probe' }
    ctx = { location: 'Quận 10, TP.HCM', userTexts: ['Tôi muốn đặt đồ ăn giao tận nhà.'] }
  } else if (scenario === 'spa') {
    result = { results: [{ name: 'Tiệm Massage Hán Cung', address: 'Quận 1' }], _tappy_place_domain: 'spa', source: 'probe' }
    ctx = { location: 'TP.HCM', query: 'spa', userTexts: ['Tìm spa ở TP.HCM.'] }
  } else if (scenario === 'event') {
    result = { results: [{ name: 'Nhà hát Hòa Bình', address: 'Quận 10' }], _tappy_place_domain: 'entertainment', source: 'probe', query: 'concert' }
    ctx = { location: 'TP.HCM', query: 'concert', userTexts: ['Có concert nào ở TP.HCM cuối tuần này không?'] }
  } else if (scenario === 'film') {
    result = { results: [{ name: 'CGV Vincom Đồng Khởi', address: 'Quận 1' }], _tappy_place_domain: 'entertainment', source: 'probe', query: 'rạp chiếu phim' }
    ctx = { location: 'Quận 1, TP.HCM', query: 'rạp chiếu phim', userTexts: ['Mua vé xem phim Mưa Đỏ tối nay ở Quận 1'] }
  } else if (scenario === 'activity') {
    result = { results: [{ name: 'Pont main', address: 'Đà Nẵng' }], _tappy_place_domain: 'entertainment', source: 'probe' }
    ctx = { location: 'Đà Nẵng', query: 'hoạt động vui chơi', userTexts: ['Tìm hoạt động vui chơi cho tôi.', 'Đà Nẵng'] }
  } else {
    throw new Error('unknown scenario')
  }
  await attachCommerceLinks(toolName, result, { enabled: true, now: NOW, platform: 'web', locale: 'vi', ...ctx })
  const key = toolName === 'get_hotel_prices' ? 'search_results' : 'results'
  for (const row of result[key] as Array<Record<string, unknown>>) {
    const links = (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[] | undefined) ?? []
    console.log(`\n▶ ${row.name ?? row.title}${row._tappy_experience ? ' (listing row)' : ''}${row._tappy_rejected ? ` REJECTED ${row._tappy_rejected}` : ''}`)
    for (const l of links) {
      console.log(`  ${l.providerId} ${l.kind} L${l.depth} guest L${l.guestDepth} auth=${l.authRequiredAt} primary=${l.primary} assumed=[${l.assumedParams}] expires=${l.expiresAt}`)
      console.log(`  → ${l.destinationUrl}`)
      if (l.limitations.length) console.log(`  limitations: ${l.limitations.join(' | ')}`)
      console.log(`  GET: ${await status(l.destinationUrl)}`)
    }
    if (links.length === 0) console.log('  (no commerce link)')
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
