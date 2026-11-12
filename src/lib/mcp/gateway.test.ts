import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleMcpRequest, type GatewayDeps, type GatewayResponse } from './gateway'
import { createSpendPool } from './spendPool'
import { createInMemoryJobStore, unavailableJobStore } from './jobs'
import { createAbuseMonitor } from './abuseGuard'
import { NO_ADAPTERS, type ServiceAdapter } from './serviceMap'
import type { VerifiedClaims } from './connectorContract'
import { __resetKvCounters } from '@/lib/security/kvCounter'

const NOW = new Date('2026-11-11T03:00:00Z')
const AUD = 'https://mcp.test/api/mcp'
const ALL_SCOPES = ['places:read', 'hotels:read', 'shopping:read', 'itinerary:create']
const CAPS = { MCP_POOL_DAILY_USD: '1', MCP_POOL_HOST_USD: '1', MCP_POOL_INSTALL_USD: '1', MCP_POOL_PRINCIPAL_USD: '0.5', MCP_POOL_TOOL_USD: '1', MCP_POOL_REQUEST_USD: '1' }
const claims = (o: Partial<VerifiedClaims> = {}): VerifiedClaims => ({ audience: AUD, scopes: ALL_SCOPES, expiresAt: NOW.getTime() / 1000 + 3600, revoked: false, host: 'claude', installId: 'inst-1', userId: null, principalId: 'anon-1', ...o })
const SERPER_ROW = (i: number) => ({ name: `Quán ${i}`, address: 'Quận 1', rating_value: 4.5, place_id: `id${i}`, maps_link: 'https://www.google.com/maps/place/?q=place_id:x', lat: 10.77, lng: 106.7, phone: '0900', _tappy_ranking: { score: 0.9 }, tvi_fact_id: 'internal' })

const HCMC = { latitude: 10.776, longitude: 106.7 }
const PARIS = { latitude: 48.85, longitude: 2.35 }

function mk(over: Partial<GatewayDeps> = {}, adapter?: ServiceAdapter) {
  const placesAdapter = vi.fn(adapter ?? (async () => ({ rows: Array.from({ length: 30 }, (_, i) => SERPER_ROW(i)) })))
  const events: Array<Record<string, unknown>> = []
  const deps: GatewayDeps = {
    verify: vi.fn(async () => claims()), expectedAudience: AUD, resourceMetadataUrl: 'https://mcp.test/.well-known/oauth-protected-resource',
    adapters: { ...NO_ADAPTERS, 'places.search': placesAdapter, 'shopping.search': vi.fn(async () => ({ rows: [{ title: 'Ốp lưng', link: 'https://shop.example/p', price: '99.000 ₫' }] })), 'hotels.prices': vi.fn(async () => ({ rows: [{ name: 'Hotel A', link: 'https://h.example' }] })) },
    spend: createSpendPool({ env: CAPS }), jobs: createInMemoryJobStore(() => NOW), abuse: createAbuseMonitor({ now: () => NOW }),
    rateLimit: async () => ({ ok: true, retryAfter: 0 }),
    now: () => NOW, log: e => { events.push(e) }, allowedOrigins: [], ...over,
  }
  return { deps, placesAdapter, events }
}
const rpc = (method: string, params?: unknown, id: number | string = 1) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })
const call = (name: string, args: unknown) => rpc('tools/call', { name, arguments: args })
const run = (body: unknown, deps: GatewayDeps, extra: { authorization?: string | null; origin?: string | null; signal?: AbortSignal } = {}) =>
  handleMcpRequest({ authorization: 'Bearer test', body, ...extra }, deps)
const result = (r: GatewayResponse) => (r.body as { result: Record<string, unknown> }).result
const structured = (r: GatewayResponse) => result(r).structuredContent as Record<string, any>
const errCode = (r: GatewayResponse) => structured(r).error.code as string

beforeEach(() => __resetKvCounters())

describe('transport and protocol', () => {
  it('rejects a request carrying an Origin that is not allowlisted (DNS-rebinding guard); accepts an allowlisted one', async () => {
    const { deps } = mk({ allowedOrigins: ['https://claude.ai'] })
    expect((await run(rpc('ping'), deps, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await run(rpc('ping'), deps, { origin: 'https://claude.ai' })).status).toBe(200)
    expect((await run(rpc('ping'), deps)).status).toBe(200)
  })
  it('initialize: states a protocol version and tools only: no tasks, resources, prompts or sampling are advertised', async () => {
    const r = await run(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } }), mk().deps)
    const res = result(r) as any
    expect(res.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Object.keys(res.capabilities)).toEqual(['tools'])
    expect(JSON.stringify(res.capabilities)).not.toMatch(/tasks/)
    expect(res.serverInfo.name).toBe('tappyai_mcp')
    expect(res.instructions).toMatch(/Vietnam/)
  })
  it('ping returns an empty result; a notification gets 202 and no body', async () => {
    expect(result(await run(rpc('ping'), mk().deps))).toEqual({})
    const n = await run({ jsonrpc: '2.0', method: 'notifications/initialized' }, mk().deps)
    expect(n.status).toBe(202); expect(n.body).toBeNull()
  })
  it('refuses a JSON-RPC batch, malformed bodies and unknown methods with the standard codes', async () => {
    const { deps } = mk()
    expect(((await run([rpc('ping')], deps)).body as any).error.code).toBe(-32600)
    expect(((await run('nope', deps)).body as any).error.code).toBe(-32600)
    expect(((await run({ id: 1, method: 'ping' }, deps)).body as any).error.code).toBe(-32600)
    expect(((await run(rpc('resources/list'), deps)).body as any).error.code).toBe(-32601)
    expect(((await run(rpc('tasks/get', { id: 'x' }), deps)).body as any).error.code).toBe(-32601)
    expect(((await run(rpc('tools/call', { name: 5 }), deps)).body as any).error.code).toBe(-32602)
  })
  it('tools/list publishes the ten tools with schema and annotations', async () => {
    const r = await run(rpc('tools/list'), mk().deps)
    const tools = (result(r) as any).tools as Array<any>
    expect(tools.map(t => t.name).sort()).toEqual(['cancel_itinerary_job', 'create_itinerary', 'create_itinerary_job', 'get_itinerary_job_result', 'get_itinerary_job_status', 'search_attractions', 'search_hotels', 'search_places', 'search_restaurants', 'search_shopping'])
    for (const t of tools) { expect(t.inputSchema.type).toBe('object'); expect(typeof t.annotations.readOnlyHint).toBe('boolean'); expect(t.description.length).toBeGreaterThan(10) }
    expect(tools.find(t => t.name === 'search_places').annotations.readOnlyHint).toBe(true)
    expect(tools.find(t => t.name === 'create_itinerary').annotations.readOnlyHint).toBe(false)
  })
})

describe('authentication is judged on every request', () => {
  it('no verified identity: 401 with a WWW-Authenticate challenge, and nothing is dispatched', async () => {
    const { deps, placesAdapter } = mk({ verify: vi.fn(async () => null) })
    const r = await run(call('search_places', { query: 'pho', ...HCMC }), deps, { authorization: null })
    expect(r.status).toBe(401); expect(r.headers['WWW-Authenticate']).toMatch(/^Bearer resource_metadata="https:\/\/mcp\.test/)
    expect(placesAdapter).not.toHaveBeenCalled()
  })
  it('a verifier that throws is a failed authentication, not a pass', async () => {
    const { deps } = mk({ verify: vi.fn(async () => { throw new Error('jwks down') }) })
    expect((await run(rpc('ping'), deps)).status).toBe(401)
  })
  it('wrong audience, expired and revoked tokens are refused as AUTH_INVALID (401) on every method, even ping', async () => {
    for (const c of [claims({ audience: 'https://other.example' }), claims({ expiresAt: NOW.getTime() / 1000 - 1 }), claims({ revoked: true })]) {
      const { deps, placesAdapter } = mk({ verify: vi.fn(async () => c) })
      for (const body of [rpc('ping'), rpc('tools/list'), call('search_places', { query: 'pho', ...HCMC })]) {
        const r = await run(body, deps); expect(r.status).toBe(401); expect((r.body as any).code).toBe('AUTH_INVALID')
      }
      expect(placesAdapter).not.toHaveBeenCalled()
    }
  })
  it('the verifier is asked on EVERY request (a token that passed before proves nothing now)', async () => {
    const { deps } = mk()
    await run(rpc('ping'), deps); await run(rpc('ping'), deps); await run(rpc('tools/list'), deps)
    expect(deps.verify).toHaveBeenCalledTimes(3)
  })
  it('passes the Authorization header to the verifier and never to anything else (not logged, not returned)', async () => {
    const { deps, events } = mk()
    const r = await run(call('search_places', { query: 'phở bò', ...HCMC }), deps, { authorization: 'Bearer SUPER-SECRET-TOKEN' })
    expect(deps.verify).toHaveBeenCalledWith('Bearer SUPER-SECRET-TOKEN')
    expect(JSON.stringify(r.body)).not.toContain('SUPER-SECRET-TOKEN')
    expect(JSON.stringify(events)).not.toContain('SUPER-SECRET-TOKEN')
  })
})

describe('authorisation: scope per tool, checked per call', () => {
  it('a token without the tool scope gets ACCESS_DENIED and the service is not called', async () => {
    const { deps, placesAdapter } = mk({ verify: vi.fn(async () => claims({ scopes: ['shopping:read'] })) })
    expect(errCode(await run(call('search_places', { query: 'pho', ...HCMC }), deps))).toBe('ACCESS_DENIED')
    expect(placesAdapter).not.toHaveBeenCalled()
    expect(errCode(await run(call('search_hotels', { query: 'h', location_query: 'Da Nang' }), deps))).toBe('ACCESS_DENIED')
    expect(errCode(await run(call('create_itinerary', { destination: 'Hue', days: 2 }), deps))).toBe('ACCESS_DENIED')
  })
  it('an unknown tool is a protocol error (-32602), including prototype names', async () => {
    for (const n of ['drop_table', '__proto__', 'constructor', 'toString']) expect(((await run(call(n, {}), mk().deps)).body as any).error.code).toBe(-32602)
  })
})

describe('search tools: validation, context, market, shaping', () => {
  it('invalid input is INVALID_INPUT and nothing is dispatched or spent', async () => {
    const { deps, placesAdapter } = mk()
    const r = await run(call('search_places', { query: '', ...HCMC }), deps)
    expect(result(r).isError).toBe(true); expect(errCode(r)).toBe('INVALID_INPUT'); expect(placesAdapter).not.toHaveBeenCalled()
    expect(errCode(await run(call('search_places', { query: 'pho', ...HCMC, extra: 1 }), deps))).toBe('INVALID_INPUT')
  })
  it('success: calls the one allowlisted service, returns only DTO fields, Top-K default, and no internal data', async () => {
    const { deps, placesAdapter } = mk()
    const r = await run(call('search_places', { query: 'pho', ...HCMC }), deps)
    expect(placesAdapter).toHaveBeenCalledTimes(1)
    expect(placesAdapter.mock.calls[0][0]).toMatchObject({ query: 'pho', lat: 10.776, lng: 106.7, lang: 'vi' })
    expect(result(r).isError).toBe(false)
    const s = structured(r)
    expect(s.status).toBe('success'); expect(s.results.length).toBe(5)
    expect(s.query_context).toMatchObject({ market: 'vn', context_source: 'explicit_coordinates' })
    const json = JSON.stringify(r.body)
    for (const leak of ['_tappy_ranking', 'tvi_fact_id', 'internal', '0900', '10.77', '106.7', 'anon-1', 'inst-1']) expect(json, leak).not.toContain(leak)
    expect(JSON.parse((result(r).content as any)[0].text)).toEqual(s) // the text block carries the same structured payload
  })
  it('limit raises the count up to the tool ceiling', async () => {
    const r = await run(call('search_places', { query: 'pho', limit: 8, ...HCMC }), mk().deps)
    expect(structured(r).results.length).toBe(8)
  })
  it('each search tool reaches its own fixed service (restaurant/attraction type, shopping, hotels)', async () => {
    const { deps, placesAdapter } = mk()
    await run(call('search_restaurants', { query: 'pho', ...HCMC }), deps)
    await run(call('search_attractions', { query: 'museum', ...HCMC }), deps)
    expect(placesAdapter.mock.calls.map(c => c[0]?.placeType)).toEqual(['restaurant', 'attraction'])
    const shop = await run(call('search_shopping', { query: 'ốp lưng' }), deps)
    expect(structured(shop).results[0]).toMatchObject({ title: 'Ốp lưng', url: 'https://shop.example/p' })
    const hotel = await run(call('search_hotels', { query: 'hotel', location_query: 'Đà Nẵng' }), deps)
    expect(structured(hotel).results[0]).toMatchObject({ name: 'Hotel A' })
  })
  it('an unwired service (Agoda/Vexere style, no key yet) is PROVIDER_UNAVAILABLE and spends nothing', async () => {
    const { deps } = mk({ adapters: { ...NO_ADAPTERS } })
    const r = await run(call('search_hotels', { query: 'hotel', location_query: 'Đà Nẵng' }), deps)
    expect(errCode(r)).toBe('PROVIDER_UNAVAILABLE'); expect(structured(r).error.retryable).toBe(false)
    // nothing was counted: a full-cap request still fits afterwards
    const { deps: d2 } = mk({ spend: deps.spend })
    expect((await run(call('search_places', { query: 'pho', ...HCMC }), d2)).status).toBe(200)
  })
  it('a market outside Vietnam is MARKET_UNSUPPORTED (server-side) and nothing is dispatched or spent', async () => {
    const { deps, placesAdapter } = mk()
    const r = await run(call('search_places', { query: 'bakery', ...PARIS }), deps)
    expect(errCode(r)).toBe('MARKET_UNSUPPORTED'); expect(placesAdapter).not.toHaveBeenCalled()
    expect(structured(r).error.message).toMatch(/Vietnam/)
  })
  it('a location-bound tool with no usable location is SUPPORTED_MARKET_REQUIRED, never a guessed city; the IP is not an input', async () => {
    const { deps, placesAdapter } = mk()
    expect(errCode(await run(call('search_places', { query: 'pho' }), deps))).toBe('SUPPORTED_MARKET_REQUIRED')
    expect(errCode(await run(call('search_places', { query: 'pho', location_query: 'Paris' }), deps))).toBe('SUPPORTED_MARKET_REQUIRED')
    expect(placesAdapter).not.toHaveBeenCalled()
  })
  it('a known Vietnamese destination in text resolves the market; shopping needs no location', async () => {
    const { deps } = mk()
    const r = await run(call('search_places', { query: 'pho', location_query: 'Hội An' }), deps)
    expect(structured(r).query_context).toMatchObject({ market: 'vn', context_source: 'explicit_location' })
    expect((await run(call('search_shopping', { query: 'tai nghe' }), deps)).status).toBe(200)
  })
  it('an adapter that returns nothing is an honest empty success, not an invented result', async () => {
    const r = await run(call('search_places', { query: 'pho', ...HCMC }), mk({}, async () => ({ rows: [] })).deps)
    expect(structured(r)).toMatchObject({ status: 'success', results: [] })
  })
})

describe('spend pool and failure behaviour (fail closed)', () => {
  it('no budget configured: BUDGET_EXCEEDED and the provider is not called', async () => {
    const { deps, placesAdapter } = mk({ spend: createSpendPool({ env: {} }) })
    expect(errCode(await run(call('search_places', { query: 'pho', ...HCMC }), deps))).toBe('BUDGET_EXCEEDED')
    expect(placesAdapter).not.toHaveBeenCalled()
  })
  it('the pool running out refuses further paid calls with BUDGET_EXCEEDED', async () => {
    const { deps, placesAdapter } = mk({ spend: createSpendPool({ env: { ...CAPS, MCP_POOL_PRINCIPAL_USD: '0.015' } }) })
    await run(call('search_places', { query: 'a', ...HCMC }), deps)
    const second = await run(call('search_places', { query: 'b', ...HCMC }), deps)
    expect(errCode(second)).toBe('BUDGET_EXCEEDED')
    expect(placesAdapter).toHaveBeenCalledTimes(1)
  })
  it('a down budget store is PROVIDER_UNAVAILABLE (retryable) and the provider is not called', async () => {
    const down = createSpendPool({ env: CAPS, incr: async () => ({ count: 0, scope: 'store_down' as const }) })
    const { deps, placesAdapter } = mk({ spend: down })
    const r = await run(call('search_places', { query: 'pho', ...HCMC }), deps)
    expect(errCode(r)).toBe('PROVIDER_UNAVAILABLE'); expect(structured(r).error.retryable).toBe(true); expect(placesAdapter).not.toHaveBeenCalled()
  })
  it('a throwing provider is PROVIDER_UNAVAILABLE with a safe message (no internals), and the reservation is KEPT (unknown outcome)', async () => {
    const { deps, events } = mk({ spend: createSpendPool({ env: { ...CAPS, MCP_POOL_PRINCIPAL_USD: '0.015' } }) }, async () => { throw new Error('SERPER_API_KEY=sk-live-123 at /srv/app/food.ts:44') })
    const r = await run(call('search_places', { query: 'pho', ...HCMC }), deps)
    expect(errCode(r)).toBe('PROVIDER_UNAVAILABLE')
    const json = JSON.stringify(r.body) + JSON.stringify(events)
    expect(json).not.toMatch(/sk-live|SERPER_API_KEY|food\.ts/)
    expect(events.some(e => e.unknown_outcome === true)).toBe(true)
    expect(errCode(await run(call('search_places', { query: 'again', ...HCMC }), deps))).toBe('BUDGET_EXCEEDED') // still counted
  })
  it('the deadline returns DEADLINE_EXCEEDED, does not wait for the provider, and keeps the reservation', async () => {
    const { deps } = mk({ deadlineMs: () => 30, spend: createSpendPool({ env: { ...CAPS, MCP_POOL_PRINCIPAL_USD: '0.015' } }) }, () => new Promise(() => { /* never settles */ }))
    const t0 = Date.now()
    const r = await run(call('search_places', { query: 'pho', ...HCMC }), deps)
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(errCode(r)).toBe('DEADLINE_EXCEEDED')
    expect(errCode(await run(call('search_places', { query: 'again', ...HCMC }), deps))).toBe('BUDGET_EXCEEDED')
  })
  it('a client that is already gone: nothing dispatched, reservation released', async () => {
    const ac = new AbortController(); ac.abort()
    const { deps, placesAdapter } = mk({ spend: createSpendPool({ env: { ...CAPS, MCP_POOL_PRINCIPAL_USD: '0.015' } }) })
    await run(call('search_places', { query: 'pho', ...HCMC }), deps, { signal: ac.signal })
    expect(placesAdapter).not.toHaveBeenCalled()
    expect((await run(call('search_places', { query: 'again', ...HCMC }), deps)).status).toBe(200) // budget was given back
  })
  it('a client that disconnects while the provider runs: the call returns, the reservation is kept, the signal reaches the adapter', async () => {
    const ac = new AbortController(); let seen: AbortSignal | undefined
    const { deps } = mk({}, (c) => { seen = c.signal; return new Promise(() => { /* hangs */ }) })
    const p = run(call('search_places', { query: 'pho', ...HCMC }), deps, { signal: ac.signal })
    setTimeout(() => ac.abort(), 10)
    const r = await p
    expect(seen).toBeDefined(); expect(errCode(r)).toBe('DEADLINE_EXCEEDED')
  })
  it('rate limiting is applied per principal and fails closed', async () => {
    const { deps, placesAdapter } = mk({ rateLimit: async () => ({ ok: false, retryAfter: 7 }) })
    const r = await run(call('search_places', { query: 'pho', ...HCMC }), deps)
    expect(errCode(r)).toBe('RATE_LIMITED'); expect(structured(r).error.retry_after_s).toBe(7); expect(placesAdapter).not.toHaveBeenCalled()
  })
})

describe('abuse monitor', () => {
  it('a high-risk principal is ABUSE_RESTRICTED and nothing is dispatched or spent', async () => {
    const abuse = { observe: () => ({ level: 'high' as const, depthFactor: 0 }), size: () => 0 }
    const { deps, placesAdapter } = mk({ abuse })
    expect(errCode(await run(call('search_places', { query: 'pho', ...HCMC }), deps))).toBe('ABUSE_RESTRICTED')
    expect(placesAdapter).not.toHaveBeenCalled()
  })
  it('an elevated principal gets reduced depth, labelled partial with a warning', async () => {
    const abuse = { observe: () => ({ level: 'elevated' as const, depthFactor: 0.4 }), size: () => 0 }
    const r = await run(call('search_places', { query: 'pho', limit: 10, ...HCMC }), mk({ abuse }).deps)
    const s = structured(r)
    expect(s.results.length).toBe(4); expect(s.status).toBe('partial'); expect(s.warnings.join(' ')).toMatch(/reduced/i)
  })
})

describe('itinerary jobs (fallback job tools; durable store not chosen yet)', () => {
  it('create_itinerary and create_itinerary_job both return a job handle and do not call any retrieval service', async () => {
    const { deps, placesAdapter } = mk()
    for (const n of ['create_itinerary', 'create_itinerary_job']) {
      const r = await run(call(n, { destination: 'Huế', days: 2 }), deps)
      const s = structured(r)
      expect(result(r).isError).toBe(false)
      expect(s).toMatchObject({ status: 'queued' }); expect(s.job_id).toMatch(/^job_/); expect(s.poll_after_ms).toBeGreaterThan(0)
      expect(Object.keys(s)).toEqual(expect.arrayContaining(['job_id', 'status', 'created_at', 'poll_after_ms', 'expires_at']))
    }
    expect(placesAdapter).not.toHaveBeenCalled()
  })
  it('status, result and cancel work for the owner', async () => {
    const { deps } = mk()
    const job = structured(await run(call('create_itinerary_job', { destination: 'Huế', days: 2 }), deps)).job_id
    expect(structured(await run(call('get_itinerary_job_status', { job_id: job }), deps)).status).toBe('queued')
    expect(structured(await run(call('get_itinerary_job_result', { job_id: job }), deps))).toMatchObject({ status: 'queued', result: null })
    expect(structured(await run(call('cancel_itinerary_job', { job_id: job }), deps)).status).toBe('cancelled')
  })
  it('ANOTHER principal cannot poll, read or cancel the job: it simply does not exist for them', async () => {
    const { deps } = mk()
    const job = structured(await run(call('create_itinerary_job', { destination: 'Huế', days: 2 }), deps)).job_id
    const other = { ...deps, verify: vi.fn(async () => claims({ principalId: 'anon-2' })) }
    for (const n of ['get_itinerary_job_status', 'get_itinerary_job_result', 'cancel_itinerary_job']) {
      expect(errCode(await run(call(n, { job_id: job }), other))).toBe('JOB_NOT_FOUND')
    }
    expect(errCode(await run(call('get_itinerary_job_status', { job_id: 'job_00000000-0000-4000-8000-000000000000' }), deps))).toBe('JOB_NOT_FOUND')
    // and the owner's job is untouched
    expect(structured(await run(call('get_itinerary_job_status', { job_id: job }), deps)).status).toBe('queued')
  })
  it('a malformed job id is INVALID_INPUT before the store is touched', async () => {
    const jobs = { ...unavailableJobStore, get: vi.fn() }
    expect(errCode(await run(call('get_itinerary_job_status', { job_id: '../../etc/passwd' }), mk({ jobs }).deps))).toBe('INVALID_INPUT')
    expect(jobs.get).not.toHaveBeenCalled()
  })
  it('a finished job returns only the allowlisted itinerary DTO: unknown fields and bad URLs are dropped; a malformed stored result is null', async () => {
    const jobs = createInMemoryJobStore(() => NOW)
    const { deps } = mk({ jobs })
    const id = structured(await run(call('create_itinerary_job', { destination: 'Huế', days: 1 }), deps)).job_id
    await jobs.claim('w1', 60_000)
    await jobs.complete(id, 'w1', { days: [{ day: 1, internal_note: 'secret', items: [{ title: 'Đại Nội', kind: 'attraction', url: 'javascript:alert(1)', cost_basis: 12 }, { title: 'Quán A', kind: 'restaurant', url: 'https://a.example/x', tvi_id: 'internal' }] }], worker_debug: 'x' })
    const out = structured(await run(call('get_itinerary_job_result', { job_id: id }), deps))
    expect(out.result).toEqual({ days: [{ day: 1, items: [{ title: 'Đại Nội', kind: 'attraction' }, { title: 'Quán A', kind: 'restaurant', url: 'https://a.example/x' }] }] })
    expect(JSON.stringify(out)).not.toMatch(/secret|internal|worker_debug|cost_basis/)
    const id2 = structured(await run(call('create_itinerary_job', { destination: 'Hà Nội', days: 1 }), deps)).job_id
    await jobs.claim('w1', 60_000); await jobs.complete(id2, 'w1', { days: 'nope' })
    expect(structured(await run(call('get_itinerary_job_result', { job_id: id2 }), deps)).result).toBeNull()
  })
  it('the default (unavailable) job store fails closed with PROVIDER_UNAVAILABLE', async () => {
    const { deps } = mk({ jobs: unavailableJobStore })
    expect(errCode(await run(call('create_itinerary', { destination: 'Huế', days: 2 }), deps))).toBe('PROVIDER_UNAVAILABLE')
    expect(errCode(await run(call('get_itinerary_job_status', { job_id: 'job_00000000-0000-4000-8000-000000000000' }), deps))).toBe('PROVIDER_UNAVAILABLE')
  })
  it('job tools are scope-checked like any other tool', async () => {
    const { deps } = mk({ verify: vi.fn(async () => claims({ scopes: ['places:read'] })) })
    for (const n of ['create_itinerary_job', 'get_itinerary_job_status', 'get_itinerary_job_result', 'cancel_itinerary_job']) expect(errCode(await run(call(n, { destination: 'Huế', days: 2, job_id: 'job_00000000-0000-4000-8000-000000000000' }), deps))).toBe('ACCESS_DENIED')
  })
})

describe('telemetry', () => {
  it('emits one event per tool call with attribution fields and no token, query text, or raw principal id', async () => {
    const { deps, events } = mk()
    await run(call('search_places', { query: 'bí mật riêng tư', ...HCMC }), deps)
    const e = events.find(x => x.type === 'tappyai_mcp_call')!
    expect(e).toMatchObject({ tool: 'search_places', host: 'claude', status: 'success', execution_mode: 'SYNC', result_count: 5 })
    expect(typeof e.request_id).toBe('string'); expect(typeof e.latency_ms).toBe('number'); expect(typeof e.estimated_cost_usd).toBe('number')
    const json = JSON.stringify(events)
    for (const leak of ['bí mật riêng tư', 'anon-1', '10.776']) expect(json).not.toContain(leak)
  })
})
