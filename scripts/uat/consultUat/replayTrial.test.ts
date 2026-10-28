// @vitest-environment node
// Wave 6 · the paid entry of the writing-step replay (replayTrial.ts), MOCK ONLY: a fake network, a fake key, no real host. What these tests pin (Owner decision A, 28/10):
//   (1) every call goes through the metered model and the spend gate: a call whose WORST case does not fit the cap is not sent, the run cap stops the run, an unknown cost or a failure after sending stops the run;
//   (2) the reasoning effort is priced safely: the output cap SENT is the cap PRICED (never above 4 000, reasoning included), also when the captured body had none or a larger one;
//   (3) the only request is POST https://api.openai.com/v1/chat/completions: no Serper, no other host / path / method, no node:http(s), nothing once the run is closed;
//   (4) every check of a normal run still applies (the same preflight), and the replay conditions refuse a wrong variant / capture / cap / model / part / missing evidence BEFORE anything is read further or sent;
//   (5) the replay lines of Gate 1 name the capture (name + SHA-256), the variant, the model, the effort, the number of calls and the caps - and an unconfirmed Gate 1 sends nothing.
// The prompts here are written for this test; nothing comes from the acceptance set or the extension set.
import { createHash } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BENCH_FLAG_NAMES, __resetBenchProcessGuardForTests } from './liveRunner'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'
import { conditionReport, formatConditionReport } from './preflightReport'
import { REPLAY_MAX_RUN_CAP_USD, REPLAY_MAX_TURN_CAP_USD, REPLAY_PRICED_MODEL, formatReplaySummary, isReplayRequested, replayCheck, runReplayTrial, unboundedPartReason, type ReplayOutcome } from './replayTrial'
import { REPLAY_MAX_RUN_CAP_USD as LAUNCHER_RUN_CAP, REPLAY_MAX_TURN_CAP_USD as LAUNCHER_TURN_CAP, REPLAY_VARIANT_TABLE, TRIAL_ENV_NAMES, buildChildEnv, gate1Line, gate1Summary, launcherRefusals, replayLines, runFlow } from './liveTrialLauncher.mjs'
import { EVIDENCE_HEADER, VARIANTS, pickWriterCalls } from './writerReplay'
import type { CapturedCall, WriterCaptureFile } from './writerCapture'

const KEY = 'sk-test-not-a-real-key-replay'
const CAP_PATH = 'D:/TappyAI-review-artifacts/consultative-wave3/probe2/run-W6-CAP/capture-1793161679656.json'
const QUESTIONS_PATH = 'D:/fake/q.txt'
const OUT_DIR = 'D:/TappyAI-review-artifacts/consultative-wave3/mock-out'
const EVIDENCE_DIR = 'D:/TappyAI-review-artifacts/consultative-wave3/probe2/w6-exa'
const TOOLS = [{ type: 'function', function: { name: 'web_search' } }]
const sys = (t: string) => ({ role: 'system', content: t })
const user = (t: string) => ({ role: 'user', content: t })
const call = (turn: string, n: number, body: Record<string, unknown>, r: Partial<NonNullable<CapturedCall['response']>>): CapturedCall => ({ turn, n, body, response: { status: 200, textChars: 0, toolCalls: 0, finishReason: 'stop', usage: null, ...r } })
const writerBody = (turn: string, extra: Record<string, unknown> = {}) => ({ model: 'gpt-6-luna', stream: true, stream_options: { include_usage: true }, reasoning_effort: 'none', max_completion_tokens: 3500, tools: TOOLS, messages: [sys(`he thong ${turn} ${'x'.repeat(3000)}`), user(`hoi ${turn}`), { role: 'tool', content: 'ket qua ' + 'y'.repeat(800) }], ...extra })
const CAPTURE: WriterCaptureFile = {
  kind: 'tappy-writer-capture', version: 1, stamp: 1793161679656, truncated: false,
  calls: [
    call('T1', 1, { response_format: { type: 'json_schema' }, messages: [sys('y'), user('q')] }, { textChars: 50 }),
    call('T1', 2, writerBody('T1'), { textChars: 900 }),
    call('T2', 1, { response_format: {}, messages: [sys('y')] }, { textChars: 40 }),
    call('T2', 2, writerBody('T2'), { toolCalls: 1, finishReason: 'tool_calls' }),
    call('T2', 3, writerBody('T2', { tools: undefined }), { textChars: 700 }),
    call('T3', 1, writerBody('T3'), { textChars: 500 }),
    call('T4', 1, writerBody('T4'), { status: 500 }), // no text: not replayed
  ],
}
const toBytes = (c: unknown) => new TextEncoder().encode(JSON.stringify(c))

const EXT: Record<string, string> = {
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '0.30', BENCH_CONFIRM_SPEND: '0.30',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450',
  CONSULTATIVE_V1: '0', CONSULT_V2: '0', BENCH_EXPECT_CONSULTATIVE_V1: '0', BENCH_EXPECT_CONSULT_V2: '0',
  BENCH_TRIAL_QUESTION_FILE: QUESTIONS_PATH, BENCH_TRIAL_OUT_DIR: OUT_DIR, OPENAI_API_KEY: KEY, SERPER_API_KEY: 'serper-test-not-a-real-key',
  BENCH_REPLAY_CAPTURE: CAP_PATH, BENCH_REPLAY_VARIANT: 'V0',
}
const ALL_NAMES = [...BENCH_FLAG_NAMES, ...Object.keys(EXT), 'BENCH_LIVE_TRIAL', 'CI', 'BENCH_REPLAY_EVIDENCE_DIR', 'VERCEL_ENV', 'C2_REQUEST_BUDGET']
const setEnv = (over: Record<string, string | undefined> = {}) => { for (const [k, v] of Object.entries({ ...EXT, ...over })) vi.stubEnv(k, v) }

const net = { requests: [] as Array<{ url: string; method: string; headers: Record<string, string>; body: any; redirect: unknown }>, handler: null as null | ((body: any, n: number) => Response | Promise<Response>) }
const okCompletion = (text = 'Tra loi viet lai.', u: Record<string, unknown> | null = { prompt_tokens: 2000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 100 } }, finish = 'stop') =>
  new Response(JSON.stringify({ id: 'c', object: 'chat.completion', model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: finish }], ...(u ? { usage: u } : {}) }), { status: 200, headers: { 'content-type': 'application/json' } })
const fakeNet = (async (input: unknown, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
  let body: any = null; try { body = JSON.parse(String(init?.body ?? 'null')) } catch { body = null }
  net.requests.push({ url, method: String(init?.method ?? 'GET'), headers: (init?.headers ?? {}) as Record<string, string>, body, redirect: init?.redirect })
  return net.handler ? net.handler(body, net.requests.length) : okCompletion(`Tra loi cho ${(body?.messages?.[1]?.content ?? '').toString().slice(0, 12)}`)
}) as typeof fetch

let files: Record<string, string | Uint8Array> = {}
let written: Record<string, string> = {}
const deps = () => ({
  readBytes: (p: string) => { const f = files[p]; if (f === undefined) throw new Error('ENOENT'); return typeof f === 'string' ? new TextEncoder().encode(f) : f },
  readText: (p: string) => { const f = files[p]; if (f === undefined) throw new Error('ENOENT'); return typeof f === 'string' ? f : new TextDecoder().decode(f) },
  writeText: (p: string, t: string) => { written[p] = t },
})
const run = (over: Record<string, unknown> = {}): Promise<ReplayOutcome> => runReplayTrial({ env: process.env, fetchImpl: fakeNet, repoRoot: 'D:/TappyAI-wt/wt-integration', execArgv: [], now: () => 1793200000000, ...deps(), ...over })
const ran = (o: ReplayOutcome) => { if (o.kind !== 'ran') throw new Error('refused: ' + o.reasons.join(' | ')); return o.summary }
const POSTED = () => net.requests.filter(r => r.method === 'POST')
const originals = { fetch: globalThis.fetch, hr: https.request, hg: https.get, hhr: http.request, hhg: http.get }

beforeEach(() => {
  __resetBenchProcessGuardForTests(); __resetRequestCap()
  for (const k of ALL_NAMES) vi.stubEnv(k, undefined)
  net.requests = []; net.handler = null
  files = { [CAP_PATH]: toBytes(CAPTURE), [QUESTIONS_PATH]: 'T1|c1|1|hoi mot\n' }; written = {}
})
afterEach(() => {
  vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetBenchProcessGuardForTests()
  globalThis.fetch = originals.fetch; https.request = originals.hr; https.get = originals.hg; http.request = originals.hhr; http.get = originals.hhg
})

describe('W6 replay run · a V0 run with the whole safety path', () => {
  it('one call per replayable turn, in order; the body is the captured one, not streamed, tools kept with tool_choice "none"; the key is a header only; the result file has what make-blind-pairs reads', async () => {
    setEnv()
    const s = ran(await run())
    expect(s).toMatchObject({ turnOk: true, trialClean: true, variant: 'V0', model: 'gpt-6-luna', turnsInCapture: 4, replayed: 3, notReplayed: 1, answered: 3, llmRequests: 3, refusals: 0, hostsBlocked: [], lateBlocked: [] })
    expect(POSTED().map(r => r.url)).toEqual(Array(3).fill('https://api.openai.com/v1/chat/completions'))
    expect(POSTED().map(r => r.body.messages[1].content)).toEqual(['hoi T1', 'hoi T2', 'hoi T3'])
    const b = POSTED()[0]!.body
    expect('stream' in b).toBe(false); expect('stream_options' in b).toBe(false); expect(b.tool_choice).toBe('none'); expect(b.tools).toEqual(TOOLS)
    expect(b.model).toBe('gpt-6-luna'); expect(b.reasoning_effort).toBe('none'); expect(b.messages).toEqual((CAPTURE.calls[1]!.body as { messages: unknown[] }).messages)
    expect(b.max_completion_tokens).toBe(3500); expect('max_tokens' in b).toBe(false)
    expect(POSTED().every(r => typeof r.headers.authorization === 'string' && r.headers.authorization === `Bearer ${KEY}`)).toBe(true)
    expect(POSTED().every(r => r.redirect === 'manual')).toBe(true) // a redirect is never followed
    // the cost is the price table's: 2000 uncached input at the cache-write rate 0.125/M + 500 output at 0.50/M, per call
    expect(s.usd).toBeCloseTo(3 * ((2000 * 0.125 + 500 * 0.5) / 1e6), 9)
    const path = s.resultPath!; expect(path.startsWith(`${OUT_DIR}/bench-1793200000000.json`)).toBe(true)
    const file = JSON.parse(written[path]!)
    expect(file.kind).toBe('tappy-writer-replay'); expect(file.variant).toBe('V0')
    expect(file.turns.map((t: { id: string; answer: string }) => [t.id, t.answer.length > 0])).toEqual([['T1', true], ['T2', true], ['T3', true], ['T4', false]])
    expect(file.turns[3].replayError).toContain('not replayed'); expect(file.summary).toMatchObject({ turns: 4, answered: 3, notReplayed: 1 })
    expect(file.captureSha256).toBe(createHash('sha256').update(toBytes(CAPTURE)).digest('hex')); expect(file.questionFile.sha256).toBe(createHash('sha256').update('T1|c1|1|hoi mot\n').digest('hex'))
    // no key anywhere in what is written or printed
    expect(written[path]).not.toContain(KEY); expect(formatReplaySummary(s)).not.toContain(KEY)
    const text = formatReplaySummary(s)
    expect(text).toMatch(/turnOk=true trialClean=true/); expect(text).not.toMatch(/NOT CLEAN/)
  })
  it('V1 adds the note to the first system message; X0 / X1 add the evidence block as the last message and report its characters; the model and the captured effort are kept', async () => {
    setEnv({ BENCH_REPLAY_VARIANT: 'V1' })
    ran(await run())
    expect(String(POSTED()[0]!.body.messages[0].content)).toContain('HUONG DAN VIET BO SUNG')
    net.requests = []; vi.unstubAllEnvs(); for (const k of ALL_NAMES) vi.stubEnv(k, undefined)
    // (T3's file starts with a byte-order mark, as a Windows editor may write it)
    for (const t of ['T1', 'T2', 'T3']) files[`${EVIDENCE_DIR}/evidence-${t}.json`] = (t === 'T3' ? String.fromCharCode(0xfeff) : '') + JSON.stringify({ results: [{ url: `https://e.example/${t}`, title: 'Tieu de', highlights: [`bang chung cho ${t}`] }] })
    setEnv({ BENCH_REPLAY_VARIANT: 'X0', BENCH_REPLAY_EVIDENCE_DIR: EVIDENCE_DIR })
    const s = ran(await run())
    for (const r of POSTED()) {
      const last = r.body.messages[r.body.messages.length - 1]
      expect(last.role).toBe('system'); expect(last.content.startsWith(EVIDENCE_HEADER)).toBe(true); expect(r.body.reasoning_effort).toBe('none'); expect(r.body.tool_choice).toBe(r.body.tools ? 'none' : undefined)
    }
    expect(POSTED().map(r => r.body.messages.length)).toEqual([4, 4, 4])
    expect(s.evidenceChars).toBeGreaterThan(300)
  })
})

describe('W6 replay run · V2 / V3 and the pricing of the reasoning', () => {
  const CAPPED: WriterCaptureFile = { ...CAPTURE, calls: [
    call('T1', 1, writerBody('T1', { max_completion_tokens: 3500 }), { textChars: 100 }),
    call('T2', 1, writerBody('T2', { max_completion_tokens: 90000 }), { textChars: 100 }),
    call('T3', 1, writerBody('T3', { max_completion_tokens: undefined, max_tokens: 2000 }), { textChars: 100 }),
    call('T4', 1, writerBody('T4', { max_completion_tokens: undefined }), { textChars: 100 }),
  ] }
  it('V0: the cap sent is the cap priced - the captured one when it is below the meter\'s ceiling (3 500; a legacy max_tokens 2 000 moves to max_completion_tokens), 4 000 when it is larger or absent', async () => {
    files[CAP_PATH] = toBytes(CAPPED)
    setEnv({ BENCH_REPLAY_VARIANT: 'V0' })
    expect(ran(await run()).trialClean).toBe(true)
    expect(POSTED().map(r => r.body.max_completion_tokens)).toEqual([3500, 4000, 2000, 4000])
    expect(POSTED().every(r => !('max_tokens' in r.body))).toBe(true)
  })
  it('V2: effort medium, NO tools, the model and the history unchanged; the output cap is the meter\'s 4 000 for every turn (reasoning is inside it), also priced at 4 000', async () => {
    files[CAP_PATH] = toBytes(CAPPED)
    setEnv({ BENCH_REPLAY_VARIANT: 'V2' })
    const s = ran(await run())
    expect(s.trialClean).toBe(true)
    for (const r of POSTED()) {
      expect(r.body.reasoning_effort).toBe('medium'); expect(r.body.model).toBe('gpt-6-luna'); expect('tools' in r.body).toBe(false); expect('tool_choice' in r.body).toBe(false)
      expect('max_tokens' in r.body).toBe(false)
    }
    expect(POSTED().map(r => r.body.max_completion_tokens)).toEqual([4000, 4000, 4000, 4000])
  })
  it('the worst case of a call is priced at the cap SENT: a per-turn cap below it sends NOTHING (reasoning at medium cannot slip past the gate)', async () => {
    // worst case of one call here = input bytes (~4 000) x 0.125/M + 4 000 output x 0.5/M = about 0.0025 USD; a 0.001 cap cannot hold it
    files[CAP_PATH] = toBytes({ ...CAPTURE, calls: [call('T1', 1, writerBody('T1', { max_completion_tokens: 90000 }), { textChars: 100 })] })
    setEnv({ BENCH_REPLAY_VARIANT: 'V2', BENCH_SPEND_TURN_CAP_USD: '0.001' })
    const s = ran(await run())
    expect(POSTED()).toHaveLength(0)
    expect(s).toMatchObject({ turnOk: false, trialClean: false, llmRequests: 0, answered: 0 })
    expect(s.problems.join(' | ')).toMatch(/T1/)
  })
  it('the run cap stops the run: with a cap that holds two turns, the third is not sent', async () => {
    setEnv({ BENCH_SPEND_TURN_CAP_USD: '0.01', BENCH_SPEND_RUN_CAP_USD: '0.0105', BENCH_CONFIRM_SPEND: '0.0105' })
    const s = ran(await run())
    expect(POSTED()).toHaveLength(2)
    expect(s.trialClean).toBe(false); expect(s.problems.join(' | ')).toContain('run cap would be exceeded')
  })
})

describe('W6 replay run · an unknown cost or a failure after sending stops the run (the spend gate\'s rule)', () => {
  it('an answer with no usage has no cost: the turn is not an answer, the run stops, no further request', async () => {
    setEnv()
    net.handler = () => okCompletion('x', null)
    const s = ran(await run())
    expect(POSTED()).toHaveLength(1)
    expect(s).toMatchObject({ turnOk: false, trialClean: false, usd: null })
    expect(s.problems.join(' | ')).toMatch(/cost/)
  })
  it('a network failure after the request may have left: cost unknown, the run stops; HTTP 500 the same', async () => {
    for (const handler of [() => { throw new Error('socket hang up') }, () => new Response('{}', { status: 500 })]) {
      vi.unstubAllEnvs(); for (const k of ALL_NAMES) vi.stubEnv(k, undefined); setEnv(); net.requests = []; net.handler = handler as never
      const s = ran(await run())
      expect(POSTED()).toHaveLength(1)
      expect(s.trialClean).toBe(false); expect(s.problems.join(' | ')).toContain('T1')
    }
  })
  it('an error text that holds the key is redacted in the summary', async () => {
    setEnv()
    net.handler = () => { throw new Error(`boom ${KEY} boom`) }
    const s = ran(await run())
    expect(JSON.stringify(s)).not.toContain(KEY)
    // and in the result file the turn's error is kept in (replayError): redacted too
    const file = Object.values(written).join('\n')
    expect(file).toContain('replayError'); expect(file).not.toContain(KEY)
  })
})

describe('W6 replay run · the network: one endpoint, nothing else', () => {
  it('a request to another host, another path, another method or through node:http(s) while the run is open is blocked before it is sent, recorded, and makes the run NOT CLEAN', async () => {
    setEnv()
    let attempts: string[] = []
    net.handler = async () => {
      for (const [u, init] of [['https://google.serper.dev/search', { method: 'POST' }], ['https://api.openai.com/v1/responses', { method: 'POST' }], ['https://api.openai.com/v1/chat/completions', { method: 'GET' }], ['https://example.com/', {}]] as const) {
        try { await globalThis.fetch(u, init as RequestInit); attempts.push('SENT ' + u) } catch { attempts.push('blocked') }
      }
      try { https.request('https://api.openai.com/v1/chat/completions'); attempts.push('SENT node') } catch { attempts.push('blocked node') }
      return okCompletion()
    }
    const s = ran(await run())
    expect(attempts.slice(0, 5)).toEqual(['blocked', 'blocked', 'blocked', 'blocked', 'blocked node'])
    expect(net.requests.map(r => r.url).filter(u => !u.endsWith('/v1/chat/completions'))).toEqual([]) // nothing but the chat endpoint ever reached the network
    expect(s.hostsBlocked.join(' ')).toContain('google.serper.dev/search'); expect(s.hostsBlocked.join(' ')).toContain('example.com'); expect(s.hostsBlocked.join(' ')).toContain('(node:http/https)')
    expect(s.trialClean).toBe(false); expect(formatReplaySummary(s)).toContain('NOT CLEAN')
  })
  it('a request with a dispatcher (a changed connection) is blocked', async () => {
    setEnv()
    let outcome = ''
    net.handler = async () => { try { await globalThis.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', dispatcher: {} } as never); outcome = 'sent' } catch { outcome = 'blocked' }; return okCompletion() }
    const s = ran(await run())
    expect(outcome).toBe('blocked'); expect(s.trialClean).toBe(false)
  })
  it("when the run is over the network is closed (afterTrial 'deny'): every later request, the chat endpoint included, fails before it is sent and is recorded; 'restore' gives it back", async () => {
    setEnv()
    const before = globalThis.fetch
    const s = ran(await run({ afterTrial: 'deny' }))
    const n = net.requests.length
    await expect(globalThis.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: '{}' })).rejects.toThrow('the run is closed')
    expect(net.requests).toHaveLength(n)
    expect(() => https.request('https://api.openai.com/v1/chat/completions')).toThrow('the run is closed')
    expect(s.trialClean).toBe(true) // (the late request was made after the summary was built)
    globalThis.fetch = before
  })
  it('a redirect is never followed: HTTP 3xx fails the call', async () => {
    setEnv()
    net.handler = () => new Response('', { status: 307, headers: { location: 'https://evil.example/' } })
    const s = ran(await run())
    expect(POSTED()).toHaveLength(1); expect(s.trialClean).toBe(false)
  })
})

describe('W6 replay run · every check of a normal run still applies, and the replay conditions refuse before anything is sent', () => {
  const refusedWith = async (over: Record<string, string | undefined>, part: string, prep?: () => void) => {
    vi.unstubAllEnvs(); for (const k of ALL_NAMES) vi.stubEnv(k, undefined); setEnv(over); net.requests = []
    files = { [CAP_PATH]: toBytes(CAPTURE), [QUESTIONS_PATH]: 'T1|c1|1|hoi mot\n' }; prep?.()
    const o = await run()
    expect(o.kind, part).toBe('refused')
    if (o.kind === 'refused') expect(o.reasons.join(' | '), part).toContain(part)
    expect(net.requests, part).toHaveLength(0)
  }
  it('the preflight of a normal run: spend gate OFF, caps above the maximum, confirmation not the run cap, CI set, a key of the wrong shape, no question file, a proxy, a flag set to a bad value', async () => {
    await refusedWith({ BENCH_SPEND_GATE: undefined }, 'BENCH_SPEND_GATE')
    await refusedWith({ BENCH_SPEND_TURN_CAP_USD: '0.5' }, 'per-turn')
    await refusedWith({ BENCH_CONFIRM_SPEND: '0.20' }, 'BENCH_CONFIRM_SPEND')
    await refusedWith({ CI: 'true' }, 'CI is set')
    await refusedWith({ OPENAI_API_KEY: 'not-a-key' }, 'sk-')
    await refusedWith({ BENCH_TRIAL_QUESTION_FILE: undefined }, 'BENCH_TRIAL_QUESTION_FILE')
    await refusedWith({ HTTPS_PROXY: 'http://x' }, 'proxy')
    await refusedWith({ CONSULT_FINAL_SYNTHESIS: 'yes' }, 'CONSULT_FINAL_SYNTHESIS')
    await refusedWith({ CONSULT_REQUEST_CAP: undefined }, 'CONSULT_REQUEST_CAP')
  })
  it('the replay conditions: mode, variant, caps above the replay maximum, capture path / name / content, model, a non-text part, no writer call, evidence', async () => {
    await refusedWith({ BENCH_TRIAL_MODE: undefined, BENCH_SPEND_RUN_CAP_USD: '0.30' }, 'BENCH_TRIAL_MODE=dev-multi')
    await refusedWith({ BENCH_REPLAY_VARIANT: 'V9' }, 'must be exactly one of')
    await refusedWith({ BENCH_REPLAY_VARIANT: undefined }, 'must be exactly one of')
    await refusedWith({ BENCH_SPEND_RUN_CAP_USD: '0.40', BENCH_CONFIRM_SPEND: '0.40' }, `run cap must be at most ${REPLAY_MAX_RUN_CAP_USD}`)
    await refusedWith({ BENCH_REPLAY_CAPTURE: undefined }, 'BENCH_REPLAY_CAPTURE is not set')
    await refusedWith({ BENCH_REPLAY_CAPTURE: 'C:/x/capture-1.json' }, 'capture-<n>.json file on drive D')
    await refusedWith({ BENCH_REPLAY_CAPTURE: 'D:/x/bench-1.json' }, 'capture-<n>.json file on drive D')
    await refusedWith({ BENCH_REPLAY_CAPTURE: 'D:/x/capture-2.json' }, 'cannot be read as JSON')
    await refusedWith({}, 'not a writer capture', () => { files[CAP_PATH] = toBytes({ kind: 'other' }) })
    await refusedWith({}, 'cannot be read as JSON', () => { files[CAP_PATH] = '{not json' })
    await refusedWith({}, 'not exactly gpt-6-luna', () => { files[CAP_PATH] = toBytes({ ...CAPTURE, calls: [call('T1', 1, writerBody('T1', { model: 'gpt-6-luna-pro' }), { textChars: 5 })] }) })
    await refusedWith({}, 'cannot be bounded by its size', () => { files[CAP_PATH] = toBytes({ ...CAPTURE, calls: [call('T1', 1, writerBody('T1', { messages: [user('q'), { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'image_url', image_url: { url: 'https://x/y.png' } }] }] }), { textChars: 5 })] }) })
    await refusedWith({}, 'no turn with a writer call', () => { files[CAP_PATH] = toBytes({ ...CAPTURE, calls: [call('T1', 1, writerBody('T1'), { status: 500 })] }) })
    await refusedWith({}, 'plain identifier', () => { files[CAP_PATH] = toBytes({ ...CAPTURE, calls: [call('../x', 1, writerBody('x'), { textChars: 5 })] }) })
    await refusedWith({ BENCH_REPLAY_VARIANT: 'X0' }, `BENCH_REPLAY_EVIDENCE_DIR must be a folder on drive D`)
    await refusedWith({ BENCH_REPLAY_VARIANT: 'X1', BENCH_REPLAY_EVIDENCE_DIR: EVIDENCE_DIR }, 'no usable outside evidence for turn(s): T1, T2, T3')
    await refusedWith({ BENCH_REPLAY_VARIANT: 'X0', BENCH_REPLAY_EVIDENCE_DIR: EVIDENCE_DIR }, 'T2', () => { for (const t of ['T1', 'T3']) files[`${EVIDENCE_DIR}/evidence-${t}.json`] = JSON.stringify({ results: [{ url: 'https://e.example', highlights: ['a'] }] }) })
    await refusedWith({ BENCH_REPLAY_VARIANT: 'V0', BENCH_REPLAY_EVIDENCE_DIR: EVIDENCE_DIR }, 'takes no evidence')
  })
  it('a part that is not text cannot be bounded by its size (pure check); the allowed ceilings are the Owner\'s and the launcher states the same ones', () => {
    expect(unboundedPartReason({ messages: [user('a'), { role: 'user', content: [{ type: 'text', text: 'a' }] }] })).toBeNull()
    expect(unboundedPartReason({ messages: [{ role: 'user', content: [{ type: 'image_url' }] }] })).toContain('image_url')
    expect(unboundedPartReason({ messages: [{ role: 'user', content: [{ type: 'input_audio' }] }] })).toContain('input_audio')
    expect([REPLAY_MAX_RUN_CAP_USD, REPLAY_MAX_TURN_CAP_USD, REPLAY_PRICED_MODEL]).toEqual(['0.30', '0.10', 'gpt-6-luna']); expect([LAUNCHER_RUN_CAP, LAUNCHER_TURN_CAP]).toEqual(['0.30', '0.10'])
  })
  it('a run with no key sends nothing', async () => {
    await refusedWith({ OPENAI_API_KEY: '' }, 'OPENAI_API_KEY')
  })
})

describe('W6 replay · the preflight report and the launcher (Gate 0 / Gate 1)', () => {
  it('the condition report gains ONE replay line, only for a replay; every other condition is the same', () => {
    setEnv()
    const withReplay = conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null })
    const line = withReplay.find(c => c.name.startsWith('replay of the writing step'))!
    expect(line).toBeDefined()
    vi.unstubAllEnvs(); for (const k of ALL_NAMES) vi.stubEnv(k, undefined); setEnv({ BENCH_REPLAY_CAPTURE: undefined, BENCH_REPLAY_VARIANT: undefined })
    const without = conditionReport({ env: process.env, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: null })
    expect(without.some(c => c.name.startsWith('replay of the writing step'))).toBe(false)
    expect(withReplay.filter(c => !c.name.startsWith('replay of the writing step') && c.name !== 'allow-list the run may reach' && !c.name.startsWith('budget mode')).map(c => c.name)).toEqual(without.filter(c => c.name !== 'allow-list the run may reach' && !c.name.startsWith('budget mode')).map(c => c.name))
    expect(formatConditionReport(withReplay)).toContain('POST api.openai.com/v1/chat/completions ONLY')
  })
  it('the replay names are in the launcher allow-list and reach the child with their value; a look-alike is still refused by name', () => {
    for (const k of ['BENCH_REPLAY_CAPTURE', 'BENCH_REPLAY_VARIANT', 'BENCH_REPLAY_EVIDENCE_DIR']) {
      expect(TRIAL_ENV_NAMES).toContain(k)
      expect(buildChildEnv({ ...EXT, [k]: 'v' }, { confirm: false, nonce: 'a'.repeat(32) })[k]).toBe('v')
    }
    expect(launcherRefusals({ ...EXT, BENCH_REPLAY_EVIDENCE_DIR: EVIDENCE_DIR })).toEqual([])
    for (const k of ['BENCH_REPLAY_MODEL', 'BENCH_REPLAY_EFFORT', 'BENCH_REPLAY_CAPTURE2']) expect(launcherRefusals({ ...EXT, [k]: '1' }).join(' | ')).toContain(`${k} is set but is not one of the variables the trial passes on`)
  })
  it('the launcher\'s variant table, caps and call count are the same as the code\'s (writerReplay / replayTrial)', () => {
    expect(Object.entries(REPLAY_VARIANT_TABLE).map(([id, v]) => [id, v.effort, v.note, v.evidence])).toEqual(VARIANTS.map(v => [v.id, v.effort, v.note, v.evidence]))
    // a capture with the shapes the rule tells apart: a small helper call after the answer, a failed call, a full answer after a tool step
    const shaped: WriterCaptureFile = { ...CAPTURE, calls: [...CAPTURE.calls,
      // the helper (no reasoning_effort, a third of the size of the writer's request) is not the writer: it sent less than half of the largest request
      call('T5', 1, writerBody('T5'), { textChars: 400 }), call('T5', 2, { model: 'gpt-6-luna', messages: [sys('h'.repeat(1400)), user('z')] }, { textChars: 14 }),
      call('T6', 1, writerBody('T6'), { toolCalls: 1, finishReason: 'tool_calls' }), call('T6', 2, writerBody('T6', { tools: undefined }), { textChars: 600 }),
      call('T7', 1, { response_format: {}, messages: [sys('y'.repeat(9000))] }, { textChars: 60 }), // an intent call is never the writer
    ] }
    const lines = replayLines({ ...EXT }, { readBytes: () => toBytes(shaped) })
    const picks = pickWriterCalls(shaped)
    expect(picks.map(p => [p.turn, p.n])).toEqual([['T1', 2], ['T2', 3], ['T3', 1], ['T4', null], ['T5', 1], ['T6', 2], ['T7', null]])
    expect(lines.join('\n')).toContain(`số lời gọi sẽ gửi: ${picks.filter(p => p.n !== null).length} trên ${picks.length} lượt`)
    // which calls were picked shows in the efforts of their bodies: the helper (no reasoning_effort) must not be among them
    expect(lines.join('\n')).toContain('(mức suy luận ghi trong capture: none)')
  })
  it('Gate 1 prints the replay lines: capture name + SHA-256, variant, model, effort, number of calls, caps; no key, no capture text', () => {
    const env = { ...EXT, BENCH_REPLAY_VARIANT: 'V2' }
    const lines = replayLines(env, { readBytes: () => toBytes(CAPTURE) })
    const text = lines.join('\n')
    expect(text).toContain('biến thể V2'); expect(text).toContain('mức suy luận medium'); expect(text).toContain('chỉ dẫn gốc;'); expect(text).toContain('trần đầu ra 4000 token (gồm cả token suy luận; không công cụ)')
    expect(text).toContain(`capture-1793161679656.json sha256=${createHash('sha256').update(toBytes(CAPTURE)).digest('hex')}`)
    expect(text).toContain('gpt-6-luna'); expect(text).toContain('(mức suy luận ghi trong capture: none)'); expect(text).toContain('số lời gọi sẽ gửi: 3 trên 4 lượt')
    expect(text).toContain('chỉ gọi api.openai.com/v1/chat/completions (không Serper, không host khác)')
    expect(text).toContain('mỗi lượt 0.05 USD (tối đa 0.10), cả biến thể 0.30 USD (tối đa 0.30)'); expect(text).toContain('meteredModel + cổng chi tiêu')
    expect(text).not.toContain(KEY); expect(text).not.toContain('he thong T1'); expect(text).not.toContain('hoi T1')
    expect(replayLines({ ...EXT, BENCH_REPLAY_VARIANT: 'V1' }, { readBytes: () => toBytes(CAPTURE) }).join('\n')).toContain('chỉ dẫn gốc + lời dặn V1; mức suy luận như lời gọi gốc; trần đầu ra như lời gọi gốc (tối đa 4000); bằng chứng Exa không')
    expect(replayLines({ ...EXT, BENCH_REPLAY_VARIANT: 'X1', BENCH_REPLAY_EVIDENCE_DIR: EVIDENCE_DIR }, { readBytes: () => toBytes(CAPTURE) }).join('\n')).toContain(`thư mục bằng chứng Exa: ${EVIDENCE_DIR}`)
    expect(replayLines({ ...EXT, BENCH_REPLAY_VARIANT: 'V9' }, { readBytes: () => toBytes(CAPTURE) }).join('\n')).toContain('KHÔNG HỢP LỆ')
    expect(replayLines({ ...EXT }, { readBytes: () => { throw new Error('x') } }).join('\n')).toContain('KHÔNG ĐỌC ĐƯỢC')
    // and it is inside the real Gate 1 summary - for a replay only
    expect(gate1Summary({ ...EXT }, null).join('\n')).toContain('PHÁT LẠI bước viết')
    const plain: Record<string, string | undefined> = { ...EXT, BENCH_REPLAY_VARIANT: undefined, BENCH_REPLAY_CAPTURE: undefined }
    expect(gate1Summary(plain, null).join('\n')).not.toContain('PHÁT LẠI')
  })
  it('the Gate 1 confirmation line is unchanged and an unconfirmed Gate 1 sends nothing (only the preflight child runs, never the real run)', async () => {
    const runs: Array<{ preflightOnly: boolean }> = []
    const out: string[] = []
    // a fake child with the shape of the launcher's runner (as launcherFlow.test.ts): answers with a block carrying the child's own nonce
    const fakeRun = (async ({ env }: { env: Record<string, string> }) => {
      const n = env.BENCH_TRIAL_ISOLATED
      const isPre = env.BENCH_TRIAL_PREFLIGHT_ONLY === '1'
      runs.push({ preflightOnly: isPre }) // (the preflight child gets the confirmation text too, and its test is skipped: only BENCH_TRIAL_PREFLIGHT_ONLY tells the two apart)
      const text = isPre
        ? `<<TRIAL-PREFLIGHT-BEGIN:${n}>>\nTỔNG: mọi điều kiện ĐẠT (preflight-only; không có request nào được gửi)\n<<TRIAL-PREFLIGHT-END:${n}>>`
        : `<<TRIAL-SUMMARY-BEGIN:${n}>>\nturnOk=true trialClean=true\n<<TRIAL-SUMMARY-END:${n}>>`
      return { text, truncated: false, exitCode: 0, killedBy: null, stillAlive: false, pipesOpen: false, pid: 1, ms: 1 }
    }) as never
    const flow = (answer: string, tty = true) => runFlow({ env: { ...EXT }, repoRoot: 'D:/x', print: s => out.push(s), run: fakeRun, questionText: null, stdinIsTTY: tty, askGate1: async () => answer })
    expect(gate1Line(EXT)).toBe('CHAY LUOT DO EXTENSION TRAN 0.30') // the line is built exactly as before
    for (const answer of ['', 'CHAY LUOT DO EXTENSION TRAN 0.65', 'chay luot do extension tran 0.30', ' CHAY LUOT DO EXTENSION TRAN 0.30', 'CHAY LUOT DO ACCEPTANCE TRAN 0.30']) {
      runs.length = 0
      expect(await flow(answer), answer).toBe(1)
      expect(runs, answer).toEqual([{ preflightOnly: true }]) // only the preflight child: the real run is never started
    }
    expect(out.join('\n')).toContain('Gate 1 not confirmed (the line did not match exactly): nothing was sent.')
    expect(out.join('\n')).toContain('PHÁT LẠI bước viết')
    runs.length = 0
    expect(await flow('CHAY LUOT DO EXTENSION TRAN 0.30', false)).toBe(2)
    expect(runs).toEqual([{ preflightOnly: true }])
    runs.length = 0
    expect(await flow('CHAY LUOT DO EXTENSION TRAN 0.30')).toBe(0)
    expect(runs).toEqual([{ preflightOnly: true }, { preflightOnly: false }]) // the real run starts only after the exact line
  })
  it('isReplayRequested: any BENCH_REPLAY_* variable makes the child a replay, never a route trial', () => {
    expect(isReplayRequested({})).toBe(false); expect(isReplayRequested({ BENCH_REPLAY_VARIANT: 'V0' })).toBe(true); expect(isReplayRequested({ BENCH_REPLAY_CAPTURE: 'x' })).toBe(true)
    expect(replayCheck({ ...EXT, BENCH_REPLAY_CAPTURE: CAP_PATH }, deps()).plan).not.toBeNull()
  })
})
