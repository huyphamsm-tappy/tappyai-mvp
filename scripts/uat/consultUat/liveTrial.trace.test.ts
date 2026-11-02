// @vitest-environment node
// Wave 2 · P1.2 · WHICH TURN made each outgoing request, and WHAT each tool call did. The baseline analysis could not say which turn reached html.duckduckgo.com, nor what a web_search
// returned (the log has no turn id and no tool result). Now the result file carries:
//   · requestLog   every request that was SENT (host + path only: never a query, a URL or a body), with the turn id and, when a tool made it, the tool call id
//   · blockedLog   every request that was BLOCKED before it was sent, with the turn id (host or host+path only)
//   · toolCalls    one record per tool call: turn, tool, ms, ok, rows returned, provider really used (serper | duckduckgo | none | other), the "empty" flag, the Serper paths and the
//                  DuckDuckGo count of that call; the query text (cut at 200 characters, redacted) ONLY in the extension mode - the acceptance mode keeps counts only. Never the content of a result.
// It rides on a seam that does nothing unless the bench sets an observer (src/lib/ai/tools/toolTrace.ts), so the product behaves exactly as before.
// REAL chat route + REAL AI layer + REAL runLiveTrial; only the network is fake. MOCK ONLY: no key, no real host, no model.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap, createRequestCapTurn, wrapToolsWithRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { currentToolCall, setToolTraceObserver, traceToolCall } from '@/lib/ai/tools/toolTrace'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { memFs } from './liveRunner.testkit'
import { formatSummary, runLiveTrial, type TrialSummary } from './liveTrial'
import type { UatTurn } from './questions'

const h = vi.hoisted(() => {
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      update: () => b, delete: () => b, then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: '00000000-0000-4000-8000-0000000c0b01' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))

// ── the fake network: OpenAI scripted to call web_search once, Serper with or without rows, DuckDuckGo with or without a parsable result ──
type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number }
const usage = (p: number, c: number): Usage => ({ prompt_tokens: p, completion_tokens: c, total_tokens: p + c })
const INTENT = JSON.stringify({ domains: [], turn: 'chat', goal: 'tra cứu thông tin', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const jsonCompletion = (content: string, u: Usage) => new Response(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: u }), { status: 200, headers: { 'content-type': 'application/json' } })
const sse = (chunks: Array<Record<string, unknown>>) => new Response(chunks.map(c => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-6-luna', ...c })}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
const toolStream = (name: string, args: object, inc: boolean) => sse([
  { choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name, arguments: '' } }] }, finish_reason: null }] },
  { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] }, finish_reason: null }] },
  { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }, ...(inc ? [{ choices: [], usage: usage(500, 50) }] : []),
])
const textStream = (text: string, inc: boolean) => sse([{ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }, ...(inc ? [{ choices: [], usage: usage(1500, 80) }] : [])])
const net = { query: 'tra cuu thong tin thu nghiem', serperRows: true, ddgRows: true, ddgReached: 0 }
const fakeNetwork = (async (input: unknown, init?: { body?: unknown }) => {
  const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
  if (u.hostname === 'api.openai.com') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const inc = body.stream_options?.include_usage === true
    // the memory-extraction call (its prompt names `location_base`) is answered with an empty object; any other JSON request is the intent call
    if (body.response_format) return jsonCompletion(JSON.stringify(body).includes('location_base') ? '{}' : INTENT, usage(1000, 100))
    // any other call that does not stream (the memory extraction, a non-streamed helper) gets an empty JSON object; only the answer stream gets text
    if (body.stream !== true) return jsonCompletion('{}', usage(300, 10))
    const msgs: Array<{ role: string }> = body.messages ?? []
    const tools: string[] = (body.tools ?? []).map((t: { function?: { name: string } }) => t.function?.name)
    if (tools.includes('web_search') && !msgs.some(m => m.role === 'tool')) return toolStream('web_search', { query: net.query }, inc)
    return textStream('Câu trả lời kiểm thử có nguồn.', inc)
  }
  if (u.hostname === 'google.serper.dev') return new Response(JSON.stringify({ organic: net.serperRows ? [{ title: 'TIEU-DE-KHONG-GHI-RA', link: 'https://example.com/a', snippet: 'DOAN-TRICH-KHONG-GHI-RA' }] : [], credits: 1 }), { status: 200 })
  if (u.hostname === 'html.duckduckgo.com') {
    net.ddgReached++
    return new Response(net.ddgRows ? '<a class="result__a" href="https://example.com/b">TIEU-DE-DDG-KHONG-GHI</a> x <a class="result__snippet">DOAN-DDG-KHONG-GHI</a>' : '<html></html>', { status: 200 })
  }
  throw new Error('UNEXPECTED host: ' + u.hostname)
}) as typeof fetch

let POST: (req: never) => Promise<Response>
beforeAll(async () => { ;({ POST } = await import('@/app/api/chat/route') as unknown as { POST: typeof POST }) }, 120_000)
const EXT: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0', BENCH_RESET_FREE_QUOTA_PER_TURN: '1',
  BENCH_TRIAL_QUESTION_FILE: 'D:/fake/q.txt', BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave2/mock-out',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
const ACC: Record<string, string> = { ...EXT, BENCH_TRIAL_MODE: '', BENCH_SPEND_RUN_CAP_USD: '0.65', BENCH_CONFIRM_SPEND: '0.65', BENCH_RESET_FREE_QUOTA_PER_TURN: '0' }
beforeEach(() => {
  __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap()
  net.query = 'tra cuu thong tin thu nghiem'; net.serperRows = true; net.ddgRows = true; net.ddgReached = 0
  for (const k of [...BENCH_FLAG_NAMES, 'BENCH_RESET_FREE_QUOTA_PER_TURN', 'BENCH_CONFIRM_SPEND', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR', 'OPENAI_API_KEY', 'SERPER_API_KEY', 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_TRIAL_MODE', 'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(k, undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); setToolTraceObserver(null); __resetBenchProcessGuardForTests() })

const TURNS: UatTurn[] = [{ id: 'T1', conversation: 'T1', turn: 1, text: 'Cau hoi tong quat rieng cho kiem thu vet luot so mot.' }]
interface Run { summary: TrialSummary; file: any; text: string; raw: string; logs: string[] }
async function run(env: Record<string, string | undefined>, turns: UatTurn[] = TURNS): Promise<Run> {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v === '' ? undefined : v)
  const logs: string[] = []
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')].map(s => s.mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ').slice(0, 300)) }))
  const fs = memFs()
  let out
  try { out = await runLiveTrial({ env: process.env, post: POST as never, fetchImpl: fakeNetwork, fs, repoRoot: process.cwd(), now: () => 1_000, turns, afterTrial: 'restore' } as never) } finally { spies.forEach(s => s.mockRestore()) }
  if (out.kind !== 'ran') throw new Error('refused: ' + JSON.stringify(out.reasons))
  const f = [...fs.files.entries()].find(([p]) => /bench-\d+\.json$/.test(p))
  return { summary: out.summary, file: f ? JSON.parse(f[1]) : null, text: formatSummary(out.summary), raw: f ? f[1] : '', logs }
}

describe('the seam does nothing without an observer (the product behaves as before)', () => {
  it('traceToolCall returns exactly what the tool returns (same promise, same value, same error) when no observer is set', async () => {
    const p = Promise.resolve({ ok: 1 })
    expect(traceToolCall('web_search', { query: 'x' }, () => p)).toBe(p)
    expect(traceToolCall('t', {}, () => 7)).toBe(7)
    expect(() => traceToolCall('t', {}, () => { throw new Error('boom') })).toThrow('boom')
    expect(currentToolCall()).toBeUndefined()
  })
  it('wrapToolsWithRequestCap still hands back the tool\'s own promise when no observer is set', async () => {
    const turn = createRequestCapTurn()!
    const p = Promise.resolve({ results: [] })
    const tools = { web_search: { execute: () => p } }
    wrapToolsWithRequestCap(tools, turn)
    expect(tools.web_search.execute()).toBe(p)
  })
  it('with an observer: it sees the tool name, its arguments, its result, and a call id that the code inside the call can read; an observer that throws changes nothing', async () => {
    const seen: Array<{ tool: string; call: number; args: unknown; result: unknown; threw: boolean; inside: number | undefined }> = []
    setToolTraceObserver(e => { seen.push({ ...e, inside: undefined }); throw new Error('an observer must never break the turn') })
    const turn = createRequestCapTurn()!
    let inside: number | undefined
    const tools = { web_search: { execute: async (a: { query: string }) => { inside = currentToolCall()?.call; return { source: 'Google (Serper)', results: [a.query] } } } }
    wrapToolsWithRequestCap(tools, turn)
    const r = await tools.web_search.execute({ query: 'q' })
    expect(r).toEqual({ source: 'Google (Serper)', results: ['q'] })
    expect(seen).toHaveLength(1); expect(seen[0]).toMatchObject({ tool: 'web_search', args: { query: 'q' }, threw: false }); expect(inside).toBe(seen[0].call)
  })
})

describe('through the real route and the real runLiveTrial', () => {
  it('extension mode, Serper has rows: one web_search record (provider serper, rows, not empty, its Serper path), every request tagged with the turn id, the query is kept (cut, redacted)', async () => {
    const r = await run(EXT)
    const calls = r.file.toolCalls as any[]
    const ws = calls.filter(c => c.tool === 'web_search')
    expect(ws).toHaveLength(1)
    expect(ws[0]).toMatchObject({ turn: 'T1', tool: 'web_search', ok: true, provider: 'serper', empty: false, serperPaths: ['/search'], ddg: 0, query: net.query })
    expect(ws[0].rows).toBeGreaterThanOrEqual(1)
    const log = r.file.requestLog as any[]
    expect(log.every(x => x.turn === 'T1')).toBe(true)
    expect(log.filter(x => x.host === 'api.openai.com').every(x => x.call === null)).toBe(true) // the model's own calls are not a tool call
    const serper = log.filter(x => x.host === 'google.serper.dev'); expect(serper).toHaveLength(1)
    expect(serper[0]).toMatchObject({ path: '/search', call: ws[0].call })
    expect(r.file.blockedLog).toEqual([])
    // never the content of a result, never a URL or a query string in the log
    for (const t of [r.raw, r.text]) expect(t).not.toMatch(/TIEU-DE-KHONG-GHI-RA|DOAN-TRICH-KHONG-GHI-RA|example\.com\/a/)
    for (const x of log) expect(JSON.stringify(x)).not.toMatch(/\?|q=|query/)
    expect(r.text).toMatch(/tool calls recorded: 1 \(empty: 0\)/)
  })
  it('extension mode, Serper empty, DuckDuckGo gives a row: provider duckduckgo, the DuckDuckGo request is logged with the turn id and the tool call id and counted once', async () => {
    net.serperRows = false
    const r = await run(EXT)
    const ws = (r.file.toolCalls as any[]).find(c => c.tool === 'web_search')
    expect(ws).toMatchObject({ turn: 'T1', provider: 'duckduckgo', rows: 1, empty: false, serperPaths: ['/search'], ddg: 1 })
    const ddg = (r.file.requestLog as any[]).filter(x => x.host === 'html.duckduckgo.com'); expect(ddg).toEqual([expect.objectContaining({ turn: 'T1', path: '/html/', call: ws.call })])
    expect(r.summary.ddgRequests).toEqual({ 'html.duckduckgo.com': 1 }); expect(r.summary.hostsBlocked).toEqual([])
    expect(r.raw).not.toMatch(/TIEU-DE-DDG-KHONG-GHI|DOAN-DDG-KHONG-GHI|example\.com\/b/)
  })
  it('extension mode, Serper empty and DuckDuckGo gives nothing parsable: provider none, empty true', async () => {
    net.serperRows = false; net.ddgRows = false
    const ws = ((await run(EXT)).file.toolCalls as any[]).find(c => c.tool === 'web_search')
    expect(ws).toMatchObject({ provider: 'none', rows: 0, empty: true, ddg: 1 })
  })
  it('acceptance mode, Serper empty: DuckDuckGo is BLOCKED and the block carries the turn id; the record is counts only - no query text anywhere in the file', async () => {
    net.serperRows = false
    const r = await run(ACC)
    const ws = (r.file.toolCalls as any[]).find(c => c.tool === 'web_search')
    expect(ws).toMatchObject({ turn: 'T1', provider: 'none', empty: true, ddg: 0 }); expect('query' in ws).toBe(false)
    expect(r.file.blockedLog).toEqual([expect.objectContaining({ turn: 'T1', label: 'html.duckduckgo.com' })])
    expect(net.ddgReached).toBe(0)
    // the NEW logs hold counts only in the acceptance mode (the older ledger field `serperCalls[].q` is not part of this change)
    expect(JSON.stringify([r.file.requestLog, r.file.blockedLog, r.file.toolCalls])).not.toContain(net.query)
    expect(r.text).toMatch(/blocked by turn: T1: html\.duckduckgo\.com/)
  })
  it('the query is cut at 200 characters and redacted (extension mode only)', async () => {
    net.query = 'tim hieu ' + 'x'.repeat(260) + ' sk-abcdef123456'
    const ws = ((await run(EXT)).file.toolCalls as any[]).find(c => c.tool === 'web_search')
    expect(ws.query.length).toBeLessThanOrEqual(200); expect(ws.query.startsWith('tim hieu x')).toBe(true)
    __resetBenchProcessGuardForTests(); __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap() // a second run in the same test needs a new process guard
    net.query = 'tra cuu sk-abcdef123456 thu nghiem'
    const ws2 = ((await run(EXT)).file.toolCalls as any[]).find(c => c.tool === 'web_search')
    expect(ws2.query).toBe('tra cuu sk-*** thu nghiem')
  })
  it('two turns: each record and each request carries its own turn id', async () => {
    const two: UatTurn[] = [...TURNS, { id: 'T2', conversation: 'T2', turn: 1, text: 'Cau hoi tong quat khac cho kiem thu vet luot so hai.' }]
    const r = await run(EXT, two)
    expect(r.summary.stopped, JSON.stringify(r.file.openReservations) + JSON.stringify(r.file.turns[0].llmCalls)).toBeNull()
    const ids = (r.file.toolCalls as any[]).filter(c => c.tool === 'web_search').map(c => c.turn)
    expect(ids).toEqual(['T1', 'T2'])
    const byTurn = new Set((r.file.requestLog as any[]).map(x => x.turn)); expect([...byTurn].sort()).toEqual(['T1', 'T2'])
  })
})
