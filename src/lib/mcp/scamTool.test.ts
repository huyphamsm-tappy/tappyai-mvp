import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleMcpRequest, type GatewayDeps, type GatewayResponse } from './gateway'
import { createSpendPool } from './spendPool'
import { createInMemoryJobStore } from './jobs'
import { createAbuseMonitor } from './abuseGuard'
import { NO_ADAPTERS, mapScamRow, type ServiceAdapter } from './serviceMap'
import { CONNECTOR_TOOLS, type VerifiedClaims } from './connectorContract'
import { CATALOG, listTools, parseArgs } from './toolCatalog'
import { TOOL_TEXT } from './tappyProfile'
import { validateJsonSchema } from './testSupport'
import { __resetKvCounters } from '@/lib/security/kvCounter'

// ── check_scam: "is this link a scam?" (owner 27/11/2026: Scam Shield is something a general AI does not have) ──────────────────
// Wraps the SAME link check the web and the apps use. The product's public vocabulary is kept (owner 02/10, legal): three states,
// never "safe"; a verdict about the link's traits, not about an organisation. No LLM call, no location, no attribution link
// (the checked link may be the malicious one: it is never turned into a tracked redirect).

const NOW = new Date('2026-11-27T03:00:00Z')
const AUD = 'https://mcp.test/api/mcp'
const SCOPES = ['places:read', 'hotels:read', 'shopping:read', 'scam:check']
const CAPS = { MCP_POOL_DAILY_USD: '1', MCP_POOL_HOST_USD: '1', MCP_POOL_INSTALL_USD: '1', MCP_POOL_PRINCIPAL_USD: '0.5', MCP_POOL_TOOL_USD: '1', MCP_POOL_REQUEST_USD: '1' }
const claims = (o: Partial<VerifiedClaims> = {}): VerifiedClaims => ({ audience: AUD, scopes: SCOPES, expiresAt: NOW.getTime() / 1000 + 3600, revoked: false, host: 'claude', installId: 'inst-1', userId: null, principalId: 'anon-1', ...o })

const RAW = {
  target: 'vietcombank-secure.example', verdict: 'familiar', verdict_title: 'Đường link có đặc điểm thường gặp ở link giả mạo',
  summary: 'Đây là nhận định về đặc điểm của đường link, không phải kết luận về một tổ chức hay tên miền cụ thể.',
  signals: ['Tên miền mới đăng ký 3 ngày trước', 'Chứng chỉ SSL do một đơn vị ít phổ biến cấp'],
  resembles_brand: 'Vietcombank', official_site: 'https://www.vietcombank.com.vn', official_hotline: '1900 54 54 13',
  next_steps: ['Không nhập OTP hay thông tin thẻ', 'Tự mở website hoặc ứng dụng chính thức'],
}

function mk(over: Partial<GatewayDeps> = {}, scam?: ServiceAdapter | null) {
  const adapter = scam === null ? null : vi.fn(scam ?? (async () => ({ rows: [RAW] })))
  const deps: GatewayDeps = {
    verify: vi.fn(async () => claims()), expectedAudience: AUD,
    adapters: { ...NO_ADAPTERS, 'scam.check': adapter },
    spend: createSpendPool({ env: CAPS }), jobs: createInMemoryJobStore(() => NOW), abuse: createAbuseMonitor({ now: () => NOW }),
    rateLimit: async () => ({ ok: true, retryAfter: 0 }), now: () => NOW, log: () => {}, allowedOrigins: [],
    attribution: { secret: 'x'.repeat(40), baseUrl: 'https://mcp.test' }, ...over,
  }
  return { deps, adapter }
}
const rpc = (method: string, params?: unknown) => ({ jsonrpc: '2.0', id: 1, method, ...(params === undefined ? {} : { params }) })
const call = (args: unknown) => rpc('tools/call', { name: 'check_scam', arguments: args })
const run = (body: unknown, deps: GatewayDeps) => handleMcpRequest({ authorization: 'Bearer t', body }, deps)
const result = (r: GatewayResponse) => (r.body as { result: Record<string, any> }).result
const sc = (r: GatewayResponse) => result(r).structuredContent as Record<string, any>

beforeEach(() => __resetKvCounters())

describe('the tool in the catalog', () => {
  it('is read-only, synchronous, takes only a link (and an optional language), and is listed', async () => {
    const t = CATALOG.check_scam
    expect(t.mode).toBe('SYNC')
    expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true })
    expect(Object.keys((t.inputSchema as { properties: object }).properties).sort()).toEqual(['preferred_language', 'url'])
    expect((t.inputSchema as { required: string[] }).required).toEqual(['url'])
    expect(CONNECTOR_TOOLS.check_scam.scope).toBe('scam:check')
    expect(CONNECTOR_TOOLS.check_scam.maxResults).toBe(1)
    expect(listTools({ jobs: false }).map(x => x.name)).toContain('check_scam')
    expect(TOOL_TEXT.check_scam.length).toBeGreaterThan(40)
  })
  it('the words promise only what it does: never "safe", never a verdict on an organisation, no live guarantee', () => {
    expect(TOOL_TEXT.check_scam).toMatch(/does not (mean|prove)|not (a )?guarantee|not mean (it is )?safe/i)
    expect(TOOL_TEXT.check_scam).not.toMatch(/\bis safe\b|guaranteed|100%/i)
  })
  it('parses a link and refuses unknown keys, an empty link and a link over 2048 characters', () => {
    expect(parseArgs('check_scam', { url: 'vietcombank-secure.example' }).ok).toBe(true)
    expect(parseArgs('check_scam', { url: 'https://x.example/a?b=1', preferred_language: 'en' }).ok).toBe(true)
    expect(parseArgs('check_scam', {}).ok).toBe(false)
    expect(parseArgs('check_scam', { url: '' }).ok).toBe(false)
    expect(parseArgs('check_scam', { url: 'a'.repeat(2049) }).ok).toBe(false)
    expect(parseArgs('check_scam', { url: 'x.example', query: 'phở' }).ok).toBe(false)
  })
})

describe('mapScamRow (the only door out)', () => {
  it('keeps the allowlisted fields, cleans text, bounds the lists and never carries a full URL', () => {
    const row = mapScamRow({ ...RAW, signals: Array.from({ length: 20 }, (_, i) => `dấu hiệu ${i}`), secret_field: 'x', url: 'https://evil.example/login?token=abc' })!
    expect(Object.keys(row).sort()).toEqual(['officialHotline', 'officialSite', 'resemblesBrand', 'signals', 'summary', 'target', 'verdict', 'verdictTitle', 'nextSteps'].sort())
    expect((row.signals as string[]).length).toBeLessThanOrEqual(6)
    expect(JSON.stringify(row)).not.toMatch(/token=abc|secret_field/)
  })
  it('drops a row whose verdict is not one of the three public states, and a row without a target', () => {
    expect(mapScamRow({ ...RAW, verdict: 'safe' })).toBeNull()
    expect(mapScamRow({ ...RAW, verdict: 'LOW' })).toBeNull()
    expect(mapScamRow({ ...RAW, target: '' })).toBeNull()
  })
  it('an official site that is not https, or has credentials, is dropped rather than passed on', () => {
    expect(mapScamRow({ ...RAW, official_site: 'javascript:alert(1)' })!.officialSite).toBeUndefined()
    expect(mapScamRow({ ...RAW, official_site: 'https://u:p@x.example' })!.officialSite).toBeUndefined()
  })
})

describe('calling check_scam through the gateway', () => {
  it('returns the verdict in the public vocabulary with the standard envelope, and passes the output schema', async () => {
    const { deps, adapter } = mk()
    const r = await run(call({ url: 'vietcombank-secure.example', preferred_language: 'vi' }), deps)
    const out = sc(r)
    expect(out.status).toBe('success')
    expect(out.results).toHaveLength(1)
    expect(out.results[0]).toMatchObject({ target: 'vietcombank-secure.example', verdict: 'familiar', resemblesBrand: 'Vietcombank', officialSite: 'https://www.vietcombank.com.vn/' })
    expect(validateJsonSchema(CATALOG.check_scam.outputSchema, out)).toEqual([])
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(adapter!.mock.calls[0][0]).toMatchObject({ query: 'vietcombank-secure.example', lang: 'vi' })
  })
  it('🚨 never builds a tracked redirect for the checked link (it may be the malicious one)', async () => {
    const { deps } = mk()
    const out = sc(await run(call({ url: 'https://evil.example/login' }), deps))
    expect(out.action_links).toBeUndefined()
    expect(JSON.stringify(out)).not.toMatch(/\/go\/m\//)
  })
  it('a token without the scam:check scope is refused', async () => {
    const { deps, adapter } = mk({ verify: vi.fn(async () => claims({ scopes: ['places:read'] })) })
    expect(sc(await run(call({ url: 'x.example' }), deps)).error.code).toBe('ACCESS_DENIED')
    expect(adapter).not.toHaveBeenCalled()
  })
  it('an input that is not a link answers INVALID_INPUT and reserves nothing', async () => {
    const { deps, adapter } = mk()
    expect(sc(await run(call({}), deps)).error.code).toBe('INVALID_INPUT')
    expect(adapter).not.toHaveBeenCalled()
  })
  it('an unwired adapter answers PROVIDER_UNAVAILABLE', async () => {
    const { deps } = mk({}, null)
    expect(sc(await run(call({ url: 'x.example' }), deps)).error.code).toBe('PROVIDER_UNAVAILABLE')
  })
  it('a link the check refuses (private address, unparseable) comes back with no row: INVALID_INPUT, and nothing about why leaks', async () => {
    const { deps } = mk({}, async () => ({ rows: [] }))
    const r = await run(call({ url: 'http://10.0.0.5/' }), deps)
    expect(sc(r).error.code).toBe('INVALID_INPUT')
    expect(JSON.stringify(sc(r))).not.toMatch(/10\.0\.0\.5|private|internal/)
  })
  it('a provider failure is PROVIDER_UNAVAILABLE (retryable) and the error text is not passed on', async () => {
    const { deps } = mk({}, async () => { throw new Error('whois exploded with key=SECRET') })
    const r = await run(call({ url: 'x.example' }), deps)
    expect(sc(r).error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(JSON.stringify(sc(r))).not.toMatch(/SECRET|whois/)
  })
  it('is stopped by the spend pool when the cap is reached (it costs a little: provider lookups)', async () => {
    const { deps, adapter } = mk({ spend: createSpendPool({ env: { ...CAPS, MCP_POOL_TOOL_USD: '0.0001' } }) })
    expect(sc(await run(call({ url: 'x.example' }), deps)).error.code).toBe('BUDGET_EXCEEDED')
    expect(adapter).not.toHaveBeenCalled()
  })
})
