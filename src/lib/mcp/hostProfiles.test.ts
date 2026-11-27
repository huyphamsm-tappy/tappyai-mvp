import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HOST_PROFILES, PROFILE_IDS, profilesFor, limitsFor } from './hostProfiles'
import { CATALOG, listTools } from './toolCatalog'
import { HOST_PLATFORMS, type HostPlatform } from './connectorContract'
import { SERVER_NAME, PROTOCOL_VERSION, handleMcpRequest, type GatewayDeps } from './gateway'
import { createSpendPool } from './spendPool'
import { createInMemoryJobStore } from './jobs'
import { createAbuseMonitor } from './abuseGuard'
import { NO_ADAPTERS } from './serviceMap'
import { GET, DELETE } from '@/app/api/mcp/route'
import { __resetKvCounters } from '@/lib/security/kvCounter'
import { NextRequest } from 'next/server'

const NOW = new Date('2026-11-12T03:00:00Z')
const AUD = 'https://mcp.test/api/mcp'
const CAPS = { MCP_POOL_DAILY_USD: '1', MCP_POOL_HOST_USD: '1', MCP_POOL_INSTALL_USD: '1', MCP_POOL_PRINCIPAL_USD: '1', MCP_POOL_TOOL_USD: '1', MCP_POOL_REQUEST_USD: '1' }
const claimsOf = (host: HostPlatform) => ({ audience: AUD, scopes: ['places:read', 'hotels:read', 'shopping:read', 'itinerary:create'], expiresAt: NOW.getTime() / 1000 + 3600, revoked: false, host, installId: `${host}:c1`, userId: null, principalId: `a:${host}` })
const ROWS = Array.from({ length: 10 }, (_, i) => ({ name: `Quán ${i}`, address: 'x'.repeat(200), place_id: `p${i}`, maps_link: 'https://m.example/x' }))
const deps = (host: HostPlatform, over: Partial<GatewayDeps> = {}): GatewayDeps => ({
  verify: async () => claimsOf(host), expectedAudience: AUD, adapters: { ...NO_ADAPTERS, 'places.search': async () => ({ rows: ROWS }) },
  spend: createSpendPool({ env: CAPS }), jobs: createInMemoryJobStore(() => NOW), abuse: createAbuseMonitor({ now: () => NOW }), rateLimit: async () => ({ ok: true, retryAfter: 0 }), now: () => NOW, log: () => {}, allowedOrigins: [], ...over,
})
const rpc = (d: GatewayDeps, method: string, params?: unknown) => handleMcpRequest({ authorization: 'Bearer t', body: { jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) } }, d)
beforeEach(() => __resetKvCounters())

describe('profiles are data, separate per Host, and make no parity claim', () => {
  it('eight profiles: Claude, ChatGPT, Gemini Apps, Gemini API, Cursor, Grok API, DeepSeek and Meta are separate entries (the two Gemini channels are not one product)', () => {
    expect(PROFILE_IDS.sort()).toEqual(['chatgpt', 'claude', 'cursor', 'deepseek', 'gemini_api', 'gemini_apps', 'grok_api', 'meta'])
    expect(HOST_PLATFORMS.length).toBe(7)
    for (const h of HOST_PLATFORMS) expect(profilesFor(h).length, h).toBeGreaterThan(0)
    expect(HOST_PROFILES.gemini_apps.label).not.toBe(HOST_PROFILES.gemini_api.label)
    expect(profilesFor('gemini').map(p => p.id).sort()).toEqual(['gemini_api', 'gemini_apps'])
    expect(profilesFor('claude').length).toBe(1)
  })
  it('every profile is UNVERIFIED, cites a dated baseline (the connector doc, or the 22/11/2026 web search that says it was not tested on a real account), and lists what must be proven on the real Host', () => {
    for (const p of Object.values(HOST_PROFILES)) {
      expect(p.verification, p.id).toBe('unverified'); expect(p.baseline).toMatch(/10\/11\/2026|22-11-2026 \(not tested on a real account\)/)
      expect(p.mustVerify.length, p.id).toBeGreaterThanOrEqual(6); expect(p.eligibility.length, p.id).toBeGreaterThan(0)
    }
  })
  it('no profile asserts parity, availability in Vietnam, or a verified status in any text', () => {
    const text = JSON.stringify(Object.values(HOST_PROFILES), (_k, v) => (v instanceof RegExp ? v.source : v))
    expect(text).not.toMatch(/\bparity\b|same as|identical|fully supported|verified: ?true/i)
    expect(HOST_PROFILES.gemini_apps.eligibility.join(' ')).toMatch(/NOT to be represented as available in Vietnam/)
  })
  it('profiles carry configuration only: no function, no search/ranking/entitlement/TVI field', () => {
    for (const p of Object.values(HOST_PROFILES)) {
      expect(Object.keys(p).sort()).toEqual(['baseline', 'eligibility', 'host', 'id', 'label', 'limits', 'mustVerify', 'serverNameRule', 'toolNameRule', 'transport', 'verification'])
      for (const v of Object.values(p)) expect(typeof v).not.toBe('function')
    }
  })
  it('the limits that apply to a Host are the strictest of its profiles, and are finite server-side placeholders', () => {
    for (const h of HOST_PLATFORMS) { const l = limitsFor(h); expect(l.serverDeadlineMs).toBeGreaterThan(0); expect(l.serverDeadlineMs).toBeLessThan(60_000); expect(l.maxResponseBytes).toBeGreaterThan(0) }
  })
})

describe('compatibility tests, one block per profile (offline: structure and behaviour we control, not Host acceptance)', () => {
  for (const id of PROFILE_IDS) {
    const p = HOST_PROFILES[id]
    describe(p.label, () => {
      it('speaks Streamable HTTP over a stateless POST and offers no SSE stream', async () => {
        expect(p.transport).toEqual({ streamableHttp: true, sse: false })
        vi.stubEnv('MCP_GATEWAY', '1')
        try { for (const r of [await GET(new NextRequest('http://localhost/api/mcp')), await DELETE(new NextRequest('http://localhost/api/mcp', { method: 'DELETE' }))]) expect(r.status).toBe(405) } finally { vi.unstubAllEnvs() }
      })
      it('initialize states a protocol revision and tools only (no Tasks is advertised to a Host that has not negotiated it)', async () => {
        const r = (await rpc(deps(p.host), 'initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'x', version: '1' } })).body as { result: { protocolVersion: string; capabilities: object; serverInfo: { name: string } } }
        expect(r.result.protocolVersion).toBe(PROTOCOL_VERSION); expect(Object.keys(r.result.capabilities)).toEqual(['tools'])
        if (p.serverNameRule) expect(r.result.serverInfo.name).toMatch(p.serverNameRule)
        expect(SERVER_NAME).toMatch(/^[a-z][a-z0-9_]*$/)
      })
      it('tool discovery: every tool name satisfies the name rule, has a description, an object schema without composition keywords, bounded size, and boolean annotations', async () => {
        const tools = ((await rpc(deps(p.host), 'tools/list')).body as { result: { tools: ReturnType<typeof listTools> } }).result.tools
        expect(tools.length).toBe(14)
        for (const t of tools) {
          expect(t.name, t.name).toMatch(p.toolNameRule); expect(t.description.length).toBeGreaterThan(10)
          expect(t.inputSchema.type).toBe('object')
          const s = JSON.stringify(t.inputSchema)
          expect(s, t.name).not.toMatch(/"\$ref"|"oneOf"|"allOf"|"not"|"\$defs"/)
          expect(Object.keys((t.inputSchema as { properties: object }).properties).length).toBeLessThanOrEqual(20)
          expect(s.length).toBeLessThan(6_000)
          for (const k of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) expect(typeof t.annotations[k]).toBe('boolean')
        }
      })
      it('a successful call carries the same structured payload as text AND as structuredContent (for Hosts that read only one)', async () => {
        const r = (await rpc(deps(p.host), 'tools/call', { name: 'search_places', arguments: { query: 'pho', location_query: 'Hà Nội' } })).body as { result: { content: Array<{ type: string; text: string }>; structuredContent: unknown; isError: boolean } }
        expect(r.result.isError).toBe(false); expect(JSON.parse(r.result.content[0].text)).toEqual(r.result.structuredContent)
      })
      it('an error is a normal tool result with a stable code, never a transport failure the Host cannot interpret', async () => {
        const r = (await rpc(deps(p.host), 'tools/call', { name: 'search_places', arguments: { query: '' } })).body as { result: { isError: boolean; structuredContent: { error: { code: string; message: string } } } }
        expect(r.result.isError).toBe(true); expect(r.result.structuredContent.error.code).toBe('INVALID_INPUT')
      })
      it('the response is held under this profile\'s size limit and the call under its deadline', async () => {
        const big = Array.from({ length: 10 }, (_, i) => ({ name: `Q${i}`, address: 'x'.repeat(240), place_id: `p${i}` }))
        const tight = deps(p.host, { adapters: { ...NO_ADAPTERS, 'places.search': async () => ({ rows: big }) }, profileLimits: () => ({ serverDeadlineMs: 5_000, maxResponseBytes: 900 }) })
        const r = (await rpc(tight, 'tools/call', { name: 'search_places', arguments: { query: 'pho', location_query: 'Hà Nội', limit: 10 } })).body as { result: { content: Array<{ text: string }>; structuredContent: { status: string; results: unknown[]; warnings: string[] } } }
        expect(JSON.stringify(r.result.structuredContent.results).length).toBeLessThanOrEqual(900)
        expect(r.result.structuredContent.status).toBe('partial'); expect(r.result.structuredContent.warnings.join(' ')).toMatch(/size/i)
        const slow = deps(p.host, { adapters: { ...NO_ADAPTERS, 'places.search': () => new Promise(() => {}) }, profileLimits: () => ({ serverDeadlineMs: 30, maxResponseBytes: 24_000 }) })
        const t0 = Date.now()
        const e = (await rpc(slow, 'tools/call', { name: 'search_places', arguments: { query: 'pho', location_query: 'Hà Nội' } })).body as { result: { structuredContent: { error: { code: string } } } }
        expect(e.result.structuredContent.error.code).toBe('DEADLINE_EXCEEDED'); expect(Date.now() - t0).toBeLessThan(1_000)
      })
      it('the Host label alone grants nothing: a token without the scope is refused whatever profile it came through', async () => {
        const d = deps(p.host, { verify: async () => ({ ...claimsOf(p.host), scopes: [] }) })
        const e = (await rpc(d, 'tools/call', { name: 'search_places', arguments: { query: 'pho', location_query: 'Hà Nội' } })).body as { result: { structuredContent: { error: { code: string } } } }
        expect(e.result.structuredContent.error.code).toBe('ACCESS_DENIED')
      })
    })
  }
  it('the read-only subset a read-only Host could allow still contains every search tool plus job status and result', () => {
    const readOnly = Object.values(CATALOG).filter(t => t.annotations.readOnlyHint).map(t => t.name).sort()
    expect(readOnly).toEqual(['check_scam', 'get_itinerary_job_result', 'get_itinerary_job_status', 'search_attractions', 'search_clips', 'search_coach', 'search_deals', 'search_hotels', 'search_places', 'search_restaurants', 'search_shopping'])
  })
})
