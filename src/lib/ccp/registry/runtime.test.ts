import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { CommerceRequest } from '../domain/types'
import { resolveDeepLink } from '../resolver/resolve'
import { resolveCommerce } from '../index'
import { dmxAdapter } from '../adapters/dmx'
import { tripcomAdapter } from '../adapters/tripcom'
import { setCommerceEventWriter } from '../events/sink'
import { getProvider, monetizationStatus, providerStatus, validateRegistry, PROVIDER_REGISTRY } from './index'
import { setProviderConfigSource, refreshProviderConfig, providerOverride, effectiveTracking, providerTier, isProviderActive, overrideFromRow, PROVIDER_CONFIG_TTL_MS, __resetProviderConfig, type ProviderOverride } from './runtime'

// ─────────────────────────────────────────────────────────────────────────────
// A3.1 — THE REGISTRY IS RUNTIME CONFIG.
//
// The owner flips a provider between Tier 2 (direct handoff) and Tier 1 (deeplink) by editing a
// row in `commerce_providers`; the app reads the table through a 60 s cache and the resolver
// asks the overlay per link. Below: the same request emits a DIRECT link, then — after the row
// changes and the cache turns over, with no restart and no code edit — a TRACKED link; and back.
// A row that enables the deeplink with nothing to wrap with stays direct and is logged; an
// inactive row runs no adapter. The consultative layer contains no per-provider branch: the
// architecture test at the end greps for one.
// ─────────────────────────────────────────────────────────────────────────────

const now = new Date('2026-09-20T10:00:00+07:00')
const dmxReq: CommerceRequest = { domain: 'shopping', intentType: 'buy_product', subject: 'iPhone 15' }
const dmxHint = { url: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb' }
const row = (over: Partial<ProviderOverride> & { providerId: string }): ProviderOverride => ({ active: true, deeplinkEnabled: false, tier: 2, network: null, campaignId: null, wrapperTemplate: null, updatedAt: null, ...over })

function fakeSource(rows: ProviderOverride[]) {
  const state = { rows, loads: 0 }
  setProviderConfigSource({ async load() { state.loads++; return state.rows } })
  return state
}

const dmxLink = () => {
  const offer = dmxAdapter.toOffer(dmxReq, dmxHint, now)!
  const r = resolveDeepLink(dmxAdapter, dmxReq, offer, undefined, { now })
  if (!r.ok) throw new Error(r.reason)
  return r
}

describe('flipping a provider from handoff to deeplink changes the emitted link — no restart', () => {
  const saved = process.env.ACCESSTRADE_PUBLISHER_ID
  beforeEach(() => { process.env.ACCESSTRADE_PUBLISHER_ID = '6277265300509373567'; setCommerceEventWriter(() => {}); __resetProviderConfig() })
  afterEach(() => { if (saved === undefined) delete process.env.ACCESSTRADE_PUBLISHER_ID; else process.env.ACCESSTRADE_PUBLISHER_ID = saved; setCommerceEventWriter(null); setProviderConfigSource(null); vi.restoreAllMocks() })

  it('Tier 2 row → DIRECT; row edited to Tier 1 with the campaign → TRACKED after the cache turns over; back to Tier 2 → DIRECT again', async () => {
    const src = fakeSource([row({ providerId: 'dmx', deeplinkEnabled: false, tier: 2, network: 'accesstrade', campaignId: '5751981382510607935' })])
    await refreshProviderConfig({ now: 0 })
    const direct = dmxLink()
    expect(direct.wrapper).toBe('unavailable') // no tracking config in effect
    expect(new URL(direct.link.url).hostname).toBe('www.dienmayxanh.com')
    expect(direct.link.tracking.mode).toBe('none')
    expect(providerTier(getProvider('dmx')!)).toBe(2)

    // The owner flips the row. Inside the TTL the cache still answers "direct"…
    src.rows = [row({ providerId: 'dmx', deeplinkEnabled: true, tier: 1, network: 'accesstrade', campaignId: '5751981382510607935' })]
    await refreshProviderConfig({ now: PROVIDER_CONFIG_TTL_MS - 1 })
    expect(dmxLink().wrapper).toBe('unavailable')
    // …and once the TTL has passed the next request emits the tracked link.
    await refreshProviderConfig({ now: PROVIDER_CONFIG_TTL_MS + 1 })
    const tracked = dmxLink()
    expect(tracked.wrapper).toBe('applied')
    expect(tracked.link.kind).toBe('AFFILIATE_DEEP_LINK')
    expect(new URL(tracked.link.url).hostname).toBe('go.isclix.com')
    expect(tracked.link.url).toContain('/5751981382510607935?')
    expect(tracked.link.directUrl).toBe(direct.link.url)
    expect(providerTier(getProvider('dmx')!)).toBe(1)
    expect(monetizationStatus(getProvider('dmx')!)).toBe('APPROVED')
    expect(providerStatus(getProvider('dmx')!)).toBe('ACTIVE')

    src.rows = [row({ providerId: 'dmx', deeplinkEnabled: false, tier: 2 })]
    await refreshProviderConfig({ now: 2 * PROVIDER_CONFIG_TTL_MS + 2 })
    expect(dmxLink().wrapper).toBe('unavailable')
    expect(src.loads).toBe(3)
  })

  it('a row that enables the deeplink with no campaign id and no template stays DIRECT and is logged as a configuration error — nothing fabricated', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    fakeSource([row({ providerId: 'traveloka', deeplinkEnabled: true, tier: 1 })])
    await refreshProviderConfig({ force: true })
    expect(effectiveTracking(getProvider('traveloka')!)).toBeUndefined()
    expect(providerTier(getProvider('traveloka')!)).toBe(1) // the owner's tier, honestly reported…
    expect(monetizationStatus(getProvider('traveloka')!)).toBe('NOT_APPLICABLE') // …but nothing earns
    const logs = err.mock.calls.map(c => JSON.parse(String(c[0])) as { step: string; providerId: string })
    expect(logs.filter(l => l.step === 'deeplink_enabled_without_wrapper' && l.providerId === 'traveloka')).toHaveLength(1)
  })

  it('a template network wraps through the owner-supplied template and proves the destination survived; a template that hides it is refused', async () => {
    fakeSource([row({ providerId: 'tripcom', deeplinkEnabled: true, tier: 1, network: 'template', wrapperTemplate: 'https://track.example.net/click?camp=77&url={url}&s={sub1}' })])
    await refreshProviderConfig({ force: true })
    const req: CommerceRequest = { domain: 'travel', intentType: 'book_hotel', subject: 'Nordic Resort', configuration: { kind: 'hotel', propertyRef: '10569789', cityRef: '42599', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2 }, context: { actorHash: 'a1b2c3d4e5f60718' } }
    const offer = tripcomAdapter.toOffer(req, { subjectRef: '10569789' }, now)!
    const r = resolveDeepLink(tripcomAdapter, req, offer, req.configuration, { now })
    expect(r.ok && r.wrapper).toBe('applied')
    expect(r.ok && new URL(r.link.url).hostname).toBe('track.example.net')
    expect(r.ok && r.link.tracking.mode).toBe('affiliate')
    expect(r.ok && new URL(r.link.url).searchParams.get('url')).toBe(r.ok ? r.link.directUrl : '')

    fakeSource([row({ providerId: 'tripcom', deeplinkEnabled: true, tier: 1, network: 'template', wrapperTemplate: 'https://track.example.net/go/{url}' })])
    await refreshProviderConfig({ force: true })
    const hidden = resolveDeepLink(tripcomAdapter, req, offer, req.configuration, { now })
    expect(hidden.ok && hidden.wrapper).toBe('rejected')
    expect(hidden.ok && new URL(hidden.link.url).hostname).toBe('vn.trip.com')
  })

  it('an inactive row runs no adapter: the orchestrator reports it disabled and emits nothing for it', async () => {
    fakeSource([row({ providerId: 'dmx', active: false })])
    await refreshProviderConfig({ force: true })
    expect(isProviderActive(getProvider('dmx')!)).toBe(false)
    const out = resolveCommerce(dmxReq, { hints: [dmxHint], now, enabled: true, adapters: [dmxAdapter] })
    expect('links' in out && out.links).toHaveLength(0)
    expect('providersFailed' in out && out.providersFailed[0]).toMatchObject({ providerId: 'dmx', code: 'disabled' })
  })

  it('a source that fails keeps the last good overlay (or the code defaults) and does not throw', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const src = fakeSource([row({ providerId: 'dmx', deeplinkEnabled: true, tier: 1, network: 'accesstrade', campaignId: '5751981382510607935' })])
    await refreshProviderConfig({ now: 0 })
    setProviderConfigSource({ async load() { throw new Error('relation "commerce_providers" does not exist') } })
    await refreshProviderConfig({ force: true })
    expect(providerOverride('dmx')).toBeNull() // a new source starts cold; the failure leaves the code defaults
    expect(effectiveTracking(getProvider('dmx')!)?.approval).toBe('pending')
    expect(err).toHaveBeenCalled()
    void src
  })

  it('overrideFromRow reads the table shape and rejects a nameless row', () => {
    expect(overrideFromRow({ provider_id: 'lazada', active: true, deeplink_enabled: true, tier: 1, network: 'accesstrade', campaign_id: '5087153089503673507', wrapper_template: null, updated_at: '2026-09-20T00:00:00Z' }))
      .toEqual({ providerId: 'lazada', active: true, deeplinkEnabled: true, tier: 1, network: 'accesstrade', campaignId: '5087153089503673507', wrapperTemplate: null, updatedAt: '2026-09-20T00:00:00Z' })
    expect(overrideFromRow({ provider_id: '' })).toBeNull()
    expect(overrideFromRow({ provider_id: 'x', network: 'cj' })?.network).toBeNull()
  })
})

describe('the code registry still validates with the widened tracking type', () => {
  it('no problems', () => { expect(validateRegistry(PROVIDER_REGISTRY)).toEqual([]) })
})

describe('the seed migration carries the owner\'s list', () => {
  it('every registry provider has a seed row; the eight Tier 1 names are deeplink_enabled; Traveloka / Vietnam Airlines have no campaign on file', () => {
    const sql = readFileSync('supabase/migrations/20260920100000_commerce_providers.sql', 'utf8')
    for (const p of PROVIDER_REGISTRY) expect(sql, p.providerId).toMatch(new RegExp(`\\('${p.providerId}',`))
    const tier1 = ['lazada', 'cellphones', 'tripcom', 'traveloka', 'vexere', 'vietnamairlines', 'klook', 'tiktokshop']
    for (const id of tier1) expect(sql).toMatch(new RegExp(`\\('${id}',\\s+true,\\s+true,\\s+1,`))
    for (const id of ['shopee', 'vietjet', 'booking', 'agoda', 'grabfood', 'shopeefood', 'ticketbox', 'cgv']) expect(sql).toMatch(new RegExp(`\\('${id}',\\s+true,\\s+false,\\s+2,`))
    expect(sql).toMatch(/\('traveloka',\s+true,\s+true,\s+1,\s+null,\s+null/)
    expect(sql).toMatch(/\('vietnamairlines',\s+true,\s+true,\s+1,\s+null,\s+null/)
    expect(sql).toMatch(/revoke all on public\.commerce_providers from anon, authenticated/)
  })
})

describe('architecture: the consultative layer asks the registry, it never branches on a provider', () => {
  it('no per-provider id branch in the chat commerce seam or the resolver', () => {
    const seam = readFileSync('src/lib/ai/tools/commerce.ts', 'utf8')
    const resolver = readFileSync('src/lib/ccp/resolver/resolve.ts', 'utf8')
    const ids = PROVIDER_REGISTRY.map(p => p.providerId)
    for (const src of [seam, resolver]) {
      for (const id of ids) {
        expect(src, `branch on '${id}'`).not.toMatch(new RegExp(`providerId\\s*===\\s*'${id}'`))
      }
    }
    expect(resolver).toContain('effectiveTracking(entry)')
    expect(seam).toContain('refreshProviderConfig()')
  })
})

// ── Owner decision 2026-09-20: DMX DISABLED entirely — a DATA change (the CCP half; the AI-layer half is
// src/lib/ai/tools/commerceInactiveProvider.test.ts, which this layer must not import) ──
import { isRemovedMerchant, inactiveMerchants } from './index'
import { discoveryScopesFor } from '../discovery'

describe('a provider switched OFF in commerce_providers is not a destination (DMX, owner 2026-09-20)', () => {
  beforeEach(() => { setCommerceEventWriter(() => {}); __resetProviderConfig() })
  afterEach(() => { setCommerceEventWriter(null); setProviderConfigSource(null) })

  it('active=false: no adapter, no discovery scope, removed-merchant by host and by name; active=true restores it', async () => {
    fakeSource([row({ providerId: 'dmx', active: false })])
    await refreshProviderConfig({ now: 0 })
    expect(isProviderActive(getProvider('dmx')!)).toBe(false)
    expect(inactiveMerchants().map(m => m.providerId)).toEqual(['dmx'])
    const res = await resolveCommerce(dmxReq, { hints: [dmxHint], now })
    if (!('links' in res)) throw new Error('resolve rejected the request')
    expect(res.links.some(l => l.providerId === 'dmx')).toBe(false)
    expect(res.providersFailed.find(f => f.providerId === 'dmx')?.code).toBe('disabled')
    expect(discoveryScopesFor('shopping', 'buy_product', Object.fromEntries(PROVIDER_REGISTRY.map(e => [e.enabledFlag, true]))).some(s => s.providerId === 'dmx')).toBe(false)
    expect(isRemovedMerchant('🛒 Mua tại Điện máy XANH', 'www.dienmayxanh.com')).toBe(true)
    expect(isRemovedMerchant('🛒 Mua ngay', 'dienmayxanh.com')).toBe(true)
    expect(isRemovedMerchant('🛒 Shopee', 'shopee.vn')).toBe(false)

    fakeSource([row({ providerId: 'dmx', active: true })])
    await refreshProviderConfig({ now: PROVIDER_CONFIG_TTL_MS + 1, force: true })
    expect(isProviderActive(getProvider('dmx')!)).toBe(true)
    expect(inactiveMerchants()).toEqual([])
    expect(isRemovedMerchant('🛒 Mua tại Điện máy XANH', 'www.dienmayxanh.com')).toBe(false)
  })
})
