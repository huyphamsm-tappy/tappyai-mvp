// @vitest-environment node
// Pre-baseline hardening · the price-watch cron calls serperPost directly, outside any chat turn. With CONSULT_REQUEST_CAP OFF (the default) it behaves as before;
// with the flag ON it has no turn object, so its request is REFUSED (fail-closed) and the watch is simply not updated — a SIDE EFFECT OF THE FLAG that the owner
// decides about (design 5.1). This pins both facts so a change shows up. MOCK ONLY: a fake Supabase, a fake AI, a stub network that answers only google.serper.dev.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AI_DATA_CONSENT_VERSION } from '@/lib/ai/consent/aiDataConsent'
import { __resetRequestCap, requestCapTotals } from '@/lib/ai/tools/serperRequestCap'

const h = vi.hoisted(() => {
  const state = { watches: [] as Array<Record<string, unknown>>, consent: [] as Array<Record<string, unknown>>, serperCalls: 0 }
  const builder: Record<string, unknown> = {}
  let mode: 'select' | 'update' | 'profiles' | 'consent' = 'select'
  builder.from = (t: string) => { if (t === 'profiles') mode = 'profiles'; else if (t === 'ai_data_consent') mode = 'consent'; return builder }
  builder.select = () => { if (mode !== 'profiles' && mode !== 'consent') mode = 'select'; return builder }
  builder.update = () => { mode = 'update'; return builder }
  builder.eq = () => builder; builder.in = () => builder; builder.order = () => builder; builder.limit = () => builder
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    if (mode === 'consent') { mode = 'select'; return Promise.resolve({ data: state.consent, error: null }).then(res, rej) }
    if (mode === 'profiles') { mode = 'select'; return Promise.resolve({ data: [], error: null }).then(res, rej) }
    return Promise.resolve(mode === 'update' ? { data: null, error: null } : { data: state.watches, error: null }).then(res, rej)
  }
  return { state, createAdminClient: vi.fn(() => builder), generate: vi.fn(async () => ({ text: 'PRICE_VND: 9999999' })), emitNotification: vi.fn(async () => undefined) }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: h.createAdminClient }))
vi.mock('@/lib/ai/llm', () => ({ AI: { generate: h.generate } }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: h.emitNotification }))

// SERPER_API_KEY is read at module load: it must exist BEFORE the import below.
process.env.SERPER_API_KEY = 'test-double-not-a-real-key'
process.env.CRON_SECRET = 'test-cron-secret'
const { GET } = await import('./route')

const req = () => new Request('http://localhost/api/cron/price-check', { headers: { authorization: 'Bearer test-cron-secret' } })
beforeEach(() => {
  __resetRequestCap(); h.state.serperCalls = 0
  h.state.watches = [{ id: 'w1', user_id: 'u1', product_name: 'AirPods Pro 2', target_price: 4_500_000, current_price: null, search_query: 'AirPods Pro 2 gia' }]
  h.state.consent = [{ user_id: 'u1', ios_used: true, granted: true, decision: 'agreed', version: AI_DATA_CONSENT_VERSION }]
  vi.spyOn(console, 'log').mockImplementation(() => undefined); vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    if (!String(input).includes('google.serper.dev')) throw new Error('network disabled in this test: ' + String(input).slice(0, 80))
    h.state.serperCalls++
    return new Response(JSON.stringify({ organic: [{ title: 'AirPods Pro 2 giá tốt', snippet: 'Chỉ 4.200.000đ', link: 'https://shopee.vn/x' }], credits: 1 }), { status: 200 })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('price-check cron and the request cap', () => {
  it('flag OFF (the default): the cron sends its one Serper request and checks the watch, as before; nothing is counted', async () => {
    const body = await (await GET(req())).json()
    expect(h.state.serperCalls).toBe(1)
    expect(body).toMatchObject({ ok: true, checked: 1 })
    expect(requestCapTotals()).toEqual({ reserved: 0, refused: {} })
  })
  it('flag ON with valid values: the cron has no turn object, so its request is refused (no_turn_scope), nothing is sent and no watch is checked — the documented side effect', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP', '1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', '15')
    const body = await (await GET(req())).json()
    expect(h.state.serperCalls).toBe(0)
    expect(body).toMatchObject({ ok: true, checked: 0 })
    expect(requestCapTotals().refused).toEqual({ no_turn_scope: 1 })
  })
  it('flag ON with an invalid value: nothing is sent either (config_invalid)', async () => {
    vi.stubEnv('CONSULT_REQUEST_CAP', '1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', 'abc')
    await GET(req())
    expect(h.state.serperCalls).toBe(0)
    expect(requestCapTotals().refused).toEqual({ config_invalid: 1 })
  })
})
