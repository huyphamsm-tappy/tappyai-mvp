// @vitest-environment node
// CONSULT_REQUEST_CAP · L1 (per turn) + L2 (per bench run). The assertions count the calls that reach the (stubbed) fetch to google.serper.dev:
// a request that is refused must not appear there. Mock network only: any other URL throws.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { serperPost } from './serperClient'
import { runWithSpendGate } from '@/lib/ai/budget/spendGate'
import { serperSearch, webSearch, __clearToolCache } from './common'
import { createTurnWebTicket, runWithTurnWebTicket, withSerperToolBudget, withSerperToolScope, withSerperTurnBudget } from './serperToolBudget'
import {
  __resetRequestCap, beginRequestCapRun, closeRequestCapTurn, createRequestCapTurn, endRequestCapRun, parseCapValue, requestCapConfig,
  requestCapRunState, requestCapTotals, reserveRequest, runWithRequestCapTurn, wrapToolsWithRequestCap,
} from './serperRequestCap'

let sent: string[]
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const okBody = () => new Response(JSON.stringify({ organic: [{ title: 't', link: 'https://example.com/a', snippet: 's' }], credits: 1 }), { status: 200 })
const post = (q: string, timeoutMs = 2000) => serperPost('search', 'k', { q }, timeoutMs)
const stubFetch = (delayMs = 5) => vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: unknown }) => {
  const u = String(input)
  if (!u.includes('google.serper.dev')) throw new Error('network disabled in this test (a real request must never be made): ' + u.slice(0, 80))
  let q = ''
  try { q = String((JSON.parse(String(init?.body ?? '{}')) as { q?: string }).q ?? '') } catch { q = '' }
  sent.push(q)
  await sleep(delayMs)
  return okBody()
}))
/** Flag ON. `null` = leave CONSULT_REQUEST_CAP_PER_TURN unset (a default parameter would swallow `undefined`, so the missing case is spelled null). */
const capOn = (perTurn: string | null = '3') => {
  vi.stubEnv('CONSULT_REQUEST_CAP', '1')
  if (perTurn !== null) vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', perTurn)
}

beforeEach(() => {
  sent = []
  __resetRequestCap(); __clearToolCache()
  vi.stubEnv('SERPER_API_KEY', 'test-key-not-real')
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  stubFetch()
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('flag OFF = the old behaviour, untouched', () => {
  it('unset: no turn object, no scope needed, nothing counted, every request is sent', async () => {
    expect(createRequestCapTurn()).toBeNull()
    for (let i = 0; i < 10; i++) expect(await post('off ' + i)).not.toBeNull()
    expect(sent).toHaveLength(10)
    expect(requestCapTotals()).toEqual({ reserved: 0, refused: {} })
  })
  it.each(['0', 'false', '', 'off', 'no', ' '])('flag value %j is OFF even with cap values present', async (v) => {
    vi.stubEnv('CONSULT_REQUEST_CAP', v)
    vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', '1')
    expect(createRequestCapTurn()).toBeNull()
    expect(requestCapConfig()).toEqual({ on: false })
    for (let i = 0; i < 3; i++) await post('off2 ' + i)
    expect(sent).toHaveLength(3)
  })
  it('flag OFF inside a hand-made turn object: the object is not consulted', async () => {
    capOn('1'); const turn = createRequestCapTurn()!
    vi.unstubAllEnvs(); vi.stubEnv('SERPER_API_KEY', 'test-key-not-real') // OFF again at request time (the flag is read per request)
    await runWithRequestCapTurn(turn, async () => { await post('a'); await post('b'); await post('c') })
    expect(sent).toHaveLength(3)
    expect(turn.sent).toBe(0)
  })
})

describe('configuration is validated strictly and FAILS CLOSED (never a default)', () => {
  it.each(['1', '3', '7', '100'])('valid value %j', (v) => { expect(parseCapValue(v, 100)).toBe(Number(v)) })
  it.each([undefined, '', ' ', '0', '-1', '-0', '1.5', '5.0', 'abc', '1e3', '05', '+5', '0x10', 'NaN', 'Infinity', '101', '1000000', '١٢'])('invalid value %j is rejected', (v) => {
    expect(parseCapValue(v as string | undefined, 100)).toBeNull()
  })
  it.each([null, '', '0', '-3', '2.5', 'abc', '1e1', '999'])('flag ON + PER_TURN=%j (null = unset): config invalid, EVERY request refused, none sent', async (v) => {
    capOn(v)
    const cfg = requestCapConfig()
    expect(cfg.on && !cfg.valid).toBe(true)
    const turn = createRequestCapTurn()!
    expect(turn.limit).toBe(0)
    const results = await runWithRequestCapTurn(turn, () => Promise.all([post('x1'), post('x2'), post('x3')]))
    expect(results).toEqual([null, null, null])
    expect(sent).toHaveLength(0)
    expect(requestCapTotals().refused.config_invalid).toBe(3)
  })
  it('an invalid value does not become a default: with a missing value 0 of 20 requests are sent (a default of N would send N)', async () => {
    capOn(null)
    const turn = createRequestCapTurn()!
    await runWithRequestCapTurn(turn, async () => { for (let i = 0; i < 20; i++) await post('d' + i) })
    expect(sent).toHaveLength(0)
  })
})

describe('L1 · per-turn request cap', () => {
  it('sequential: exactly `limit` requests reach fetch, the rest return null', async () => {
    capOn('3'); const turn = createRequestCapTurn()!
    const r = await runWithRequestCapTurn(turn, async () => { const out = []; for (let i = 0; i < 5; i++) out.push(await post('s' + i)); return out })
    expect(r.map(x => x !== null)).toEqual([true, true, true, false, false])
    expect(sent).toEqual(['s0', 's1', 's2'])
    expect(turn.sent).toBe(3)
    expect(turn.refused).toBe(2)
    expect(turn.refusals).toEqual({ turn_cap: 2 })
  })

  it('PARALLEL (Promise.all): 12 simultaneous requests with limit 4 → exactly 4 reach fetch (no gap between check and reservation)', async () => {
    capOn('4'); const turn = createRequestCapTurn()!
    const r = await runWithRequestCapTurn(turn, () => Promise.all(Array.from({ length: 12 }, (_, i) => post('p' + i))))
    expect(sent).toHaveLength(4)
    expect(r.filter(x => x !== null)).toHaveLength(4)
    expect(turn.sent).toBe(4)
    expect(turn.refused).toBe(8)
  })

  it('two turns at the same time keep their own count (no mixing)', async () => {
    capOn('2')
    const a = createRequestCapTurn()!; const b = createRequestCapTurn()!
    await Promise.all([
      runWithRequestCapTurn(a, () => Promise.all([post('A1'), post('A2'), post('A3')])),
      runWithRequestCapTurn(b, () => Promise.all([post('B1'), post('B2'), post('B3')])),
    ])
    expect(sent.filter(q => q.startsWith('A'))).toHaveLength(2)
    expect(sent.filter(q => q.startsWith('B'))).toHaveLength(2)
    expect([a.sent, b.sent]).toEqual([2, 2])
  })

  it('no turn object (and no agent credit scope): refused, never let through', async () => {
    capOn('3')
    expect(await post('orphan')).toBeNull()
    expect(sent).toHaveLength(0)
    expect(requestCapTotals().refused).toEqual({ no_turn_scope: 1 })
  })

  it('a refused request reports not_sent (the caller sees what happened) and is counted in the ledger as refused', async () => {
    capOn('1'); const turn = createRequestCapTurn()!
    const states: string[] = []
    await runWithRequestCapTurn(turn, async () => {
      await serperPost('search', 'k', { q: 'r1' }, 2000, { report: s => states.push(s) })
      await serperPost('search', 'k', { q: 'r2' }, 2000, { report: s => states.push(s) })
    })
    expect(states).toEqual(['sent_ok', 'not_sent'])
    expect(sent).toEqual(['r1'])
  })

  it('refusal is VISIBLE: a structured log line per refusal and one ERROR alert per reason', async () => {
    capOn('1'); const turn = createRequestCapTurn()!
    await runWithRequestCapTurn(turn, async () => { await post('v1'); await post('v2'); await post('v3') })
    const lines = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0])).filter(l => l.includes('tappyai_serper_request_cap"'))
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toMatchObject({ refused: true, reason: 'turn_cap', turn: turn.id, sent: 1, limit: 1 })
    const alerts = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0])).filter(l => l.includes('serper_request_cap_refused'))
    expect(alerts).toHaveLength(1)
  })
})

describe('what counts, what does not', () => {
  it('a request that the credit scope refuses AFTER the reservation gives the reservation back (it was never sent)', async () => {
    capOn('2'); const turn = createRequestCapTurn()!
    await runWithRequestCapTurn(turn, async () => {
      // A credit scope of 1: the first search (1 credit) passes, the second is refused by it — after the cap reserved it.
      const inner = await withSerperTurnBudget(1, async () => [await post('c1'), await post('c2')])
      expect(inner.value.map(x => x !== null)).toEqual([true, false])
      expect(turn.sent).toBe(1) // c2's reservation went back
      expect(await post('c3')).not.toBeNull() // so the second slot is still free
      expect(await post('c4')).toBeNull() // and now the cap is really spent
    })
    expect(sent).toEqual(['c1', 'c3'])
    expect(turn.sent).toBe(2)
  })

  it('every later refusal that proves the request was NOT sent gives the reservation back — ticket denied after admit, spend gate, cancelled before send, body not built', async () => {
    capOn('2'); const turn = createRequestCapTurn()!
    // (1) a web ticket taken by a parallel W request while this one waited on the daily counter: refused AFTER admit
    vi.stubEnv('TURN_WEB_TICKET', '1')
    const ticket = createTurnWebTicket(1)
    const w = await runWithTurnWebTicket(ticket, () => runWithRequestCapTurn(turn, () => Promise.all([
      serperPost('search', 'k', { q: 'w1' }, 2000, { purpose: 'W' }), serperPost('search', 'k', { q: 'w2' }, 2000, { purpose: 'W' }),
    ])))
    expect(w.filter(x => x !== null)).toHaveLength(1)
    expect(sent).toHaveLength(1)
    expect(turn.sent).toBe(1) // the loser's reservation went back
    vi.unstubAllEnvs(); vi.stubEnv('SERPER_API_KEY', 'test-key-not-real'); capOn('2')
    // (2) the spend gate refuses (no gate in scope while BENCH_SPEND_GATE is on → `no_gate`): after admit, before send
    const t2 = createRequestCapTurn()!
    vi.stubEnv('BENCH_SPEND_GATE', '1'); vi.stubEnv('BENCH_SPEND_TURN_CAP_USD', '0.05'); vi.stubEnv('BENCH_SPEND_RUN_CAP_USD', '0.10'); vi.stubEnv('BENCH_CONFIRM_SPEND', '0.10')
    const before = sent.length
    expect(await runWithRequestCapTurn(t2, () => post('gated'))).toBeNull()
    expect(sent.length).toBe(before)
    expect(t2.sent).toBe(0)
    vi.unstubAllEnvs(); vi.stubEnv('SERPER_API_KEY', 'test-key-not-real'); capOn('2')
    // (3) cancelled between the reservation and the send (the runtime aborts the tool invocation)
    const t3 = createRequestCapTurn()!
    const ctrl = new AbortController()
    const cancelled = await runWithRequestCapTurn(t3, () => withSerperToolScope(5, ctrl.signal, async () => { const p = post('cancelled'); ctrl.abort(); return p }))
    expect(cancelled.value).toBeNull()
    expect(t3.sent).toBe(0)
    // (4) the body cannot be built (JSON.stringify throws): fetch is never called
    const t4 = createRequestCapTurn()!
    await expect(runWithRequestCapTurn(t4, () => serperPost('search', 'k', { q: BigInt(1) as unknown as string }, 2000))).rejects.toThrow()
    expect(t4.sent).toBe(0)
    expect(sent.filter(q => q === 'gated' || q === 'cancelled')).toHaveLength(0)
  })

  it('an UNEXPECTED throw from the spend gate (not a refusal) happens before the send: the reservation goes back and the error still reaches the caller', async () => {
    capOn('1'); const turn = createRequestCapTurn()!
    vi.stubEnv('BENCH_SPEND_GATE', '1'); vi.stubEnv('BENCH_SPEND_TURN_CAP_USD', '0.05'); vi.stubEnv('BENCH_SPEND_RUN_CAP_USD', '0.65')
    const gate = { reserve: () => { throw new Error('gate exploded') }, settle: () => 'ok' as const, release: () => undefined, markUnknown: () => undefined }
    await expect(runWithSpendGate(gate, () => runWithRequestCapTurn(turn, () => post('exploding gate')))).rejects.toThrow('gate exploded')
    expect(turn.sent).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('the agent-scope branch (no turn, a finite credit scope) also gives its reservation back: a refusal by the credit scope frees the L2 slot', async () => {
    capOn('1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '2'); beginRequestCapRun()
    await withSerperTurnBudget(1, async () => {
      expect(await post('agent one')).not.toBeNull()
      expect(requestCapRunState()!.sent).toBe(1)
      expect(await post('agent two')).toBeNull() // refused by the credit scope AFTER the cap reserved it
      expect(requestCapRunState()!.sent).toBe(1) // given back
    })
    expect(sent).toEqual(['agent one'])
    const direct = await withSerperTurnBudget(8, async () => { const r = reserveRequest('search'); const during = requestCapRunState()!.sent; if (r.ok) { r.release(); r.release() } return { during, after: requestCapRunState()!.sent } })
    expect(direct.value).toEqual({ during: 2, after: 1 })
  })

  it('an HTTP error answer (non-2xx) keeps the reservation: the request was sent', async () => {
    capOn('1'); const turn = createRequestCapTurn()!
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => { if (String(input).includes('google.serper.dev')) { sent.push('http500'); return new Response('{}', { status: 500 }) } throw new Error('x') }))
    await runWithRequestCapTurn(turn, async () => {
      const r = await post('http500')
      expect(r?.status).toBe(500)
      expect(turn.sent).toBe(1)
      expect(await post('after 500')).toBeNull()
    })
    expect(sent).toEqual(['http500'])
  })

  it('release is idempotent: giving a reservation back twice frees one slot, not two', () => {
    capOn('2'); const turn = createRequestCapTurn()!
    const res = runWithRequestCapTurn(turn, () => reserveRequest('search'))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const second = runWithRequestCapTurn(turn, () => reserveRequest('search'))
    expect(turn.sent).toBe(2)
    res.release(); res.release()
    expect(turn.sent).toBe(1)
    expect(second.ok).toBe(true)
  })

  it('a request that TIMES OUT after it was sent keeps its reservation (the provider may have processed it)', async () => {
    capOn('1'); const turn = createRequestCapTurn()!
    stubFetch(80)
    await runWithRequestCapTurn(turn, async () => {
      await expect(post('slow', 5)).rejects.toThrow('timeout')
      expect(turn.sent).toBe(1)
      expect(await post('after timeout')).toBeNull()
    })
    expect(sent).toEqual(['slow'])
  })

  it('a request whose fetch REJECTS (network error) keeps its reservation too', async () => {
    capOn('1'); const turn = createRequestCapTurn()!
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => { if (String(input).includes('google.serper.dev')) { sent.push('boom'); throw new Error('fetch failed') } throw new Error('x') }))
    await runWithRequestCapTurn(turn, async () => {
      await expect(post('boom')).rejects.toThrow('fetch failed')
      expect(turn.sent).toBe(1)
      expect(await post('next')).toBeNull()
    })
    expect(sent).toEqual(['boom'])
  })

  it('cache hit and single-flight follower send nothing and are not counted; the leader counts once', async () => {
    capOn('5'); const turn = createRequestCapTurn()!
    await runWithRequestCapTurn(turn, async () => {
      const [a, b] = await Promise.all([serperSearch('same flight query'), serperSearch('same flight query')])
      expect(a).not.toBeNull(); expect(b).not.toBeNull()
      expect(sent).toHaveLength(1)
      expect(turn.sent).toBe(1)
      const c = await serperSearch('same flight query') // L1 cache hit
      expect(c).not.toBeNull()
      expect(sent).toHaveLength(1)
      expect(turn.sent).toBe(1)
    })
  })

  it('the real web_search function (purpose W): the first query is sent and counted; the second DISTINCT query is refused for the cap and gets the honest "unavailable" answer, not an invented one', async () => {
    capOn('1'); const turn = createRequestCapTurn()!
    const [a, b] = await runWithRequestCapTurn(turn, async () => [await webSearch('alpha unique query', 'vi') as Record<string, unknown>, await webSearch('beta unique query', 'vi') as Record<string, unknown>])
    expect(sent).toEqual(['alpha unique query'])
    expect(a.source).toBe('Google (Serper)')
    expect(b.source).not.toBe('Google (Serper)')
    expect(Array.isArray(b.results) ? (b.results as unknown[]).length : 0).toBe(0)
    expect(turn.sent).toBe(1)
    expect(turn.refusals).toEqual({ turn_cap: 1 })
  })

  it('RETRY: each request that is really sent counts — the same query posted twice is two reservations', async () => {
    capOn('2'); const turn = createRequestCapTurn()!
    await runWithRequestCapTurn(turn, async () => { await post('again'); await post('again'); expect(await post('again')).toBeNull() })
    expect(sent).toEqual(['again', 'again'])
  })

  it('a leader refused by its OWN turn cap hands its follower (another turn, which had room) nothing — pinned limitation, not a wanted behaviour', async () => {
    capOn('1')
    const spent = createRequestCapTurn()!; const roomy = createRequestCapTurn()!
    await runWithRequestCapTurn(spent, () => post('use up the single slot'))
    const [lead, follow] = await Promise.all([
      runWithRequestCapTurn(spent, () => serperSearch('contended query')),
      // Same tick as the leader: it registers as a follower of the leader's flight instead of sending.
      runWithRequestCapTurn(roomy, () => serperSearch('contended query')),
    ])
    expect(lead).toBeNull()
    expect(follow).toBeNull() // observed: it shared the leader's refusal; nothing was sent for it either
    expect(sent).toEqual(['use up the single slot'])
    expect(roomy.sent).toBe(0)
  })
})

describe('closed turn: requests that start after the turn ended are refused', () => {
  it('after closeRequestCapTurn a new request is refused (turn_closed); one already in flight is not cut', async () => {
    capOn('5'); const turn = createRequestCapTurn()!
    stubFetch(30)
    const inflight = runWithRequestCapTurn(turn, () => post('inflight'))
    await sleep(5)
    closeRequestCapTurn(turn)
    expect(await runWithRequestCapTurn(turn, () => post('late'))).toBeNull()
    expect(await inflight).not.toBeNull()
    expect(sent).toEqual(['inflight'])
    expect(turn.refusals).toEqual({ turn_closed: 1 })
  })
  it('fire-and-forget work that starts after the turn is closed (a timer) is refused', async () => {
    capOn('5'); const turn = createRequestCapTurn()!
    let late: Response | null | undefined
    const done = runWithRequestCapTurn(turn, async () => { setTimeout(() => { post('timer late').then(r => { late = r }) }, 25) })
    await done
    closeRequestCapTurn(turn)
    await sleep(60)
    expect(late).toBeNull()
    expect(sent).toHaveLength(0)
  })
  it('closing is idempotent and logs the turn summary once', () => {
    capOn('5'); const turn = createRequestCapTurn()!
    closeRequestCapTurn(turn); closeRequestCapTurn(turn)
    const lines = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0])).filter(l => l.includes('tappyai_serper_request_cap_turn'))
    expect(lines).toHaveLength(1)
  })
})

describe('L2 · bench run total (one process)', () => {
  it('a run total below the sum of the turn caps stops the run even though the turn has room (run_cap)', async () => {
    capOn('2'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '3')
    expect(beginRequestCapRun()).toEqual({ ok: true, limit: 3 })
    const a = createRequestCapTurn()!; const b = createRequestCapTurn()!
    await runWithRequestCapTurn(a, async () => { await post('a1'); await post('a2') })
    await runWithRequestCapTurn(b, async () => { await post('b1'); expect(await post('b2')).toBeNull() })
    expect(sent).toEqual(['a1', 'a2', 'b1'])
    expect(b.sent).toBe(1) // the turn had room: it was the RUN that said no
    expect(requestCapRunState()).toEqual({ limit: 3, sent: 3, refused: 1 })
    expect(endRequestCapRun()).toEqual({ limit: 3, sent: 3, refused: 1 })
    expect(requestCapRunState()).toBeNull()
  })
  it('a run total larger than a turn cap is valid (no forced relation); the turn cap still binds', async () => {
    capOn('2'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '50')
    expect(beginRequestCapRun().ok).toBe(true)
    const a = createRequestCapTurn()!
    await runWithRequestCapTurn(a, async () => { for (let i = 0; i < 5; i++) await post('n' + i) })
    expect(sent).toHaveLength(2)
  })
  it.each([undefined, '', '0', '-1', '2.5', 'x', '5001'])('flag ON + PER_RUN=%j: the run refuses to start and every request is refused (run_config_invalid)', async (v) => {
    capOn('3'); if (v !== undefined) vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', v)
    const r = beginRequestCapRun()
    expect(r.ok).toBe(false)
    const turn = createRequestCapTurn()!
    expect(await runWithRequestCapTurn(turn, () => post('nope'))).toBeNull()
    expect(sent).toHaveLength(0)
    expect(requestCapTotals().refused.run_config_invalid).toBe(1)
  })
  it('flag OFF: beginRequestCapRun starts nothing', () => {
    expect(beginRequestCapRun()).toEqual({ ok: true, limit: null })
    expect(requestCapRunState()).toBeNull()
  })
  it('the run value is NOT applied outside a bench run: with no run begun, only L1 binds (production never inherits an L2 total)', async () => {
    capOn('3'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '1')
    const a = createRequestCapTurn()!
    await runWithRequestCapTurn(a, async () => { await post('p1'); await post('p2'); await post('p3') })
    expect(sent).toHaveLength(3)
  })
  it('a reservation given back (credit scope refused it) is given back on the run total as well', async () => {
    capOn('5'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '2'); beginRequestCapRun()
    const turn = createRequestCapTurn()!
    await runWithRequestCapTurn(turn, async () => {
      await withSerperTurnBudget(1, async () => { await post('g1'); await post('g2') }) // g2: refused by the credit scope after reserving
      expect(requestCapRunState()!.sent).toBe(1)
      expect(await post('g3')).not.toBeNull()
      expect(await post('g4')).toBeNull() // run total 2 is spent
    })
    expect(sent).toEqual(['g1', 'g3'])
  })
})

describe('the bounded agent keeps its own credit scope', () => {
  it('no turn object but inside an agent credit scope: admitted, counted on L2 only', async () => {
    capOn('1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '2'); beginRequestCapRun()
    const r = await withSerperTurnBudget(8, async () => [await post('ag1'), await post('ag2'), await post('ag3')])
    expect(r.value.map(x => x !== null)).toEqual([true, true, false]) // third: L2 total 2
    expect(sent).toEqual(['ag1', 'ag2'])
    expect(requestCapRunState()!.sent).toBe(2)
  })
})

describe('the unbounded scope of a single-flight leader is NOT a credit scope that admits (found pre-baseline: it let every unwrapped serperSearch caller through)', () => {
  it('serperSearch (it goes through serperFlight, which wraps the leader in a MAX_SAFE_INTEGER scope) outside any turn and any bounded scope: refused, nothing sent', async () => {
    capOn('5')
    const rows = await serperSearch('an unwrapped caller of the search helper')
    expect(rows).toBeNull()
    expect(sent).toHaveLength(0)
    expect(requestCapTotals().refused.no_turn_scope).toBe(1)
  })
  it('the same call inside a FINITE agent scope is admitted (no turn; counted on L2 only)', async () => {
    capOn('1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '9'); beginRequestCapRun()
    const r = await withSerperTurnBudget(8, () => serperSearch('an agent turn search'))
    expect(r.value).not.toBeNull()
    expect(sent).toEqual(['an agent turn search'])
    expect(requestCapRunState()!.sent).toBe(1)
  })
  it('a finite tool scope (withSerperToolBudget) around the same call also admits it; the L2 total still binds', async () => {
    capOn('1'); vi.stubEnv('CONSULT_REQUEST_CAP_PER_RUN', '1'); beginRequestCapRun()
    const a = await withSerperToolBudget(4, () => serperSearch('tool scope one'))
    const b = await withSerperToolBudget(4, () => serperSearch('tool scope two'))
    expect(a.value).not.toBeNull()
    expect(b.value).toBeNull()
    expect(sent).toEqual(['tool scope one'])
    expect(requestCapTotals().refused.run_cap).toBe(1)
  })
  it('inside a turn the turn decides (a flight scope does not change the count): 3 distinct searches, cap 2 → 2 sent', async () => {
    capOn('2'); const turn = createRequestCapTurn()!
    await runWithRequestCapTurn(turn, async () => { await serperSearch('flight one'); await serperSearch('flight two'); await serperSearch('flight three') })
    expect(sent).toEqual(['flight one', 'flight two'])
    expect(turn.sent).toBe(2)
    expect(requestCapTotals().refused).toEqual({ turn_cap: 1 })
  })
})

describe('entry points: the turn object travels with execute(); anything that is not wrapped is refused, not unbounded', () => {
  const makeTools = () => ({
    t: { execute: async (n: number) => { const out: Array<Response | null> = []; for (let i = 0; i < n; i++) out.push(await post('tool ' + i)); return out } },
    par: { execute: async (n: number) => Promise.all(Array.from({ length: n }, (_, i) => post('par ' + i))) },
    timer: { execute: async () => new Promise<Response | null>(res => setTimeout(() => { post('timer q').then(res) }, 5)) },
  })

  it('wrapped execute: counts from Promise.all and from a timer, and a CONSUMER-driven pull (no scope at the consumer) still carries the turn', async () => {
    capOn('4'); const turn = createRequestCapTurn()!
    const tools = wrapToolsWithRequestCap(makeTools(), turn)
    // The consumer reads outside any scope; the tool call happens inside pull().
    const stream = new ReadableStream<number>({ async pull(c) { await tools.par.execute(3); await tools.timer.execute(); c.enqueue(1); c.close() } })
    const reader = stream.getReader()
    await reader.read()
    expect(sent).toHaveLength(4)
    expect(turn.sent).toBe(4)
    expect(turn.refused).toBe(0)
    await tools.t.execute(2) // limit 4 is spent: both refused
    expect(sent).toHaveLength(4)
    expect(turn.refused).toBe(2)
  })

  it('an UNWRAPPED function called from a consumer-driven pull has no turn: refused (fail-closed), nothing sent', async () => {
    capOn('4')
    const tools = makeTools() // not wrapped
    const stream = new ReadableStream<number>({ async pull(c) { await tools.par.execute(3); c.enqueue(1); c.close() } })
    await stream.getReader().read()
    expect(sent).toHaveLength(0)
    expect(requestCapTotals().refused.no_turn_scope).toBe(3)
  })

  it('wrapToolsWithRequestCap returns the same object and wraps only functions (like the web-ticket wrapper)', () => {
    capOn('4'); const turn = createRequestCapTurn()!
    const tools = { a: { execute: async () => 1 }, b: { notATool: true } }
    expect(wrapToolsWithRequestCap(tools, turn)).toBe(tools)
    expect(tools.b).toEqual({ notATool: true })
  })
})
