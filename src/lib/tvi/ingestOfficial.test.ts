import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tviIngestOn, isOfficialTarget, officialFactsFromDoc, ingestOfficialTarget, ingestOfficialTargets, INGEST_MAX_TARGETS, type OfficialTarget } from './ingestOfficial'
import type { PageFetchResult } from '@/lib/security/safePageFetch'

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })

const T: OfficialTarget = { entityKey: 'attraction:hoang-thanh-hue', name: 'Hoàng thành Huế', city: 'Huế', url: 'https://hoangthanhhue.com.vn/ve', sourceType: 'GOVERNMENT' }
const NOW = new Date('2026-11-20T00:00:00Z')

const ld = (o: Record<string, unknown>) => `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify(o)}</script></head><body><p>${'Nội dung '.repeat(60)}</p></body></html>`
const PAGE = ld({ '@type': 'TouristAttraction', name: 'Hoàng thành Huế', address: { streetAddress: '23 Tháng 8', addressLocality: 'Huế' }, telephone: '0234 3523 237', openingHours: 'Mo-Su 07:00-17:30', offers: { price: '200000', priceCurrency: 'VND' } })
const ok = (body: string, finalUrl = T.url): PageFetchResult => ({ ok: true, url: T.url, finalUrl, status: 200, contentType: 'text/html', body, bytes: body.length, truncated: false, redirects: 0, ms: 5 })

describe('the flag', () => {
  it('is off by default, on only for "1", locked in a production runtime unless the owner lists it', () => {
    expect(tviIngestOn({})).toBe(false)
    expect(tviIngestOn({ TVI_INGEST: '1' })).toBe(true)
    expect(tviIngestOn({ TVI_INGEST: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(tviIngestOn({ TVI_INGEST: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'TVI_INGEST' })).toBe(true)
  })
})

describe('isOfficialTarget', () => {
  it('accepts an https page of an official source for an attraction entity', () => { expect(isOfficialTarget(T)).toBe(true) })
  it('refuses http, an IP host, credentials, a non-attraction key and a source type that is not official', () => {
    expect(isOfficialTarget({ ...T, url: 'http://hoangthanhhue.com.vn/' })).toBe(false)
    expect(isOfficialTarget({ ...T, url: 'https://10.0.0.1/x' })).toBe(false)
    expect(isOfficialTarget({ ...T, url: 'https://u:p@hoangthanhhue.com.vn/' })).toBe(false)
    expect(isOfficialTarget({ ...T, entityKey: 'place:abc' })).toBe(false)
    expect(isOfficialTarget({ ...T, sourceType: 'NEWS' as never })).toBe(false)
    expect(isOfficialTarget({ ...T, sourceType: 'KOL' as never })).toBe(false)
  })
})

describe('officialFactsFromDoc', () => {
  const doc = (structured: Array<Record<string, unknown>>) => ({ structured }) as never
  it('takes address, phone, hours and a VND price from the structured data of the named place', () => {
    const f = officialFactsFromDoc(doc([{ type: 'TouristAttraction', name: 'Hoàng thành Huế', address: '23 Tháng 8, Huế', telephone: '0234 3523 237', openingHours: 'Mo-Su 07:00-17:30', price: '200000', currency: 'VND' }]), T.name)
    expect(f.map(x => x.factType)).toEqual(['address', 'phone', 'opening_hours', 'ticket_price'])
    expect(f[3].value).toEqual({ amountVnd: 200000 })
    expect(f[2].value).toEqual({ text: 'Mo-Su 07:00-17:30' })
  })
  it('ignores a structured block about another name (a site-wide organisation)', () => {
    expect(officialFactsFromDoc(doc([{ type: 'Organization', name: 'Tập đoàn ABC', address: '1 Nguyễn Huệ, Quận 1' }]), T.name)).toEqual([])
  })
  it('drops implausible values: a price not in VND, a tiny or absurd price, junk phone, hours without a number', () => {
    const f = officialFactsFromDoc(doc([{ type: 'Place', name: 'Hoàng thành Huế', price: '20', currency: 'USD', telephone: 'abc', openingHours: 'open daily', address: 'Huế' }]), T.name)
    expect(f).toEqual([])
    expect(officialFactsFromDoc(doc([{ type: 'Place', name: 'Hoàng thành Huế', price: '5', currency: 'VND' }]), T.name)).toEqual([])
    expect(officialFactsFromDoc(doc([{ type: 'Place', name: 'Hoàng thành Huế', price: '900000000', currency: 'VND' }]), T.name)).toEqual([])
  })
})

describe('ingestOfficialTarget', () => {
  const mk = () => {
    const stage = vi.fn(async (i: { factType: string }) => ({ ok: true as const, outcome: 'created' as const, factId: 'f-' + i.factType, versionId: 'v-' + i.factType, versionNumber: 1 }))
    const attach = vi.fn(async () => ({ ok: true as const, outcome: 'attached' as const, evidenceId: 'e1' }))
    return { stage, attach }
  }
  it('stages each fact as a candidate under the attraction entity and attaches the official page as SUPPORTS evidence', async () => {
    const { stage, attach } = mk()
    const c = await ingestOfficialTarget(T, { fetchPage: async () => ok(PAGE), stage: stage as never, attach: attach as never }, NOW)
    expect(c).toMatchObject({ fetched: true, facts: 4, created: 4, evidence: 4, failed: 0 })
    expect(stage).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'attraction', entityKey: T.entityKey, canonicalName: T.name, city: 'Huế', actor: 'ingest.official' }))
    expect(attach).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'GOVERNMENT', domain: 'hoangthanhhue.com.vn', relation: 'SUPPORTS', reference: T.url }))
  })
  it('refuses a page whose final host is not the target host (a redirect elsewhere)', async () => {
    const { stage } = mk()
    const c = await ingestOfficialTarget(T, { fetchPage: async () => ok(PAGE, 'https://evil.example/ve'), stage: stage as never, attach: vi.fn() as never }, NOW)
    expect(c).toMatchObject({ fetched: true, facts: 0, reason: 'host_changed' })
    expect(stage).not.toHaveBeenCalled()
  })
  it('a failed fetch or a page with no structured facts writes nothing', async () => {
    const { stage } = mk()
    const bad = await ingestOfficialTarget(T, { fetchPage: async () => ({ ok: false, url: T.url, reason: 'http_error', redirects: 0, ms: 1 }), stage: stage as never, attach: vi.fn() as never }, NOW)
    expect(bad).toMatchObject({ fetched: false, facts: 0, reason: 'http_error' })
    const empty = await ingestOfficialTarget(T, { fetchPage: async () => ok('<html><body><p>' + 'abc '.repeat(100) + '</p></body></html>'), stage: stage as never, attach: vi.fn() as never }, NOW)
    expect(empty).toMatchObject({ fetched: true, facts: 0, reason: 'no_facts' })
    expect(stage).not.toHaveBeenCalled()
  })
  it('an unchanged fact attaches no new evidence', async () => {
    const stage = vi.fn(async () => ({ ok: true as const, outcome: 'unchanged' as const, factId: 'f', versionId: 'v', versionNumber: 1 }))
    const attach = vi.fn()
    const c = await ingestOfficialTarget(T, { fetchPage: async () => ok(PAGE), stage: stage as never, attach: attach as never }, NOW)
    expect(c.unchanged).toBe(4)
    expect(attach).not.toHaveBeenCalled()
  })
  it('never throws', async () => {
    const c = await ingestOfficialTarget(T, { fetchPage: async () => { throw new Error('x') }, stage: vi.fn() as never, attach: vi.fn() as never }, NOW)
    expect(c.failed).toBe(1)
  })
})

describe('ingestOfficialTargets', () => {
  it('skips invalid targets, bounds the list, and sums the counts', async () => {
    const stage = vi.fn(async (i: { factType: string }) => ({ ok: true as const, outcome: 'created' as const, factId: 'f' + i.factType, versionId: 'v' + i.factType, versionNumber: 1 }))
    const attach = vi.fn(async () => ({ ok: true as const, outcome: 'attached' as const, evidenceId: 'e' }))
    const many = Array.from({ length: INGEST_MAX_TARGETS + 5 }, () => T)
    const r = await ingestOfficialTargets([{ ...T, url: 'http://x.vn' }, ...many], { fetchPage: async () => ok(PAGE), stage: stage as never, attach: attach as never }, NOW)
    expect(r.targets).toBe(INGEST_MAX_TARGETS)
    expect(r.skipped).toBeGreaterThanOrEqual(1)
    expect(r.totals.created).toBe(INGEST_MAX_TARGETS * 4)
  })
})
