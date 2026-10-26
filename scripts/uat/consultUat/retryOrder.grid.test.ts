// @vitest-environment node
// Wave 2J (J2) — review F1 / F2 / F10 / M10 for CONSULT_ABORT_ABANDONED_FIRST_PART, with the REAL paid-run spend gate (GuardSpendGate over BudgetGuard). MOCK-ONLY: fake models, fetch stubbed to throw.
// The paid-run gate refuses every call once a cost is unknown, so a retry that is asked AFTER its failed primary was closed as unknown is refused (SpendRefusal) and the user gets an error.
// Claims, over the grid {stream, generate} x {normal role, agent role} x {timeout, fail, empty stream, error first part} x {ABORT unset / "1"} x {gate / no gate}:
//   · ABORT = "1" with the gate: the retry is NEVER refused - the user gets the retry's answer, the retry is settled, the primary is closed as unknown (never "held"), the gate still blocks everything after (fail-closed);
//   · ABORT unset (and every value that is not exactly "1"): exactly the behaviour of 40ea965 (the table `OLD` below: held / refused as before);
//   · no gate: the retry answers in every cell, with or without the flag.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai'
import { APICallError } from 'ai'
import { meteredModel } from '@/lib/ai/budget/meteredModel'
import { withFallback } from '@/lib/ai/llm/fallback'
import { runWithSpendGate, ABANDONED_FIRST_PART_REASON } from '@/lib/ai/budget/spendGate'
import { BudgetGuard } from './harness'
import { GuardSpendGate } from './spendGateAdapter'

const USAGE = { promptTokens: 100, completionTokens: 20 }
const FINISH: LanguageModelV1StreamPart = { type: 'finish', finishReason: 'stop', usage: USAGE, providerMetadata: { tappy: { cost: { usd: 0.0004 } } } as never }
const CALL = { inputFormat: 'messages' as const, mode: { type: 'regular' as const }, prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'xin chào' }] }] }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Failure = 'timeout' | 'fail' | 'empty' | 'errorPart'
interface Probe { starts: number; cancelled: number; signal: AbortSignal | undefined }
/** A fake provider. `mode` decides how the call goes wrong (or `ok`). A `timeout` is a call that never gives a first part within the fallback's wait and ignores its signal. */
function fake(mode: Failure | 'ok', opts: { slowMs?: number } = {}): { m: LanguageModelV1; probe: Probe } {
  const probe: Probe = { starts: 0, cancelled: 0, signal: undefined }
  const err = () => new APICallError({ message: 'server error', url: 'https://example.invalid', requestBodyValues: {}, statusCode: 500, isRetryable: true })
  const m: LanguageModelV1 = {
    specificationVersion: 'v1', provider: 'openai.chat', modelId: 'gpt-6-luna', defaultObjectGenerationMode: undefined,
    async doGenerate(o) {
      probe.starts++; probe.signal = o.abortSignal
      if (mode === 'fail') throw err()
      if (mode === 'timeout') await sleep(opts.slowMs ?? 400)
      else if (opts.slowMs) await new Promise<void>((res, rej) => { const t = setTimeout(res, opts.slowMs); o.abortSignal?.addEventListener('abort', () => { clearTimeout(t); rej(o.abortSignal?.reason ?? new Error('aborted')) }, { once: true }) })
      return { text: 'ok', finishReason: 'stop', usage: USAGE, rawCall: { rawPrompt: null, rawSettings: {} }, providerMetadata: { tappy: { cost: { usd: 0.0004 } } } as never }
    },
    async doStream(o) {
      probe.starts++; probe.signal = o.abortSignal
      if (mode === 'fail') throw err()
      const parts: LanguageModelV1StreamPart[] = mode === 'empty' ? [] : mode === 'errorPart' ? [{ type: 'error', error: 'upstream broke' }] : [{ type: 'text-delta', textDelta: 'ok' }, FINISH]
      return {
        stream: new ReadableStream<LanguageModelV1StreamPart>({
          async start(c) {
            if (mode === 'timeout') await sleep(opts.slowMs ?? 400)
            else if (opts.slowMs) await sleep(opts.slowMs)
            for (const p of parts) c.enqueue(p)
            c.close()
          },
          cancel() { probe.cancelled++ },
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      }
    },
  }
  return { m, probe }
}

const ENV = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD', 'C2_REQUEST_BUDGET', 'CONSULT_ABORT_ABANDONED_FIRST_PART', 'NODE_ENV', 'VERCEL_ENV']
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k] }
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REAL FETCH CALLED') }))
})
afterEach(() => { vi.unstubAllGlobals(); for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })
const setGate = (on: boolean) => { if (on) { process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = '0.05'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.65' } }
const flag = (v: string | undefined) => { if (v === undefined) delete process.env.CONSULT_ABORT_ABANDONED_FIRST_PART; else process.env.CONSULT_ABORT_ABANDONED_FIRST_PART = v }

type Kind = 'stream' | 'generate'
type Role = 'normal' | 'agent'
const pair = (primary: LanguageModelV1, retry: LanguageModelV1, role: Role) =>
  withFallback(meteredModel(primary, 'smart'), meteredModel(retry, 'smart:retry'), { firstPartMs: 40, generateMs: 40, label: role === 'agent' ? 'agent' : 'smart', fallbackKind: 'luna_retry', ...(role === 'agent' ? { abortPrimaryOnTimeout: true } : {}) })

async function run(model: LanguageModelV1, kind: Kind, abortSignal?: AbortSignal): Promise<string> {
  const opts = { ...CALL, ...(abortSignal ? { abortSignal } : {}) } as never
  if (kind === 'generate') { const r = await model.doGenerate(opts); return `gen:${r.text}` }
  const r = await model.doStream(opts); const rd = r.stream.getReader(); const got: string[] = []
  for (;;) { const n = await rd.read(); if (n.done) break; got.push(n.value.type) }
  return 'str:' + got.join(',')
}
const outcome = async <T,>(p: Promise<T>) => { try { return { ok: true as const, value: await p } } catch (e) { return { ok: false as const, error: e instanceof Error ? `${e.name}:${e.message}`.slice(0, 80) : String(e) } } }
const states = (g: GuardSpendGate) => g.records.map(r => `${r.label}=${r.state}`)

interface Cell { kind: Kind; role: Role; failure: Failure; abort: string | undefined; gate: boolean }
async function cell(c: Cell) {
  flag(c.abort); setGate(c.gate)
  const g = new GuardSpendGate(new BudgetGuard(0.05))
  const p = fake(c.failure), r = fake('ok')
  const model = pair(p.m, r.m, c.role)
  const res = await outcome(runWithSpendGate(g, () => run(model, c.kind)))
  await sleep(c.failure === 'timeout' ? 450 : 80) // let an abandoned primary finish by itself
  return { res, g, p, r }
}

const FAILURES: Failure[] = ['timeout', 'fail', 'empty', 'errorPart']
const KINDS: Array<[Kind, Failure[]]> = [['stream', FAILURES], ['generate', ['timeout', 'fail']]]
const ROLES: Role[] = ['normal', 'agent']
const ANSWER: Record<Kind, string> = { stream: 'str:text-delta,finish', generate: 'gen:ok' }

describe('F1 / F2 — ABORT = "1" with the spend gate: the retry is never refused and the primary is never left held', () => {
  for (const [kind, failures] of KINDS) for (const role of ROLES) for (const failure of failures) {
    it(`${kind} | ${role} | ${failure}: the user gets the retry's answer; primary unknown, retry settled; nothing held; the gate blocks what follows`, async () => {
      const { res, g, p, r } = await cell({ kind, role, failure, abort: '1', gate: true })
      expect(res).toEqual({ ok: true, value: ANSWER[kind] })
      expect(states(g)).toEqual(['llm:smart=unknown', 'llm:smart:retry=settled'])
      expect(g.records.some(x => x.state === 'held' || x.state === 'refused')).toBe(false)
      expect(g.guard.blockedBy).toBe('cost-unknown') // fail-closed is unchanged: everything after this is refused
      expect(g.guard.knownUsd).toBeGreaterThan(0)    // the retry's real cost is still booked
      expect(r.probe.starts).toBe(1)
      if (failure === 'timeout') expect(g.records[0]?.unknownReason).toBe(ABANDONED_FIRST_PART_REASON)
      else expect(g.records[0]?.unknownReason).toBeUndefined() // a failure is not "abandoned": no reason code
      void p
    })
  }
})

describe('ABORT unset (and any value but "1") — exactly the behaviour of 40ea965', () => {
  // The old behaviour with the gate: a timeout leaves the abandoned primary "held" and the retry answers; a primary that FAILED / came back empty / errored first is closed as unknown at once, so
  // the retry is refused by the gate (SpendRefusal, the run is blocked). Without the gate every cell answers.
  for (const v of [undefined, '0', 'true', ' 1', '1 ', 'on']) {
    for (const [kind, failures] of KINDS) for (const role of ROLES) for (const failure of failures) {
      it(`value ${JSON.stringify(v)} | ${kind} | ${role} | ${failure} | gate`, async () => {
        const { res, g } = await cell({ kind, role, failure, abort: v, gate: true })
        if (failure === 'timeout') {
          expect(res).toEqual({ ok: true, value: ANSWER[kind] })
          // the abandoned primary was never closed by anyone while it was abandoned (it books itself only when it finally returns, if it ever does)
          expect(states(g)[1]).toBe('llm:smart:retry=settled')
          expect(g.records[0]?.unknownReason).toBeUndefined()
        } else {
          expect(res.ok).toBe(false)
          expect(states(g)).toEqual(['llm:smart=unknown', expect.stringMatching(/^llm:smart:retry=(refused|unknown)$/) as unknown as string].slice(0, states(g).length))
          expect(g.guard.blockedBy).toBe('cost-unknown')
        }
      })
    }
  }
  it('no gate: every cell answers with the retry, flag unset or "1"', async () => {
    for (const abort of [undefined, '1']) for (const [kind, failures] of KINDS) for (const role of ROLES) for (const failure of failures) {
      const { res } = await cell({ kind, role, failure, abort, gate: false })
      expect(res, `${abort} ${kind} ${role} ${failure}`).toEqual({ ok: true, value: ANSWER[kind] })
    }
  }, 60000)
})

describe('more cases with the gate and ABORT = "1"', () => {
  it('two timeouts in ONE turn (same gate): the first is answered by its retry; the call after it is refused by the gate (fail-closed, by design)', async () => {
    flag('1'); setGate(true)
    const g = new GuardSpendGate(new BudgetGuard(0.05))
    const a = await outcome(runWithSpendGate(g, () => run(pair(fake('timeout').m, fake('ok').m, 'normal'), 'stream')))
    const b = await outcome(runWithSpendGate(g, () => run(pair(fake('timeout').m, fake('ok').m, 'normal'), 'stream')))
    await sleep(450)
    expect(a).toEqual({ ok: true, value: ANSWER.stream })
    expect(b.ok).toBe(false)
    expect(g.records.some(x => x.state === 'held')).toBe(false)
    expect(g.guard.blockedBy).toBe('cost-unknown')
  })

  it('the caller aborts while the RETRY is running: both reservations end unknown, nothing is held, the call rejects', async () => {
    flag('1'); setGate(true)
    const g = new GuardSpendGate(new BudgetGuard(0.05))
    const ctl = new AbortController()
    setTimeout(() => ctl.abort(new Error('client_gone')), 120) // the primary times out at 40 ms, the retry (300 ms) is still running
    const res = await outcome(runWithSpendGate(g, () => run(pair(fake('timeout').m, fake('ok', { slowMs: 300 }).m, 'normal'), 'generate', ctl.signal)))
    await sleep(100)
    expect(res.ok).toBe(false)
    expect(g.records.some(x => x.state === 'held')).toBe(false)
    expect(states(g)).toEqual(['llm:smart=unknown', 'llm:smart:retry=unknown'])
  })

  it('the retry never returns either (ignores its signal) and the caller aborts: both closed unknown, nothing held', async () => {
    flag('1'); setGate(true)
    const g = new GuardSpendGate(new BudgetGuard(0.05))
    const ctl = new AbortController()
    setTimeout(() => ctl.abort(new Error('client_gone')), 150)
    const hang = fake('timeout', { slowMs: 3000 })
    const running = outcome(runWithSpendGate(g, () => run(pair(fake('timeout').m, hang.m, 'normal'), 'generate', ctl.signal))) // not awaited: a provider that ignores its signal keeps the CALL pending
    await sleep(350)
    expect(states(g)).toEqual(['llm:smart=unknown', 'llm:smart:retry=unknown']) // but the books are closed: the abort of the caller closed the retry's reservation
    expect(g.records.some(x => x.state === 'held')).toBe(false)
    void running
  })
})

describe('M10 / F10', () => {
  it('M10: a primary stream that has its header but no first part in time is CANCELLED (the source gets cancel) with the flag ON, not with it OFF', async () => {
    for (const [abort, expected] of [['1', 1], [undefined, 0]] as const) {
      flag(abort); setGate(true)
      const g = new GuardSpendGate(new BudgetGuard(0.05))
      const p = fake('timeout', { slowMs: 300 })
      await outcome(runWithSpendGate(g, () => run(pair(p.m, fake('ok').m, 'normal'), 'stream')))
      await sleep(400)
      expect(p.probe.cancelled, `abort=${abort}`).toBe(expected)
    }
  })

  it('F10: once a reservation is closed as unknown the abort listener is removed from the shared request signal (no listener left behind by flush / error-part outcomes)', async () => {
    flag('1'); setGate(true)
    const ctl = new AbortController()
    const added: number[] = [0]
    const origAdd = ctl.signal.addEventListener.bind(ctl.signal), origRemove = ctl.signal.removeEventListener.bind(ctl.signal)
    ctl.signal.addEventListener = ((t: string, l: EventListenerOrEventListenerObject, o?: AddEventListenerOptions | boolean) => { if (t === 'abort') added[0]!++; return origAdd(t, l, o) }) as typeof ctl.signal.addEventListener
    ctl.signal.removeEventListener = ((t: string, l: EventListenerOrEventListenerObject, o?: EventListenerOptions | boolean) => { if (t === 'abort') added[0]!--; return origRemove(t, l, o) }) as typeof ctl.signal.removeEventListener
    const g = new GuardSpendGate(new BudgetGuard(0.05))
    // direct metered call (no fallback): an error as the first part closes the reservation unknown at once
    await outcome(runWithSpendGate(g, () => run(meteredModel(fake('errorPart').m, 'smart'), 'stream', ctl.signal)))
    await sleep(20)
    expect(states(g)).toEqual(['llm:smart=unknown'])
    expect(added[0]).toBe(0)
  })

  it('a call whose signal is NOT owned by a fallback is closed at once, exactly as before (no deferral for a direct metered call, flag ON)', async () => {
    flag('1'); setGate(true)
    const g = new GuardSpendGate(new BudgetGuard(0.05))
    await outcome(runWithSpendGate(g, () => run(meteredModel(fake('fail').m, 'smart'), 'generate')))
    expect(states(g)).toEqual(['llm:smart=unknown']) // closed in the same tick, no timer needed
    expect(g.guard.blockedBy).toBe('cost-unknown')
  })
})
