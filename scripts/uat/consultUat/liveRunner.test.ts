// @vitest-environment node
// The benchmark runner for the 13 fixed turns. MOCK-ONLY: the "chat" is a fake transport that makes its paid calls through the spend gate
// exactly as the app does (reserveSpend), `fetch` is stubbed to throw, nothing reads a key, and results go to an in-memory writer.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { reserveSpend, currentSpendGate } from '@/lib/ai/budget/spendGate'
import { UAT_TURNS } from './questions'
import { memFs } from './liveRunner.testkit'
import {
  __resetBenchProcessGuardForTests, BENCH_FLAG_NAMES, BENCH_MUST_BE_OFF, BenchRefusal, assertBenchAllowed, createBenchRunner, resolveBenchOutDir, routeTransport, runBench,
  type BenchOptions, type ChatTransport,
} from './liveRunner'

const GOOD_ENV: Record<string, string> = {
  BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.65',
  CONSULT_LUNA: '1', TURN_WEB_TICKET: '1', SEARCH_FALLBACK_GATE: '1',
}
const CANARY = 'sk-test-secret-canary-0123456789'
function applyEnv(env: Record<string, string | undefined>) {
  for (const k of [...BENCH_FLAG_NAMES, 'OPENAI_API_KEY', 'SERPER_API_KEY']) delete process.env[k]
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v
}
const declare = (env: Record<string, string | undefined>): Record<string, string | null> => Object.fromEntries(BENCH_FLAG_NAMES.map(k => [k, env[k] ?? null]))

/** One fake turn: a model call and a Serper request through the gate, a ticket log line, a tool frame, an answer. */
function turnTransport(over: { llmMax?: number; llmActual?: unknown; serper?: boolean } = {}): { chat: ChatTransport; requests: Array<{ messages: Array<{ role: string; content: string }>; chatSessionId: string }> } {
  const requests: Array<{ messages: Array<{ role: string; content: string }>; chatSessionId: string }> = []
  const chat: ChatTransport = async req => {
    requests.push(JSON.parse(JSON.stringify(req)))
    expect(currentSpendGate(), 'the spend gate must be injected while the app runs').toBeDefined()
    const llm = reserveSpend('llm:consult', over.llmMax ?? 0.004)!
    llm.settle(over.llmActual === undefined ? 0.003 : over.llmActual)
    if (over.serper !== false) {
      const s = reserveSpend('serper:search', 0.001)!
      s.settle(0.001)
      console.log(JSON.stringify({ type: 'tappyai_web_ticket', step: 'settled', label: 'serper:search', state: 'sent_success', used: 1, limit: 1 }))
    }
    console.log(JSON.stringify({ type: 'unrelated_log', note: 'must not be captured' }))
    const last = req.messages[req.messages.length - 1].content
    return { raw: `0:${JSON.stringify(`Trả lời: ${last.slice(0, 20)}`)}\n9:{"toolCallId":"t1","toolName":"web_search","args":{"query":"x"}}\nd:{"finishReason":"stop"}\n` }
  }
  return { chat, requests }
}

// Round 2b: the output folder is required and on drive D, and the runner writes through an injectable file system (here in memory); `writes` collects
// the FINAL result file only (the per-turn JSONL and the writability probe are checked in liveRunner.guard.test.ts).
function options(over: Partial<BenchOptions> = {}, env: Record<string, string | undefined> = GOOD_ENV): { opts: BenchOptions; writes: Array<{ path: string; text: string }> } {
  const writes: Array<{ path: string; text: string }> = []
  const fs = memFs()
  const write = fs.write
  fs.write = (path, text) => { write(path, text); if (/\/bench-\d+\.json$/.test(path.replace(/\\/g, '/'))) writes.push({ path, text }) }
  return {
    writes,
    opts: {
      chat: turnTransport().chat, turnCapUsd: 0.05, runCapUsd: 0.65, confirmSpend: { capUsd: 0.65 }, declaredFlags: declare(env), env,
      outDir: 'D:/TappyAI-review-artifacts/tappy-bench-test', repoRoot: 'D:/TappyAI-wt/wt-integration',
      fs, now: () => 1_000, ...over,
    },
  }
}

beforeEach(() => { __resetBenchProcessGuardForTests() /* C-1: one runner per process - isolate the tests from each other */; applyEnv(GOOD_ENV); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REAL FETCH CALLED — tests must not reach the network') })) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); applyEnv({}) })

describe('11 · the runner refuses to run unless everything is explicit', () => {
  const refused = async (o: BenchOptions, transportCalls: () => number, why: RegExp) => {
    await expect(runBench(o)).rejects.toBeInstanceOf(BenchRefusal)
    await expect(runBench(o)).rejects.toThrow(why)
    expect(transportCalls()).toBe(0) // no turn, no call, no money
  }
  it('no spend confirmation (--confirm-spend with the cap)', async () => {
    const t = turnTransport(); const { opts } = options({ chat: t.chat, confirmSpend: null })
    await refused(opts, () => t.requests.length, /confirm/i)
  })
  it('a confirmation for another cap than the run cap', async () => {
    const t = turnTransport(); const { opts } = options({ chat: t.chat, confirmSpend: { capUsd: 5 } })
    await refused(opts, () => t.requests.length, /confirm/i)
  })
  it('the BENCH_SPEND_GATE flag is not ON', async () => {
    const env = { ...GOOD_ENV }; delete (env as Record<string, string | undefined>).BENCH_SPEND_GATE; applyEnv(env)
    const t = turnTransport(); const { opts } = options({ chat: t.chat }, env)
    await refused(opts, () => t.requests.length, /BENCH_SPEND_GATE/)
  })
  it('the caps in the environment are missing or differ from the ones asked for', async () => {
    for (const patch of [{ BENCH_SPEND_TURN_CAP_USD: undefined }, { BENCH_SPEND_RUN_CAP_USD: '5' }, { BENCH_SPEND_TURN_CAP_USD: '0.5' }]) {
      const env = { ...GOOD_ENV, ...patch }; applyEnv(env)
      const t = turnTransport(); const { opts } = options({ chat: t.chat }, env)
      await refused(opts, () => t.requests.length, /cap/i)
    }
  })
  it('the flag set is not listed explicitly (absent, a name missing, an extra name, or a value that differs from the environment)', async () => {
    const t = turnTransport()
    const base = declare(GOOD_ENV)
    const missing = { ...base }; delete missing[BENCH_FLAG_NAMES[0]]
    const cases: Array<Record<string, string | null> | null> = [null, missing, { ...base, SOME_OTHER_FLAG: '1' }, { ...base, CONSULT_LUNA: null }]
    for (const declaredFlags of cases) {
      const { opts } = options({ chat: t.chat, declaredFlags })
      await expect(runBench(opts)).rejects.toBeInstanceOf(BenchRefusal)
    }
    expect(t.requests.length).toBe(0)
  })
  it('a flag that must be OFF is ON (agent runtime, V4, V5, Responses API, Haiku fallback…)', async () => {
    expect(BENCH_MUST_BE_OFF).toEqual(expect.arrayContaining(['TAPPY_AGENT', 'TAPPY_ANSWER_V4', 'RETRIEVAL_V5', 'LLM_OPENAI_API']))
    for (const k of BENCH_MUST_BE_OFF) {
      const env = { ...GOOD_ENV, [k]: '1' }; applyEnv(env)
      const t = turnTransport(); const { opts } = options({ chat: t.chat }, env)
      await refused(opts, () => t.requests.length, new RegExp(k))
    }
  })
  it('the output folder is inside the repository, or inside the backups folder: refused (results go outside the repo)', async () => {
    for (const outDir of ['D:/TappyAI-wt/wt-integration/docs/bench', 'D:/TappyAI-wt/wt-integration', 'D:/Claude/TappyAI-backups/wave1/bench']) {
      const t = turnTransport(); const { opts } = options({ chat: t.chat, outDir })
      await refused(opts, () => t.requests.length, /out/i)
    }
  })
  it('a relative output path or one with ".." that leads into the repository is refused; the repository defaults to the working directory', async () => {
    const t = turnTransport()
    for (const outDir of ['D:/TappyAI-wt/wt-other/../wt-integration/docs/x', 'docs/bench-out', './out']) {
      const { opts } = options({ chat: t.chat, outDir, repoRoot: outDir.startsWith('D:') ? 'D:/TappyAI-wt/wt-integration' : undefined })
      await expect(runBench(opts), outDir).rejects.toBeInstanceOf(BenchRefusal)
    }
    expect(t.requests.length).toBe(0)
  })
  it('the flag set also covers what prices are read from (model ids, price per credit)', () => {
    expect(BENCH_FLAG_NAMES).toEqual(expect.arrayContaining(['SERPER_USD_PER_CREDIT', 'LLM_LUNA_MODEL', 'LLM_CONSULT_MODEL', 'LLM_INTENT_MODEL', 'LLM_PLAN_MODEL']))
  })
  it('the environment object that was checked is not the one the app reads (process.env): refused', async () => {
    const t = turnTransport()
    const other = { ...GOOD_ENV } // checked and declared as this...
    applyEnv({ ...GOOD_ENV, CONSULT_LUNA: undefined }) // ...while process.env says something else
    const { opts } = options({ chat: t.chat }, other)
    await expect(runBench(opts)).rejects.toThrow(/process\.env/)
    expect(t.requests.length).toBe(0)
  })
  it('assertBenchAllowed lists EVERY reason at once', () => {
    const { opts } = options({ confirmSpend: null, declaredFlags: null })
    try { assertBenchAllowed(opts); throw new Error('should have refused') } catch (e) {
      expect(e).toBeInstanceOf(BenchRefusal)
      expect((e as BenchRefusal).reasons.length).toBeGreaterThanOrEqual(2)
    }
  })
  // Round 2b: the temporary-folder default is gone (it put results on drive C). The folder must be given, and be on drive D.
  it('there is no default output folder: without outDir (or with one on drive C) the folder is refused; a folder on D is returned as given', () => {
    expect(() => resolveBenchOutDir({ repoRoot: 'D:/TappyAI-wt/wt-integration' })).toThrow(BenchRefusal)
    expect(() => resolveBenchOutDir({ outDir: 'C:/Users/Admin/AppData/Local/Temp/x', repoRoot: 'D:/TappyAI-wt/wt-integration' })).toThrow(BenchRefusal)
    expect(resolveBenchOutDir({ outDir: 'D:/TappyAI-review-artifacts/x/', repoRoot: 'D:/TappyAI-wt/wt-integration' })).toBe('D:/TappyAI-review-artifacts/x')
  })
})

describe('9 · the 13 fixed turns through runUat on a $0.65 run and $0.05 per turn', () => {
  it('runs all 13 in order; Q11.2 runs in the SAME conversation with the history of Q11.1', async () => {
    const t = turnTransport(); const { opts } = options({ chat: t.chat })
    const r = await runBench(opts)
    expect(t.requests).toHaveLength(13)
    expect(r.report.turns.map(x => x.id)).toEqual(UAT_TURNS.map(x => x.id))
    expect(r.report.cost).toMatchObject({ complete: true, costAccounted: true })
    expect(r.report.cost.totalUsd).toBeCloseTo(13 * 0.004, 10)
    const q111 = t.requests[UAT_TURNS.findIndex(x => x.id === 'Q11.1')]
    const q112 = t.requests[UAT_TURNS.findIndex(x => x.id === 'Q11.2')]
    expect(q111.messages).toEqual([{ role: 'user', content: UAT_TURNS.find(x => x.id === 'Q11.1')!.text }])
    expect(q112.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(q112.messages[0].content).toBe(UAT_TURNS.find(x => x.id === 'Q11.1')!.text)
    expect(q112.messages[2].content).toBe(UAT_TURNS.find(x => x.id === 'Q11.2')!.text)
    expect(q112.chatSessionId).toBe(q111.chatSessionId)
    const others = t.requests.filter((_, i) => ![10, 11].includes(i)).map(x => x.chatSessionId)
    expect(new Set([...others, q111.chatSessionId]).size).toBe(12) // one conversation per question, 12 in all
  })
  it('a model call whose worst case is almost the whole turn cap still fits once (it is settled before the next call asks); no turn books more than $0.05 and the run books no more than $0.65', async () => {
    const t = turnTransport({ llmMax: 0.0499 }); const { opts } = options({ chat: t.chat })
    const r = await runBench(opts)
    expect(r.valid).toBe(true)
    expect(r.records.every(x => (x.cost as { usd: number }).usd <= 0.05 + 1e-9)).toBe(true)
    expect(r.report.cost.totalUsd).toBeLessThanOrEqual(0.65 + 1e-9)
  })
})

describe('10 · what is recorded for every turn', () => {
  it('answer, time, tool names, the ticket log lines, the booked cost, and the number of model / Serper requests', async () => {
    const t = turnTransport(); const { opts, writes } = options({ chat: t.chat })
    let clock = 1_000
    opts.now = () => (clock += 50)
    const r = await runBench(opts)
    const first = r.records[0] as unknown as Record<string, unknown>
    expect(first).toMatchObject({
      id: 'Q1', toolNames: ['web_search'], llmRequests: 1, serperRequests: 1, refusals: 0, degraded: false,
      cost: { state: 'known', usd: expect.closeTo(0.004, 10) },
    })
    expect(String(first.answer)).toContain('Trả lời')
    expect(first.ms).toEqual(expect.any(Number))
    expect(first.ticketLog).toEqual([expect.objectContaining({ type: 'tappyai_web_ticket', state: 'sent_success' })]) // only ticket lines, none of the other logs
    expect(JSON.stringify(first)).not.toContain('unrelated_log')
    expect(writes).toHaveLength(1)
    expect(writes[0].path.replace(/\\/g, '/')).toMatch(/^D:\/TappyAI-review-artifacts\/tappy-bench-test\//)
    const saved = JSON.parse(writes[0].text)
    expect(saved.turns).toHaveLength(13)
    expect(saved.flags).toEqual(declare(GOOD_ENV)) // the whole flag set is part of the result
  })
  it('12 · no key ever reaches the result, however the environment looks', async () => {
    applyEnv({ ...GOOD_ENV, OPENAI_API_KEY: CANARY, SERPER_API_KEY: CANARY })
    const t = turnTransport(); const { opts, writes } = options({ chat: t.chat })
    const r = await runBench(opts)
    expect(JSON.stringify(r)).not.toContain(CANARY)
    for (const w of writes) expect(w.text).not.toContain(CANARY)
  })
  it('the console is restored after every turn, and only ticket lines are kept', async () => {
    const before = console.log
    const t = turnTransport(); const { opts } = options({ chat: t.chat })
    await runBench(opts)
    expect(console.log).toBe(before)
  })
})

describe('5 · a turn that costs more than reserved, whose cost is unknown or unusable, or that leaves something open, stops the run', () => {
  const stopsAt = async (chat: ChatTransport, n: number) => {
    const { opts } = options({ chat })
    const r = await runBench(opts)
    expect(r.report.stopped).not.toBeNull()
    expect(r.report.cost.totalUsd).toBeNull()
    expect(r.valid).toBe(false)
    expect(r.report.turns).toHaveLength(n)
    expect(r.report.notRun.length).toBe(13 - n)
  }
  it('a model call reports a cost above its reservation (cost-exceeded)', async () => {
    let n = 0
    await stopsAt(async req => { n++; return n === 3 ? turnTransport({ llmActual: 0.01 }).chat(req) : turnTransport().chat(req) }, 3)
  })
  it('a model call returns no usable cost (usage missing → invalid)', async () => {
    let n = 0
    await stopsAt(async req => { n++; return n === 2 ? turnTransport({ llmActual: Number.NaN }).chat(req) : turnTransport().chat(req) }, 2)
  })
  it('a paid call fails after it was sent (unknown): the turn is recorded as unknown and nothing runs after it', async () => {
    let n = 0
    await stopsAt(async req => { n++; if (n === 4) { reserveSpend('llm:consult', 0.004)!.markUnknown(); throw new Error('provider failed after send') } return turnTransport().chat(req) }, 4)
  })
  it('a reservation is still open when the turn ends (a request that is still running)', async () => {
    let n = 0
    await stopsAt(async req => { n++; if (n === 5) { reserveSpend('llm:consult', 0.004); return { raw: '0:"x"\nd:{}\n' } } return turnTransport().chat(req) }, 5)
  })
})

describe('6 · a call refused by the cap: recorded, the answer is flagged degraded, nothing is left open', () => {
  it('the turn cannot afford its model call → the transport sees a SpendRefusal; the run is not valid; the books stay clean', async () => {
    let n = 0
    const chat: ChatTransport = async req => {
      n++
      if (n === 2) { try { reserveSpend('llm:consult', 0.06) } catch (e) { expect((e as Error).name).toBe('SpendRefusal') } return { raw: '0:"Xin lỗi, chưa trả lời được."\nd:{}\n' } }
      return turnTransport().chat(req)
    }
    const { opts } = options({ chat })
    const r = await runBench(opts)
    expect(r.records[1]).toMatchObject({ refusals: 1, degraded: true })
    expect(r.valid).toBe(false)
    expect(r.report.cost.complete).toBe(true) // the books are fine; the benchmark answer is what is invalid
    expect((r.records[1].cost as { usd: number }).usd).toBe(0)
  })
})

describe('4 · work the app leaves running after its answer cannot spend outside the books', () => {
  it('a paid call started after the turn ended is refused and recorded as late (not as a degraded answer); nothing is left open', async () => {
    let lateOutcome: string | null = null
    const chat: ChatTransport = async req => {
      const ok = await turnTransport().chat(req)
      setTimeout(() => { try { reserveSpend('llm:fast', 0.004); lateOutcome = 'reserved' } catch (e) { lateOutcome = (e as Error).name } }, 0) // e.g. memory extraction after the stream
      return ok
    }
    const { opts } = options({ chat })
    const r = await runBench(opts)
    await new Promise(res => setTimeout(res, 5))
    expect(lateOutcome).toBe('SpendRefusal')
    expect(r.records[0]).toMatchObject({ lateRefusals: 1, refusals: 0, degraded: false, openReservedUsd: 0 })
    expect(r.valid).toBe(true)
  })
})

describe('13 · transport: the in-process route call', () => {
  it('routeTransport builds the request the way the replay harness does and reads the WHOLE stream', async () => {
    let seen: { headers: Headers; body: unknown; nextUrl: URL } | null = null
    const post = async (req: { headers: Headers; json: () => Promise<unknown>; nextUrl: URL }) => {
      seen = { headers: req.headers, body: await req.json(), nextUrl: req.nextUrl }
      return new Response('0:"a"\n0:"b"\nd:{"finishReason":"stop"}\n', { status: 200 })
    }
    const out = await routeTransport(post as never)({ messages: [{ role: 'user', content: 'xin chào' }], chatSessionId: 'conv-1' })
    expect(out.raw).toBe('0:"a"\n0:"b"\nd:{"finishReason":"stop"}\n')
    expect(out.status).toBe(200)
    expect(seen!.body).toMatchObject({ messages: [{ role: 'user', content: 'xin chào' }], chatSessionId: 'conv-1' })
    expect(seen!.headers.get('content-type')).toBe('application/json')
    expect(seen!.headers.get('cookie')).toBeNull() // no session is invented here
  })
  it('createBenchRunner alone: the transport is called inside the spend gate and the gate is gone afterwards', async () => {
    const t = turnTransport(); const { opts } = options({ chat: t.chat })
    const { runner, records } = createBenchRunner(opts)
    const res = await runner({ turn: UAT_TURNS[0], history: [] })
    expect(res.usd).toBeCloseTo(0.004, 10)
    expect(records).toHaveLength(1)
    expect(currentSpendGate()).toBeUndefined()
  })
})
