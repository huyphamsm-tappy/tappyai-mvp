/**
 * Wave 4 · C3 — CONSULT_PICK_TURN_TOOLS (R2) at ROUTE level (full POST /api/chat, scripted intent call and scripted model, Serper and the page fetch mocked, no network, no key, no cost).
 * R2 = a lean Luna answer turn the CODE pre-searched (the model had no tool). Claims:
 *   · OFF (unset, "0", any other value, L1, production): the previous turn byte for byte - two steps, no tool;
 *   · ON: the code's pre-search runs exactly as before AND the model is offered web_search, read_page and calculate (nothing else); steps by level; the three rule lines only for those tools;
 *   · ON: read_page opens the venue's own site found by the pre-search, honours robots.txt; a price read on that page stays in the answer, an invented one is still cut (the guards see the page);
 *   · a lean turn that was NOT pre-searched (R1) is untouched by the flag.
 * The messages and pages are written for this test; none comes from a benchmark question file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { RESEARCH_RULE, __resetSharedRobots } from '@/lib/ai/consultative/researchLoop'
import { MATH_TOOL_RULE, TOOL_BY_NEED_RULE } from '@/lib/ai/consultative/leanConsultPrompt'
import { __resetPageCache } from '@/lib/ai/agent/runtime/readPage'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    calls: [] as Call[], results: [] as Array<{ name: string; result: any }>, luna: null as null | Record<string, unknown>,
    toolNames: [] as string[], maxSteps: 0, system: '' as string, text: 'ok', maps: [] as string[], webCalls: [] as string[], fetched: [] as string[],
    pages: {} as Record<string, { status?: number; body: string; contentType?: string }>, userId: 'u-pick-turn-tools', secondVenue: false, evidence: null as null | Record<string, unknown>,
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
  // S1: the stored decision evidence a follow-up turn may reuse (null = none, as every other test of this file)
  return { state, client: { from: () => builder(), rpc: (name: string) => Promise.resolve({ data: name === 'decision_evidence_load' ? state.evidence : null, error: null }) } }
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
  fetchPublicPage: async (url: string, opts?: { signal?: AbortSignal; hopGate?: (u: URL, s?: AbortSignal) => Promise<string | null> }) => {
    h.state.fetched.push(url)
    // A redirect: the real fetcher asks the hop gate before it opens the target (safePageFetch); the stand-in does the same.
    if (url === 'https://caphemay.example/go') {
      const refused = await opts?.hopGate?.(new URL('https://caphemay.example/private/staff'), opts?.signal)
      if (refused) return { ok: false, url, reason: refused, redirects: 1, ms: 1 }
      h.state.fetched.push('https://caphemay.example/private/staff')
      return { ok: true, url: 'https://caphemay.example/private/staff', finalUrl: 'https://caphemay.example/private/staff', status: 200, contentType: 'text/html; charset=utf-8', body: '<html><body>x</body></html>', bytes: 27, truncated: false, redirects: 1, ms: 1 }
    }
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
  webSearch: async (q: string) => { h.state.webCalls.push(String(q)); return { results: [{ title: 'Cà phê Mây', link: 'https://caphemay.example/', snippet: 'Thực đơn' }, { title: 'Nhân sự', link: 'https://caphemay.example/private/staff', snippet: 'x' }, { title: 'Chuyển', link: 'https://caphemay.example/go', snippet: 'x' }] } },
}))
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()),
  serperPlaces: async (q: string, ll?: { lat: number; lng: number } | null) => {
    h.state.maps.push(q)
    return ll ? [
      { title: 'Cà phê Mây', address: 'Cà phê Mây', rating: 4.5, ratingCount: 300, placeId: 'p1', latitude: ll.lat + 0.001, longitude: ll.lng + 0.001, website: 'https://caphemay.example/' },
      // part B: a second venue with a site of its own, only in the tests that ask for it (every other test sees the one-venue pre-search it always saw)
      ...(h.state.secondVenue ? [{ title: 'Trà Gió', address: 'Trà Gió', rating: 4.4, ratingCount: 200, placeId: 'p2', latitude: ll.lat + 0.002, longitude: ll.lng + 0.002, website: 'https://tragio.example/' }] : []),
    ] : []
  },
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/food')>()), searchPlacesOSM: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => h.state.luna
      ? Promise.resolve({ object: h.state.luna, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {} })
      : Promise.reject(new Error('no provider in this test')),
    stream: (opts: Record<string, any>) => {
      h.state.toolNames = Object.keys(opts.tools ?? {})
      h.state.maxSteps = Number(opts.maxSteps ?? 0)
      try { h.state.system = JSON.stringify({ system: opts.system }) } catch { h.state.system = '' }
      return {
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

const GPS_HN = { lat: 21.0285, lng: 105.8542, address: 'Hoàn Kiếm, Hà Nội' }
type Msg = { role: 'user' | 'assistant'; content: string }
const lunaIntent = (turn: string, domains: string[]) => ({ domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const J = (s: string) => JSON.stringify(s).slice(1, -1)
const PICK: Msg[] = [{ role: 'user', content: 'quán cà phê gần đây' }]
const ENV_NAMES = ['CONSULT_LUNA', 'CONSULT_FOLLOW_REUSE', 'CONSULT_PICK_TURN_TOOLS','CONSULT_KNOWLEDGE_PATH', 'CONSULT_CAPABILITY_LEVEL', 'CONSULT_RESEARCH_LOOP', 'CONSULT_DETERMINISTIC_MATH', 'CONSULT_TOOL_BY_NEED', 'CONSULT_STRUCTURED_SYNTHESIS', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_FINAL_SYNTHESIS', 'VERCEL_ENV', 'TAPPY_AGENT']
const MENU = '<html><head><title>Thực đơn Cà phê Mây</title></head><body><table><caption>Đồ uống</caption><tr><th>Món</th><th>Giá</th></tr><tr><td>Bạc xỉu</td><td>52.000đ</td></tr></table><p>Mở cửa 7h đến 22h.</p></body></html>'

interface Cfg { flag?: string; level?: string; vercelEnv?: string; lunaTurn?: string; lunaDomains?: string[]; msgs?: Msg[]; calls?: Array<{ name: string; args: Record<string, unknown> }>; reply?: string; secondVenue?: boolean; env?: Record<string, string>; evidence?: Record<string, unknown>; evidenceId?: string; withLogs?: boolean }
async function turn(c: Cfg = {}) {
  for (const k of ENV_NAMES) delete process.env[k]
  for (const [k, v] of Object.entries(c.env ?? {})) process.env[k] = v
  h.state.secondVenue = c.secondVenue ?? false
  h.state.evidence = c.evidence ?? null
  if (c.flag !== undefined) process.env.CONSULT_PICK_TURN_TOOLS = c.flag
  if (c.level !== undefined) { process.env.CONSULT_CAPABILITY_LEVEL = c.level; process.env.CONSULT_KNOWLEDGE_PATH = '0' } // this file measures R2 alone
  if (c.vercelEnv) process.env.VERCEL_ENV = c.vercelEnv
  h.state.calls = (c.calls ?? []).map((t, i) => ({ toolCallId: `c${i + 1}`, toolName: t.name, args: t.args }))
  h.state.text = c.reply ?? 'ok'
  h.state.luna = lunaIntent(c.lunaTurn ?? 'pick', c.lunaDomains ?? ['food'])
  h.state.toolNames = []; h.state.maxSteps = 0; h.state.system = ''; h.state.results = []; h.state.fetched = []; h.state.maps = []; h.state.webCalls = []
  __resetAiQuestionQuotaLocal(); __resetPageCache(); __resetSharedRobots()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: c.msgs ?? PICK, userLocation: GPS_HN, ...(c.evidenceId ? { decisionEvidenceId: c.evidenceId } : {}) }), signal: undefined,
  }
  const logs: string[] = []
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) }))
  let raw = ''
  try { raw = await (await POST(req as never)).text() } finally { spies.forEach(s => s.mockRestore()) }
  const text = raw.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')
  const out = { tools: [...h.state.toolNames].sort(), maxSteps: h.state.maxSteps, system: h.state.system, text, maps: h.state.maps.length, results: [...h.state.results], fetched: [...h.state.fetched] }
  return c.withLogs ? { ...out, logs } : out
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T03:09:00Z')) // the prompt carries the minute; these tests compare prompts byte for byte
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  h.state.pages = {
    'https://caphemay.example/robots.txt': { body: 'User-agent: *\nDisallow: /private\n', contentType: 'text/plain' },
    'https://caphemay.example/': { body: MENU },
    'https://caphemay.example/private/staff': { body: '<html><body>Lương 9.000.000đ</body></html>' },
  }
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { vi.useRealTimers(); for (const k of ENV_NAMES) delete process.env[k]; vi.unstubAllGlobals() })

describe('C3 — OFF is the previous R2 turn', () => {
  it('unset: the code pre-searches, two steps, the model gets no tool', async () => {
    const off = await turn()
    expect(off.maps).toBeGreaterThan(0)
    expect(off.maxSteps).toBe(2)
    expect(off.tools).toEqual([])
  }, 60000)
  it('"0", any other value, L1, a production runtime (even with L4 or "1"): the very same turn', async () => {
    const off = await turn()
    for (const c of [{ flag: '0' }, { flag: 'true' }, { flag: ' 1' }, { flag: '1 ' }, { flag: '' }, { level: '1' }, { level: '4', vercelEnv: 'production' }, { flag: '1', vercelEnv: 'production' }, { level: '2', flag: '0' }] as Cfg[]) {
      expect(await turn(c), JSON.stringify(c)).toEqual(off)
    }
  }, 120000)
})

describe('C3 — ON: the pre-searched pick gets the model tools', () => {
  it('flag "1": the pre-search still runs; the model gets exactly web_search, read_page, calculate; the three rule lines; steps 5', async () => {
    const off = await turn()
    const on = await turn({ flag: '1' })
    expect(on.maps).toBe(off.maps)
    expect(on.tools).toEqual(['calculate', 'read_page', 'web_search'])
    for (const r of [TOOL_BY_NEED_RULE, MATH_TOOL_RULE, RESEARCH_RULE]) expect(on.system).toContain(J(r))
    expect(on.maxSteps).toBe(5)
  }, 60000)
  it('steps by level: L2 six, L4 eight', async () => {
    expect((await turn({ level: '2' })).maxSteps).toBe(6)
    expect((await turn({ level: '4' })).maxSteps).toBe(8)
  }, 60000)
  const SEARCH = { name: 'web_search', args: { query: 'Cà phê Mây thực đơn giá' } }
  const READ = (u: string) => ({ name: 'read_page', args: { urls: [u], focus: 'giá' } })
  it('the venue page is opened only after a search carried its link (the pre-search\'s slimmed place card carries none); robots.txt is honoured; an invented price is cut', async () => {
    const before = await turn({ flag: '1', calls: [READ('https://caphemay.example/')] })
    expect(before.results.find(x => x.name === 'read_page')?.result?.pages?.[0]?.error).toBe('url_not_from_results')
    expect(before.fetched).toEqual([])
    const r = await turn({ flag: '1', calls: [SEARCH, READ('https://caphemay.example/'), READ('https://caphemay.example/private/staff')], reply: 'Mình chọn **Cà phê Mây**. Bạc xỉu **52.000đ**.' })
    const reads = r.results.filter(x => x.name === 'read_page').map(x => x.result?.pages?.[0])
    expect(reads[0]?.error).toBeUndefined()
    expect(JSON.stringify(reads[0])).toContain('52.000')
    expect(reads[1]?.error).toBe('page_unreadable'); expect(reads[1]?.reason).toBe('robots_disallowed')
    expect(r.fetched).not.toContain('https://caphemay.example/private/staff')
    const invented = await turn({ flag: '1', calls: [SEARCH, READ('https://caphemay.example/')], reply: 'Mình chọn **Cà phê Mây**. Bạc xỉu **99.000đ**.' })
    expect(invented.text).not.toContain('99.000đ')
  }, 60000)
  // Part B (Owner option a; was the C3 KNOWN GAP `it.fails`): the venue rows of the CODE's pre-search reach the stream slimmed (no website); the price guard now gets the venue sites from the
  // FULL rows (presearchPlaceSites), so a price read on the chosen venue's own site stays - as on a lean W1 turn. Only an input: the controls below are still cut.
  it('a price read on the chosen venue\'s own site stays in a pre-searched pick (as on a lean W1 turn)', async () => {
    const r = await turn({ flag: '1', calls: [SEARCH, READ('https://caphemay.example/')], reply: 'Mình chọn **Cà phê Mây**. Bạc xỉu **52.000đ**.' })
    expect(r.results.find(x => x.name === 'read_page')?.result?.pages?.[0]?.error).toBeUndefined() // the page really was read
    expect(r.text).toContain('52.000đ')
  }, 60000)
  it('control: the same page price said of ANOTHER venue (which has a site of its own, never read) is still cut', async () => {
    const r = await turn({ flag: '1', secondVenue: true, calls: [SEARCH, READ('https://caphemay.example/')], reply: 'Mình chọn **Trà Gió**. Bạc xỉu **52.000đ**.' })
    expect(r.results.find(x => x.name === 'read_page')?.result?.pages?.[0]?.error).toBeUndefined()
    expect(r.text).toContain('Trà Gió')                                    // the venue sentence is there; only its amount is judged
    expect(r.text).not.toContain('52.000đ')
  }, 60000)
  it('control: with two venues, the own-site price still stays for the right one', async () => {
    const r = await turn({ flag: '1', secondVenue: true, calls: [SEARCH, READ('https://caphemay.example/')], reply: 'Mình chọn **Cà phê Mây**. Bạc xỉu **52.000đ**.' })
    expect(r.text).toContain('52.000đ')
  }, 60000)
  it('control: an amount the page never states is still cut on the venue\'s own site', async () => {
    const r = await turn({ flag: '1', calls: [SEARCH, READ('https://caphemay.example/')], reply: 'Mình chọn **Cà phê Mây**. Bạc xỉu **61.000đ**.' })
    expect(r.text).not.toContain('61.000đ')
  }, 60000)
  it('flag OFF: no page is read, the same reply loses the amount (the price guard has no new input: the OFF turn is untouched)', async () => {
    const r = await turn({ calls: [SEARCH, READ('https://caphemay.example/')], reply: 'Mình chọn **Cà phê Mây**. Bạc xỉu **52.000đ**.' })
    expect(r.tools).toEqual([])
    expect(r.text).not.toContain('52.000đ')
  }, 60000)
  it('robots.txt that disallows the whole site: the page is not opened (fail closed on the same reader)', async () => {
    h.state.pages['https://caphemay.example/robots.txt'] = { body: 'User-agent: *\nDisallow: /\n', contentType: 'text/plain' }
    const r = await turn({ flag: '1', calls: [SEARCH, READ('https://caphemay.example/')] })
    const p = r.results.find(x => x.name === 'read_page')?.result?.pages?.[0]
    expect(p?.error).toBe('page_unreadable'); expect(p?.reason).toBe('robots_disallowed')
    expect(r.fetched).not.toContain('https://caphemay.example/')
  }, 60000)
  it('a redirect into a disallowed path is refused at the hop (robots on every hop): the target is never opened', async () => {
    const r = await turn({ flag: '1', calls: [SEARCH, READ('https://caphemay.example/go')] })
    const p = r.results.find(x => x.name === 'read_page')?.result?.pages?.[0]
    expect(r.fetched).toContain('https://caphemay.example/go')
    expect(r.fetched).not.toContain('https://caphemay.example/private/staff')
    expect(p?.error).toBe('page_unreadable'); expect(p?.reason).toBe('robots_disallowed')
  }, 60000)
  it('a link the user typed may be opened (user_url), as in lean', async () => {
    const msgs: Msg[] = [{ role: 'user', content: 'quán cà phê gần đây, xem giúp https://caphemay.example/' }]
    const r = await turn({ flag: '1', msgs, calls: [READ('https://caphemay.example/')] })
    expect(r.tools).toEqual(['calculate', 'read_page', 'web_search']) // the control really is a pre-searched pick with the tools
    expect(r.results.find(x => x.name === 'read_page')?.result?.pages?.[0]?.error).toBeUndefined()
  }, 60000)
})

describe('C3 — a lean turn that was not pre-searched (R1) is untouched', () => {
  it('a chat turn with a domain (no pre-search): ON = OFF', async () => {
    const msgs: Msg[] = [{ role: 'user', content: 'Giải thích giúp mình cách chọn hạt cà phê ngon' }]
    const off = await turn({ msgs, lunaTurn: 'chat', lunaDomains: ['food'] })
    const on = await turn({ msgs, lunaTurn: 'chat', lunaDomains: ['food'], flag: '1' })
    expect(off.maps).toBe(0) // the control really is not pre-searched
    expect(on).toEqual(off)
  }, 60000)
})

// Review (final) S1 · the recognition boundary of R2, held by tests: the tools go ONLY to a pre-searched Luna answer turn. Each case: the code still pre-searches, the
// flag is ON, and the turn is exactly the flag-OFF turn (no web_search / read_page / calculate, not the level's steps). Live control: a Luna pick turn gets the tools.
const FOLLOW: Msg[] = [{ role: 'user', content: 'quán cà phê gần đây' }, { role: 'assistant', content: 'Mình chọn **Cà phê Mây**: gần bạn, đánh giá 4.5.' }, { role: 'user', content: 'Cà phê Mây có chỗ ngồi ngoài trời không?' }]
const PRIOR_EVIDENCE = { placeSearch: { args: { query: 'cà phê', type: 'cafe' }, shown: ['Cà phê Mây'], at: '2026-10-27T03:00:00.000Z' } }
const EVIDENCE_ID = '0b4f6a2e-2b1c-4e8a-9d3f-5a6b7c8d9e0f'
describe('S1 — R2 only on a pre-searched Luna answer turn', () => {
  it('live control: a Luna pick turn the code pre-searched gets web_search, read_page, calculate and 6 steps at L2', async () => {
    const on = await turn({ flag: '1', level: '2' })
    expect(on.maps).toBeGreaterThan(0)
    expect(on.tools).toEqual(['calculate', 'read_page', 'web_search'])
    expect(on.maxSteps).toBe(6)
  }, 60000)
  it('`lunaAnswer`: Luna OFF (CONSULT_LUNA=0) - the code still pre-searches, the flag gives nothing: the turn is the flag-OFF turn', async () => {
    const on = await turn({ flag: '1', level: '2', env: { CONSULT_LUNA: '0' } })
    const off = await turn({ level: '2', env: { CONSULT_LUNA: '0', CONSULT_PICK_TURN_TOOLS: '0' } })
    expect(off.maps).toBeGreaterThan(0)                                   // the control really is pre-searched
    expect(off.maxSteps).toBe(2)                                          // ... on the pre-searched lean path (two steps)
    // (measured: with Luna off, L2 still offers the Wave 3 lean set - search_places + web_search + read_page + calculate - on BOTH sides; R2 would be exactly three tools and 6 steps)
    expect(on.tools).not.toEqual(['calculate', 'read_page', 'web_search'])
    expect(on.maxSteps).toBe(2)
    expect(on).toEqual(off)
  }, 60000)
  it('`!consultFollowReuse`: a follow-up that REUSES the stored place search (the code re-runs it) is not R2: the turn is the flag-OFF turn', async () => {
    const base = { msgs: FOLLOW, lunaTurn: 'followup', level: '2', evidence: PRIOR_EVIDENCE, evidenceId: EVIDENCE_ID }
    const on = await turn({ ...base, flag: '1', env: { CONSULT_FOLLOW_REUSE: '1' } })
    const off = await turn({ ...base, env: { CONSULT_FOLLOW_REUSE: '1', CONSULT_PICK_TURN_TOOLS: '0' } })
    expect(off.maps).toBeGreaterThan(0)                                   // the control really re-ran the stored search
    expect(off.maxSteps).toBe(2)                                          // ... on the follow-reuse path (two steps)
    expect(on.tools).not.toContain('read_page')
    expect(on).toEqual(off)
  }, 60000)
  // `!noToolTurn` in pickCandidate cannot change the outcome (review C3b, an EQUIVALENT mutant - VERIFIED by reading route.ts): a no-tool turn has `tools` undefined, and
  // willPresearch needs `!noToolTurn` (or `tools`), so a no-tool turn is NEVER pre-searched and pickTools (which needs presearchAll.length > 0) is false anyway.
  // The assertion `maps === 0` below states exactly that reason; if it ever goes red, `!noToolTurn` becomes a live guard and needs a test of its own.
  it('`!noToolTurn`: a follow-up WITHOUT a reusable search is a no-tool turn: never pre-searched, the flag gives nothing (the turn is the flag-OFF turn)', async () => {
    const base = { msgs: FOLLOW, lunaTurn: 'followup', level: '2' }
    const on = await turn({ ...base, flag: '1' })
    const off = await turn({ ...base, env: { CONSULT_PICK_TURN_TOOLS: '0' } })
    expect(on.maps).toBe(0)                                               // the reason C3b is equivalent: a no-tool turn is not pre-searched
    expect(on.tools).toEqual([])
    expect(on.maxSteps).not.toBe(6)
    expect(on).toEqual(off)
  }, 60000)
})
