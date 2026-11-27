import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleMcpRequest, type GatewayDeps, type GatewayResponse } from './gateway'
import { createSpendPool } from './spendPool'
import { createInMemoryJobStore } from './jobs'
import { createAbuseMonitor } from './abuseGuard'
import { NO_ADAPTERS, mapDealRow, mapClipRow, mapCoachRow, type ServiceAdapter, type ServiceId } from './serviceMap'
import { CONNECTOR_TOOLS, type VerifiedClaims } from './connectorContract'
import { CATALOG, parseArgs } from './toolCatalog'
import { TOOL_TEXT } from './tappyProfile'
import { validateJsonSchema } from './testSupport'
import { __resetKvCounters } from '@/lib/security/kvCounter'

// ── search_deals and search_clips (owner 27/11/2026: what a general AI does not have: Vietnamese partner offers and real clips from Tappy users) ──
// Both are database reads of data Tappy already shows the public (the Deal page; the public Explore feed). No LLM, no paid provider.
// A clip row never carries its author; a deal row carries only what the Deal page shows.

const NOW = new Date('2026-11-27T03:00:00Z')
const AUD = 'https://mcp.test/api/mcp'
const SCOPES = ['places:read', 'hotels:read', 'shopping:read', 'scam:check', 'deals:read', 'clips:read']
const CAPS = { MCP_POOL_DAILY_USD: '1', MCP_POOL_HOST_USD: '1', MCP_POOL_INSTALL_USD: '1', MCP_POOL_PRINCIPAL_USD: '0.5', MCP_POOL_TOOL_USD: '1', MCP_POOL_REQUEST_USD: '1' }
const claims = (o: Partial<VerifiedClaims> = {}): VerifiedClaims => ({ audience: AUD, scopes: SCOPES, expiresAt: NOW.getTime() / 1000 + 3600, revoked: false, host: 'claude', installId: 'inst-1', userId: null, principalId: 'anon-1', ...o })

const DEAL = { id: 'd1', partnerName: 'Lazada', category: 'Mua sắm', title: 'Giảm 50% đơn đầu', description: 'Áp dụng cho khách mới', officialUrl: 'https://go.isclix.com/deep_link/1/2?url=https%3A%2F%2Fwww.lazada.vn', discountLabel: '50%', voucherCode: 'LAZ50', endAt: '2026-12-31T00:00:00Z', clickCount: 99, affiliateCode: 'SECRET' }
const CLIP = { id: '7ca8479a-1cb8-492c-9836-de22cb78d366', place_name: 'Phở Thìn Lò Đúc', place_address: '13 Lò Đúc, Hà Nội', body: 'Phở bò tái lăn rất đậm đà #pho', thumbnail: 'https://media.tappyai.com/t/1.jpg', like_count: 12, comment_count: 3, created_at: '2026-11-20T00:00:00Z', user_id: 'user-secret', source_url: 'https://tiktok.com/x', profiles: { full_name: 'Huy Phạm', avatar_url: 'https://a/b.png' }, media_url: 'https://media.tappyai.com/v/1.mp4' }

function mk(adapters: Partial<Record<ServiceId, ServiceAdapter | null>> = {}, over: Partial<GatewayDeps> = {}) {
  const fns = {
    'deals.search': vi.fn(async (_c: unknown) => ({ rows: [DEAL] as Array<Record<string, unknown>> })), 'clips.search': vi.fn(async (_c: unknown) => ({ rows: [CLIP] as Array<Record<string, unknown>> })),
  }
  const deps: GatewayDeps = {
    verify: vi.fn(async () => claims()), expectedAudience: AUD,
    adapters: { ...NO_ADAPTERS, 'deals.search': fns['deals.search'], 'clips.search': fns['clips.search'], ...adapters } as GatewayDeps['adapters'],
    spend: createSpendPool({ env: CAPS }), jobs: createInMemoryJobStore(() => NOW), abuse: createAbuseMonitor({ now: () => NOW }),
    rateLimit: async () => ({ ok: true, retryAfter: 0 }), now: () => NOW, log: () => {}, allowedOrigins: [], ...over,
  }
  return { deps, fns }
}
const call = (name: string, args: unknown) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
const run = (body: unknown, deps: GatewayDeps) => handleMcpRequest({ authorization: 'Bearer t', body }, deps)
const sc = (r: GatewayResponse) => (r.body as { result: { structuredContent: Record<string, any> } }).result.structuredContent

beforeEach(() => __resetKvCounters())

describe('the tools in the catalog', () => {
  it('are read-only, synchronous, bounded, and behind their own scopes', () => {
    for (const [n, scope] of [['search_deals', 'deals:read'], ['search_clips', 'clips:read']] as const) {
      expect(CATALOG[n].mode).toBe('SYNC')
      expect(CATALOG[n].annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true })
      expect(CONNECTOR_TOOLS[n].scope).toBe(scope)
      expect(CONNECTOR_TOOLS[n].maxResults).toBeLessThanOrEqual(10)
      expect(TOOL_TEXT[n]).toMatch(/Read-only/)
      expect(TOOL_TEXT[n].length).toBeGreaterThan(40)
      expect(TOOL_TEXT[n].length).toBeLessThan(500)
    }
  })
  it('take a query, an optional limit and language; nothing else (no author, no location, no file)', () => {
    for (const n of ['search_deals', 'search_clips'] as const) {
      expect(Object.keys((CATALOG[n].inputSchema as { properties: object }).properties).sort()).toEqual(['limit', 'preferred_language', 'query'])
      expect(parseArgs(n, { query: 'lazada' }).ok).toBe(true)
      expect(parseArgs(n, { query: 'lazada', user_id: 'x' }).ok).toBe(false)
      expect(parseArgs(n, {}).ok).toBe(false)
    }
  })
  it('the words claim nothing the data does not support: no "live", no "best", clips are public posts of Tappy users', () => {
    expect(TOOL_TEXT.search_deals).not.toMatch(/\blive\b|real-?time|best|guarantee/i)
    expect(TOOL_TEXT.search_clips).not.toMatch(/\blive\b|real-?time|guarantee/i)
    expect(TOOL_TEXT.search_clips).toMatch(/public/i)
  })
})

describe('mapDealRow', () => {
  it('keeps what the Deal page shows, drops internals (click count, affiliate code), and needs https', () => {
    const r = mapDealRow(DEAL as never)!
    expect(r).toMatchObject({ id: 'd1', title: 'Giảm 50% đơn đầu', partner: 'Lazada', discount: '50%', voucherCode: 'LAZ50', endsAt: '2026-12-31T00:00:00Z' })
    expect(JSON.stringify(r)).not.toMatch(/SECRET|clickCount|affiliateCode|99/)
    expect(mapDealRow({ ...DEAL, officialUrl: 'http://x.example' } as never)!.url).toBeUndefined()
    expect(mapDealRow({ ...DEAL, title: '' } as never)).toBeNull()
  })
})

describe('mapClipRow', () => {
  it('🚨 never carries the author or any internal id: no user_id, no profile, no source link; the link is built from the clip id', () => {
    const r = mapClipRow(CLIP as never)!
    expect(r).toMatchObject({ id: CLIP.id, title: 'Phở Thìn Lò Đúc', address: '13 Lò Đúc, Hà Nội', likes: 12, comments: 3, url: `https://www.tappyai.com/reviews/${CLIP.id}`, thumbnail: 'https://media.tappyai.com/t/1.jpg' })
    expect(JSON.stringify(r)).not.toMatch(/user-secret|Huy Phạm|avatar|tiktok|user_id|profiles|media_url/)
  })
  it('refuses a row whose id is not a clip id (no link is built from anything else) or that has no title; thumbnail only https; caption bounded', () => {
    expect(mapClipRow({ ...CLIP, id: '../admin' } as never)).toBeNull()
    expect(mapClipRow({ ...CLIP, place_name: '' } as never)).toBeNull()
    expect(mapClipRow({ ...CLIP, thumbnail: 'javascript:alert(1)' } as never)!.thumbnail).toBeUndefined()
    expect((mapClipRow({ ...CLIP, body: 'x'.repeat(900) } as never)!.caption as string).length).toBeLessThanOrEqual(300)
  })
})

describe('search_coach (the dated Vexere route page, or nothing)', () => {
  const COACH = { id: 'l1', title: 'Vexere: Sài Gòn → Đà Lạt', route: 'Sài Gòn → Đà Lạt', departDate: '2026-12-05', merchant: 'Vexere', url: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-1t4573.html?date=05-12-2026' }
  it('is read-only, synchronous, bounded to one result, behind transport:read, and its words promise no timetable, price or seat', () => {
    expect(CATALOG.search_coach.mode).toBe('SYNC')
    expect(CATALOG.search_coach.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
    expect(CONNECTOR_TOOLS.search_coach.scope).toBe('transport:read')
    expect(CONNECTOR_TOOLS.search_coach.maxResults).toBe(1)
    expect(TOOL_TEXT.search_coach).toMatch(/no timetable, price or seat/i)
    expect(TOOL_TEXT.search_coach.length).toBeLessThan(500)
    expect(TOOL_TEXT.search_coach).not.toMatch(/\blive\b|real-?time|cheapest|best/i)
    expect(Object.keys((CATALOG.search_coach.inputSchema as { properties: object }).properties).sort()).toEqual(['depart_date', 'destination', 'origin', 'preferred_language'])
    expect(parseArgs('search_coach', { origin: 'Sài Gòn', destination: 'Đà Lạt' }).ok).toBe(true)
    expect(parseArgs('search_coach', { origin: 'Sài Gòn', destination: 'Đà Lạt', depart_date: '2026-12-05' }).ok).toBe(true)
    expect(parseArgs('search_coach', { origin: 'Sài Gòn', destination: 'Đà Lạt', depart_date: '05/12/2026' }).ok).toBe(false)
    expect(parseArgs('search_coach', { origin: 'Sài Gòn' }).ok).toBe(false)
  })
  it('mapCoachRow keeps the route page (https) and the day; a row without a link or a route is dropped', () => {
    expect(mapCoachRow(COACH as never)).toMatchObject({ route: 'Sài Gòn → Đà Lạt', departDate: '2026-12-05', merchant: 'Vexere', url: COACH.url })
    expect(mapCoachRow({ ...COACH, url: 'http://vexere.com/x' } as never)).toBeNull()
    expect(mapCoachRow({ ...COACH, route: '' } as never)).toBeNull()
  })
  it('the two places and the day reach the adapter; the answer is one row and passes the output schema', async () => {
    const coach = vi.fn(async (_c: unknown) => ({ rows: [COACH] as Array<Record<string, unknown>> }))
    const { deps } = mk({ 'coach.link': coach }, { verify: vi.fn(async () => claims({ scopes: [...SCOPES, 'transport:read'] })) })
    const out = sc(await run(call('search_coach', { origin: 'Sài Gòn', destination: 'Đà Lạt', depart_date: '2026-12-05' }), deps))
    expect(coach.mock.calls[0][0]).toMatchObject({ origin: 'Sài Gòn', destination: 'Đà Lạt', departDate: '2026-12-05', lang: 'vi' })
    expect(out.results).toHaveLength(1)
    expect(out.results[0]).toMatchObject({ merchant: 'Vexere', departDate: '2026-12-05' })
    expect(validateJsonSchema(CATALOG.search_coach.outputSchema, out)).toEqual([])
  })
  it('no route page found is a success with no rows (nothing is invented); the scope is required', async () => {
    const { deps } = mk({ 'coach.link': async () => ({ rows: [] }) }, { verify: vi.fn(async () => claims({ scopes: [...SCOPES, 'transport:read'] })) })
    // a place the city list does not know (a small town) is still a valid question: the places are the ask, not a market
    const out = sc(await run(call('search_coach', { origin: 'Sài Gòn', destination: 'Mộc Châu' }), deps))
    expect(out.status).toBe('success'); expect(out.results).toEqual([])
    const denied = mk({ 'coach.link': async () => ({ rows: [COACH] }) })
    expect(sc(await run(call('search_coach', { origin: 'A', destination: 'B' }), denied.deps)).error.code).toBe('ACCESS_DENIED')
  })
})

describe('through the gateway', () => {
  it('search_deals returns the deal rows in the standard envelope and passes the output schema', async () => {
    const { deps, fns } = mk()
    const out = sc(await run(call('search_deals', { query: 'lazada' }), deps))
    expect(out.status).toBe('success')
    expect(out.results[0]).toMatchObject({ partner: 'Lazada', discount: '50%' })
    expect(validateJsonSchema(CATALOG.search_deals.outputSchema, out)).toEqual([])
    expect(fns['deals.search'].mock.calls[0][0]).toMatchObject({ query: 'lazada', lang: 'vi' })
  })
  it('search_clips returns clip rows without an author and passes the output schema', async () => {
    const { deps } = mk()
    const out = sc(await run(call('search_clips', { query: 'phở hà nội', limit: 3 }), deps))
    expect(out.results[0]).toMatchObject({ title: 'Phở Thìn Lò Đúc', url: `https://www.tappyai.com/reviews/${CLIP.id}` })
    expect(JSON.stringify(out)).not.toMatch(/user-secret|Huy Phạm/)
    expect(validateJsonSchema(CATALOG.search_clips.outputSchema, out)).toEqual([])
  })
  it('a token without the tool\'s scope is refused and the adapter is never called', async () => {
    const { deps, fns } = mk({}, { verify: vi.fn(async () => claims({ scopes: ['places:read'] })) })
    expect(sc(await run(call('search_deals', { query: 'x' }), deps)).error.code).toBe('ACCESS_DENIED')
    expect(sc(await run(call('search_clips', { query: 'x' }), deps)).error.code).toBe('ACCESS_DENIED')
    expect(fns['deals.search']).not.toHaveBeenCalled(); expect(fns['clips.search']).not.toHaveBeenCalled()
  })
  it('an unwired adapter answers PROVIDER_UNAVAILABLE; an adapter that throws does not leak its message', async () => {
    expect(sc(await run(call('search_deals', { query: 'x' }), mk({ 'deals.search': null }).deps)).error.code).toBe('PROVIDER_UNAVAILABLE')
    const { deps } = mk({ 'clips.search': async () => { throw new Error('db password=SECRET') } })
    const r = sc(await run(call('search_clips', { query: 'x' }), deps))
    expect(r.error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(JSON.stringify(r)).not.toMatch(/SECRET|password/)
  })
  it('the limit is respected and an empty result is a success with no rows', async () => {
    const { deps } = mk({ 'deals.search': async () => ({ rows: Array.from({ length: 9 }, (_, i) => ({ ...DEAL, id: `d${i}` })) }) })
    expect(sc(await run(call('search_deals', { query: 'x', limit: 2 }), deps)).results).toHaveLength(2)
    const empty = mk({ 'clips.search': async () => ({ rows: [] }) })
    const out = sc(await run(call('search_clips', { query: 'zzz' }), empty.deps))
    expect(out.status).toBe('success'); expect(out.results).toEqual([])
  })
})
