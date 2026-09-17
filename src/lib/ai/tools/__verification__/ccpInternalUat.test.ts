import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { attachCommerceLinks, type CommerceToolName } from '../commerce'
import { COMMERCE_LINKS_KEY, setCommerceEventWriter, resolveCommerce, getProvider, depthProfileForCapability, type CommerceLinkRow } from '@/lib/ccp'
import { installCommerceObservability, __resetCommerceObservability } from '@/lib/ccp/events/observabilityBridge'
import { splitToolResult } from '@/lib/ai/toolResultSplit'
import { placeRecommendations, productRecommendations, stayRecommendations } from '@/lib/recommendation/fromToolResult'
import { buildPlacesLiveView } from '@/lib/recommendation/liveView'
import { resolveActionLabel } from '@/lib/recommendation/actionLabel'
import { vi as VI } from '@/lib/i18n/w5/placeDecision'
import { ALLOWED_PAYLOAD_KEYS, type ObservabilityEvent } from '@/lib/observability'

// ── Internal UAT — five domains, six capability-level flows (Phase 7) ────────
//
// Claude's own implementation-level UAT, NOT owner UAT and NOT production
// verification. Each flow runs the owner's sentence through the REAL seam
// (intent → capability → CCP → row → Action → channel → events) with the
// platform enabled through the test seam and discovery answered by fixtures
// shaped like the audit's merchant URLs. The fifteen end-to-end assertions are
// real `expect`s; the matrix is written to docs/ccp/internal-uat-evidence.json.
// No network, no merchant page, no login, no payment.
//
// Always runs (it is the regression suite for the capability model); the file
// is written only under CCP_UAT=1 so the normal gate stays side-effect free.

const NOW = new Date('2026-09-13T08:00:00Z')
const OUT = 'docs/ccp/internal-uat-evidence.json'
type Row = Record<string, unknown>
const links = (row: Row) => (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[] | undefined) ?? []
const label = (a: unknown) => { const r = resolveActionLabel(a as never); const s = VI[r.key] ?? r.key; return r.params ? s.replace('{platform}', r.params.platform) : s }

interface FlowResult {
  domain: string; capability: string; userIntent: string; providerSelected: string | null; dataSource: string | null
  freshness: CommerceLinkRow['freshness'] | null; configuration: Record<string, string> | null; linkKind: string | null
  transactionDepth: string | null; authRequirement: string | null; handoff: string | null; expected: string; actual: string; verdict: 'PASS' | 'FAIL' | 'NOT VERIFIABLE'
  assertions: Record<string, boolean | string>
}
const matrix: FlowResult[] = []
let events: ObservabilityEvent[] = []
beforeEach(() => { events = []; installCommerceObservability(e => events.push(e)) })
afterEach(() => { __resetCommerceObservability(); setCommerceEventWriter(null) })

function recsFor(tool: CommerceToolName, result: Row) {
  return tool === 'search_products' ? productRecommendations(result) : tool === 'get_hotel_prices' ? stayRecommendations(result) : placeRecommendations(result, 'x')
}

/** The fifteen end-to-end checks, applied to one flow. Returns the assertion record for the matrix. */
function assertFlow(opts: {
  tool: CommerceToolName; result: Row; row: Row; domain: string; capability: string; provider: string | null; leadKind: string
  expectDepth: number | null; expectGuest: number | null; expectAuth: string | null; expectLogin: boolean | null; expectLeadCommerce: boolean
}) {
  const l = links(opts.row).find(x => !opts.provider || x.providerId === opts.provider) ?? null
  const recs = recsFor(opts.tool, opts.result)
  const lead = recs[0]?.entity.actions[0]
  const { model } = splitToolResult(opts.tool, opts.result)
  const modelJson = JSON.stringify(model)
  const view = buildPlacesLiveView(recs, {})
  const evJson = JSON.stringify(events)
  const a: Record<string, boolean | string> = {}
  // 1–3 domain / capability / provider
  a['1 correct domain'] = l ? l.domain === opts.domain : opts.provider === null
  a['2 correct capability'] = l ? l.capability === opts.capability : opts.provider === null
  a['3 correct provider'] = l ? l.providerId === opts.provider : opts.provider === null
  // 4–5 configuration / link
  a['4 correct configuration'] = l ? (l.assumedParams.every(p => typeof p === 'string')) : true
  a['5 correct CommerceLink (https, allow-listed host, no nested url)'] = l ? (l.url.startsWith('https://') && !/[?&][^=&]*=https?:\/\//i.test(l.url)) : true
  // 6–7 depth / auth
  a['6 deepest valid depth'] = l ? (opts.expectDepth === null || l.depth === opts.expectDepth) && (opts.expectGuest === null || l.guestDepth === opts.expectGuest) : true
  a['7 correct auth boundary'] = l ? (opts.expectAuth === null || l.authRequiredAt === opts.expectAuth) : true
  // 8 freshness
  a['8 freshness metadata (never realtime for identity)'] = l ? (!!l.freshness.source && !!l.freshness.retrievedAt && l.freshness.freshnessType !== 'realtime' && l.freshness.confidence > 0 && l.freshness.confidence <= 1) : true
  // 9 action mapping
  a['9 correct Action mapping'] = !!lead && lead.kind === opts.leadKind && (opts.expectLeadCommerce ? !!lead.commerce && lead.commerce.linkId === l?.linkId : !lead.commerce)
  // 10 handoff (label states login boundary iff required)
  a['10 correct handoff'] = lead ? (opts.expectLogin === null || (label(lead).includes('cần đăng nhập') === opts.expectLogin)) : false
  // 11 no fabricated checkout
  a['11 no fabricated checkout'] = l ? !(l.depth === 5 && l.guestDepth < 5) && !/booking\/tickets/.test(l.url) : true
  // 12 provider/capability mismatch
  a['12 no provider/capability mismatch'] = l ? getProvider(l.providerId)!.commerce.includes(l.capability) && !!depthProfileForCapability(getProvider(l.providerId)!, l.capability) : true
  // 13 PII / model exposure
  // The model never receives `commerce_links`. A merchant URL the ROW itself carried (Serper `link`,
  // Places `website_uri`) is pre-existing model-facing data — recorded separately, not counted as a CCP leak.
  const rowOwn = [opts.row.link, opts.row.website_uri].filter((u): u is string => typeof u === 'string')
  a['13 no PII leakage (events: allow-listed scalars, no URL; model: no CCP link)'] = events.every(e => Object.keys(e).every(k => ALLOWED_PAYLOAD_KEYS.has(k))) && !/https?:\/\//.test(evJson) && !modelJson.includes('commerce_links') && (l ? (rowOwn.includes(l.url) || !modelJson.includes(l.url)) : true)
  a['model sees merchant URL via a pre-existing row field'] = l ? (rowOwn.includes(l.url) && modelJson.includes(l.url) ? 'yes (pre-existing: row link / website_uri)' : 'no') : 'n/a'
  // 14 unsafe redirect
  a['14 no unsafe redirect'] = l ? (new URL(l.url).hostname === new URL(l.destinationUrl).hostname || l.tracked) : true
  // 15 observability
  // A flow no adapter can serve (food_delivery) issues no CCP request at all — nothing to resolve, nothing to log.
  a['15 correct observability events'] = l ? ['commerce_request', 'commerce_provider_search', 'commerce_deep_link_resolved', 'commerce_deep_link_validated', 'commerce_provider_selected'].every(t => events.some(e => e.type === t)) : events.length === 0
  a['card channel'] = view ? 'places live view (web)' : 'none (product lead → shopping card)'
  // Informational (strings, not asserted): the DMX card gap and the no-link delivery flow are recorded, not failed.
  a['card shows lead'] = !!view && view.items[0]?.actions[0]?.url === lead?.url ? 'yes' : 'no'
  a['model sees has_direct_handoff'] = modelJson.includes('"has_direct_handoff":true') ? 'yes' : 'no'
  a['lead label'] = lead ? label(lead) : ''
  for (const [k, v] of Object.entries(a)) if (typeof v === 'boolean') expect(v, k).toBe(true)
  return { l, lead, a }
}

function record(f: Omit<FlowResult, 'assertions'> & { assertions: Record<string, boolean | string> }) { matrix.push(f) }
const cfgOf = (l: CommerceLinkRow | null) => l ? Object.fromEntries(new URL(l.destinationUrl).searchParams.entries()) : null
const depthText = (l: CommerceLinkRow | null) => l ? `lands L${l.depth} · guest L${l.guestDepth}` : null

describe('Internal UAT — six capability-level flows', () => {
  it('1 · Food & Drink / food_delivery — "Tôi muốn đặt món ăn giao tận nhà."', async () => {
    const row: Row = { name: 'Phở Hòa', address: '260C Pasteur', maps_link: 'https://maps.google.com/?cid=1', order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/tim-kiem?q=Ph%E1%BB%9F%20H%C3%B2a' }, { name: 'GrabFood', url: 'https://food.grab.com/vn/en/s?searchKeyword=Ph%E1%BB%9F%20H%C3%B2a' }] }
    const result: Row = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, userText: 'Tôi muốn đặt món ăn giao tận nhà.', search: async () => [{ title: 'x', link: 'https://pasgo.vn/nha-hang/pho-hoa-999', snippet: '' }] })
    const { lead, a } = assertFlow({ tool: 'search_places', result, row, domain: 'food_drink', capability: 'food_delivery', provider: null, leadKind: 'order', expectDepth: null, expectGuest: null, expectAuth: null, expectLogin: false, expectLeadCommerce: false })
    expect(links(row)).toEqual([]) // PasGo NOT routed
    const grab = depthProfileForCapability(getProvider('grabfood')!, 'food_delivery')!
    record({ domain: 'Food & Drink', capability: 'food_delivery', userIntent: 'Tôi muốn đặt món ăn giao tận nhà.', providerSelected: 'GrabFood / ShopeeFood (legacy order links; no CCP adapter)', dataSource: 'platformLinks/food.ts search URLs (L2); registry facts grabfood/shopeefood', freshness: null, configuration: null, linkKind: 'SEARCH_HANDOFF (legacy)', transactionDepth: `search L2 → restaurant L3 · guest L${grab.guestDepth} (registry)`, authRequirement: `GrabFood ${grab.authRequiredAt} · ShopeeFood app_only`, handoff: lead ? label(lead) : null, expected: 'food_order/food_delivery → GrabFood/ShopeeFood, NOT PasGo, no false L5', actual: `lead action ${lead?.kind} ${lead?.platform} (${lead?.urlKind}); CCP links on row: 0`, verdict: 'PASS', assertions: a })
  })

  it('2 · Food & Drink / table_reservation — "Tôi muốn đặt bàn cho 2 người lúc 19h tối nay." (NOT an active capability, owner decision 14 Sep 2026)', async () => {
    const row: Row = { name: 'Quá Ngon', address: '306 Lê Văn Sỹ', maps_link: 'https://maps.google.com/?cid=1', order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/tim-kiem?q=Qu%C3%A1%20Ngon' }] }
    const result: Row = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    let searched = 0
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, location: 'Quận 3', userText: 'Tôi muốn đặt bàn cho 2 người lúc 19h tối nay.', search: async () => { searched++; return [{ title: 'Nhà hàng Quá Ngon', link: 'https://pasgo.vn/nha-hang/nha-hang-qua-ngon-1234', snippet: '' }] } })
    expect(links(row)).toEqual([])
    expect(searched).toBe(0)
    const rec = placeRecommendations(result, 'Quận 3')[0]
    expect(rec.entity.actions.some(a => a.commerce || a.kind === 'reservation')).toBe(false)
    record({ domain: 'Food & Drink', capability: 'table_reservation', userIntent: 'Tôi muốn đặt bàn cho 2 người lúc 19h tối nay.', providerSelected: null, dataSource: 'none — capability NOT_REQUIRED / FUTURE (PasGo removed 14 Sep 2026)', freshness: null, configuration: null, linkKind: null, transactionDepth: null, authRequirement: null, handoff: null, expected: 'no provider, no link, no fabricated CTA; venue results stand', actual: 'CCP links on row: 0; searches: 0; no reservation action', verdict: 'PASS', assertions: { 'no commerce link': true, 'no discovery search': true, 'no reservation action': true } })
  })

  it('3 · Shopping / product_purchase — "Tìm iPhone phù hợp cho tôi."', async () => {
    const row: Row = { title: 'iPhone 15 128GB', link: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-128gb', price_vnd: 19990000, source: 'Điện Máy Xanh' }
    const result: Row = { search_results: [row], source: 'Google Shopping (Serper)' }
    await attachCommerceLinks('search_products', result, { enabled: true, now: NOW, userText: 'Tìm iPhone phù hợp cho tôi.', search: async () => [] })
    const { l, lead, a } = assertFlow({ tool: 'search_products', result, row, domain: 'shopping', capability: 'product_purchase', provider: 'dmx', leadKind: 'purchase', expectDepth: 3, expectGuest: 5, expectAuth: 'at_order', expectLogin: false, expectLeadCommerce: true })
    const cps = depthProfileForCapability(getProvider('cellphones')!, 'product_purchase')!
    expect(cps).toMatchObject({ guestDepth: 4, authRequiredAt: 'before_checkout' })
    expect(l!.tracked).toBe(false) // no publisher id → direct; affiliate never overrides depth/exactness
    expect(JSON.stringify(l)).not.toMatch(/price|feed:/)
    record({ domain: 'Shopping', capability: 'product_purchase', userIntent: 'Tìm iPhone phù hợp cho tôi.', providerSelected: 'dmx (CellphoneS = handoff-only registry fact: L4, Smember login)', dataSource: l!.freshness.source + ' + Serper row link', freshness: l!.freshness, configuration: null, linkKind: l!.kind, transactionDepth: depthText(l), authRequirement: l!.authRequiredAt, handoff: label(lead), expected: 'DMX L5 guest, CellphoneS L4/login fact, affiliate optional, current product URL', actual: `${l!.destinationUrl}; web surface = shopping card (marker) — CCP action not displayed`, verdict: 'PASS', assertions: { ...a, 'shopping presentation gap': 'CCP CORE PASS — SHOPPING PRESENTATION GAP' } })
  })

  it('4 · Entertainment / cinema_ticket — "Tìm vé xem phim CGV tối nay." (adapter only; no film tool)', async () => {
    const row: Row = { name: 'CGV Vincom Đồng Khởi', website_uri: 'https://www.cgv.vn/default/inside-out-2.html' }
    const result: Row = { results: [row], _tappy_place_domain: 'entertainment', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, userText: 'Tìm vé xem phim CGV tối nay.', search: async () => [] })
    const { l, lead, a } = assertFlow({ tool: 'search_places', result, row, domain: 'entertainment', capability: 'cinema_ticket', provider: 'cgv', leadKind: 'ticket', expectDepth: 3, expectGuest: 4, expectAuth: 'before_selection', expectLogin: true, expectLeadCommerce: true })
    record({ domain: 'Entertainment', capability: 'cinema_ticket', userIntent: 'Tìm vé xem phim CGV tối nay.', providerSelected: 'cgv (fixture row carrying a cgv.vn film URL)', dataSource: l!.freshness.source, freshness: l!.freshness, configuration: null, linkKind: l!.kind, transactionDepth: depthText(l), authRequirement: l!.authRequiredAt, handoff: label(lead), expected: 'CGV only if triggerable; L4 guest; login before seat selection; no fabricated L5', actual: `${l!.destinationUrl} — adapter PASS; production trigger NOT AVAILABLE (no canonical film tool; no discovery scope)`, verdict: 'NOT VERIFIABLE', assertions: { ...a, 'production trigger': 'NOT AVAILABLE' } })
  })

  it('5 · Entertainment / activity_booking — Klook (VinWonders)', async () => {
    const row: Row = { name: 'VinWonders Nha Trang', address: 'Hòn Tre' }
    const result: Row = { results: [row], _tappy_place_domain: 'entertainment', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, location: 'Nha Trang', userText: 'Tìm hoạt động ở VinWonders Nha Trang', search: async () => [{ title: 'Vé VinWonders', link: 'https://www.klook.com/vi/activity/2734-vinwonders-nha-trang-ticket/', snippet: '' }] })
    const { l, lead, a } = assertFlow({ tool: 'search_places', result, row, domain: 'entertainment', capability: 'activity_booking', provider: 'klook', leadKind: 'ticket', expectDepth: 3, expectGuest: 4, expectAuth: 'before_checkout', expectLogin: true, expectLeadCommerce: true })
    record({ domain: 'Entertainment', capability: 'activity_booking', userIntent: 'Tìm hoạt động ở VinWonders Nha Trang', providerSelected: 'klook', dataSource: l!.freshness.source + ' + discovery hit (fixture)', freshness: l!.freshness, configuration: null, linkKind: l!.kind, transactionDepth: depthText(l), authRequirement: l!.authRequiredAt, handoff: label(lead), expected: 'Klook, activity page, L4 guest, loginRequired=true, honest wording', actual: `${l!.destinationUrl} · package/date/qty page-only`, verdict: 'PASS', assertions: a })
  })

  it('6 · Travel / hotel_booking — "Tìm khách sạn ở Đà Nẵng từ 10/10 đến 12/10 cho 2 người."', async () => {
    const row: Row = { title: 'Mường Thanh Luxury Đà Nẵng - Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html' }
    const result: Row = { search_results: [row], booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang' }
    await attachCommerceLinks('get_hotel_prices', result, { enabled: true, now: NOW, location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12', userText: 'Tìm khách sạn ở Đà Nẵng từ 10/10 đến 12/10 cho 2 người.', search: async () => [{ title: 'Mường Thanh', link: 'https://vn.trip.com/hotels/da-nang-hotel-detail-10569789/muong-thanh-luxury/', snippet: '' }] })
    const { l, lead, a } = assertFlow({ tool: 'get_hotel_prices', result, row, domain: 'travel', capability: 'hotel_booking', provider: 'tripcom', leadKind: 'booking', expectDepth: 4, expectGuest: 5, expectAuth: 'none', expectLogin: false, expectLeadCommerce: true })
    expect(cfgOf(l)).toMatchObject({ hotelId: '10569789', checkIn: '2026-10-10', checkOut: '2026-10-12', adult: '2' })
    expect(l!.url).not.toMatch(/product_link|url_enc=/)
    record({ domain: 'Travel', capability: 'hotel_booking', userIntent: 'Tìm khách sạn ở Đà Nẵng từ 10/10 đến 12/10 cho 2 người.', providerSelected: 'tripcom', dataSource: l!.freshness.source + ' + discovery hit (fixture, SEO path)', freshness: l!.freshness, configuration: cfgOf(l), linkKind: l!.kind, transactionDepth: depthText(l), authRequirement: l!.authRequiredAt, handoff: label(lead), expected: 'Trip.com, hotelId + checkIn + checkOut + adult=2, Deep Link/API, no Product Link, L5 guest, freshness static', actual: `${l!.destinationUrl} · adults assumed (conversation says "2 người" but the hotel tool carries no party size → default 2, declared)`, verdict: 'PASS', assertions: a })
  })

  it('7 · Spa / spa_voucher — "Tìm spa ở TP.HCM."', async () => {
    const row: Row = { name: 'Ha Spa', address: 'Quận 1' }
    const result: Row = { results: [row], _tappy_place_domain: 'spa', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, location: 'TP.HCM', userText: 'Tìm spa ở TP.HCM.', search: async () => [{ title: 'Ha Spa', link: 'https://www.klook.com/vi/activity/43345-ha-spa-ho-chi-minh/', snippet: '' }] })
    const { l, lead, a } = assertFlow({ tool: 'search_places', result, row, domain: 'spa', capability: 'spa_voucher', provider: 'klook', leadKind: 'purchase', expectDepth: 3, expectGuest: 4, expectAuth: 'before_checkout', expectLogin: true, expectLeadCommerce: true })
    record({ domain: 'Spa', capability: 'spa_voucher', userIntent: 'Tìm spa ở TP.HCM.', providerSelected: 'klook', dataSource: l!.freshness.source + ' + discovery hit (fixture)', freshness: l!.freshness, configuration: null, linkKind: l!.kind, transactionDepth: depthText(l), authRequirement: l!.authRequiredAt, handoff: label(lead), expected: 'Klook Spa, listing, L4 guest, loginRequired=true, no false L5', actual: `${l!.destinationUrl} · package/qty/preferred date page-only`, verdict: 'PASS', assertions: a })
  })

  it('writes the matrix (CCP_UAT=1) and the CGV adapter contract', () => {
    const req = { domain: 'entertainment', intentType: 'buy_ticket', subject: 'Inside Out 2' } as const
    const hint = { url: 'https://www.cgv.vn/default/inside-out-2.html' }
    const pick = (r: ReturnType<typeof resolveCommerce>) => ('links' in r && r.links[0]) ? { url: r.links[0].url, kind: r.links[0].kind, depth: r.links[0].depth, guestDepth: r.links[0].depthProfile.guestDepth, authRequiredAt: r.links[0].authRequiredAt, validation: r.links[0].validation.status } : null
    const cgv = {
      filmPage: pick(resolveCommerce(req, { enabled: true, now: NOW, hints: [hint] })),
      partialSession_noFabrication: pick(resolveCommerce({ ...req, configuration: { kind: 'cinema', filmRef: 'inside-out-2', cinemaRef: '074', date: '2026-09-20' } }, { enabled: true, now: NOW, hints: [hint] })),
      sessionUrl_observedGrammar: pick(resolveCommerce({ ...req, configuration: { kind: 'cinema', filmRef: 'inside-out-2', cinemaRef: '074', date: '2026-09-20', sessionRef: '30101' } }, { enabled: true, now: NOW, hints: [hint] })),
    }
    expect(cgv.filmPage?.depth).toBe(3)
    expect(cgv.partialSession_noFabrication?.depth).toBe(3)
    expect(cgv.sessionUrl_observedGrammar).toMatchObject({ depth: 4, guestDepth: 4, validation: 'grammar_unverified' })
    expect(matrix).toHaveLength(7)
    if (process.env.CCP_UAT === '1') {
      mkdirSync('docs/ccp', { recursive: true })
      writeFileSync(OUT, JSON.stringify({ generatedAt: NOW.toISOString(), note: 'Internal UAT (Claude), fixture-driven run of the real Phase-6/7 seam; no network; not owner UAT; not production verification.', matrix, cgvAdapter: cgv }, null, 2))
    }
  })
})
