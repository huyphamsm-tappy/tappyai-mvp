import { describe, it, expect, beforeEach } from 'vitest'
import { CATALOG, DTO_FIELD_TYPES, catalogFingerprint, listTools, parseArgs, TOOL_CATALOG_VERSION, type CatalogToolName } from './toolCatalog'
import { CONNECTOR_TOOLS } from './connectorContract'
import { validateJsonSchema } from './testSupport'
import { handleMcpRequest, type GatewayDeps } from './gateway'
import { createSpendPool } from './spendPool'
import { createInMemoryJobStore } from './jobs'
import { createAbuseMonitor } from './abuseGuard'
import { NO_ADAPTERS } from './serviceMap'
import { hotelAdapter, fakeHotelProvider } from './providers'
import { __resetKvCounters } from '@/lib/security/kvCounter'

const NOW = new Date('2026-11-12T03:00:00Z')
const AUD = 'https://mcp.test/api/mcp'
const CAPS = { MCP_POOL_DAILY_USD: '1', MCP_POOL_HOST_USD: '1', MCP_POOL_INSTALL_USD: '1', MCP_POOL_PRINCIPAL_USD: '1', MCP_POOL_TOOL_USD: '1', MCP_POOL_REQUEST_USD: '1' }
const claims = { audience: AUD, scopes: ['places:read', 'hotels:read', 'shopping:read', 'itinerary:create'], expiresAt: NOW.getTime() / 1000 + 3600, revoked: false, host: 'claude' as const, installId: 'claude:c1', userId: null, principalId: 'a:x' }
const placeRows = Array.from({ length: 12 }, (_, i) => ({ name: `Quán ${i}`, place_id: `p${i}`, address: 'Quận 1', rating_value: 4.5, price_range_text: '50-100', open_now: true, distance_km: 1.5, maps_link: 'https://maps.example/x', place_types: ['restaurant'], opening_hours: '8-22' }))
const deps = (): GatewayDeps => ({
  verify: async () => claims, expectedAudience: AUD,
  adapters: { ...NO_ADAPTERS, 'places.search': async () => ({ rows: placeRows }), 'shopping.search': async () => ({ rows: [{ title: 'Tai nghe', link: 'https://shop.example/p', price: 199000, source: 'Shop', rating: 4.2 }] }), 'hotels.prices': hotelAdapter(fakeHotelProvider([{ name: 'KS', pricePerNight: 900000, currency: 'VND', stars: 3, rating: 8, url: 'https://agoda.example/h' }])) },
  spend: createSpendPool({ env: CAPS }), jobs: createInMemoryJobStore(() => NOW), abuse: createAbuseMonitor({ now: () => NOW }), rateLimit: async () => ({ ok: true, retryAfter: 0 }), now: () => NOW, log: () => {}, allowedOrigins: [],
})
const call = (d: GatewayDeps, name: string, args: unknown) => handleMcpRequest({ authorization: 'Bearer t', body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } }, d)
const sc = (r: { body: unknown }) => (r.body as { result: { structuredContent: Record<string, any>; isError: boolean } }).result.structuredContent
beforeEach(() => __resetKvCounters())

const SEARCH_INPUT = { query: 'pho', location_query: 'Hà Nội', latitude: 21.03, longitude: 105.85, preferred_language: 'vi', user_locale: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', search_radius_meters: 3000, limit: 5 }

describe('catalog v1.0 follows the connector doc', () => {
  it('connector doc 12.4 illustrative input (with its null coordinates removed) and 7.2 context parameters validate', () => {
    expect(parseArgs('search_restaurants', { query: 'pho restaurant', location_query: 'District 1, Ho Chi Minh City', preferred_language: 'vi', currency: 'VND', search_radius_meters: 3000, limit: 5 }).ok).toBe(true)
    expect(parseArgs('search_places', SEARCH_INPUT).ok).toBe(true)
    expect(parseArgs('search_places', { query: 'x', user_locale: 'not a locale!' }).ok).toBe(false)
    expect(parseArgs('search_places', { query: 'x', timezone: '../../etc' }).ok).toBe(false)
  })
  it('every published tool has an input and an output schema, and every DTO field has a JSON type', () => {
    for (const t of listTools()) { expect(t.inputSchema.type, t.name).toBe('object'); expect(t.outputSchema.type, t.name).toBe('object') }
    for (const c of Object.values(CONNECTOR_TOOLS)) if (c.name !== 'create_itinerary') for (const f of c.dtoFields) expect(DTO_FIELD_TYPES[f], `${c.name}.${f}`).toBeDefined()
  })
  it('the input schema a Host sees accepts and rejects the same samples as the validator the Gateway runs', () => {
    const good = SEARCH_INPUT
    const bads: unknown[] = [{ ...good, limit: 11 }, { ...good, latitude: 100 }, { ...good, currency: 'vnd' }, { ...good, extra: 1 }, { query: '' }, {}]
    for (const n of ['search_places', 'search_restaurants', 'search_shopping', 'search_attractions'] as CatalogToolName[]) {
      expect(validateJsonSchema(CATALOG[n].inputSchema, good), n).toEqual([])
      for (const b of bads) { expect(validateJsonSchema(CATALOG[n].inputSchema, b).length > 0, `${n} ${JSON.stringify(b)}`).toBe(true); expect(parseArgs(n, b).ok).toBe(false) }
    }
  })
  it('the published catalog is pinned: any change to what a Host sees must change the version and this value together', () => {
    expect(TOOL_CATALOG_VERSION).toBe('mcp-tools.v1.4')
    expect(catalogFingerprint()).toBe('446b545fb950bb36223608f6072c2fb23585e79b4f39322f4966d1c91cabf493')
  })
  it('the fingerprint is sensitive to a schema change (so the pin cannot pass by accident)', () => {
    const before = catalogFingerprint()
    const t = CATALOG.search_places as unknown as { inputSchema: { properties: Record<string, unknown> } }
    t.inputSchema.properties.__probe = { type: 'string' }
    try { expect(catalogFingerprint()).not.toBe(before) } finally { delete t.inputSchema.properties.__probe }
    expect(catalogFingerprint()).toBe(before)
  })
})

describe('real results conform to the published output schema', () => {
  it('each of the five search tools returns structuredContent that validates against its outputSchema', async () => {
    const d = deps()
    for (const [name, args] of [['search_places', SEARCH_INPUT], ['search_restaurants', SEARCH_INPUT], ['search_attractions', SEARCH_INPUT], ['search_shopping', { query: 'tai nghe' }], ['search_hotels', { query: 'hotel', location_query: 'Đà Nẵng', check_in: '2026-12-01', check_out: '2026-12-02' }]] as Array<[CatalogToolName, unknown]>) {
      const s = sc(await call(d, name, args))
      expect(validateJsonSchema(CATALOG[name].outputSchema, s), `${name}: ${JSON.stringify(s).slice(0, 200)}`).toEqual([])
      expect(s.results.length, name).toBeGreaterThan(0)
    }
  })
  it('a degraded (partial) result also conforms', async () => {
    const d = { ...deps(), abuse: { observe: () => ({ level: 'elevated' as const, depthFactor: 0.4 }), size: () => 0 } }
    const s = sc(await call(d, 'search_places', SEARCH_INPUT))
    expect(s.status).toBe('partial'); expect(validateJsonSchema(CATALOG.search_places.outputSchema, s)).toEqual([])
  })
  it('job tools: create, status, cancel and result all conform; a finished result conforms with its itinerary', async () => {
    const d = deps(); const store = d.jobs as ReturnType<typeof createInMemoryJobStore>
    const created = sc(await call(d, 'create_itinerary', { destination: 'Huế', days: 2 }))
    expect(validateJsonSchema(CATALOG.create_itinerary.outputSchema, created)).toEqual([])
    expect(validateJsonSchema(CATALOG.get_itinerary_job_status.outputSchema, sc(await call(d, 'get_itinerary_job_status', { job_id: created.job_id })))).toEqual([])
    const pending = sc(await call(d, 'get_itinerary_job_result', { job_id: created.job_id }))
    expect(validateJsonSchema(CATALOG.get_itinerary_job_result.outputSchema, pending)).toEqual([]); expect(pending.result).toBeNull()
    await store.claim('w', 60_000); await store.complete(created.job_id, 'w', { days: [{ day: 1, items: [{ title: 'Đại Nội', kind: 'attraction', url: 'https://a.example/' }] }, { day: 2, items: [] }] })
    const done = sc(await call(d, 'get_itinerary_job_result', { job_id: created.job_id }))
    expect(done.status).toBe('succeeded'); expect(validateJsonSchema(CATALOG.get_itinerary_job_result.outputSchema, done)).toEqual([])
    const other = sc(await call(d, 'create_itinerary_job', { destination: 'Hà Nội', days: 1 }))
    expect(validateJsonSchema(CATALOG.cancel_itinerary_job.outputSchema, sc(await call(d, 'cancel_itinerary_job', { job_id: other.job_id })))).toEqual([])
  })
  it('the validator itself rejects a wrong result (so the checks above can fail)', () => {
    expect(validateJsonSchema(CATALOG.search_places.outputSchema, { status: 'success' }).length).toBeGreaterThan(0)
    expect(validateJsonSchema(CATALOG.search_places.outputSchema, { status: 'success', query_context: {}, results: [{ name: 1 }], warnings: [], next_action: null }).length).toBeGreaterThan(0)
  })
})
