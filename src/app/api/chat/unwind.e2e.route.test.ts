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
  serperSearch: async (q: string) => { h.state.webCalls.push(String(q)); return [] },
  webSearch: async (q: string) => {
    h.state.webCalls.push(String(q))
    return h.state.webCalls.length === 1
      ? { results: [{ title: 'Bảng giá điện sinh hoạt', link: 'https://giadien.example/bang-gia', snippet: 'Biểu giá bậc thang' }, { title: 'Tin tức', link: 'https://tin.example/bai', snippet: 'Bài viết' }, { title: 'Diễn đàn', link: 'https://forum.example/t/1', snippet: 'Thảo luận' }, { title: 'Thứ tư', link: 'https://khac.example/4', snippet: 'x' }] }
      : { results: [{ title: 'Quyết định điều chỉnh giá', link: 'https://chinhphu.example/qd', snippet: 'Văn bản' }, { title: 'Bảng giá điện sinh hoạt', link: 'https://giadien.example/bang-gia', snippet: 'trùng' }] }
  },
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
            try { await opts.onFinish?.({ usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop', text: h.state.text, steps: [] }) } catch { /* the mock must not fail a turn */ }
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
interface TurnOpts { unwind: boolean; oneBrain?: boolean; media?: boolean; luna: Record<string, unknown>; tools?: Array<{ name: string; args: Record<string, unknown> }>; reply?: string; gapQuery?: string | null }

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
  const ALL_TOOLS = ['search_places', 'get_news', 'search_products', 'web_search', 'read_page', 'calculate', 'get_weather', 'get_weather_forecast', 'get_gold_price', 'get_flight_prices', 'get_hotel_prices', 'get_transport_options', 'save_price_watch']
  const reply = 'Trả lời của mô hình.'
  it('flag ON: every kind of request reaches the model the same way - no intent call, the whole tool set, the one general instruction, 6 steps, 4000 tokens', async () => {
    for (const [name, m, l] of cases) {
      const on = await turn(m, { unwind: true, oneBrain: true, luna: l, reply })
      expect(on.streamCalled, name).toBe(1)
      expect(on.extract, name).not.toContain('tappy_intent')
      expect(on.logs.some(x => x.type === 'tappyai_luna_intent'), name).toBe(false)
      expect([...on.toolNames].sort(), name).toEqual([...ALL_TOOLS].sort())
      expect(on.opts.systemShared, name).toContain('You are Tappy, a general AI assistant')
      expect(on.opts, name).toMatchObject({ role: 'consult', maxSteps: 6, maxTokens: 4000 })
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
    expect(on.opts).toMatchObject({ role: 'consult', maxSteps: 6, maxTokens: 4000 })
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
