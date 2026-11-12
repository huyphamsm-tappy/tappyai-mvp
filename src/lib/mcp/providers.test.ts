import { describe, it, expect, vi, beforeEach } from 'vitest'
import { keysPresent, hotelProviderFromEnv, transportProviderFromEnv, providerStatus, hotelAdapter, fakeHotelProvider, fakeTransportProvider, PROVIDER_KEY_ENV, HOTEL_PROVIDER_FACTORY, TRANSPORT_PROVIDER_FACTORY } from './providers'
import { realAdapters } from './defaultDeps'
import { handleMcpRequest, type GatewayDeps } from './gateway'
import { createSpendPool } from './spendPool'
import { createInMemoryJobStore } from './jobs'
import { createAbuseMonitor } from './abuseGuard'
import { NO_ADAPTERS } from './serviceMap'
import type { VerifiedClaims } from './connectorContract'
import { __resetKvCounters } from '@/lib/security/kvCounter'

const NOW = new Date('2026-11-12T03:00:00Z')
const AUD = 'https://mcp.test/api/mcp'
const claims: VerifiedClaims = { audience: AUD, scopes: ['hotels:read'], expiresAt: NOW.getTime() / 1000 + 3600, revoked: false, host: 'claude', installId: 'claude:c1', userId: null, principalId: 'a:x' }
const CAPS = { MCP_POOL_DAILY_USD: '1', MCP_POOL_HOST_USD: '1', MCP_POOL_INSTALL_USD: '1', MCP_POOL_PRINCIPAL_USD: '1', MCP_POOL_TOOL_USD: '1', MCP_POOL_REQUEST_USD: '1' }
const OFFERS = [
  { name: 'Khách sạn Sông Hàn', address: '12 Bạch Đằng, Đà Nẵng', rating: 8.7, stars: 4, pricePerNight: 1_200_000, currency: 'VND', url: 'https://www.agoda.example/song-han' },
  { name: 'Homestay Biển', pricePerNight: 450_000, currency: 'VND', url: 'javascript:alert(1)' },
]
const deps = (hotels: ReturnType<typeof hotelAdapter> | null): GatewayDeps => ({
  verify: async () => claims, expectedAudience: AUD, adapters: { ...NO_ADAPTERS, 'hotels.prices': hotels }, spend: createSpendPool({ env: CAPS }), jobs: createInMemoryJobStore(() => NOW),
  abuse: createAbuseMonitor({ now: () => NOW }), rateLimit: async () => ({ ok: true, retryAfter: 0 }), now: () => NOW, log: () => {}, allowedOrigins: [], deadlineMs: () => 50,
})
const call = (d: GatewayDeps, args: unknown) => handleMcpRequest({ authorization: 'Bearer t', body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_hotels', arguments: args } } }, d)
const sc = (r: { body: unknown }) => (r.body as { result: { structuredContent: Record<string, any> } }).result.structuredContent
beforeEach(() => __resetKvCounters())

describe('key gate: presence only, and a client must exist', () => {
  it('keysPresent needs every named setting non-empty', () => {
    expect(keysPresent(PROVIDER_KEY_ENV.agoda, {})).toBe(false)
    expect(keysPresent(PROVIDER_KEY_ENV.agoda, { AGODA_API_KEY: 'x' })).toBe(false)
    expect(keysPresent(PROVIDER_KEY_ENV.agoda, { AGODA_API_KEY: 'x', AGODA_SITE_ID: ' ' })).toBe(false)
    expect(keysPresent(PROVIDER_KEY_ENV.agoda, { AGODA_API_KEY: 'x', AGODA_SITE_ID: 'y' })).toBe(true)
  })
  it('no real client exists today: even with every key present the providers stay null (unwired)', () => {
    expect(HOTEL_PROVIDER_FACTORY).toBeNull(); expect(TRANSPORT_PROVIDER_FACTORY).toBeNull()
    expect(hotelProviderFromEnv({ AGODA_API_KEY: 'x', AGODA_SITE_ID: 'y' })).toBeNull()
    expect(transportProviderFromEnv({ VEXERE_API_KEY: 'x' })).toBeNull()
    expect(realAdapters({ AGODA_API_KEY: 'x', AGODA_SITE_ID: 'y' })['hotels.prices']).toBeNull()
  })
  it('a provider is built only when BOTH the keys are present and a factory is supplied', () => {
    const p = fakeHotelProvider([])
    const factory = vi.fn(() => p)
    expect(hotelProviderFromEnv({}, factory)).toBeNull(); expect(factory).not.toHaveBeenCalled()
    expect(hotelProviderFromEnv({ AGODA_API_KEY: 'x', AGODA_SITE_ID: 'y' }, factory)).toBe(p)
    const t = fakeTransportProvider([])
    expect(transportProviderFromEnv({ VEXERE_API_KEY: 'k' }, () => t)).toBe(t); expect(transportProviderFromEnv({}, () => t)).toBeNull()
  })
  it('providerStatus reports booleans only, never a value', () => {
    const s = providerStatus({ AGODA_API_KEY: 'SECRET-VALUE-1', AGODA_SITE_ID: 'SECRET-VALUE-2' })
    expect(s).toEqual({ agoda: { keys: true, client: false }, vexere: { keys: false, client: false } })
    expect(JSON.stringify(s)).not.toContain('SECRET')
  })
})

describe('hotels through the Gateway with a fake provider (contract test; no real provider exists)', () => {
  it('returns DTO fields only: name, address, rating, stars, price per night, currency, a safe URL; no availability claim', async () => {
    const p = fakeHotelProvider(OFFERS)
    const r = await call(deps(hotelAdapter(p)), { query: 'hotel', location_query: 'Đà Nẵng', check_in: '2026-12-01', check_out: '2026-12-03' })
    const s = sc(r)
    expect(s.status).toBe('success')
    expect(s.results[0]).toEqual({ name: 'Khách sạn Sông Hàn', address: '12 Bạch Đằng, Đà Nẵng', rating: 8.7, stars: 4, pricePerNight: 1_200_000, currency: 'VND', url: 'https://www.agoda.example/song-han' })
    expect(s.results[1].url).toBeUndefined() // javascript: URL dropped
    expect(JSON.stringify(s)).not.toMatch(/avail|vacan/i)
    expect(p.calls[0]).toMatchObject({ location: 'Đà Nẵng', checkIn: '2026-12-01', checkOut: '2026-12-03', lang: 'vi' })
    expect(p.calls[0].signal).toBeDefined() // cancellation reaches the provider
  })
  it('a provider failure is PROVIDER_UNAVAILABLE with no provider text; a hang is DEADLINE_EXCEEDED, and neither refunds the reservation', async () => {
    expect(sc(await call(deps(hotelAdapter(fakeHotelProvider([], { fail: true }))), { query: 'h', location_query: 'Đà Nẵng' })).error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(sc(await call(deps(hotelAdapter(fakeHotelProvider([], { hang: true }))), { query: 'h', location_query: 'Đà Nẵng' })).error.code).toBe('DEADLINE_EXCEEDED')
  })
  it('without a provider the tool is PROVIDER_UNAVAILABLE (unwired) and nothing is reserved', async () => {
    const r = await call(deps(null), { query: 'h', location_query: 'Đà Nẵng' })
    expect(sc(r).error).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: false })
  })
  it('stay dates are validated before any provider call: out before in, impossible dates, check_out alone, over 30 nights', async () => {
    const p = fakeHotelProvider(OFFERS); const d = deps(hotelAdapter(p))
    for (const bad of [{ check_in: '2026-12-03', check_out: '2026-12-01' }, { check_in: '2026-02-30' }, { check_out: '2026-12-03' }, { check_in: '2026-12-01', check_out: '2027-02-01' }, { check_in: '2026-12-01', check_out: '2026-12-01' }]) {
      expect(sc(await call(d, { query: 'h', location_query: 'Đà Nẵng', ...bad })).error.code, JSON.stringify(bad)).toBe('INVALID_INPUT')
    }
    expect(p.calls.length).toBe(0)
    expect(sc(await call(d, { query: 'h', location_query: 'Đà Nẵng', check_in: '2026-12-01' })).status).toBe('success')
  })
})

describe('transport port (Vexere): interface and fake only; no published tool', () => {
  it('the fake honours the query and the limit', async () => {
    const t = fakeTransportProvider([{ operator: 'A', mode: 'train' }, { operator: 'B', mode: 'train' }, { operator: 'C', mode: 'bus' }])
    expect((await t.search({ from: 'Hà Nội', to: 'Huế', date: '2026-12-01', mode: 'train', limit: 2 })).length).toBe(2)
    expect(t.calls[0]).toMatchObject({ from: 'Hà Nội', to: 'Huế', mode: 'train' })
  })
})
