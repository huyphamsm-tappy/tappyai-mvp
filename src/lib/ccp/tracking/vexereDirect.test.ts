import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { withVexereDirectParams, wrapWithVexereDirect } from './vexereDirect'
import { getProvider } from '../registry'
import { effectiveTracking } from '../registry/runtime'
import { resolveDeepLink } from '../resolver/resolve'
import { vexereAdapter } from '../adapters/grammar'
import type { CommerceRequest } from '../domain/types'
import { resolveCommerce } from '../index'
import { setCommerceEventWriter } from '../events/sink'
import { buildCoachLandingLink, buildFlightLinks } from '@/lib/platformLinks/travel'
import { vexereDirectAffiliateOn, VEXERE_DIRECT_AFFILIATE_FLAG, VEXERE_DIRECT_AID, VEXERE_DIRECT_PARAMS } from '@/lib/config/vexereDirect'

const PARAMS = 'utm_source=affiliate&utm_campaign=380&utm_medium=aff_link&aid=380'
const now = new Date('2026-10-01T10:00:00+07:00')
const ROUTE = 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-lam-dong-129t23991.html'
const RAIL = 'https://vexere.com/vn/ve-tau-hoa/tu-ha-noi-di-sai-gon.24.29.vi'

describe('the flag', () => {
  it('is OFF unless exactly "1", locked in production unless the owner lists it', () => {
    const n = VEXERE_DIRECT_AFFILIATE_FLAG
    expect(n).toBe('VEXERE_DIRECT_AFFILIATE')
    expect(vexereDirectAffiliateOn({})).toBe(false)
    for (const v of ['0', 'true', 'on', ' 1', '1 ', '01']) expect(vexereDirectAffiliateOn({ [n]: v })).toBe(false)
    expect(vexereDirectAffiliateOn({ [n]: '1' })).toBe(true)
    expect(vexereDirectAffiliateOn({ [n]: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(vexereDirectAffiliateOn({ [n]: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: n })).toBe(true)
  })
  it('the programme identifiers live in one config constant', () => {
    expect(VEXERE_DIRECT_AID).toBe('380')
    expect(VEXERE_DIRECT_PARAMS.map(([k, v]) => `${k}=${v}`).join('&')).toBe(PARAMS)
  })
})

describe('withVexereDirectParams — appends exactly the programme parameters', () => {
  const ok = (u: string) => { const r = withVexereDirectParams(u); if (!r.ok) throw new Error(r.reason); return r.url }
  it('front door, bus route (existing query kept), train list (bracket encoding kept)', () => {
    expect(ok('https://vexere.com/vi-VN')).toBe(`https://vexere.com/vi-VN?${PARAMS}`)
    expect(ok(`${ROUTE}?date=10-10-2026`)).toBe(`${ROUTE}?date=10-10-2026&${PARAMS}`)
    const train = 'https://vexere.com/vn/ve-tau-hoa/dat-ve-tau.vi?from=24_area&to=29_area&date%5Bdepart%5D=2026-10-10&passenger%5Badt%5D=2'
    expect(ok(train)).toBe(`${train}&${PARAMS}`)
    expect(ok('https://vexere.com/vn/ve-may-bay.vi')).toBe(`https://vexere.com/vn/ve-may-bay.vi?${PARAMS}`)
  })
  it('is idempotent and never duplicates a key', () => {
    const once = ok(`${ROUTE}?date=10-10-2026`)
    expect(ok(once)).toBe(once)
    const keys = [...new URL(once).searchParams.keys()]
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('a URL that already carries another program id (aid, aff_sid) or is not Vexere is refused, never overwritten', () => {
    expect(withVexereDirectParams(`${ROUTE}?aid=1234&aff_sid=x`).ok).toBe(false)
    expect(withVexereDirectParams(`${ROUTE}?aid=381`).ok).toBe(false)
    expect(withVexereDirectParams(`${ROUTE}?aff_sid=x`).ok).toBe(false)
    expect(withVexereDirectParams('https://evil.example/vi-VN').ok).toBe(false)
    expect(withVexereDirectParams('https://vexere.com.evil.example/vi-VN').ok).toBe(false)
    expect(withVexereDirectParams('http://vexere.com/vi-VN').ok).toBe(false)
    expect(withVexereDirectParams('not a url').ok).toBe(false)
  })
  it('keeps a hash after the query', () => {
    expect(ok('https://vexere.com/vi-VN#top')).toBe(`https://vexere.com/vi-VN?${PARAMS}#top`)
  })
})

describe('resolver — flag ON sends the direct programme, flag OFF changes nothing', () => {
  const saved = { f: process.env[VEXERE_DIRECT_AFFILIATE_FLAG], p: process.env.ACCESSTRADE_PUBLISHER_ID, v: process.env.VERCEL_ENV, n: process.env.NODE_ENV }
  beforeEach(() => { process.env.ACCESSTRADE_PUBLISHER_ID = '6277265300509373567'; delete process.env[VEXERE_DIRECT_AFFILIATE_FLAG]; setCommerceEventWriter(() => {}) })
  afterEach(() => {
    for (const [k, v] of [[VEXERE_DIRECT_AFFILIATE_FLAG, saved.f], ['ACCESSTRADE_PUBLISHER_ID', saved.p]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    setCommerceEventWriter(null)
  })
  const bus = { kind: 'transport' as const, originRef: 'sai-gon', destinationRef: 'da-lat', departDate: '2026-10-10', mode: 'bus' as const }
  const train = { kind: 'transport' as const, originRef: 'ha-noi', destinationRef: 'sai-gon', departDate: '2026-10-10', mode: 'train' as const, passengers: 2 }
  const reqOf = (configuration: typeof bus | typeof train): CommerceRequest => ({ domain: 'travel', intentType: 'book_transport', subject: 'x', configuration, context: { actorHash: 'a1b2c3d4e5f60718' } })
  const run = (url: string, configuration: typeof bus | typeof train) => {
    const req = reqOf(configuration)
    const offer = vexereAdapter.toOffer(req, { subjectRef: url, url }, now)
    if (!offer) throw new Error('no offer')
    const r = resolveDeepLink(vexereAdapter, req, offer, configuration, { now, wrappingEnabled: true })
    if (!r.ok) throw new Error(r.reason)
    return r
  }

  it('OFF: bus link is the Accesstrade deep link through /go/at (host is ours or isclix), never the direct programme', () => {
    const r = run(ROUTE, bus)
    expect(r.link.url).not.toContain('aid=380')
    expect(r.link.tracking.mode === 'affiliate' && r.link.tracking.network).toBe('accesstrade')
    expect(effectiveTracking(getProvider('vexere')!)?.network).toBe('accesstrade')
  })

  it('ON: bus route page = clean date URL + the four parameters, no wrapper, no aff_sid, one aid', () => {
    process.env[VEXERE_DIRECT_AFFILIATE_FLAG] = '1'
    const r = run(ROUTE, bus)
    expect(r.link.url).toBe(`${ROUTE}?date=10-10-2026&${PARAMS}`)
    expect(r.link.directUrl).toBe(`${ROUTE}?date=10-10-2026`)
    expect(r.link.url).not.toMatch(/aff_sid|isclix|\/go\/at/)
    expect(new URL(r.link.url).searchParams.getAll('aid')).toEqual(['380'])
    expect(r.link.tracking).toMatchObject({ mode: 'affiliate', network: 'vexere_direct', campaignId: '380' })
    expect(r.link.validation.status).toBe('param_echo_ok')
  })

  it('ON: train list keeps %5B…%5D and gets the parameters; the identity (canonical) stays clean', () => {
    process.env[VEXERE_DIRECT_AFFILIATE_FLAG] = '1'
    const r = run(RAIL, train)
    expect(r.link.url).toBe(`https://vexere.com/vn/ve-tau-hoa/dat-ve-tau.vi?from=24_area&to=29_area&date%5Bdepart%5D=2026-10-10&passenger%5Badt%5D=2&${PARAMS}`)
    expect(r.link.directUrl).not.toContain('aid=')
    const offer = vexereAdapter.toOffer(reqOf(train), { subjectRef: RAIL, url: RAIL }, now)!
    expect(JSON.stringify(offer)).not.toMatch(/aid=380|utm_campaign|aff_link/)
  })

  it('ON: the front door (no route page) carries the parameters', () => {
    process.env[VEXERE_DIRECT_AFFILIATE_FLAG] = '1'
    const r = resolveCommerce(reqOf(bus), { hints: [], now, enabled: true })
    if ('issues' in r) throw new Error('issues')
    expect(r.links.map(l => l.directUrl)).toEqual(['https://vexere.com/vi-VN'])
    expect(r.links.map(l => l.url)).toEqual([`https://vexere.com/vi-VN?${PARAMS}`])
  })

  it('ON but tracking refused by the request: a plain direct link, no parameters', () => {
    process.env[VEXERE_DIRECT_AFFILIATE_FLAG] = '1'
    const req = reqOf(bus)
    const offer = vexereAdapter.toOffer(req, { subjectRef: ROUTE, url: ROUTE }, now)!
    const r = resolveDeepLink(vexereAdapter, req, offer, bus, { now, wrappingEnabled: true, allowTracking: false })
    if (!r.ok) throw new Error(r.reason)
    expect(r.link.url).toBe(`${ROUTE}?date=10-10-2026`)
  })

  it('wrapWithVexereDirect refuses a destination that already carries aff_sid (collision) and a non-Vexere host', () => {
    const t = { network: 'vexere_direct' as const, approval: 'approved' as const, safeWrapper: 'deep_link' as const, unsafeWrappers: [] }
    expect(wrapWithVexereDirect({ directUrl: `${ROUTE}?aid=1&aff_sid=z`, tracking: t }).ok).toBe(false)
    expect(wrapWithVexereDirect({ directUrl: 'https://example.com/', tracking: t }).ok).toBe(false)
  })
})

describe('platform links', () => {
  const saved = process.env[VEXERE_DIRECT_AFFILIATE_FLAG]
  afterEach(() => { if (saved === undefined) delete process.env[VEXERE_DIRECT_AFFILIATE_FLAG]; else process.env[VEXERE_DIRECT_AFFILIATE_FLAG] = saved })

  it('OFF: the coach landing and the flight list are exactly as before (no Vexere flight entry)', () => {
    delete process.env[VEXERE_DIRECT_AFFILIATE_FLAG]
    expect(buildCoachLandingLink()).toBe('https://vexere.com/vi-VN')
    expect(buildFlightLinks('SGN', 'HAN', '2026-12-01').some(l => /vexere/i.test(l.name + l.url))).toBe(false)
  })
  it('ON: the coach landing carries the parameters and the flight list gains Vexere\'s flight landing (front door, honestly labelled), also with the parameters', () => {
    process.env[VEXERE_DIRECT_AFFILIATE_FLAG] = '1'
    expect(buildCoachLandingLink()).toBe(`https://vexere.com/vi-VN?${PARAMS}`)
    const v = buildFlightLinks('SGN', 'HAN', '2026-12-01').find(l => /vexere/i.test(l.url))!
    expect(v.url).toBe(`https://vexere.com/vn/ve-may-bay.vi?${PARAMS}`)
    expect(v.name).toBe('Vexere (trang vé máy bay)')
    expect(buildFlightLinks('SGN', 'HAN').find(l => /vexere/i.test(l.url))!.url).toBe(v.url)
  })
})
