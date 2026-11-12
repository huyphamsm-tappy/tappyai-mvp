import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hotelProviderFromEnv, transportProviderFromEnv, providerStatus, hotelAdapter, fakeHotelProvider, fakeTransportProvider, HOTEL_PROVIDER_SOURCE, TRANSPORT_PROVIDER_SOURCE } from './providers'
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

describe('provider source gate: configured AND a source must exist', () => {
  const src = <P,>(p: P, key = 'FAKE_PROVIDER_KEY') => ({ isConfigured: (env: Record<string, string | undefined>) => typeof env[key] === 'string' && (env[key] as string).trim() !== '', create: vi.fn(() => p) })
  it('no real source exists today: whatever the environment holds the providers stay null (unwired)', () => {
    expect(HOTEL_PROVIDER_SOURCE).toBeNull(); expect(TRANSPORT_PROVIDER_SOURCE).toBeNull()
    expect(hotelProviderFromEnv({ FAKE_PROVIDER_KEY: 'x' })).toBeNull(); expect(transportProviderFromEnv({ FAKE_PROVIDER_KEY: 'x' })).toBeNull()
    expect(realAdapters({ FAKE_PROVIDER_KEY: 'x' })['hotels.prices']).toBeNull()
  })
  it('a provider is built only when a source exists AND says it is configured', () => {
    const p = fakeHotelProvider([]); const s = src(p)
    expect(hotelProviderFromEnv({}, s)).toBeNull(); expect(s.create).not.toHaveBeenCalled()
    expect(hotelProviderFromEnv({ FAKE_PROVIDER_KEY: ' ' }, s)).toBeNull()
    expect(hotelProviderFromEnv({ FAKE_PROVIDER_KEY: 'x' }, s)).toBe(p)
    const t = fakeTransportProvider([]); const ts = src(t)
    expect(transportProviderFromEnv({ FAKE_PROVIDER_KEY: 'k' }, ts)).toBe(t); expect(transportProviderFromEnv({}, ts)).toBeNull()
  })
  it('providerStatus reports booleans only, never a value', () => {
    const s = providerStatus({ FAKE_PROVIDER_KEY: 'SECRET-VALUE-1' })
    expect(s).toEqual({ hotels: { source: false, configured: false }, transport: { source: false, configured: false } })
    expect(JSON.stringify(s)).not.toContain('SECRET')
  })
  it('this file names no partner credential (the architecture guard allows only src/lib/ccp/tracking to)', () => {
    const lines = readFileSync(join(process.cwd(), 'src/lib/mcp/providers.ts'), 'utf8').split(String.fromCharCode(10))
    const code = lines.filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**')).join(' ')
    expect(code).not.toMatch(/process[.]env[.][A-Z]/)
    expect(code.toLowerCase()).not.toMatch(/api_key|site_id|secret/)
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
