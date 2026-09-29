import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { attachCommerceLinks } from './commerce'
import { COMMERCE_LINKS_KEY, type CommerceLinkRow } from '@/lib/ccp'
import { setProviderConfigSource, refreshProviderConfig, overrideFromRow, __resetProviderConfig, type ProviderOverride } from '@/lib/ccp/registry/runtime'
import { setCommerceEventWriter } from '@/lib/ccp/events/sink'
import { buildActions } from '@/lib/recommendation/actions'
import { resolveActionLabel } from '@/lib/recommendation/actionLabel'
import { capabilitiesOf } from '@/lib/recommendation/capabilities'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { buildShoppingSynthesis } from '@/lib/ai/consultative/synthesis'
import { buildSynthesisView } from '@/lib/ai/consultative/synthesisView'
import type { Candidate } from '@/lib/ai/consultative/candidate'

// ── A1 (UAT 2026-09-28, owner blocker): a row with no page of its own gets ONE search fallback ──
//
// A3.3 keeps a row's CTA to the subject's OWN page (L3+) so a wrong venue / product is never
// presented as the one asked for. A row with no such page on any platform was left with Maps only.
// It now carries ONE merchant search page (registry grammar, CCP-resolved and affiliate-wrapped
// where the merchant is in the program), labelled "Tìm trên …", never primary, never a direct
// handoff for the model — and a real L3 action on the row always wins.

const NOW = new Date('2026-09-28T08:00:00Z')
const links = (row: Record<string, unknown>) => (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[] | undefined) ?? []
const none = async () => []

beforeEach(() => { __resetProviderConfig(); setCommerceEventWriter(() => undefined); vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { setProviderConfigSource(null); setCommerceEventWriter(null); vi.restoreAllMocks() })

describe('food venue without its own platform page', () => {
  it('discovery turn → ONE "Tìm trên GrabFood" search for name + area; secondary, never the lead', async () => {
    const row = { name: 'Bún Bò Huế O Xuân', address: '12 Lý Chính Thắng', maps_link: 'https://maps.google.com/?cid=7' }
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    const search = vi.fn(none)
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, location: 'Quận 3', userTexts: ['bún bò ngon ở Quận 3'] })
    expect(search).not.toHaveBeenCalled() // the fallback costs no discovery query
    const ls = links(row)
    expect(ls).toHaveLength(1)
    expect(ls[0]).toMatchObject({ providerId: 'grabfood', kind: 'SEARCH_HANDOFF', depth: 2, fallback: 'search', primary: false, capability: 'food_delivery' })
    const dest = new URL(ls[0].destinationUrl)
    expect(`${dest.origin}${dest.pathname}`).toBe('https://food.grab.com/vn/vi/restaurants')
    expect(dest.searchParams.get('search')).toBe('Bún Bò Huế O Xuân Quận 3')

    const actions = placeRecommendations(result, 'Quận 3')[0].entity.actions
    const fb = actions.find(a => a.commerce)!
    expect(fb).toMatchObject({ kind: 'delivery', urlKind: 'search', platform: 'GrabFood' })
    expect(fb.commerce!.primary).toBe(false)
    expect(resolveActionLabel(fb)).toEqual({ key: 'v3.action.orderSearch', params: { platform: 'GrabFood' } }) // "Tìm trên GrabFood"
    expect(actions.findIndex(a => a === fb)).toBeLessThan(actions.findIndex(a => a.kind === 'maps'))
    // The model is not told a direct handoff exists.
    expect(capabilitiesOf(row as never).has_direct_handoff).toBeUndefined()
  })

  it('EVERY card row gets the fallback, not only the rows discovery searched (live UAT: 2 of 8)', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ name: `Phở Số ${i + 1}`, maps_link: `https://maps.google.com/?cid=${i + 1}` }))
    const search = vi.fn(none)
    await attachCommerceLinks('search_places', { results: rows, _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search, location: 'Quận 1', userTexts: ['quán phở ngon quận 1'] })
    expect(rows.map(r => links(r).map(l => l.providerId))).toEqual(rows.map(() => ['grabfood']))
    expect(search.mock.calls.length).toBeLessThanOrEqual(3 * 2) // discovery budget unchanged (≤ maxRows rows)
  })

  it('a table-reservation turn gets no delivery search (not an active capability)', async () => {
    const row = { name: 'Rakuen Hotpot', maps_link: 'https://maps.google.com/?cid=1' }
    await attachCommerceLinks('search_places', { results: [row], _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search: none, userTexts: ['Đặt bàn cho 2 người lúc 19h tối nay'] })
    expect(links(row)).toEqual([])
  })

  it('a user who NAMED ShopeeFood gets no GrabFood search (ShopeeFood has no search grammar → nothing)', async () => {
    const row = { name: 'Phở Hòa', maps_link: 'https://maps.google.com/?cid=1' }
    await attachCommerceLinks('search_places', { results: [row], _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search: none, userTexts: ['Đặt phở giao tận nhà qua ShopeeFood'] })
    expect(links(row)).toEqual([])
  })

  it('a row WITH its own restaurant page (L3) gets no fallback — the real page wins', async () => {
    const row = { name: 'Phở 24 Nguyễn Tri Phương', address: 'Quận 10', maps_link: 'https://maps.google.com/?cid=1' }
    const search = async (q: string) => q.includes('site:shopeefood.vn') ? [{ title: 'Phở 24 - Nguyễn Tri Phương - ShopeeFood', link: 'https://shopeefood.vn/ho-chi-minh/pho-24-nguyen-tri-phuong', snippet: '' }] : []
    await attachCommerceLinks('search_places', { results: [row], _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search, userTexts: ['giao tận nhà'] })
    expect(links(row).length).toBeGreaterThan(0)
    expect(links(row).every(l => l.fallback === undefined && l.depth >= 3)).toBe(true)
  })

  it('a row whose maps listing carries its own booking page gets no fallback beside it', async () => {
    const row = { name: 'Hàng Dương Quán', maps_link: 'https://maps.google.com/?cid=1', booking_links: ['https://hangduongquan.com/dat-ban.html'] }
    await attachCommerceLinks('search_places', { results: [row], _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search: none, userTexts: ['quán ăn Quận 1'] })
    expect(links(row)).toEqual([])
  })

  it('wrong-venue protection stands: a platform page for ANOTHER venue is never attached — only the search, labelled as one', async () => {
    const row = { name: 'Phở Hòa', address: '260C Pasteur', maps_link: 'https://maps.google.com/?cid=1' }
    const search = async (q: string) => q.includes('site:shopeefood.vn') ? [{ title: 'Phở Lệ - ShopeeFood', link: 'https://shopeefood.vn/ho-chi-minh/pho-le-nguyen-trai', snippet: '' }] : []
    await attachCommerceLinks('search_places', { results: [row], _tappy_place_domain: 'food' }, { enabled: true, now: NOW, search, userTexts: ['giao tận nhà'] })
    expect(links(row).map(l => l.destinationUrl)).not.toContain('https://shopeefood.vn/ho-chi-minh/pho-le-nguyen-trai')
    expect(links(row).every(l => l.fallback === 'search' && l.kind === 'SEARCH_HANDOFF')).toBe(true)
  })
})

describe('the action layer: a real action always wins; one button per platform', () => {
  const fallbackRow = (providerId: string, merchantName: string, url: string, intentType: CommerceLinkRow['intentType']): CommerceLinkRow => ({
    linkId: `fb-${providerId}`, requestId: 'r1', url, destinationUrl: url, kind: 'SEARCH_HANDOFF', providerId, merchantName, domain: 'food_drink', intentType, capability: 'food_delivery',
    primary: false, depth: 2, guestDepth: 3, authenticatedDepth: null, authRequiredAt: 'before_checkout', handoff: 'merchant_login', expiresAt: null,
    freshness: { source: 'grammar', retrievedAt: NOW.toISOString(), expiresAt: null, freshnessType: 'static', confidence: 1 }, assumedParams: [], limitations: [], tracked: false, fallback: 'search',
  })
  const grab = fallbackRow('grabfood', 'GrabFood', 'https://food.grab.com/vn/vi/restaurants?search=Ph%E1%BB%9F%20H%C3%B2a', 'order_delivery')

  it('alone → rendered as a search action', () => {
    const acts = buildActions({ name: 'Phở Hòa', maps_link: 'https://maps.google.com/?cid=1', commerce_links: [grab] }, 'food')
    expect(acts.filter(a => a.commerce).map(a => [a.kind, a.urlKind])).toEqual([['delivery', 'search']])
  })

  it('beside the venue\'s own order page (entity evidence) → dropped', () => {
    const acts = buildActions({ name: 'Phở Hòa', commerce_links: [grab], order_search_results: [{ link: 'https://shopeefood.vn/ho-chi-minh/pho-hoa-pasteur', title: 'Phở Hòa' }] }, 'food')
    expect(acts.some(a => a.commerce)).toBe(false)
    expect(acts.some(a => a.kind === 'order' && a.urlKind === 'direct')).toBe(true)
  })

  it('beside the venue\'s own reservation page (maps booking_links) → dropped', () => {
    const acts = buildActions({ name: 'Hàng Dương Quán', commerce_links: [grab], booking_links: ['https://hangduongquan.com/dat-ban.html'] }, 'food')
    expect(acts.some(a => a.commerce)).toBe(false)
  })

  it('a fallback on a front door (not a results page) is never rendered', () => {
    const door = { ...grab, url: 'https://food.grab.com/vn/vi/', destinationUrl: 'https://food.grab.com/vn/vi/' }
    expect(buildActions({ name: 'x', commerce_links: [door] }, 'food').some(a => a.commerce)).toBe(false)
  })

  it('an old SEARCH_HANDOFF without the fallback mark is still refused (A3.3 last exit)', () => {
    const { fallback: _f, ...legacy } = grab
    expect(buildActions({ name: 'x', commerce_links: [legacy as CommerceLinkRow] }, 'food').some(a => a.commerce)).toBe(false)
  })
})

// The 27 Sep portal state (Lazada / CellphoneS approved, Shopee / GrabFood not), read like the app reads it.
function rowsAfterMigration(): ProviderOverride[] {
  const seed = readFileSync('supabase/migrations/20260920100000_commerce_providers.sql', 'utf8')
  const update = readFileSync('supabase/migrations/20260927100000_commerce_providers_portal_state.sql', 'utf8')
  const table = new Map<string, Record<string, unknown>>()
  for (const m of seed.matchAll(/\('(\w+)',\s+(true|false),\s+(true|false),\s+([12]),\s+(?:'(\w+)'|null),\s+(?:'(\d+)'|null),/g)) {
    table.set(m[1], { provider_id: m[1], active: m[2] === 'true', deeplink_enabled: m[3] === 'true', tier: Number(m[4]), network: m[5] ?? null, campaign_id: m[6] ?? null })
  }
  for (const m of update.matchAll(/update public\.commerce_providers\s+set ([\s\S]*?)\s+where provider_id = '(\w+)';/g)) {
    const r = table.get(m[2])!
    for (const a of m[1].matchAll(/(\w+) = (true|false|\d|'[^']*')/g)) {
      const v = a[2]
      r[a[1]] = v === 'true' ? true : v === 'false' ? false : /^\d$/.test(v) ? Number(v) : v.slice(1, -1)
    }
  }
  table.get('dmx')!.active = false
  return [...table.values()].map(r => overrideFromRow(r)!)
}

describe('shopping product whose only link is a Google Shopping intermediary', () => {
  const PUB = '6277265300509373567'
  const saved = process.env.ACCESSTRADE_PUBLISHER_ID
  afterEach(() => { if (saved === undefined) delete process.env.ACCESSTRADE_PUBLISHER_ID; else process.env.ACCESSTRADE_PUBLISHER_ID = saved })

  const googleRow = () => ({ title: 'Tai nghe Sony WH-1000XM5', link: 'https://www.google.com/search?ibp=oshop&q=sony+wh-1000xm5&prds=catalogid:1', price_vnd: 6990000, source: 'Fogo Store' })

  it('→ ONE marketplace search; with the program live it is the ACCESSTRADE-wrapped Lazada search', async () => {
    process.env.ACCESSTRADE_PUBLISHER_ID = PUB
    setProviderConfigSource({ async load() { return rowsAfterMigration() } })
    await refreshProviderConfig({ force: true })
    const row = googleRow()
    await attachCommerceLinks('search_products', { search_results: [row] }, { enabled: true, now: NOW, search: none, actorHash: 'a'.repeat(24) })
    const ls = links(row)
    expect(ls).toHaveLength(1)
    expect(ls[0]).toMatchObject({ providerId: 'lazada', kind: 'SEARCH_HANDOFF', fallback: 'search', primary: false, tracked: true })
    const u = new URL(ls[0].url)
    expect(u.hostname).toBe('go.isclix.com')
    expect(u.searchParams.get('sub1')).toBeNull() // Phương án C: sub1 is drawn per click at /go/at
    expect(new URL(ls[0].destinationUrl).pathname).toBe('/catalog/')
    expect(new URL(ls[0].destinationUrl).searchParams.get('q')).toContain('WH-1000XM5')
    // The card: no "Mua"/"Xem sản phẩm" for the Google redirect, one "Tìm trên Lazada".
    const acts = buildActions(row as never, 'shopping')
    expect(acts.map(a => [a.kind, a.urlKind, a.platform])).toEqual([['purchase', 'search', 'Lazada']])
    expect(resolveActionLabel(acts[0])).toEqual({ key: 'v3.action.searchOn', params: { platform: 'Lazada' } })
    expect(capabilitiesOf(row as never).has_direct_handoff).toBeUndefined()
  })

  it('→ the Shopping card marker carries it as a SEARCH handoff (never the leading "Mua trên")', async () => {
    const row = googleRow()
    await attachCommerceLinks('search_products', { search_results: [row] }, { enabled: true, now: NOW, search: none })
    expect(links(row)).toHaveLength(1)
    const view = buildSynthesisView(buildShoppingSynthesis([{ id: 'c0', name: row.title, raw: row } as unknown as Candidate], null, 'tai nghe Sony WH-1000XM5'))
    const e = view.entities[0]
    expect(e.commerce).toBeUndefined()
    expect(e.commerceLinks?.map(c => c.kind)).toEqual(['SEARCH_HANDOFF'])
    expect(e.commerceLinks?.[0].labelKey).toMatch(/^v3\.action\.search/)
  })

  it('a product whose own link IS the merchant product page gets no search beside it', async () => {
    const row = { title: 'Tai nghe Sony WH-1000XM5', link: 'https://fptshop.com.vn/tai-nghe/sony-wh-1000xm5', price_vnd: 6990000, source: 'FPT Shop' }
    await attachCommerceLinks('search_products', { search_results: [row] }, { enabled: true, now: NOW, search: none })
    expect(links(row)).toEqual([])
  })

  it('a product with a real marketplace product page keeps it, and no fallback is added', async () => {
    const row = { title: 'Điện thoại Apple iPhone 16 Pro 128GB', link: 'https://www.google.com/search?q=iphone+16+pro&prds=1', price_vnd: 25990000, source: 'Fogo Store' }
    const search = async (q: string) => q.includes('site:lazada.vn') ? [{ title: 'iPhone 16 Pro 128GB Chính Hãng (VN/A) - Lazada', link: 'https://www.lazada.vn/products/iphone-16-pro-128gb-chinh-hang-vna-i2806208680.html', snippet: '' }] : []
    await attachCommerceLinks('search_products', { search_results: [row] }, { enabled: true, now: NOW, search })
    expect(links(row).length).toBeGreaterThan(0)
    expect(links(row).some(l => l.fallback === 'search')).toBe(false)
  })
})

describe('events', () => {
  it('event-ticket turn with no listing found → the venue gets ONE "Tìm vé trên Ticketbox"', async () => {
    const venue = { name: 'Nhà hát Hòa Bình', address: 'Quận 10', maps_link: 'https://maps.google.com/?cid=3' }
    const result = { results: [venue], _tappy_place_domain: 'entertainment', query: 'concert' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search: none, location: 'TP.HCM', query: 'concert', userTexts: ['Có concert nào ở TP.HCM cuối tuần này không?'] })
    const ls = links(venue)
    expect(ls).toHaveLength(1)
    expect(ls[0]).toMatchObject({ providerId: 'ticketbox', kind: 'SEARCH_HANDOFF', fallback: 'search', primary: false })
    expect(new URL(ls[0].destinationUrl).pathname).toBe('/search')
    const acts = buildActions(venue as never, 'entertainment')
    const fb = acts.find(a => a.commerce)!
    expect(fb).toMatchObject({ kind: 'ticket', urlKind: 'search' })
    expect(resolveActionLabel(fb).key).toMatch(/^v3\.action\.(ticketSearch|searchLoginOn)$/)
  })

  it('a non-ticket entertainment turn gets no Ticketbox search for a venue name', async () => {
    const venue = { name: 'Landmark 81 SkyView', maps_link: 'https://maps.google.com/?cid=4' }
    await attachCommerceLinks('search_places', { results: [venue], _tappy_place_domain: 'entertainment' }, { enabled: true, now: NOW, search: none, userTexts: ['chỗ đi chơi ở Quận 1'] })
    expect(links(venue).some(l => l.providerId === 'ticketbox')).toBe(false)
  })
})

describe('hotel card rows without a page of their own (live UAT 2026-09-28: 2 of 8 had a booking button)', () => {
  it('every hotel row gets ONE "Tìm trên Booking.com" results page for THAT hotel, not the city', async () => {
    const rows = ['Khách Sạn Green Eco Đà Lạt', 'Tulip Dalat Hotel', 'Ana Villa'].map((n, i) => ({ name: n, maps_link: `https://maps.google.com/?cid=${i}`, place_types: ['hotel'] }))
    const result = { results: rows, _tappy_place_domain: 'place', query: 'khách sạn Đà Lạt' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search: none, location: 'Đà Lạt', userTexts: ['khách sạn Đà Lạt dưới 1 triệu'] })
    for (const r of rows) {
      const ls = links(r)
      expect(ls).toHaveLength(1)
      expect(ls[0]).toMatchObject({ providerId: 'booking', kind: 'SEARCH_HANDOFF', fallback: 'search', primary: false })
      const ss = new URL(ls[0].url).searchParams.get('ss')!
      expect(ss.startsWith(r.name)).toBe(true)
    }
    const actions = placeRecommendations(result, 'Đà Lạt')[0].entity.actions
    expect(resolveActionLabel(actions.find(a => a.commerce)!)).toEqual({ key: 'v3.action.bookingSearch', params: { platform: 'Booking.com' } })
  })
})
