import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { attachCommerceLinks } from '../commerce'
import { COMMERCE_LINKS_KEY, setCommerceEventWriter, resolveCommerce, type CommerceLinkRow } from '@/lib/ccp'
import { installCommerceObservability, __resetCommerceObservability } from '@/lib/ccp/events/observabilityBridge'
import { cgvAdapter } from '@/lib/ccp/adapters/cgv'
import { splitToolResult } from '@/lib/ai/toolResultSplit'
import { placeRecommendations, productRecommendations, stayRecommendations } from '@/lib/recommendation/fromToolResult'
import { buildPlacesLiveView } from '@/lib/recommendation/liveView'
import { resolveActionLabel } from '@/lib/recommendation/actionLabel'
import { vi as VI } from '@/lib/i18n/w5/placeDecision'
import type { ObservabilityEvent } from '@/lib/observability'

// ── Production-verification evidence (owner instruction 13 Sep 2026) ────────
//
// Runs the five owner intents through the REAL Phase-6 seam with the platform
// enabled via the test seam, discovery answered by fixtures shaped like the
// merchant URLs the transaction-depth audit recorded, and writes the concrete
// outcome (link, kind, depth, params, freshness, events, model view, card) to
// verification-evidence.json for the checklist. Nothing here reaches a
// network, a merchant or a payment step. Gated behind CCP_VERIFY=1 so it is
// not part of the regular gate.

const NOW = new Date('2026-09-13T10:00:00Z')
const OUT = 'docs/ccp/verification-evidence.json'
const run = process.env.CCP_VERIFY === '1' ? describe : describe.skip

type Row = Record<string, unknown>
const links = (row: Row) => (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[] | undefined) ?? []
const label = (a: { kind: never; urlKind: never; url: string; platform?: string; commerce?: unknown }) => {
  const r = resolveActionLabel(a as never)
  const s = VI[r.key] ?? r.key
  return r.params ? s.replace('{platform}', r.params.platform) : s
}

const evidence: Record<string, unknown> = {}
let events: ObservabilityEvent[] = []
beforeEach(() => { events = []; installCommerceObservability(e => events.push(e)) })
afterEach(() => { __resetCommerceObservability(); setCommerceEventWriter(null) })

function summarise(row: Row, tool: 'search_products' | 'get_hotel_prices' | 'search_places', result: Row) {
  const l = links(row)[0]
  const { model } = splitToolResult(tool, result)
  const modelJson = JSON.stringify(model)
  const recs = tool === 'search_products' ? productRecommendations(result) : tool === 'get_hotel_prices' ? stayRecommendations(result) : placeRecommendations(result, 'x')
  const action = recs[0]?.entity.actions[0]
  const view = buildPlacesLiveView(recs, {})
  const u = l ? new URL(l.url) : null
  return {
    provider: l?.providerId ?? null,
    intentType: l?.intentType ?? null,
    dataSource: l?.freshness.source ?? null,
    freshness: l?.freshness ?? null,
    url: l?.url ?? null,
    host: u?.hostname ?? null,
    path: u?.pathname ?? null,
    params: u ? Object.fromEntries(u.searchParams.entries()) : null,
    kind: l?.kind ?? null,
    depthLanding: l?.depth ?? null,
    guestDepth: l?.guestDepth ?? null,
    authRequiredAt: l?.authRequiredAt ?? null,
    expiresAt: l?.expiresAt ?? null,
    assumedParams: l?.assumedParams ?? null,
    tracked: l?.tracked ?? null,
    limitations: l?.limitations ?? null,
    action: action ? { kind: action.kind, urlKind: action.urlKind, platform: action.platform, priority: action.priority, loginRequired: action.commerce?.loginRequired ?? null, label: label(action as never) } : null,
    cardRendersIt: !!view && view.items[0]?.actions[0]?.url === l?.url,
    cardChannel: view ? 'places live view (web annotation)' : 'none (product lead → shopping card)',
    modelSeesMerchantUrl: l ? modelJson.includes(l.url) || modelJson.includes(u!.hostname) : null,
    modelSeesCapability: modelJson.includes('"has_direct_handoff":true'),
    events: events.map(e => e.type),
    eventPayloadHasUrl: events.some(e => /https?:\/\//.test(JSON.stringify(e))),
  }
}

run('CCP production-verification evidence', () => {
  it('A · Trip.com — "hotel in Da Nang, 2 adults, 10/10 → 12/10/2026"', async () => {
    const row: Row = { title: 'Mường Thanh Luxury Đà Nẵng - Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html' }
    const result: Row = { search_results: [row], booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang' }
    await attachCommerceLinks('get_hotel_prices', result, {
      enabled: true, now: NOW, location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12', platform: 'web', locale: 'vi',
      search: async () => [{ title: 'Mường Thanh Luxury Đà Nẵng', link: 'https://vn.trip.com/hotels/da-nang-hotel-detail-10569789/muong-thanh-luxury-da-nang/', snippet: '' }],
    })
    evidence.tripcom = summarise(row, 'get_hotel_prices', result)
    expect(links(row)[0]).toBeTruthy()
  })

  it('B · PasGo — "restaurant for 2 at 19:00" (chat path: no reservation configuration is built)', async () => {
    const row: Row = { name: 'Quá Ngon', address: '306 Lê Văn Sỹ', maps_link: 'https://maps.google.com/?cid=1' }
    const result: Row = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, {
      enabled: true, now: NOW, location: 'Quận 3', platform: 'web', locale: 'vi',
      search: async () => [{ title: 'Nhà hàng Quá Ngon', link: 'https://pasgo.vn/nha-hang/nha-hang-qua-ngon-le-van-sy-1234', snippet: '' }],
    })
    evidence.pasgo_chat = summarise(row, 'search_places', result)
    // The L5 hold grammar, as the adapter builds it WHEN a configuration exists (not reachable from chat today).
    const configured = resolveCommerce(
      { domain: 'food_drink', intentType: 'reserve_table', subject: 'Quá Ngon', configuration: { kind: 'reservation', restaurantRef: '1234', date: '2026-09-20', time: '19:00', adults: 2 } },
      { enabled: true, now: NOW, hints: [{ url: 'https://pasgo.vn/nha-hang/nha-hang-qua-ngon-le-van-sy-1234' }] },
    )
    const l = 'links' in configured ? configured.links[0] : null
    evidence.pasgo_configured = l ? { url: l.url, params: Object.fromEntries(new URL(l.url).searchParams.entries()), kind: l.kind, depth: l.depth, guestDepth: l.depthProfile.guestDepth, authRequiredAt: l.authRequiredAt, expiresAt: l.expiresAt, limitations: l.limitations } : null
    expect(l?.depth).toBe(5)
  })

  it('C · Klook Entertainment — "VinWonders activity"', async () => {
    const row: Row = { name: 'VinWonders Nha Trang', address: 'Hòn Tre' }
    const result: Row = { results: [row], _tappy_place_domain: 'entertainment', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, {
      enabled: true, now: NOW, location: 'Nha Trang', platform: 'web', locale: 'vi',
      search: async () => [{ title: 'Vé VinWonders Nha Trang', link: 'https://www.klook.com/vi/activity/2734-vinwonders-nha-trang-ticket/', snippet: '' }],
    })
    evidence.klook_entertainment = summarise(row, 'search_places', result)
    expect(links(row)[0]?.providerId).toBe('klook')
  })

  it('D · Klook Spa — "spa in HCMC"', async () => {
    const row: Row = { name: 'Ha Spa', address: 'Quận 1' }
    const result: Row = { results: [row], _tappy_place_domain: 'spa', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, {
      enabled: true, now: NOW, location: 'TP.HCM', platform: 'web', locale: 'vi',
      search: async () => [{ title: 'Ha Spa voucher', link: 'https://www.klook.com/vi/activity/43345-ha-spa-ho-chi-minh/', snippet: '' }],
    })
    evidence.klook_spa = summarise(row, 'search_places', result)
    expect(links(row)[0]?.intentType).toBe('buy_spa_voucher')
  })

  it('E · DMX — "iPhone"', async () => {
    const row: Row = { title: 'iPhone 15 128GB', link: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-128gb', price_vnd: 19990000, source: 'Điện Máy Xanh' }
    const result: Row = { search_results: [row], source: 'Google Shopping (Serper)' }
    await attachCommerceLinks('search_products', result, { enabled: true, now: NOW, platform: 'web', locale: 'vi', search: async () => [] })
    evidence.dmx = summarise(row, 'search_products', result)
    expect(links(row)[0]?.guestDepth).toBe(5)
  })

  it('F · CGV — adapter contract only (no canonical film tool)', () => {
    const req = { domain: 'entertainment', intentType: 'buy_ticket', subject: 'Inside Out 2' } as const
    const film = resolveCommerce(req, { enabled: true, now: NOW, hints: [{ url: 'https://www.cgv.vn/default/inside-out-2.html' }] })
    const partial = resolveCommerce({ ...req, configuration: { kind: 'cinema', filmRef: 'inside-out-2', cinemaRef: '074', date: '2026-09-20' } }, { enabled: true, now: NOW, hints: [{ url: 'https://www.cgv.vn/default/inside-out-2.html' }] })
    const session = resolveCommerce({ ...req, configuration: { kind: 'cinema', filmRef: 'inside-out-2', cinemaRef: '074', date: '2026-09-20', sessionRef: '30101' } }, { enabled: true, now: NOW, hints: [{ url: 'https://www.cgv.vn/default/inside-out-2.html' }] })
    const pick = (r: ReturnType<typeof resolveCommerce>) => ('links' in r && r.links[0]) ? { url: r.links[0].url, kind: r.links[0].kind, depth: r.links[0].depth, guestDepth: r.links[0].depthProfile.guestDepth, authRequiredAt: r.links[0].authRequiredAt, validation: r.links[0].validation.status, limitations: r.links[0].limitations } : null
    evidence.cgv = { filmPage: pick(film), partialSession_noFabrication: pick(partial), sessionUrl_observedGrammar: pick(session), adapterSupports: cgvAdapter.supports(req) }
    expect(evidence.cgv).toMatchObject({ filmPage: { depth: 3 }, partialSession_noFabrication: { depth: 3 }, sessionUrl_observedGrammar: { depth: 4, validation: 'grammar_unverified' } })
  })

  it('writes the evidence file', () => {
    mkdirSync('docs/ccp', { recursive: true })
    writeFileSync(OUT, JSON.stringify({ generatedAt: NOW.toISOString(), note: 'Fixture-driven run of the real Phase-6 seam; discovery answered by fixtures; no network.', ...evidence }, null, 2))
    expect(Object.keys(evidence).length).toBe(7)
  })
})
