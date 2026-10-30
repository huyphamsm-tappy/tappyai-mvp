/**
 * Unwind (28/10/2026) at ROUTE level, with the flag set of the U-DEV25 / U-BENCH12 measurement (RUN-ALL.ps1): L2 + the Wave 2 flags RUN-ALL sets +
 * CONSULT_READ_PAGE_LATE + CONSULT_UNWIND_S1A..S4B + S6A..S6C. Full POST /api/chat, scripted intent call and scripted model, Serper and the page fetch
 * mocked, no network, no key, no cost. It checks that the pieces work TOGETHER on the real route before a paid run:
 *   · a request that already holds enough is answered by the model, never by the code-built card (S2A), and the model reads the open question;
 *   · a model web_search comes back with the pages it found already read (S6A), only links of the turn, robots.txt honoured, and one follow-up search (S6B);
 *   · the model's citation marker never reaches the user (S1C);
 *   · the same turns with every unwind flag OFF behave as before (the card, no page read, the marker left alone).
 * The messages and pages are written for this test; none comes from a benchmark or development question file, nor from the 28/10 UAT turns.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __resetSharedRobots } from '@/lib/ai/consultative/researchLoop'
import { __resetPageCache } from '@/lib/ai/agent/runtime/readPage'
import { ONE_BRAIN_CORE, ONE_BRAIN_SHAPE_REMINDER } from '@/lib/ai/consultative/oneBrain'
import { STYLE_LUNA6_BLOCK } from '@/lib/ai/consultative/styleLuna6'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    results: [] as Array<{ name: string; result: any }>,
    luna: null as null | Record<string, unknown>,
    gapQuery: null as null | string,
    extractRoles: [] as string[],
    streamCalled: 0,
    toolNames: [] as string[],
    opts: {} as { role?: string; maxSteps?: number; maxTokens?: number; systemShared?: string },
    system: '' as string,
    text: 'ok',
    webCalls: [] as string[],
    fetched: [] as string[],
    pages: {} as Record<string, { status?: number; body: string; contentType?: string }>,
    userId: 'u-unwind-e2e',
    accountErrorAt: 0,
    finishSteps: [] as Array<Record<string, unknown>>,
    /** 29/10: the trains a rail route page states (railSchedule mock); null = the page gives none. */
    railRows: null as null | Array<Record<string, unknown>>,
    /** 30/10: what the route's attachCommerceLinks wrapper passed on, per call (the real function still runs). */
    commerceCtx: [] as Array<{ tool: string; ctx: Record<string, unknown> }>,
  }
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { state, client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: h.state.userId }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/security/safePageFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security/safePageFetch')>()),
  fetchPublicPage: async (url: string) => {
    h.state.fetched.push(url)
    const p = h.state.pages[url]
    if (!p) return { ok: false, url, reason: 'http_error', status: 404, redirects: 0, ms: 1 }
    if ((p.status ?? 200) >= 400) return { ok: false, url, reason: 'http_error', status: p.status, redirects: 0, ms: 1 }
    return { ok: true, url, finalUrl: url, status: 200, contentType: p.contentType ?? 'text/html; charset=utf-8', body: p.body, bytes: p.body.length, truncated: false, redirects: 0, ms: 1 }
  },
}))
vi.mock('@/lib/ai/tools/common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/common')>()),
  getCache: () => null, setCache: () => undefined, fetchPlacePhotosByName: async () => [],
  serperSearch: async (q: string) => {
    h.state.webCalls.push(String(q))
    // 29/10: the scoped rail search finds the Vexere rail route page; every other search here finds nothing.
    return String(q).includes('site:vexere.com/vn/ve-tau-hoa') ? [{ title: 'Vé tàu Hồ Chí Minh Nha Trang', link: 'https://vexere.com/vn/ve-tau-hoa/tu-ho-chi-minh-di-nha-trang-khanh-hoa.29.417.vi', snippet: '' }] : []
  },
  webSearch: async (q: string) => {
    h.state.webCalls.push(String(q))
    return h.state.webCalls.length === 1
      ? { results: [{ title: 'Bảng giá điện sinh hoạt', link: 'https://giadien.example/bang-gia', snippet: 'Biểu giá bậc thang' }, { title: 'Tin tức', link: 'https://tin.example/bai', snippet: 'Bài viết' }, { title: 'Diễn đàn', link: 'https://forum.example/t/1', snippet: 'Thảo luận' }, { title: 'Thứ tư', link: 'https://khac.example/4', snippet: 'x' }] }
      : { results: [{ title: 'Quyết định điều chỉnh giá', link: 'https://chinhphu.example/qd', snippet: 'Văn bản' }, { title: 'Bảng giá điện sinh hoạt', link: 'https://giadien.example/bang-gia', snippet: 'trùng' }] }
  },
}))
vi.mock('@/lib/ai/tools/commerce', async (importOriginal) => {
  const m = await importOriginal<typeof import('@/lib/ai/tools/commerce')>()
  return { ...m, attachCommerceLinks: (tool: string, result: unknown, ctx: Record<string, unknown> = {}) => { h.state.commerceCtx.push({ tool, ctx }); return m.attachCommerceLinks(tool as never, result, ctx as never) } }
})
vi.mock('@/lib/ai/tools/railSchedule', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/railSchedule')>()),
  fetchRailSchedule: async (page: string) => (h.state.railRows ? { page_url: page, rows: h.state.railRows } : null),
}))
vi.mock('@/lib/ai/tools/serperClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/serperClient')>()), serperLastAccountErrorAt: () => h.state.accountErrorAt }))
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()), serperPlaces: async () => [] }))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/food')>()), searchPlacesOSM: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: (o: { schemaName?: string }) => {
      h.state.extractRoles.push(String(o?.schemaName ?? ''))
      if (o?.schemaName === 'tappy_follow_up') return Promise.resolve({ object: { query: h.state.gapQuery }, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {} })
      return h.state.luna ? Promise.resolve({ object: h.state.luna, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {} }) : Promise.reject(new Error('no provider in this test'))
    },
    stream: (opts: Record<string, any>) => {
      h.state.streamCalled++
      h.state.toolNames = Object.keys(opts.tools ?? {})
      h.state.opts = { role: opts.role, maxSteps: opts.maxSteps, maxTokens: opts.maxTokens, systemShared: typeof opts.systemShared === 'string' ? opts.systemShared : '' }
      try { h.state.system = JSON.stringify({ system: opts.system, messages: opts.messages }) } catch { h.state.system = '' }
      return {
        get steps() { return Promise.resolve([{ toolResults: h.state.results.map(r => ({ toolName: r.name, result: r.result })) }]) },
        toDataStreamResponse: () => new Response(new ReadableStream<Uint8Array>({
          async start(c) {
            const enc = new TextEncoder()
            for (const call of h.state.calls) {
              if (!opts.tools?.[call.toolName]) continue
              c.enqueue(enc.encode(`9:${JSON.stringify(call)}\n`))
              const result = await opts.tools[call.toolName].execute(call.args, { toolCallId: call.toolCallId, messages: [] })
              h.state.results.push({ name: call.toolName, result })
              c.enqueue(enc.encode(`a:${JSON.stringify({ toolCallId: call.toolCallId, result })}\n`))
            }
            if (h.state.text) c.enqueue(enc.encode(`0:${JSON.stringify(h.state.text)}\n`))
            try { await opts.onFinish?.({ usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop', text: h.state.text, steps: h.state.finishSteps }) } catch { /* the mock must not fail a turn */ }
            c.enqueue(enc.encode('d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n'))
            c.close()
          },
        }), { status: 200, headers: { 'content-type': 'text/plain' } }),
      }
    },
    step: () => Promise.resolve({ text: '', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} }),
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

/** The flag set of RUN-ALL.ps1 Set-RunEnv + the U-DEV25 Extra (the bench-only BENCH_* switches are not route flags). */
const UNWIND = ['S1A', 'S1B', 'S1C', 'S1D', 'S2A', 'S2B', 'S2C', 'S3A', 'S3B', 'S3C', 'S4A', 'S4B', 'S6A', 'S6B', 'S6C'].map(s => `CONSULT_UNWIND_${s}`)
const BASE_FLAGS: Record<string, string> = {
  CONSULTATIVE_V1: '1', CONSULT_V2: '1', CONSULT_FINAL_SYNTHESIS: '1', CONSULT_ANSWER_ATTRIBUTION: '1', CONSULT_GENERAL_ASSISTANT: '1', CONSULT_TRACE_DIAGNOSTICS: '1',
  CONSULT_ABORT_ABANDONED_FIRST_PART: '1', CONSULT_KNOWLEDGE_TURN_TOOLS: '1', CONSULT_SEARCH_NOW_INTENT_GATE: '1', CONSULT_CAPABILITY_LEVEL: '2', CONSULT_READ_PAGE_LATE: '1',
}
type Msg = { role: 'user' | 'assistant'; content: string }
const intent = (turn: string, domains: string[], extra: Record<string, unknown> = {}) => ({
  domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'normal', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null, ...extra,
})
interface TurnOpts { unwind: boolean; oneBrain?: boolean; media?: boolean; luna: Record<string, unknown>; tools?: Array<{ name: string; args: Record<string, unknown> }>; reply?: string; gapQuery?: string | null; finishSteps?: Array<Record<string, unknown>>; railRows?: Array<Record<string, unknown>> }

async function turn(messages: Msg[], o: TurnOpts) {
  delete process.env.TAPPY_AGENT
  for (const [k, v] of Object.entries(BASE_FLAGS)) vi.stubEnv(k, v)
  for (const k of UNWIND) vi.stubEnv(k, o.unwind ? '1' : '0')
  vi.stubEnv('CONSULT_ONE_BRAIN', o.oneBrain ? '1' : '0')
  vi.stubEnv('CONSULT_ONE_BRAIN_MEDIA', o.media ? '1' : '0')
  for (const k of ['CONSULT_PICK_TURN_TOOLS', 'CONSULT_KNOWLEDGE_PATH', 'CONSULT_RESEARCH_LOOP', 'CONSULT_TOOL_BY_NEED', 'CONSULT_DETERMINISTIC_MATH', 'CONSULT_STRUCTURED_SYNTHESIS', 'CONSULT_CHAT_DOMAIN_AGREEMENT', 'CONSULT_THREAD_AWARE_ASK', 'CONSULT_PICK_PAGE_READ', 'CONSULT_LUNA_ONE', 'VERCEL_ENV']) vi.stubEnv(k, undefined as unknown as string)
  h.state.calls = (o.tools ?? []).map((t, i) => ({ toolCallId: `c${i + 1}`, toolName: t.name, args: t.args }))
  h.state.text = o.reply ?? 'Câu trả lời của mô hình.'
  h.state.luna = o.luna
  h.state.gapQuery = o.gapQuery ?? null
  h.state.finishSteps = o.finishSteps ?? []
  h.state.railRows = o.railRows ?? null
  h.state.commerceCtx = []
  h.state.extractRoles = []; h.state.streamCalled = 0; h.state.toolNames = []; h.state.opts = {}; h.state.system = ''; h.state.results = []; h.state.webCalls = []; h.state.fetched = []
  __resetAiQuestionQuotaLocal(); __resetPageCache(); __resetSharedRobots()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages }), signal: undefined,
  }
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])) })
  let raw = ''
  try { raw = await (await POST(req as never)).text() } finally { spy.mockRestore() }
  const text = raw.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')
  const logs = lines.map(l => { try { return JSON.parse(l) as Record<string, any> } catch { return null } }).filter((x): x is Record<string, any> => !!x)
  return { raw, text, logs, streamCalled: h.state.streamCalled, toolNames: [...h.state.toolNames], opts: { ...h.state.opts }, system: h.state.system, web: [...h.state.webCalls], fetched: [...h.state.fetched], results: [...h.state.results], extract: [...h.state.extractRoles] }
}

/** A page as long as a real article (the real pages read on 28/10 gave 2 500 - 7 000 characters): a one-line page is read as "thin". */
const ARTICLE = (title: string, lines: string[]) => `<html><head><title>${title}</title></head><body><h1>${title}</h1>${[...lines, ...Array.from({ length: 6 }, (_, i) => `Đoạn ${i + 1}: phần giải thích chi tiết về cách tính, các trường hợp áp dụng, ví dụ cụ thể và những lưu ý thường gặp khi người dân tra cứu thông tin này trên các trang chính thức.`)].map(l => `<p>${l}</p>`).join('')}</body></html>`
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-28T03:09:00Z'))
  h.state.pages = {
    'https://giadien.example/robots.txt': { body: 'User-agent: *\nDisallow: /noi-bo\n', contentType: 'text/plain' },
    'https://giadien.example/bang-gia': { body: ARTICLE('Biểu giá bán lẻ điện sinh hoạt', ['Bậc 1 (0 - 50 kWh): 1.893 đồng/kWh, áp dụng từ 11/10/2026.']) },
    'https://tin.example/robots.txt': { status: 503, body: '' },
    'https://tin.example/bai': { body: ARTICLE('Không được mở', ['robots.txt của trang không tới được.']) },
    'https://forum.example/robots.txt': { status: 404, body: '' },
    'https://forum.example/t/1': { body: ARTICLE('Diễn đàn', ['Mình đóng tiền điện tháng 10 khoảng 650.000 đồng.']) },
    'https://khac.example/robots.txt': { status: 404, body: '' },
    'https://khac.example/4': { body: ARTICLE('Trang thứ tư', ['Bảng giá điện cập nhật.']) },
    'https://chinhphu.example/robots.txt': { status: 404, body: '' },
    'https://chinhphu.example/qd': { body: ARTICLE('Quyết định điều chỉnh giá điện', ['Giá bán lẻ điện bình quân điều chỉnh tăng 4,8% từ ngày 11/10/2026.']) },
  }
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); delete process.env.TAPPY_AGENT })

describe('P0-3 follow-up (30/10): the route\'s attachCommerceLinks wrapper, offline (the real function runs; Serper and the network are stubbed)', () => {
  const ASK: Msg[] = [{ role: 'user', content: 'Tư vấn nồi chiên không dầu 6 lít. Shopee hay Lazada mua chỗ nào lợi hơn?' }]
  const SHOP = intent('pick', ['shopping'])
  const run = (oneBrain: boolean) => turn(ASK, { unwind: oneBrain, oneBrain, luna: SHOP, tools: [{ name: 'search_products', args: { query: 'nồi chiên không dầu 6 lít' } }], reply: 'Mình chọn nồi 6 lít.' })
  const shoppingCtx = () => h.state.commerceCtx.filter(c => c.tool === 'search_products').map(c => c.ctx)
  it('one brain: a search_products result reaches CCP with unambiguousMerchantOnly = true (a turn naming several merchants names none)', async () => {
    await run(true)
    const ctxs = shoppingCtx()
    expect(ctxs.length).toBeGreaterThan(0)
    for (const c of ctxs) expect(c.unambiguousMerchantOnly).toBe(true)
  }, 60000)
  it('one brain: the context the tool layer built is passed on whole (only the flag is added)', async () => {
    await run(true)
    const c = shoppingCtx()[0]
    expect(c).toBeDefined()
    expect(Object.keys(c)).toEqual(expect.arrayContaining(['unambiguousMerchantOnly']))
    expect(Object.keys(c).filter(k => k !== 'unambiguousMerchantOnly').length).toBeGreaterThan(0)
  }, 60000)
  it('not one brain: the flag is absent on every tool the route offers (the old reading of the question is unchanged)', async () => {
    // search_products is not offered off one brain for this intent, so the wrapper is exercised through the places tool of the same route
    await turn([{ role: 'user', content: 'Quán cà phê yên tĩnh gần Quận 1' }], { unwind: false, oneBrain: false, luna: intent('pick', ['food']), tools: [{ name: 'search_places', args: { query: 'quán cà phê yên tĩnh', type: 'cafe' } }], reply: 'Mình gợi ý vài quán.' })
    const all = h.state.commerceCtx.map(c => c.ctx)
    expect(all.length).toBeGreaterThan(0) // the wrapper really ran (a loop over nothing proves nothing)
    for (const c of all) expect(c.unambiguousMerchantOnly).toBeUndefined()
  }, 60000)
})

describe('P1-2 (30/10): in one brain the model reads ONE scope and ONE style source (the real route, offline)', () => {
  const Q2: Msg[] = [{ role: 'user', content: 'Giải thích giúp mình lạm phát là gì' }]
  const read = async (oneBrain: boolean) => {
    const r = await turn(Q2, { unwind: oneBrain, oneBrain, luna: intent('answer', ['knowledge']), reply: 'ok' })
    const sys = JSON.parse(r.system || '{}') as { system?: string }
    return { shared: r.opts.systemShared ?? '', dynamic: typeof sys.system === 'string' ? sys.system : '' }
  }
  it('the shared segment is the one general instruction and nothing else; it states the scope once (a general assistant, no refusal outside five areas)', async () => {
    const { shared } = await read(true)
    expect(shared).toBe(ONE_BRAIN_CORE)
    expect(shared).toContain('general AI assistant')
    expect(shared).not.toContain('CHI ho tro 5 linh vuc')
  })
  it('no second scope block and no second voice block reach the model: the legacy refusal, the five-area scope and the voice layer are absent', async () => {
    const { shared, dynamic } = await read(true)
    for (const text of [shared, dynamic]) {
      expect(text).not.toContain('HAY TU CHOI LICH SU')
      expect(text).not.toContain('PHAM VI HOAT DONG')
      expect(text).not.toContain(STYLE_LUNA6_BLOCK.trim().slice(0, 60))
    }
  })
  it('the person\'s own settings are inside the per-turn part and the shape reminder is its LAST line, so a style the person set is read before it and wins (the reminder says so)', async () => {
    const { dynamic } = await read(true)
    expect(dynamic.endsWith(ONE_BRAIN_SHAPE_REMINDER)).toBe(true)
    expect(ONE_BRAIN_SHAPE_REMINDER).toContain('wins over it')
  })
})

describe('P2-8 (30/10): one line per one-brain turn about how the loop ended (the real route, offline)', () => {
  const Q: Msg[] = [{ role: 'user', content: 'Giải thích giúp mình lạm phát là gì' }]
  const STEPS = [{ toolCalls: [{ toolName: 'web_search', args: { query: 'bí mật của người dùng' } }, { toolName: 'read_page' }], response: { modelId: 'reported-model-x' } }, { toolCalls: [], response: { modelId: 'reported-model-x' } }]
  const traceOf = (logs: Array<Record<string, any>>) => logs.filter(l => l.type === 'tappyai_one_brain_turn')
  it('one brain: exactly one line, with steps, tools by name, the model the provider reported and the cap', async () => {
    const r = await turn(Q, { unwind: true, oneBrain: true, luna: intent('answer', ['knowledge']), finishSteps: STEPS, reply: 'Lạm phát là sự tăng mức giá chung.' })
    const t = traceOf(r.logs)
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ steps_run: 2, max_steps: 8, step_cap_hit: false, wrote_text: true, finish_reason: 'stop', tools: { web_search: 1, read_page: 1 }, tool_calls: 2, response_model: 'reported-model-x', provider: 'mock' })
    expect(JSON.stringify(t[0])).not.toContain('bí mật') // names and counts only
  }, 60000)
  it('one brain: a turn that went through the settle stages writes ONE line with the chars it lost (0 when nothing was cut), and what would have gone is counted apart', async () => {
    const ASK: Msg[] = [{ role: 'user', content: 'Tư vấn nồi chiên không dầu 6 lít' }]
    const r = await turn(ASK, { unwind: true, oneBrain: true, luna: intent('pick', ['shopping']), tools: [{ name: 'search_products', args: { query: 'nồi chiên không dầu 6 lít' } }], reply: 'Mình chọn nồi 6 lít, giá **5.550.000đ** ở một cửa hàng.' })
    const t = r.logs.filter(l => l.guard === 'legacy_turn')
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ chars_removed_total: expect.any(Number), chars_would_remove_total: expect.any(Number), removed_by_stage: expect.any(Object), would_remove_by_stage: expect.any(Object) })
    expect(JSON.stringify(t[0])).not.toContain('5.550.000') // counts only
  }, 60000)
  it('not one brain: no such line (the other routes are unchanged)', async () => {
    const r = await turn(Q, { unwind: false, oneBrain: false, luna: intent('answer', ['knowledge']), finishSteps: STEPS, reply: 'Lạm phát là sự tăng mức giá chung.' })
    expect(traceOf(r.logs)).toHaveLength(0)
  }, 60000)
})

const PLAN: Msg[] = [{ role: 'user', content: 'len ke hoach di choi da nang 4 ngay 3 dem, tong chi phi tam 18 trieu' }]
const PLAN_INTENT = intent('ask', ['travel'], {
  known: [{ key: 'diem_den', value: 'Đà Nẵng' }, { key: 'so_ngay', value: '4 ngày 3 đêm' }, { key: 'ngan_sach', value: '18 triệu' }],
  ask: { lead: 'Để lên lịch cho bạn:', questions: [{ id: 'so_nguoi', q: 'Đi mấy người?', options: ['1', '2', '3-4'] }] },
})

describe('unwind e2e — a request that already holds enough is answered by the model (S2A)', () => {
  it('flags ON: the model is called, the reply is the model\'s, no canned path, and the open question reaches the model', async () => {
    const on = await turn(PLAN, { unwind: true, luna: PLAN_INTENT, reply: 'Lịch 4 ngày ở Đà Nẵng, giả định 2 người. Bạn đi mấy người?' })
    expect(on.streamCalled).toBe(1)
    expect(on.text).toContain('Lịch 4 ngày ở Đà Nẵng')
    expect(on.logs.some(l => l.type === 'tappyai_canned_reply')).toBe(false)
    expect(on.logs.some(l => l.type === 'tappyai_trace' && l.ev === 'path_cut' && l.kind === 'canned_reply')).toBe(false)
    expect(on.logs.find(l => l.type === 'tappyai_unwind_ask')?.open_questions).toBe(1)
    expect(on.system).toContain('LUOT NAY KHONG HOI LAI TRUOC')
    // this turn is a lean (domain) turn: the writing block reaches that prompt build too
    expect(on.system).toContain('CACH VIET LUOT NAY')
  }, 60000)
  it('flags OFF (same turn): the code-built card answers and the model is never called (HEAD)', async () => {
    const off = await turn(PLAN, { unwind: false, luna: PLAN_INTENT })
    expect(off.streamCalled).toBe(0)
    expect(off.logs.some(l => l.type === 'tappyai_canned_reply')).toBe(true)
    expect(off.text).not.toContain('Câu trả lời của mô hình')
  }, 60000)
})

const KNOW: Msg[] = [{ role: 'user', content: 'gia dien sinh hoat bay gio bao nhieu 1 so' }]
const KNOW_INTENT = intent('chat', [])
const SEARCH = { name: 'web_search', args: { query: 'giá điện sinh hoạt 2026' } }

describe('unwind e2e — a web search comes back with its pages read (S6A, S6B)', () => {
  it('flags ON: the top pages are read in the search result, only through the reader (robots.txt honoured), plus ONE follow-up search', async () => {
    const on = await turn(KNOW, { unwind: true, luna: KNOW_INTENT, tools: [SEARCH], gapQuery: 'quyết định điều chỉnh giá điện tháng 10 2026' })
    expect(on.streamCalled).toBe(1)
    expect(on.toolNames).toContain('read_page')
    const ws = on.results.find(r => r.name === 'web_search')?.result
    expect(Array.isArray(ws?.pages_read)).toBe(true)
    const read = (ws.pages_read as Array<Record<string, unknown>>).filter(p => !('error' in p))
    expect(read.length).toBe(2) // giadien + forum; tin.example has an unreachable robots.txt
    expect(on.fetched).toContain('https://giadien.example/bang-gia')
    expect(on.fetched).toContain('https://forum.example/t/1')
    expect(on.fetched).not.toContain('https://tin.example/bai')
    expect(on.fetched).not.toContain('https://khac.example/4') // only the top three are opened
    // the follow-up: one gap call, one more search, its NEW page read (the duplicate link is not opened twice)
    expect(on.extract).toContain('tappy_follow_up')
    expect(on.web).toEqual(['giá điện sinh hoạt 2026', 'quyết định điều chỉnh giá điện tháng 10 2026'])
    expect(ws.follow_up?.query).toBe('quyết định điều chỉnh giá điện tháng 10 2026')
    expect(on.fetched).toContain('https://chinhphu.example/qd')
    expect(on.fetched.filter(u => u === 'https://giadien.example/bang-gia').length).toBe(1)
    const line = on.logs.find(l => l.type === 'tappyai_search_reads')
    expect(line).toMatchObject({ pages_read: 2, follow_up: true, follow_up_pages: 1 })
    // the freshness line (S3A) and the writing block (S3B) reach the model
    expect(on.system).toContain('hom nay la 2026-10-28')
    expect(on.system).toContain('CACH VIET LUOT NAY')
  }, 60000)
  it('flags ON, read-on: when only one of the top three is readable, the next result is read too (real web 28/10: a question whose three top links all failed)', async () => {
    h.state.pages['https://forum.example/t/1'] = { status: 403, body: '' }
    const on = await turn(KNOW, { unwind: true, luna: KNOW_INTENT, tools: [SEARCH], gapQuery: null })
    const ws = on.results.find(r => r.name === 'web_search')?.result
    expect(on.fetched).toContain('https://khac.example/4')
    expect((ws.pages_read as Array<Record<string, unknown>>).filter(p => !('error' in p)).length).toBe(2)
    expect(on.logs.find(l => l.type === 'tappyai_search_reads')).toMatchObject({ pages_read: 2, follow_up: false })
  }, 60000)
  it('flags OFF (same turn): the search result is the plain search, no page is opened by the code, no follow-up', async () => {
    const off = await turn(KNOW, { unwind: false, luna: KNOW_INTENT, tools: [SEARCH], gapQuery: 'x' })
    const ws = off.results.find(r => r.name === 'web_search')?.result
    expect(ws?.pages_read).toBeUndefined()
    expect(ws?.follow_up).toBeUndefined()
    expect(off.fetched).toEqual([])
    expect(off.web).toEqual(['giá điện sinh hoạt 2026'])
    expect(off.extract).not.toContain('tappy_follow_up')
    expect(off.logs.some(l => l.type === 'tappyai_search_reads')).toBe(false)
    expect(off.system).not.toContain('CACH VIET LUOT NAY')
  }, 60000)
})

const PICK: Msg[] = [{ role: 'user', content: 'tim quan bun cha ngon o pho hang bac giup minh' }]
const PICK_INTENT = intent('pick', ['food'], { known: [{ key: 'mon', value: 'bún chả' }, { key: 'khu_vuc', value: 'Hàng Bạc' }], query: 'bún chả Hàng Bạc', area: 'Hàng Bạc' })

describe('unwind e2e — a place request whose search finds nothing keeps the model\'s reply (S1A)', () => {
  // S2C: neither the rules' query nor the intent layer's covers "phố" of the request, so the code does not pre-search: the MODEL searches (scripted below).
  const PLACE_CALL = { name: 'search_places', args: { query: 'bún chả', location: 'Hàng Bạc, Hà Nội', type: 'restaurant' } }
  it('flags ON: no code pre-search (S2C), the model has the place tool, its empty search keeps the model\'s words with the block appended, no TP.HCM chip', async () => {
    const on = await turn(PICK, { unwind: true, luna: PICK_INTENT, tools: [PLACE_CALL], reply: 'Mình chưa thấy quán khớp trong dữ liệu; bạn thử tìm thêm theo tên phố nhé.' })
    expect(on.logs.find(l => l.type === 'tappyai_unwind_presearch_query')?.chosen).toBe('none')
    expect(on.logs.some(l => l.type === 'tappyai_presearch')).toBe(false)
    expect(on.toolNames).toContain('search_places')
    expect(on.text).toContain('Mình chưa thấy quán khớp trong dữ liệu')
    expect(on.logs.find(l => l.type === 'tappyai_empty_result')).toMatchObject({ replaced: false, appended: true })
    expect(on.text).toContain('chưa thấy kết quả đủ tin cậy')
    expect(on.text).not.toContain('Tìm trên cả TP.HCM')
  }, 60000)
  it('flags OFF (same turn): HEAD never calls the model - the code-built card asks "how many people" (measured on this route, 28/10)', async () => {
    const off = await turn(PICK, { unwind: false, luna: PICK_INTENT, tools: [PLACE_CALL], reply: 'Câu của mô hình không được giữ.' })
    expect(off.logs.some(l => l.type === 'tappyai_unwind_presearch_query')).toBe(false)
    expect(off.streamCalled).toBe(0)
    expect(off.logs.some(l => l.type === 'tappyai_canned_reply')).toBe(true)
    expect(off.text).toContain('[TAPPY_ASK]')
    expect(off.text).not.toContain('Câu của mô hình không được giữ.')
  }, 60000)
})

describe('unwind e2e — a markdown table reaches the user whole (S3B)', () => {
  // measured on localhost 28/10 (L2): the line tidy dropped the "|---|" rule (no letter or digit) and the user saw raw "|" lines
  const reply = 'So sánh nhanh:\n\n| Ngân hàng | 12 tháng |\n|---|---|\n| A | 5,9% |\n| B | 4,9% |\n\nNguồn ngày 26/10/2026.'
  // the localhost turn: a comparison (the V1 frame is on: goal "compare") read as EASY, so no structured synthesis (route.ts: structured needs difficulty !== 'easy') and only the line tidy decides the table
  const COMPARE: Msg[] = [{ role: 'user', content: 'so sanh lai suat tiet kiem 12 thang cua Vietcombank va BIDV giup minh' }]
  const LEAN_CHAT = intent('chat', [], { difficulty: 'easy' })
  it('flags ON: the rule line and every row are kept', async () => {
    const on = await turn(COMPARE, { unwind: true, luna: LEAN_CHAT, tools: [SEARCH], reply })
    expect(on.text).toContain('| Ngân hàng | 12 tháng |\n|---|---|\n| A | 5,9% |')
  }, 60000)
  it('flags OFF (L2, no structured synthesis): the rule line is dropped as at HEAD', async () => {
    const off = await turn(COMPARE, { unwind: false, luna: LEAN_CHAT, tools: [SEARCH], reply })
    expect(off.text).toContain('| Ngân hàng | 12 tháng |')
    expect(off.text).not.toContain('|---|---|')
  }, 60000)
})

describe('unwind e2e — the citation marker never reaches the user (S1C)', () => {
  const OPEN = String.fromCharCode(0xe200), CLOSE = String.fromCharCode(0xe201), SEP = String.fromCharCode(0xe202)
  const reply = `Giá điện bậc 1 là 1.893 đồng/kWh ${OPEN}cite${SEP}turn0search0${CLOSE}.`
  it('flags ON: removed from the stream', async () => {
    const on = await turn(KNOW, { unwind: true, luna: KNOW_INTENT, reply })
    expect(on.text).toContain('Giá điện bậc 1 là 1.893 đồng/kWh')
    expect(on.text).not.toContain(OPEN)
    expect(on.text).not.toContain('turn0search0')
  }, 60000)
  it('flags OFF: left as at HEAD (CONSULT_LUNA_ONE off)', async () => {
    const off = await turn(KNOW, { unwind: false, luna: KNOW_INTENT, reply })
    expect(off.text).toContain('turn0search0')
  }, 60000)
})

describe('one brain e2e (CONSULT_ONE_BRAIN) - the answer model is the only reader of the question', () => {
  // Four different kinds of request, written for this test: a review of a text (the rules read "ban hang" as shopping), a trip plan, a place pick, a knowledge question.
  const REVIEW: Msg[] = [{ role: 'user', content: 'nhan xet giup minh prompt nay: "Hay thiet ke kien truc cho mot website ban hang online co gio hang va thanh toan"' }]
  const TRIP: Msg[] = [{ role: 'user', content: 'len lich trinh 2 ngay 1 dem o da lat giup minh' }]
  const TRIP_INTENT = intent('plan', ['travel'], { known: [{ key: 'diem_den', value: 'Đà Lạt' }, { key: 'so_ngay', value: '2' }] })
  const cases: Array<[string, Msg[], Record<string, unknown>]> = [['review', REVIEW, intent('chat', [])], ['trip', TRIP, TRIP_INTENT], ['pick', PICK, PICK_INTENT], ['know', KNOW, KNOW_INTENT], ['hello', [{ role: 'user', content: 'chao ban' }], intent('chat', [])]]
  const ALL_TOOLS = ['search_places', 'get_news', 'search_products', 'web_search', 'read_page', 'calculate', 'get_weather', 'get_weather_forecast', 'present_plan', 'get_gold_price', 'get_flight_prices', 'get_hotel_prices', 'get_transport_options', 'save_price_watch']
  const reply = 'Trả lời của mô hình.'
  it('flag ON: every kind of request reaches the model the same way - no intent call, the whole tool set, the one general instruction, 8 steps, 4000 tokens', async () => {
    for (const [name, m, l] of cases) {
      const on = await turn(m, { unwind: true, oneBrain: true, luna: l, reply })
      expect(on.streamCalled, name).toBe(1)
      expect(on.extract, name).not.toContain('tappy_intent')
      expect(on.logs.some(x => x.type === 'tappyai_luna_intent'), name).toBe(false)
      expect([...on.toolNames].sort(), name).toEqual([...ALL_TOOLS].sort())
      expect(on.opts.systemShared, name).toContain('You are Tappy, a general AI assistant')
      expect(on.opts, name).toMatchObject({ role: 'consult', maxSteps: 8, maxTokens: 4000 })
      expect(on.system, name).not.toContain('NGUOI TU VAN')
      expect(on.text, name).toContain(reply)
    }
  }, 120000)
  it('flag OFF (same turns, unwind flags ON): the intent call reads each turn and the code gives each its own tool set and prompt', async () => {
    const seen: Record<string, { tools: string[]; role?: string }> = {}
    for (const [name, m, l] of cases) {
      const off = await turn(m, { unwind: true, oneBrain: false, luna: l, reply })
      // a greeting is answered by the code's canned small talk: no model at all
      if (name === 'hello') { expect(off.streamCalled).toBe(0); continue }
      expect(off.extract, name).toContain('tappy_intent')
      expect(off.opts.systemShared ?? '', name).not.toContain('You are Tappy, a general AI assistant')
      seen[name] = { tools: off.toolNames, role: off.opts.role }
    }
    expect(seen.trip).toEqual({ tools: [], role: 'plan' })
    expect(seen.pick.tools).not.toContain('get_weather')
  }, 120000)
  it('flag ON, a fare question: a fare and a departure the READ pages state are kept; a number no page states is still cut (29/10)', async () => {
    // Measured 29/10 on localhost: the travel guard cut 11 of 16 amounts the model copied from the Vexere train page it had read.
    h.state.pages['https://giadien.example/bang-gia'] = { body: ARTICLE('Vé tàu Sài Gòn Nha Trang', ['Tàu SE8 khởi hành 06:00, ghế ngồi mềm giá vé 315.000đ.']) }
    const FARE: Msg[] = [{ role: 'user', content: 've tau sai gon di nha trang ngay 16/11 gia bao nhieu' }]
    const FARE_INTENT = intent('ask', ['travel'])
    const said = 'Tàu SE8 khởi hành lúc 06:00, ghế ngồi mềm giá 315.000đ.'
    const invented = 'Giường nằm khoang 4 giá 987.000đ.'
    // No place tool ran: the place guard does not judge these (it deleted both on 29/10, the second a hedge).
    const booking = 'Bạn có thể đặt vé trực tuyến trên Vexere.'
    const hedge = 'Mình chưa xác minh được còn chỗ cho ngày 16/11.'
    const on = await turn(FARE, { unwind: true, oneBrain: true, luna: FARE_INTENT, tools: [SEARCH], reply: `${said} ${invented} ${booking} ${hedge}` })
    const ws = on.results.find(r => r.name === 'web_search')?.result
    expect((ws?.pages_read as unknown[] | undefined)?.length ?? 0).toBeGreaterThan(0)
    expect(on.text).toContain('315.000')
    expect(on.text).toContain('06:00')
    expect(on.text).not.toContain('987.000')
    expect(on.text).toContain('đặt vé trực tuyến trên Vexere')
    expect(on.text).toContain('chưa xác minh được còn chỗ')
    // Without the one-brain flag the same turn keeps its old evidence (snippets only): the page fare is cut as before.
    const off = await turn(FARE, { unwind: true, oneBrain: false, luna: FARE_INTENT, tools: [SEARCH], reply: `${said} ${invented}` })
    expect(off.text).not.toContain('315.000')
  }, 60000)
  it('a train question: the transport tool carries the dated train link AND the route page\'s trains with their fares; the reply may restate them, an invented fare is cut (29/10)', async () => {
    const ROWS = [
      { train: 'SE8', depart: '06:00', arrive: '13:43', from_station: 'Ga Sài Gòn', to_station: 'Ga Nha Trang', price_from_vnd: 315000 },
      { train: 'SE6', depart: '08:45', arrive: '16:06', from_station: 'Ga Sài Gòn', to_station: 'Ga Nha Trang', price_from_vnd: 363000 },
    ]
    const TRAIN: Msg[] = [{ role: 'user', content: 've tau sai gon nha trang ngay 16/11 cho 2 nguoi' }]
    const CALL = { name: 'get_transport_options', args: { origin: 'Sài Gòn', destination: 'Nha Trang', date: '2026-11-16', passengers: 2 } }
    // "khởi hành" is the wording the travel guard judges a time in: a departure the page states stays, one it does not is cut.
    const reply = 'Tàu SE8 khởi hành 06:00, đến 13:43, giá từ 315.000đ. Tàu SE6 khởi hành 08:45 giá từ 363.000đ, hai người khoảng 726.000đ. Giường nằm VIP giá 999.000đ. Có thêm chuyến khởi hành lúc 23:10.'
    const on = await turn(TRAIN, { unwind: true, oneBrain: true, luna: intent('ask', ['travel']), tools: [CALL], reply, railRows: ROWS })
    const tr = on.results.find(r => r.name === 'get_transport_options')?.result
    expect(tr?.train_booking_link).toBe('https://vexere.com/vn/ve-tau-hoa/dat-ve-tau.vi?from=29_area&to=417_area&date%5Bdepart%5D=2026-11-16&passenger%5Badt%5D=2')
    expect(tr?.train_schedule?.rows).toEqual(ROWS)
    expect(tr?.train_schedule?.page_url).toBe('https://vexere.com/vn/ve-tau-hoa/tu-ho-chi-minh-di-nha-trang-khanh-hoa.29.417.vi')
    expect(on.text).toContain('315.000')
    expect(on.text).toContain('363.000')
    expect(on.text).toContain('06:00')
    expect(on.text).toContain('08:45')
    expect(on.text).toContain('726.000') // the party's total: 363.000đ × 2
    expect(on.text).not.toContain('999.000')
    expect(on.text).not.toContain('23:10') // a departure no page states
    // No page rows: no field, and the fares the model states have nothing behind them.
    const none = await turn(TRAIN, { unwind: true, oneBrain: true, luna: intent('ask', ['travel']), tools: [CALL], reply })
    expect(none.results.find(r => r.name === 'get_transport_options')?.result?.train_schedule).toBeUndefined()
    expect(none.text).not.toContain('363.000')
  }, 60000)
  it('a train question: the journey time a row implies is evidence too; a journey time no row implies is still cut (30/10)', async () => {
    // Measured offline 30/10 (travel guard with the rows as evidence): "khởi hành 13:00 và mất khoảng 12h35" was cut whole, the journey
    // time read as a clock time no row states. SE8 06:00 → 13:43 is 7 h 43; SE6 08:45 → 16:06 is 7 h 21.
    const ROWS = [
      { train: 'SE8', depart: '06:00', arrive: '13:43', from_station: 'Ga Sài Gòn', to_station: 'Ga Nha Trang', price_from_vnd: 315000 },
      { train: 'SE6', depart: '08:45', arrive: '16:06', from_station: 'Ga Sài Gòn', to_station: 'Ga Nha Trang', price_from_vnd: 363000 },
    ]
    const TRAIN: Msg[] = [{ role: 'user', content: 've tau sai gon nha trang ngay 16/11' }]
    const CALL = { name: 'get_transport_options', args: { origin: 'Sài Gòn', destination: 'Nha Trang', date: '2026-11-16' } }
    const reply = 'Đi tàu vào Nha Trang khá thoải mái. Tàu SE8 khởi hành 06:00 và mất khoảng 7h43 để tới Nha Trang. Tàu SE6 khởi hành 08:45 và mất khoảng 9h15.'
    const on = await turn(TRAIN, { unwind: true, oneBrain: true, luna: intent('ask', ['travel']), tools: [CALL], reply, railRows: ROWS })
    expect(on.text).toContain('mất khoảng 7h43')
    expect(on.text).not.toContain('9h15')
    // No page rows: nothing implies a journey time, and the sentence goes as before.
    const none = await turn(TRAIN, { unwind: true, oneBrain: true, luna: intent('ask', ['travel']), tools: [CALL], reply })
    expect(none.text).not.toContain('7h43')
  }, 60000)
  it('a train question, one brain: availability ADVICE and the pointer to the booking page stay; a stated seat count is cut; flag OFF unchanged (owner 30/10, a)', async () => {
    const TRAIN: Msg[] = [{ role: 'user', content: 've tau sai gon nha trang ngay 16/11' }]
    const CALL = { name: 'get_transport_options', args: { origin: 'Sài Gòn', destination: 'Nha Trang', date: '2026-11-16' } }
    const advice = 'Dịp cuối tuần vé giường nằm hay hết chỗ sớm, nên đặt trước.'
    const pointer = 'Bạn bấm link đặt vé để xem chỗ còn trống.'
    const reply = `Đi tàu vào Nha Trang khá thoải mái. ${advice} ${pointer} Chuyến SE8 hiện còn 3 chỗ.`
    const on = await turn(TRAIN, { unwind: true, oneBrain: true, luna: intent('ask', ['travel']), tools: [CALL], reply })
    expect(on.text).toContain(advice)
    expect(on.text).toContain(pointer)
    expect(on.text).not.toContain('còn 3 chỗ')
    const off = await turn(TRAIN, { unwind: true, oneBrain: false, luna: intent('ask', ['travel']), tools: [CALL], reply })
    expect(off.text).not.toContain('hay hết chỗ sớm')
    expect(off.text).not.toContain('chỗ còn trống')
  }, 60000)
  it('flag ON, trip plan: no code question, no pre-fetch, no plan frame - the model plans with its tools', async () => {
    const on = await turn(TRIP, { unwind: true, oneBrain: true, luna: TRIP_INTENT, reply })
    expect(on.web).toEqual([])
    expect(on.results).toEqual([])
    expect(on.logs.some(x => ['tappyai_unwind_ask', 'tappyai_luna_plan_data', 'tappyai_presearch', 'tappyai_clarify_gate', 'tappyai_canned_reply'].includes(String(x.type)))).toBe(false)
    expect(on.toolNames).toEqual(expect.arrayContaining(['search_places', 'web_search', 'get_weather', 'get_hotel_prices']))
  }, 60000)
  it('flag ON, place pick: no code card or pre-search; the model\'s own place search runs and its words are kept', async () => {
    const PLACE_CALL = { name: 'search_places', args: { query: 'bún chả', location: 'Hàng Bạc, Hà Nội', type: 'restaurant' } }
    const on = await turn(PICK, { unwind: true, oneBrain: true, luna: PICK_INTENT, tools: [PLACE_CALL], reply: 'Mình chưa thấy quán khớp; bạn cho mình thêm tên phố gần đó nhé.' })
    expect(on.logs.some(x => x.type === 'tappyai_presearch' || x.type === 'tappyai_canned_reply')).toBe(false)
    expect(on.logs.some(x => x.type === 'tappyai_tool_called' && x.tool === 'search_places')).toBe(true)
    expect(on.text).toContain('Mình chưa thấy quán khớp')
    expect(on.text).not.toContain('[TAPPY_ASK]')
    // the model read the empty result and wrote its own answer: no code block after it (S1A alone appends one)
    expect(on.text).not.toContain('chưa thấy kết quả đủ tin cậy')
  }, 60000)
  it('flag ON: a lookup the search provider refused at account level reaches the model as a FAILED lookup, not an empty one; flag OFF unchanged', async () => {
    h.state.accountErrorAt = Number.MAX_SAFE_INTEGER
    try {
      const on = await turn(KNOW, { unwind: true, oneBrain: true, luna: KNOW_INTENT, tools: [SEARCH], reply })
      expect(JSON.stringify(on.results)).toContain('search_provider_refused')
      // the tool's own "no result" note is replaced by the failure note
      expect(JSON.stringify(on.results)).toMatch(/(?<![_a-z])\\*"note\\*":\\*"The search provider refused/)
      const off = await turn(KNOW, { unwind: true, oneBrain: false, luna: KNOW_INTENT, tools: [SEARCH], reply })
      expect(JSON.stringify(off.results)).not.toContain('search_provider_refused')
    } finally { h.state.accountErrorAt = 0 }
    const fine = await turn(KNOW, { unwind: true, oneBrain: true, luna: KNOW_INTENT, tools: [SEARCH], reply })
    expect(JSON.stringify(fine.results)).not.toContain('search_provider_refused')
  }, 60000)
  it('flag ON: a cited price range stays in the model\'s sentence and no "not verified" line is appended', async () => {
    const ranged = '- **Giá mua:** Xe A khoảng 18,9–19,5 triệu đồng, xe B khoảng 22 triệu đồng (theo [Giaxe.2banh](https://giaxe.example/bang-gia)). Xe C niêm yết 24,9 triệu đồng.\n\nNên so giá lăn bánh.'
    const ASK_BUY: Msg[] = [{ role: 'user', content: 'nen mua xe may dien hay xe xang cho sinh vien di hoc hang ngay' }]
    const on = await turn(ASK_BUY, { unwind: true, oneBrain: true, luna: intent('chat', [], { difficulty: 'easy' }), tools: [SEARCH], reply: ranged })
    expect(on.text).toContain('Xe A khoảng 18,9–19,5 triệu đồng')
    expect(on.logs.some(x => x.type === 'tappyai_guard' && x.guard === 'range_evidence')).toBe(false)
    expect(on.text).toContain('Xe C niêm yết 24,9 triệu đồng.')
    expect(on.text).not.toContain('Mình chưa xác minh được giá hiện tại')
    // The OFF side is not reproduced here: the guard needs evidence rows from real search / page results, which this offline harness does not build.
    // The fix was checked on localhost 28/10 with the turn that showed it (MOT-BO-NAO report, question 8).
  }, 60000)
  it('flag ON: a plan handed to present_plan reaches the user as the [TAPPY_PLAN] card block (the brochure), after the model\'s summary', async () => {
    const plan = { type: 'trip', title: 'Đà Lạt 2 ngày 1 đêm', days: [{ label: 'Ngày 1 — Hồ Xuân Hương', items: [{ time: 'Sáng', emoji: '🌲', category: 'sightseeing', name: 'Hồ Xuân Hương' }] }] }
    const on = await turn(TRIP, { unwind: true, oneBrain: true, luna: TRIP_INTENT, tools: [{ name: 'present_plan', args: plan }], reply: 'Lịch trình gọn cho bạn, xem thẻ kế hoạch bên dưới.' })
    expect(on.text).toContain('Lịch trình gọn cho bạn')
    const m = on.text.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)
    expect(m).not.toBeNull()
    expect(JSON.parse(m![1])).toMatchObject({ type: 'trip', title: 'Đà Lạt 2 ngày 1 đêm', days: [{ label: 'Ngày 1 — Hồ Xuân Hương' }] })
    expect(on.text.indexOf('Lịch trình gọn')).toBeLessThan(on.text.indexOf('[TAPPY_PLAN]'))
  }, 60000)
  it('flag ON, no place retrieved (search down): the brochure keeps known sights marked unchecked and meals as plain slots; an invented hotel is still dropped', async () => {
    // Localhost 29/10 ("Đà Lạt 2 ngày 1 đêm", Serper 403): the strict plan guard dropped all 9 stops and every day of the card was empty.
    const plan = { type: 'trip', title: 'Đà Lạt 2 ngày 1 đêm', days: [{ label: 'Ngày 1 — Trung tâm', items: [
      { time: '08:00', emoji: '🌲', category: 'attraction', name: 'Hồ Xuân Hương', description: 'Đi dạo quanh hồ' },
      { time: '12:00', emoji: '🍲', category: 'food', name: 'Lẩu gà lá é Tao Ngộ', description: 'Ăn trưa' },
      { time: '14:00', emoji: '🏨', category: 'hotel', name: 'Khách sạn Hoa Mai Đà Lạt', description: 'Nhận phòng' },
    ] }] }
    const items = async (o: { oneBrain: boolean }) => {
      const t = await turn(TRIP, { unwind: true, oneBrain: o.oneBrain, luna: TRIP_INTENT, tools: [{ name: 'present_plan', args: plan }], reply: 'Lịch trình gọn cho bạn.' })
      const m = t.text.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)
      return m ? (JSON.parse(m[1]).days?.[0]?.items ?? []) as Array<{ name: string; description?: string; category?: string }> : null
    }
    const on = await items({ oneBrain: true })
    expect(on?.map(i => i.name)).toEqual(['Hồ Xuân Hương', 'Ăn trưa gần chỗ ở'])
    expect(on?.[0].description).toContain('gợi ý chưa kiểm chứng')
    expect(JSON.stringify(on)).not.toContain('Tao Ngộ')
    expect(JSON.stringify(on)).not.toContain('Hoa Mai')
  }, 60000)
  it('flag ON: the turn cost line prices the answer at the call\'s own vendor cost, not at the Haiku list price; flag OFF unchanged', async () => {
    // Localhost 29/10: a one-brain turn logged model "haiku-4.5" and priced the vendor's tokens at the Haiku list price.
    const finishSteps = [{ usage: { promptTokens: 8000, completionTokens: 500 }, providerMetadata: { tappy: { cost: { provider: 'openai', effort: 'none', usd: 0.0123, reasoningTokens: 0, cachedInputTokens: 6000, cacheWriteTokens: 0 } } } }]
    const cost = (t: { logs: Array<Record<string, any>> }) => t.logs.find(x => x.type === 'tappyai_turn_cost')
    const on = cost(await turn(KNOW, { unwind: true, oneBrain: true, luna: KNOW_INTENT, reply, finishSteps }))
    expect(on?.model).toBe('openai:none')
    expect(on?.answerUsd).toBeCloseTo(0.0123, 6)
    expect(on?.usd).toBeCloseTo(0.0123, 6)
    expect(on?.lunaCachedIn).toBe(6000)
    // Flag OFF this route runs the Luna path, which already priced each step from its own cost: the same line, with the intent call added.
    const off = cost(await turn(KNOW, { unwind: true, luna: KNOW_INTENT, reply, finishSteps }))
    expect(off?.model).toBe('openai:none')
    expect(off?.answerUsd).toBeCloseTo(0.0123, 6)
  }, 60000)
  it('CONSULT_ONE_BRAIN_MEDIA: the picture step runs after the answer and leaves the answer and its finish frame whole; without the flag it does not run', async () => {
    const on = await turn(KNOW, { unwind: true, oneBrain: true, media: true, luna: KNOW_INTENT, reply })
    expect(on.text).toContain(reply)
    expect(on.logs.some(x => x.type === 'tappyai_one_brain_media')).toBe(true)
    expect(on.raw.trim().split('\n').filter(l => l.startsWith('d:')).length).toBe(1)
    const off = await turn(KNOW, { unwind: true, oneBrain: true, luna: KNOW_INTENT, reply })
    expect(off.logs.some(x => x.type === 'tappyai_one_brain_media')).toBe(false)
    expect(off.text).toContain(reply)
  }, 60000)
  it('flag ON: the model may run a second place search of another kind in the same turn (the one-search-a-turn budget is not applied)', async () => {
    const calls = [{ name: 'search_places', args: { query: 'hải sản', location: 'Nha Trang', type: 'restaurant' } }, { name: 'search_places', args: { query: 'điểm tham quan', location: 'Nha Trang', type: 'attraction' } }]
    const on = await turn([{ role: 'user', content: 'di nha trang 2 ngay an gi choi gi' }], { unwind: true, oneBrain: true, luna: intent('chat', []), tools: calls, reply })
    expect(on.logs.filter(x => x.type === 'tappyai_tool_called' && x.tool === 'search_places' && x.step === undefined).length).toBe(2)
    expect(on.logs.some(x => x.type === 'tappyai_places_budget' && x.step === 'blocked')).toBe(false)
  }, 60000)
  it('flag ON with every unwind flag OFF: the model\'s table is not line-tidied (the tidy is for prose the shape guard cut)', async () => {
    const COMPARE: Msg[] = [{ role: 'user', content: 'so sanh lai suat tiet kiem 12 thang cua Vietcombank va BIDV giup minh' }]
    const table = 'So sánh nhanh:\n\n| Ngân hàng | 12 tháng |\n|---|---|\n| A | 5,9% |\n| B | 4,9% |'
    const on = await turn(COMPARE, { unwind: false, oneBrain: true, luna: intent('chat', [], { difficulty: 'easy' }), tools: [SEARCH], reply: table })
    expect(on.text).toContain('| Ngân hàng | 12 tháng |\n|---|---|\n| A | 5,9% |')
    // the one-brain limits do not lean on the unwind flags (S3B alone would also give 4000)
    expect(on.opts).toMatchObject({ role: 'consult', maxSteps: 8, maxTokens: 4000 })
  }, 60000)
  it('flag ON: a follow-up about a venue of the previous reply is answered by the model, not by a code-written reply', async () => {
    const thread: Msg[] = [{ role: 'user', content: 'Gợi ý giúp mình một quán cà phê yên tĩnh để làm việc' }, { role: 'assistant', content: 'Mình chọn **Cơm Niêu Sài Gòn**, số **028 1111 2222**.' }, { role: 'user', content: 'số điện thoại của quán này là gì?' }]
    const on = await turn(thread, { unwind: true, oneBrain: true, luna: intent('followup', ['food']), reply })
    expect(on.streamCalled).toBe(1)
    expect(on.logs.some(x => x.type === 'tappyai_canned_reply')).toBe(false)
    expect(on.text).toContain(reply)
  }, 60000)
  it('flag ON: a fare request naming two cities is not pre-searched by the code; the model gets the fare tool', async () => {
    const on = await turn([{ role: 'user', content: 've may bay tu ha noi di da nang ngay 5/11 gia bao nhieu' }], { unwind: true, oneBrain: true, luna: intent('pick', ['travel']), reply })
    expect(on.logs.some(x => x.type === 'tappyai_presearch')).toBe(false)
    expect(on.results).toEqual([])
    expect(on.toolNames).toContain('get_flight_prices')
  }, 60000)
  it('flag ON: a place request that names its district is not pre-searched by the code; the model gets the place tool', async () => {
    // without the one-brain guard the V1 frame pre-searches this one (measured with the guard removed)
    const on = await turn([{ role: 'user', content: 'cafe yen tinh quan 3 tphcm' }], { unwind: true, oneBrain: true, luna: intent('pick', ['food']), reply })
    expect(on.logs.some(x => x.type === 'tappyai_presearch')).toBe(false)
    expect(on.results).toEqual([])
    expect(on.toolNames).toContain('search_places')
  }, 60000)
})

// P0-1 (29/10 audit): the one-brain model must read the conversation it is answering. Before, a keyword reading of the last turn's domain (turnStartsNewConsultation)
// cut the history to ONE message, and the server compaction shrank every assistant reply but the last exchange to its first paragraph (≤420 characters), so
// "cái thứ hai" / "bảng ở trên" pointed at text the model no longer had. The payload the model gets is read here (`system` = {system, messages} as sent to AI.stream).
describe('one brain keeps the conversation the model answers (P0-1)', () => {
  const sent = (r: { system: string }): Array<{ role: string; content: string }> => (JSON.parse(r.system).messages as Array<{ role: string; content: unknown }>).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }))
  const joined = (r: { system: string }): string => sent(r).map(m => m.content).join('\n')
  // a long answer with a list and a table, each carrying a detail that only the full text has (a first paragraph + bold names would lose it)
  const ANSWER = [
    'Mình gợi ý 3 chỗ ở Đà Lạt cho gia đình, ưu tiên gần trung tâm.',
    '',
    '- **Villa Hoa Sữa:** phòng ba người, có bếp riêng, bãi đậu xe rộng; chi tiết-ZETA-ngày-hai-bữa-sáng-miễn-phí.',
    '- **Khách sạn Thông Xanh:** gần chợ đêm, nhưng phòng nhỏ hơn.',
    '- **Homestay Mây Chiều:** view đồi, xa trung tâm 6 km.',
    '',
    '| Chỗ | Giá/đêm | Ghi chú |',
    '|---|---|---|',
    '| Villa Hoa Sữa | 1.150.000đ | ô-bảng-KAPPA-có-hồ-bơi |',
    '| Khách sạn Thông Xanh | 780.000đ | gần chợ |',
    '| Homestay Mây Chiều | 640.000đ | view đồi |',
    '',
    'Nếu ưu tiên tiện đi lại thì chọn Villa Hoa Sữa; ngân sách chặt hơn thì Homestay Mây Chiều. '.repeat(3),
  ].join('\n')
  const U1 = 'gia đình mình 4 người muốn đi Đà Lạt 3 ngày, ngân sách khoảng 12 triệu, cần chỗ ở có bếp và bãi đậu xe'
  const U2 = 'gợi ý giúp mình quán cà phê view đẹp'
  const KEYWORD_SWITCH: Msg[] = [{ role: 'user', content: U1 }, { role: 'assistant', content: ANSWER }, { role: 'user', content: U2 }]
  const FOLLOW = 'cái thứ hai có gần chợ không, và cái ở bảng trên giá rẻ nhất là chỗ nào'
  const LONG_THREAD: Msg[] = [
    { role: 'user', content: U1 }, { role: 'assistant', content: ANSWER },
    { role: 'user', content: 'vậy chỗ nào gần chợ đêm' }, { role: 'assistant', content: 'Khách sạn Thông Xanh gần chợ đêm nhất. '.repeat(30) },
    { role: 'user', content: FOLLOW },
  ]
  const one = (m: Msg[]) => turn(m, { unwind: true, oneBrain: true, luna: intent('followup', []), reply: 'Ok.' })

  it('a turn the keyword reading calls a new subject still gets the whole thread (role order kept, nothing doubled)', async () => {
    const on = await one(KEYWORD_SWITCH)
    const m = sent(on)
    expect(m.map(x => x.role)).toEqual(['user', 'assistant', 'user'])
    expect(m[0].content).toContain('ngân sách khoảng 12 triệu')
    expect(m[1].content).toContain('chi tiết-ZETA-ngày-hai-bữa-sáng-miễn-phí')
    expect(m[2].content).toBe(U2)
    expect(joined(on).split(U2).length - 1).toBe(1)
  }, 60000)
  it('"cái thứ hai" / "bảng ở trên": the earlier list and table reach the model whole, not as a first paragraph', async () => {
    const m = sent(await one(LONG_THREAD))
    expect(m.map(x => x.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
    expect(m[1].content).toContain('chi tiết-ZETA-ngày-hai-bữa-sáng-miễn-phí')
    expect(m[1].content).toContain('ô-bảng-KAPPA-có-hồ-bơi')
    expect(m[1].content).toContain('| Homestay Mây Chiều | 640.000đ | view đồi |')
    expect(m[4].content).toBe(FOLLOW)
  }, 60000)
  it('a constraint stated in the first turn is still in the payload several turns later', async () => {
    for (const thread of [LONG_THREAD, [...LONG_THREAD.slice(0, 4), { role: 'user', content: U2 } as Msg]]) {
      const t = joined(await one(thread))
      expect(t).toContain('ngân sách khoảng 12 triệu')
      expect(t).toContain('cần chỗ ở có bếp và bãi đậu xe')
    }
  }, 60000)
  it('no application-generated state block rides along with the longer history', async () => {
    const on = await one(KEYWORD_SWITCH)
    expect(on.system).not.toContain('DỮ LIỆU PHIÊN')
    expect(on.system).not.toContain('TRANG THAI PHIEN')
  }, 60000)
  it('over the request budget (the existing 20 000 characters of requestHistory): the OLDEST turns go whole, the newest stay verbatim, the thread never opens on an assistant turn', async () => {
    // four replies of ~5.2k characters: ~21k with the user turns, over the 20 000 budget and under the server's 24 000 cap, inside the ten-message window
    const BIG = (tag: string) => `Câu trả lời ${tag}. ` + `Đoạn dài về chuyến đi ${tag} với nhiều chi tiết. `.repeat(115).trimEnd() + `\n\n**Quán Cây Thông ${tag}** ngon.`
    const thread: Msg[] = [
      { role: 'user', content: 'câu hỏi một về Đà Lạt' }, { role: 'assistant', content: BIG('A1') },
      { role: 'user', content: 'câu hỏi hai về Đà Lạt' }, { role: 'assistant', content: BIG('A2') },
      { role: 'user', content: 'câu hỏi ba về Đà Lạt' }, { role: 'assistant', content: BIG('A3') },
      { role: 'user', content: 'câu hỏi bốn về Đà Lạt' }, { role: 'assistant', content: BIG('A4') },
      { role: 'user', content: 'câu hỏi năm về Đà Lạt, tóm tắt giúp mình' },
    ]
    expect(thread.reduce((n, x) => n + x.content.length, 0)).toBeGreaterThan(20_000)
    const m = sent(await one(thread))
    const chars = m.reduce((n, x) => n + x.content.length, 0)
    expect(chars).toBeLessThanOrEqual(20_000)
    // the first exchange went (requestHistory drops the oldest turns, then any assistant turn left in front); what is left is whole and in order
    expect(m[0].role).toBe('user')
    expect(m.map(x => x.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user'])
    expect(m.filter(x => x.role === 'user').map(x => x.content)).toEqual(thread.filter(x => x.role === 'user').slice(1).map(x => x.content))
    expect(m.filter(x => x.role === 'assistant').map(x => x.content.trim())).toEqual([BIG('A2').trim(), BIG('A3').trim(), BIG('A4').trim()])
  }, 60000)
  it('inside the budget nothing is shrunk: every assistant reply of a short thread arrives whole', async () => {
    const m = sent(await one(LONG_THREAD))
    // (compared without the stray end space: the route's marker stripping may touch it)
    expect(m[1].content.trim()).toBe(ANSWER.trim())
    expect(m[3].content.trim()).toBe('Khách sạn Thông Xanh gần chợ đêm nhất. '.repeat(30).trim())
  }, 60000)
  it('the other routes are unchanged: the same keyword-switch thread still reaches a flag-OFF model as ONE message, and an old reply is still compacted', async () => {
    const off = await turn(KEYWORD_SWITCH, { unwind: true, oneBrain: false, luna: intent('pick', ['food']), reply: 'Ok.' })
    expect(off.streamCalled).toBe(1)
    expect(joined(off)).toContain(U2)
    expect(joined(off)).not.toContain('ngân sách khoảng 12 triệu') // the earlier subject's turns do not reach the model on this route (unchanged)
    expect(joined(off)).not.toContain('chi tiết-ZETA')
    const offLong = await turn(LONG_THREAD, { unwind: true, oneBrain: false, luna: intent('followup', []), reply: 'Ok.' })
    expect(offLong.streamCalled).toBe(1)
    expect(joined(offLong)).not.toContain('ô-bảng-KAPPA-có-hồ-bơi')
  }, 60000)
})

// P0-3 (29/10 audit): the route passed `needProfile.domain === 'places'` (a keyword reading of the question) to the stream filter as `placeIntent`. In one brain the place
// guards follow the place TOOL the model called, so a place-sounding question the model answered without a tool switches nothing on.
describe('one brain: a place keyword alone does not run the place guards (P0-3)', () => {
  const ASK: Msg[] = [{ role: 'user', content: 'quán phở ngon ở quận 3 tphcm' }]
  const reply = 'Phở ở quận 3 thường khoảng **50.000đ** một tô, quán nào cũng đông vào buổi trưa.'
  it('no place tool: no place-price stage record in one brain; the other route still runs it', async () => {
    const on = await turn(ASK, { unwind: true, oneBrain: true, luna: intent('pick', ['food']), reply })
    expect(on.streamCalled).toBe(1)
    expect(on.logs.some(l => l.guard === 'legacy_stage' && String(l.stage).includes('snippet_price'))).toBe(false)
    expect(on.text).toContain('50.000đ')
    vi.stubEnv('LEGACY_STREAM_TRACE', '1') // (the counters of the other route are behind this flag)
    const off = await turn(ASK, { unwind: true, oneBrain: false, luna: intent('pick', ['food']), reply })
    expect(off.text).not.toContain('50.000đ')
    expect(off.logs.some(l => l.guard === 'legacy_stage' && l.stage === 'snippet_price')).toBe(true)
  }, 60000)
})
