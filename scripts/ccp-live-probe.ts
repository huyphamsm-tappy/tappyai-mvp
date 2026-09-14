// CCP Phase 8 — live seam probe (verification environment only; read-only).
// Runs attachCommerceLinks with the REAL discovery search and REAL merchant-page
// verification for one venue row, prints the resolved links, and GETs each
// destination read-only to report its HTTP status. Nothing is submitted.
//   npx tsx --env-file=.env.local scripts/ccp-live-probe.ts <scenario>
import { attachCommerceLinks } from '../src/lib/ai/tools/commerce'
import { COMMERCE_LINKS_KEY, type CommerceLinkRow } from '../src/lib/ccp'

const scenario = process.argv[2] ?? 'reservation'
const NOW = new Date()

async function status(url: string): Promise<string> {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } })
    const text = await r.text()
    const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
    const marks = ['sfAdult', 'Chưa hỗ trợ đặt bàn qua PasGo', 'đã dừng đặt chỗ', 'Nhập thông tin', 'hotelId', 'Đặt ngay'].filter(m => text.includes(m))
    return `${r.status} ${r.url} · title="${title.slice(0, 80)}" · marks=${marks.join(',') || '-'}`
  } catch (e) { return `ERR ${(e as Error).message}` }
}

async function main() {
  let toolName: 'search_places' | 'search_products' | 'get_hotel_prices' = 'search_places'
  let result: Record<string, unknown>
  let ctx: Record<string, unknown>
  if (scenario === 'reservation') {
    result = { results: [{ name: 'Rakuen Hotpot', address: '306 Lê Văn Sỹ, Quận 3' }, { name: 'Nhà Hàng Jaspas', address: 'Quận 3' }], _tappy_place_domain: 'food', source: 'probe' }
    ctx = { location: 'Quận 3, TP.HCM', userTexts: ['Tìm nhà hàng phù hợp và đặt bàn cho 2 người lúc 19:00.', 'Lẩu ở Quận 3, TP.HCM, tối nay'] }
  } else if (scenario === 'reservation-nodate') {
    result = { results: [{ name: 'Rakuen Hotpot', address: '306 Lê Văn Sỹ, Quận 3' }], _tappy_place_domain: 'food', source: 'probe' }
    ctx = { location: 'Quận 3, TP.HCM', userTexts: ['Tìm nhà hàng phù hợp và đặt bàn cho 2 người lúc 19:00.', 'Lẩu ở Quận 3, TP.HCM'] }
  } else if (scenario === 'hotel') {
    toolName = 'get_hotel_prices'
    result = { search_results: [
      { title: 'Book Oc Tien Sa Hotel Danang i Da Nang på Agoda.com', link: 'https://www.agoda.com/vi-vn/oc-tien-sa-hotel/hotel/da-nang-vn.html', snippet: '' },
      { title: 'Dai Long Hotel | Hoi An 2026 UPDATED DEALS, HD Photos & Reviews', link: 'https://www.agoda.com/vi-vn/dai-long-hotel/hotel/hoi-an-vn.html', snippet: '' },
      { title: 'Mường Thanh Luxury Đà Nẵng - Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html', snippet: '' },
    ] }
    ctx = { location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12', userTexts: ['Tìm khách sạn ở Đà Nẵng cho 2 người, check-in 10/10/2026, check-out 12/10/2026.'] }
  } else if (scenario === 'spa') {
    result = { results: [{ name: 'Tiệm Massage Hán Cung', address: 'Quận 1' }], _tappy_place_domain: 'spa', source: 'probe' }
    ctx = { location: 'TP.HCM', query: 'spa', userTexts: ['Tìm spa ở TP.HCM.'] }
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
