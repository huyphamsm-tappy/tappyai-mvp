import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { commerceActorHash } from '@/lib/ccp/tracking/attribution'
import { wrapWithAccesstrade } from '@/lib/ccp/tracking/accesstrade'
import { getProvider, PROVIDER_REGISTRY } from '@/lib/ccp/registry'
import { setProviderConfigSource, refreshProviderConfig, effectiveTracking, overrideFromRow, __resetProviderConfig, type ProviderOverride } from '@/lib/ccp/registry/runtime'
import { setCommerceEventWriter } from '@/lib/ccp/events/sink'
import { attachCommerceLinks } from './commerce'
import { COMMERCE_LINKS_KEY, type CommerceLinkRow } from '@/lib/ccp'

// ─────────────────────────────────────────────────────────────────────────────
// 27 Sep 2026 — THE MONEY PATH, as verified live in the ACCESSTRADE portal.
//
//   recommendation row → CCP → go.isclix.com/deep_link/<publisher>/<campaign>?url=…&sub1=<hash>
//
// Portal facts pinned here (docs/commerce/AFFILIATE_STATUS.md):
//   · the portal's own Deep Link tool emits exactly `/deep_link/<publisher>/<campaign>?url=<enc>` —
//     the format tracking/accesstrade.ts builds;
//   · Lazada / Vexere / Traveloka / Vietnam Airlines are APPROVED and now carry campaign rows;
//   · TikTok Shop credits ONLY product-feed links, so a Deep Link must never be emitted for it;
//   · sub1 is a keyed hash of the verified identity — never the id, never PII.
// ─────────────────────────────────────────────────────────────────────────────

const PUB = '6277265300509373567'
const SECRET = 'x'.repeat(48)
const USER = '550e8400-e29b-41d4-a716-446655440000'

describe('sub1 attribution id', () => {
  it('is a 24-hex keyed hash of the identity: deterministic, never the raw id, domain-separated', () => {
    const env = { CCP_ATTRIBUTION_SECRET: SECRET } as unknown as NodeJS.ProcessEnv
    const h = commerceActorHash(USER, env)!
    expect(h).toMatch(/^[a-f0-9]{24}$/)
    expect(commerceActorHash(USER, env)).toBe(h)
    expect(h).not.toContain(USER.replace(/-/g, '').slice(0, 8))
    expect(commerceActorHash('another-user-0001', env)).not.toBe(h)
    expect(commerceActorHash(USER, { CCP_ATTRIBUTION_SECRET: 'y'.repeat(48) } as unknown as NodeJS.ProcessEnv)).not.toBe(h)
  })

  it('fails closed on privacy: no secret, a short secret, no identity or a non-id value ⇒ no attribution id', () => {
    expect(commerceActorHash(USER, {} as unknown as NodeJS.ProcessEnv)).toBeUndefined()
    expect(commerceActorHash(USER, { CCP_ATTRIBUTION_SECRET: 'short' } as unknown as NodeJS.ProcessEnv)).toBeUndefined()
    const env = { CCP_ATTRIBUTION_SECRET: SECRET } as unknown as NodeJS.ProcessEnv
    expect(commerceActorHash(null, env)).toBeUndefined()
    expect(commerceActorHash('', env)).toBeUndefined()
    expect(commerceActorHash('user@example.com', env)).toBeUndefined()
    expect(commerceActorHash('Nguyễn Văn A', env)).toBeUndefined()
  })
})

describe('TikTok Shop: the campaign does not credit a Deep Link — never emitted', () => {
  const saved = process.env.ACCESSTRADE_PUBLISHER_ID
  beforeEach(() => { process.env.ACCESSTRADE_PUBLISHER_ID = PUB; __resetProviderConfig() })
  afterEach(() => { if (saved === undefined) delete process.env.ACCESSTRADE_PUBLISHER_ID; else process.env.ACCESSTRADE_PUBLISHER_ID = saved; setProviderConfigSource(null); vi.restoreAllMocks() })

  it('the wrapper refuses it even though the campaign is approved', () => {
    const tiktok = getProvider('tiktokshop')!.tracking!
    expect(tiktok.approval).toBe('approved')
    const r = wrapWithAccesstrade({ directUrl: 'https://shop.tiktok.com/vn/pdp/ao-thun/1729384756', tracking: tiktok })
    expect(r).toMatchObject({ ok: false, reason: 'unsafe_wrapper' })
  })

  it('a runtime row that enables the deeplink cannot override the fact', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const row: ProviderOverride = { providerId: 'tiktokshop', active: true, deeplinkEnabled: true, tier: 1, network: 'accesstrade', campaignId: '6648523843406889655', wrapperTemplate: null, updatedAt: '2026-09-27' }
    setProviderConfigSource({ async load() { return [row] } })
    await refreshProviderConfig({ force: true })
    expect(effectiveTracking(getProvider('tiktokshop')!)).toBeUndefined()
  })
})

// The 27 Sep migration, read the way the app reads the table: every enabled row wraps through the
// Deep Link with its own campaign; pending / disabled rows emit direct links.
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
  // DMX: the 20 Sep prod pack switched it off (owner decision) — mirror that state.
  table.get('dmx')!.active = false
  return [...table.values()].map(r => overrideFromRow(r)!)
}

describe('the 27 Sep portal-state migration', () => {
  const saved = process.env.ACCESSTRADE_PUBLISHER_ID
  beforeEach(() => { process.env.ACCESSTRADE_PUBLISHER_ID = PUB; __resetProviderConfig() })
  afterEach(() => { if (saved === undefined) delete process.env.ACCESSTRADE_PUBLISHER_ID; else process.env.ACCESSTRADE_PUBLISHER_ID = saved; setProviderConfigSource(null) })

  it('exactly the seven portal-approved, deep-link-credited campaigns are Tier 1, each with its own campaign id', async () => {
    const rows = rowsAfterMigration()
    setProviderConfigSource({ async load() { return rows } })
    await refreshProviderConfig({ force: true })
    const expected: Record<string, string> = {
      cellphones: '6259155740535091857', klook: '4704521809526929067', lazada: '5087153089503673507', traveloka: '6654251588167732819',
      tripcom: '6455552313033835511', vexere: '5222734619328835827', vietnamairlines: '6318680441596031865',
    }
    const tracked = PROVIDER_REGISTRY.filter(p => effectiveTracking(p) !== undefined).map(p => p.providerId).sort()
    expect(tracked).toEqual(Object.keys(expected).sort())
    for (const [id, campaign] of Object.entries(expected)) expect(effectiveTracking(getProvider(id)!)).toMatchObject({ network: 'accesstrade', campaignId: campaign, approval: 'approved' })
    for (const id of ['shopee', 'dmx', 'tiktokshop', 'agoda', 'booking', 'grabfood', 'shopeefood']) expect(effectiveTracking(getProvider(id)!), id).toBeUndefined()
  })
})

describe('recommendation → CommerceLink → tracked ACCESSTRADE URL carrying sub1', () => {
  const saved = process.env.ACCESSTRADE_PUBLISHER_ID
  beforeEach(() => { process.env.ACCESSTRADE_PUBLISHER_ID = PUB; __resetProviderConfig(); setCommerceEventWriter(() => undefined) })
  afterEach(() => { if (saved === undefined) delete process.env.ACCESSTRADE_PUBLISHER_ID; else process.env.ACCESSTRADE_PUBLISHER_ID = saved; setProviderConfigSource(null); setCommerceEventWriter(null) })

  it('a hotel row gets a go.isclix.com Deep Link for the Trip.com campaign, the exact dated URL inside, and sub1 = the actor hash', async () => {
    setProviderConfigSource({ async load() { return rowsAfterMigration() } })
    const actorHash = commerceActorHash(USER, { CCP_ATTRIBUTION_SECRET: SECRET } as unknown as NodeJS.ProcessEnv)!
    const row = { title: 'Mường Thanh Luxury Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html', snippet: '' }
    const search = async (q: string) => q.includes('site:vn.trip.com/hotels') ? [{ title: 'Mường Thanh Luxury Đà Nẵng', link: 'https://vn.trip.com/hotels/da-nang-hotel-detail-10569789/muong-thanh-luxury/', snippet: '' }] : []
    await attachCommerceLinks('get_hotel_prices', { search_results: [row] }, { enabled: true, search, now: new Date('2026-09-27T08:00:00Z'), location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12', actorHash })
    const l = ((row as Record<string, unknown>)[COMMERCE_LINKS_KEY] as CommerceLinkRow[]).find(x => x.providerId === 'tripcom')!
    expect(l.tracked).toBe(true)
    const u = new URL(l.url)
    expect(u.hostname).toBe('go.isclix.com')
    expect(u.pathname).toBe(`/deep_link/${PUB}/6455552313033835511`)
    expect(u.searchParams.get('sub1')).toBeNull() // Phương án C: no fixed sub1 in the deep link
    expect(u.searchParams.get('utm_source')).toBe('tappyai')
    const dest = new URL(u.searchParams.get('url')!)
    expect(dest.hostname).toBe('vn.trip.com')
    expect(dest.searchParams.get('hotelId')).toBe('10569789')
    expect(dest.searchParams.get('checkIn')).toBe('2026-10-10')
    expect(l.destinationUrl).toBe(u.searchParams.get('url'))
    expect(l.url).not.toContain(USER)
  })

  it('without a publisher id the same row is DIRECT — never a half-built wrapper', async () => {
    delete process.env.ACCESSTRADE_PUBLISHER_ID
    setProviderConfigSource({ async load() { return rowsAfterMigration() } })
    const row = { title: 'Mường Thanh Luxury Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html', snippet: '' }
    const search = async (q: string) => q.includes('site:vn.trip.com/hotels') ? [{ title: 'Mường Thanh Luxury Đà Nẵng', link: 'https://vn.trip.com/hotels/da-nang-hotel-detail-10569789/muong-thanh-luxury/', snippet: '' }] : []
    await attachCommerceLinks('get_hotel_prices', { search_results: [row] }, { enabled: true, search, now: new Date('2026-09-27T08:00:00Z'), location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12', actorHash: 'a'.repeat(24) })
    const l = ((row as Record<string, unknown>)[COMMERCE_LINKS_KEY] as CommerceLinkRow[]).find(x => x.providerId === 'tripcom')!
    expect(l.tracked).toBe(false)
    expect(new URL(l.url).hostname).toBe('vn.trip.com')
  })
})

describe('a memoised tool result shared by two users never keeps the other identity sub1', () => {
  const saved = process.env.ACCESSTRADE_PUBLISHER_ID
  beforeEach(() => { process.env.ACCESSTRADE_PUBLISHER_ID = PUB; __resetProviderConfig(); setCommerceEventWriter(() => undefined) })
  afterEach(() => { if (saved === undefined) delete process.env.ACCESSTRADE_PUBLISHER_ID; else process.env.ACCESSTRADE_PUBLISHER_ID = saved; setProviderConfigSource(null); setCommerceEventWriter(null) })

  it('user B re-attaching on the row user A decorated gets only B-attributed links', async () => {
    setProviderConfigSource({ async load() { return rowsAfterMigration() } })
    const row: Record<string, unknown> = { title: 'Mường Thanh Luxury Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html', snippet: '' }
    const shared = { search_results: [row] }
    const search = async (q: string) => q.includes('site:vn.trip.com/hotels') ? [{ title: 'Mường Thanh Luxury Đà Nẵng', link: 'https://vn.trip.com/hotels/da-nang-hotel-detail-10569789/muong-thanh-luxury/', snippet: '' }] : []
    const base = { enabled: true, search, now: new Date('2026-09-27T08:00:00Z'), location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12' }
    const a = 'a'.repeat(24), b = 'b'.repeat(24)
    // Phương án C: the per-caller marker is the click link's `h`; the identity rides sealed in `a`.
    process.env.CCP_ATTRIBUTION_SECRET = 'test-secret-for-click-links-000000000000'
    const { sealIdentity, linkActorMarker } = await import('@/lib/ccp/tracking/clickLink')
    const sealA = sealIdentity('11111111-1111-4111-8111-111111111111')!, sealB = sealIdentity('22222222-2222-4222-8222-222222222222')!
    await attachCommerceLinks('get_hotel_prices', shared, { ...base, actorHash: a, actorSeal: sealA })
    // Simulate B's turn meeting A's attachment mid-flight: A's links are on the row when B writes.
    const aLinks = [...(row[COMMERCE_LINKS_KEY] as CommerceLinkRow[])]
    await attachCommerceLinks('get_hotel_prices', shared, { ...base, actorHash: b, actorSeal: sealB })
    row[COMMERCE_LINKS_KEY] = [...aLinks, ...((row[COMMERCE_LINKS_KEY] as CommerceLinkRow[]) ?? [])]
    await attachCommerceLinks('get_hotel_prices', shared, { ...base, actorHash: b, actorSeal: sealB })
    const subs = (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[]).filter(l => l.tracked).map(l => linkActorMarker(l.url))
    delete process.env.CCP_ATTRIBUTION_SECRET
    expect(subs.length).toBeGreaterThan(0)
    expect(new Set(subs)).toEqual(new Set([b]))
  })
})

// Review of PR #255 (27 Sep 2026): with an attribution id, a DIRECT link an earlier intent put on the
// row (CGV's film page, no sub1) was dropped when the next intent (Klook) wrote — a direct link
// carries no identity, so it belongs to every caller.
describe('an attributed turn keeps the direct links of every intent', () => {
  beforeEach(() => { __resetProviderConfig(); setCommerceEventWriter(() => undefined) })
  afterEach(() => { setProviderConfigSource(null); setCommerceEventWriter(null) })

  it('cinema row: the CGV film page (buy_ticket) survives the Klook pass (book_activity), with or without actorHash', async () => {
    const search = async (q: string) => q.includes('site:klook.com') ? [{ title: 'CGV Vincom Đồng Khởi', link: 'https://www.klook.com/vi/activity/12345-cgv-vincom-dong-khoi/', snippet: '' }] : []
    const run = async (actorHash?: string) => {
      const row: Record<string, unknown> = { name: 'CGV Vincom Đồng Khởi', website_uri: 'https://www.cgv.vn/default/inside-out-2.html' }
      await attachCommerceLinks('search_places', { results: [row], _tappy_place_domain: 'entertainment' }, { enabled: true, search, now: new Date('2026-09-27T08:00:00Z'), ...(actorHash ? { actorHash } : {}) })
      return ((row[COMMERCE_LINKS_KEY] as CommerceLinkRow[] | undefined) ?? []).map(l => l.providerId).sort()
    }
    const anonymous = await run()
    expect(anonymous).toContain('cgv')
    expect(await run('c'.repeat(24))).toEqual(anonymous)
  })
})
