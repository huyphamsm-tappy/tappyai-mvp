// @vitest-environment node
// Wave 2C · CONSULT_TRACE_DIAGNOSTICS (default OFF): the flag, the trace id, the six tool states, the preview limits and the scrubbing. MOCK ONLY: no network, no key; every secret-looking value is fake.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { consultTraceDiagnosticsOn, isProductionRuntime } from '@/lib/config/consultFlags'
import { createTurnTrace, safeUrl, scrubText, summarizeToolArgs, summarizeToolResult, traceCallBy, traceToolsInner, traceToolsOuter, TRACE_ID_HEADER, type TurnTrace } from './traceDiagnostics'
import { recordSerperCall, setSerperCallObserver } from '@/lib/ai/tools/serperMeter'

// Wave 2H (F4-1): the real setSerperCallObserver, wrapped in a spy, so a test can say "the trace did NOT touch the request path's listener"
vi.mock('@/lib/ai/tools/serperMeter', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/serperMeter')>()
  return { ...real, setSerperCallObserver: vi.fn(real.setSerperCallObserver) }
})

const ON = { CONSULT_TRACE_DIAGNOSTICS: '1', NODE_ENV: 'test' }
const lines: Array<Record<string, unknown>> = []
const mk = (headers?: Record<string, string>, env: Record<string, string | undefined> = ON): TurnTrace | null => {
  lines.length = 0
  return createTurnTrace(headers ? { get: (n: string) => headers[n] ?? null } : undefined, env, () => 1000, l => lines.push(JSON.parse(l)))
}
const toolEvents = () => lines.filter(l => l.ev === 'tool')
const states = () => toolEvents().map(l => `${l.tool}:${l.state}`)

describe('the flag', () => {
  it('is ON only for exactly "1", and never in a production runtime', () => {
    for (const v of [undefined, '', '0', 'true', 'on', ' 1', '1 ', 'yes']) expect(consultTraceDiagnosticsOn({ CONSULT_TRACE_DIAGNOSTICS: v, NODE_ENV: 'test' }), String(v)).toBe(false)
    expect(consultTraceDiagnosticsOn({ CONSULT_TRACE_DIAGNOSTICS: '1', NODE_ENV: 'test' })).toBe(true)
    expect(consultTraceDiagnosticsOn({ CONSULT_TRACE_DIAGNOSTICS: '1', NODE_ENV: 'development' })).toBe(true)
    expect(consultTraceDiagnosticsOn({ CONSULT_TRACE_DIAGNOSTICS: '1' })).toBe(true)
    expect(consultTraceDiagnosticsOn({ CONSULT_TRACE_DIAGNOSTICS: '1', NODE_ENV: 'production' })).toBe(false)
    expect(consultTraceDiagnosticsOn({ CONSULT_TRACE_DIAGNOSTICS: '1', NODE_ENV: 'test', VERCEL_ENV: 'production' })).toBe(false)
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true)
  })
  it('OFF (or production): no trace object, wrappers return their input untouched, nothing is logged', () => {
    for (const env of [{}, { CONSULT_TRACE_DIAGNOSTICS: '0' }, { CONSULT_TRACE_DIAGNOSTICS: '1', NODE_ENV: 'production' }]) {
      expect(createTurnTrace({ get: () => 'E1' }, env, () => 0, () => { throw new Error('logged while OFF') })).toBeNull()
    }
    const tools = { a: { execute: async () => 1 } }
    expect(traceToolsInner(tools, null)).toBe(tools)
    expect(traceToolsOuter(tools, null)).toBe(tools)
    expect(tools.a.execute.toString()).toContain('1') // not replaced
  })
})

describe('the trace id', () => {
  it('is the benchmark turn id from the header when it is a plain identifier; otherwise generated (never the header text)', () => {
    expect(mk({ [TRACE_ID_HEADER]: 'X1-3' })!.traceId).toBe('X1-3')
    const t = mk({ [TRACE_ID_HEADER]: 'E1' })!; t.emit('x'); expect(lines[0]).toMatchObject({ type: 'tappyai_trace', ev: 'x', traceId: 'E1', seq: 1 })
    for (const bad of ['a b', '<script>', 'x'.repeat(41), '-lead', '', 'sk-abcdef1234567890']) {
      const g = mk({ [TRACE_ID_HEADER]: bad })!
      expect(g.traceId, bad).toMatch(/^t-[0-9a-f]{8}$/); expect(g.idSource).toBe('generated')
    }
    expect(mk()!.idSource).toBe('generated')
  })
  it('numbers its lines in order and two turns never share an id or a counter', () => {
    const a = mk({ [TRACE_ID_HEADER]: 'E1' })!; a.emit('p'); a.emit('q'); const aLines = [...lines]
    const b = mk({ [TRACE_ID_HEADER]: 'E2' })!; b.emit('p')
    expect(aLines.map(l => l.seq)).toEqual([1, 2]); expect(lines.map(l => [l.traceId, l.seq])).toEqual([['E2', 1]])
    expect(a.nextCall()).toBe(1); expect(a.nextCall()).toBe(2); expect(b.nextCall()).toBe(1)
  })
})

describe('summarizeToolResult: the shape, never the body', () => {
  it('results: rows, provider, a bounded preview (name, host+path, rating, reviews, price only)', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ title: `Quan ${i}`, link: `https://shop.example.vn/p/${i}?utm_source=x&token=abc#frag`, snippet: 'A long snippet that must never be logged '.repeat(10), rating: 4.5, reviewCount: 12, price: '100k', address: '1 Nguyen Hue, Quan 1', phone: '0901234567' }))
    const s = summarizeToolResult({ source: 'Google (Serper)', results: rows })
    expect(s).toMatchObject({ outcome: 'results', rows: 6, provider: 'serper', lookup: 'completed', errorKind: null })
    expect(s.preview).toHaveLength(3)
    expect(s.preview[0]).toEqual({ name: 'Quan 0', url: 'shop.example.vn/p/0', rating: 4.5, reviews: 12, price: '100k' })
    expect(JSON.stringify(s)).not.toMatch(/snippet|utm_|token=|frag|Nguyen Hue|0901234567|A long snippet/)
  })
  it('empty: a provider answered with no rows (completed lookup, not an error)', () => {
    expect(summarizeToolResult({ note: 'khong co ket qua', results: [], search_url: 'https://duckduckgo.com/?q=x' })).toMatchObject({ outcome: 'empty', rows: 0, lookup: 'completed', errorKind: null, hasNote: true })
  })
  it('error: a provider failure is an error, not an empty result; no_current_location is an error that looked nothing up', () => {
    expect(summarizeToolResult({ note: 'unavailable', results: [], provider_status: 'error' })).toMatchObject({ outcome: 'error', errorKind: 'provider_status_error', lookup: 'failed' })
    expect(summarizeToolResult({ error: 'no_current_location', note: 'Chua co vi tri' })).toMatchObject({ outcome: 'error', errorKind: 'no_current_location', lookup: 'not_attempted', rows: null })
  })
  it('blocked: search_budget_used is its own outcome and never a lookup', () => {
    expect(summarizeToolResult({ error: 'search_budget_used', note: 'Het luot tim' })).toMatchObject({ outcome: 'blocked', lookup: 'not_attempted', errorKind: 'search_budget_used' })
  })
  it('a result that is an object with no row list: results when it holds data, empty when only a note; null is empty', () => {
    expect(summarizeToolResult({ temp: 30, text: 'nang' })).toMatchObject({ outcome: 'results', rows: null })
    expect(summarizeToolResult({ note: 'x', search_url: 'u' })).toMatchObject({ outcome: 'empty' })
    expect(summarizeToolResult(null)).toMatchObject({ outcome: 'empty', errorKind: 'no_result' })
  })
})

describe('scrubbing and limits', () => {
  it('removes key / token / e-mail / phone shapes and cuts long strings', () => {
    const dirty = 'key sk-test1234567890abcdef and Bearer abcdefghijklmnop12 and token=abc123 and a@b.vn and 0901234567 and ' + 'A'.repeat(40) + ' and https://user:pw@host.vn/x'
    const s = scrubText(dirty, 400)
    expect(s).not.toMatch(/sk-test1234567890abcdef|abcdefghijklmnop12|abc123|a@b\.vn|0901234567|A{33}|user:pw/)
    expect(scrubText('x'.repeat(500)).length).toBeLessThanOrEqual(160)
  })
  it('safeUrl keeps host + path only', () => {
    expect(safeUrl('https://www.example.vn/a/b?utm_source=z&x=1#top')).toBe('www.example.vn/a/b')
    expect(safeUrl('https://user:pw@example.vn/')).toBe('example.vn')
    expect(safeUrl('')).toBeNull(); expect(safeUrl(42)).toBeNull()
  })
  it('summarizeToolArgs keeps the useful fields, scrubbed, and only names the rest', () => {
    expect(summarizeToolArgs({ query: 'pho sk-test1234567890abcdef', location: 'Quan 3', secret: 'x', other: 1 })).toEqual({ query: 'pho [redacted]', location: 'Quan 3', otherArgs: ['secret', 'other'] })
  })
  it('a whole emitted line never holds a secret-shaped value or a long string', () => {
    const t = mk({ [TRACE_ID_HEADER]: 'E1' })!
    t.emit('probe', { note: 'sk-test1234567890abcdef ' + 'z'.repeat(400), nested: { a: 'Bearer abcdefghijklmnop12' } })
    const raw = JSON.stringify(lines[0])
    expect(raw).not.toMatch(/sk-test1234567890abcdef|abcdefghijklmnop12/); expect(raw.length).toBeLessThan(600)
  })
})

describe('the six tool states (real wrappers, fake tools)', () => {
  const run = async (tools: Record<string, { execute: (a: unknown, c?: unknown) => unknown }>, trace: TurnTrace, call: string, args: unknown = { query: 'q' }): Promise<unknown> => {
    const outer = traceToolsOuter(traceToolsInner(tools, trace), trace) as typeof tools
    return outer[call].execute(args, {})
  }
  it('requested → executed → results, with the result summary', async () => {
    const t = mk({ [TRACE_ID_HEADER]: 'E1' })!
    const r = await run({ search_places: { execute: async () => ({ source: 'Google (Serper)', results: [{ name: 'A', rating: 4 }] }) } }, t, 'search_places')
    expect(r).toEqual({ source: 'Google (Serper)', results: [{ name: 'A', rating: 4 }] }) // the very same value
    expect(states()).toEqual(['search_places:requested', 'search_places:executed', 'search_places:results'])
    expect(toolEvents()[0]).toMatchObject({ by: 'model', call: 1 }); expect(toolEvents()[2]).toMatchObject({ rows: 1, provider: 'serper', call: 1 })
    expect(t.counters).toMatchObject({ requested: 1, executed: 1, results: 1, empty: 0, error: 0, blocked: 0 })
  })
  it('executed with no rows → empty (not an error, not results)', async () => {
    const t = mk()!
    await run({ web_search: { execute: async () => ({ note: 'n', results: [], search_url: 'u' }) } }, t, 'web_search')
    expect(states()).toEqual(['web_search:requested', 'web_search:executed', 'web_search:empty']); expect(t.counters).toMatchObject({ empty: 1, results: 0 })
  })
  it('executed and failed → error; a thrown error is an error and is rethrown unchanged', async () => {
    const t = mk()!
    await run({ web_search: { execute: async () => ({ note: 'down', results: [], provider_status: 'error' }) } }, t, 'web_search')
    expect(states()).toEqual(['web_search:requested', 'web_search:executed', 'web_search:error'])
    const boom = new Error('boom')
    const t2 = mk()!
    await expect(run({ web_search: { execute: async () => { throw boom } } }, t2, 'web_search')).rejects.toBe(boom)
    expect(states()).toEqual(['web_search:requested', 'web_search:executed', 'web_search:error']); expect(toolEvents()[2]).toMatchObject({ errorKind: 'threw', lookup: 'failed' })
  })
  it('no_current_location is an ERROR that looked nothing up: never "results", lookup not_attempted', async () => {
    const t = mk()!
    await run({ search_places: { execute: async () => ({ error: 'no_current_location', note: 'x' }) } }, t, 'search_places')
    expect(states()).toEqual(['search_places:requested', 'search_places:executed', 'search_places:error'])
    expect(toolEvents()[2]).toMatchObject({ errorKind: 'no_current_location', lookup: 'not_attempted', rows: null }); expect(t.counters.results).toBe(0)
  })
  it('a guard that answers search_budget_used before the tool body runs → blocked, never executed, never a provider request', async () => {
    const t = mk()!
    let bodyRan = false
    const inner = traceToolsInner({ web_search: { execute: async (_a?: unknown) => { bodyRan = true; return { results: [{ name: 'x' }] } } } }, t)
    const guarded = { web_search: { ...inner.web_search, execute: (_a?: unknown) => Promise.resolve({ error: 'search_budget_used', note: 'het luot' }) } } // what finalSynthesisGuard does
    const outer = traceToolsOuter(guarded, t)
    const r = await outer.web_search.execute({ query: 'q' })
    expect(r).toEqual({ error: 'search_budget_used', note: 'het luot' }); expect(bodyRan).toBe(false)
    expect(states()).toEqual(['web_search:requested', 'web_search:blocked'])
    expect(toolEvents()[1]).toMatchObject({ reason: 'search_budget_used', reachedProvider: false, by: 'guard' })
    expect(t.counters).toMatchObject({ requested: 1, executed: 0, blocked: 1, results: 0 })
  })
  it('a code call (the pre-search) has no model request: it opens its own requested event with by "code"', async () => {
    const t = mk()!
    const inner = traceToolsInner({ search_places: { execute: async (_a?: unknown) => ({ source: 'Google (Serper)', results: [{ name: 'A' }] }) } }, t)
    await inner.search_places.execute({ query: 'x' })
    expect(toolEvents().map(l => `${l.state}:${l.by}`)).toEqual(['requested:code', 'executed:code', 'results:code'])
  })
  it('two parallel model calls keep their own call numbers (no cross-assignment)', async () => {
    const t = mk()!
    const slow = (ms: number, v: unknown) => async () => { await new Promise(r => setTimeout(r, ms)); return v }
    const outer = traceToolsOuter(traceToolsInner({ a: { execute: slow(20, { results: [1] }) }, b: { execute: slow(1, { results: [] }) } }, t), t) as Record<string, { execute: (a: unknown) => Promise<unknown> }>
    await Promise.all([outer.a.execute({}), outer.b.execute({})])
    const by = (call: number) => toolEvents().filter(l => l.call === call).map(l => `${l.tool}:${l.state}`)
    expect(by(1)).toEqual(['a:requested', 'a:executed', 'a:results']); expect(by(2)).toEqual(['b:requested', 'b:executed', 'b:empty'])
  })
  it('a synchronous tool result is returned as it is (same value, not a promise)', () => {
    const t = mk()!
    const inner = traceToolsInner({ s: { execute: (_a?: unknown) => ({ results: [1] }) } }, t)
    const r = inner.s.execute({})
    expect(r).toEqual({ results: [1] }); expect(typeof (r as { then?: unknown }).then).toBe('undefined')
  })
})

describe('Wave 2F · turn facts (M2-M5, M7): tool NAMES and counts of who called what', () => {
  const NO_LOC = { error: 'no_current_location', note: 'x' }
  const fresh = (sent: { n: number }) => {
    const t = mk()!
    // the bodies send their requests through the real meter (recordSerperCall), as serperClient does at the moment a request is sent; `sent` is the process-wide counter the cross-check reads
    const tools = { search_places: { execute: async (a?: unknown) => { for (let i = 0; i < 3; i++) { sent.n++; recordSerperCall('maps') } return (a as { noLoc?: boolean })?.noLoc ? NO_LOC : { source: 'Google (Serper)', results: [{ name: 'A' }] } } }, web_search: { execute: async (_a?: unknown) => { sent.n++; recordSerperCall('search'); return { results: [{ name: 'W' }] } } } }
    const inner = traceToolsInner(tools, t, () => sent.n)
    return { t, inner, outer: traceToolsOuter(inner, t) as typeof tools }
  }
  it('the names of the tools OFFERED to the answer model are recorded (names only), null until a tool set is offered', () => {
    const t0 = mk()!
    traceToolsInner({ search_places: { execute: async () => ({ results: [] }) } }, t0) // the inner layer alone offers nothing to anyone
    expect(t0.facts.toolsOffered).toBeNull()
    const sentB = { n: 0 }, b = fresh(sentB)
    expect(b.t.facts.toolsOffered).toEqual(['search_places', 'web_search'])
    expect(JSON.stringify(b.t.facts)).not.toMatch(/Serper|results/)
  })
  it('a call made by the answer model counts as the MODEL\'s (place calls, Serper requests it caused); a call the code makes counts as the CODE\'s', async () => {
    const sent = { n: 0 }, { t, inner, outer } = fresh(sent)
    await outer.search_places.execute({})
    await outer.web_search.execute({})
    await inner.search_places.execute({}) // the code's own pre-search: not inside a model request
    expect(t.facts).toMatchObject({ modelToolCalls: 2, modelPlaceCalls: 1, codePlaceCalls: 1, serperRequestsByModel: 4, serperRequestsByCode: 3, noLocationBy: null })
  })
  it('the first call that came back no_current_location names who made it (the one that makes the code ask for the area)', async () => {
    const m = fresh({ n: 0 })
    await m.outer.search_places.execute({ noLoc: true })
    await m.inner.search_places.execute({ noLoc: true })
    expect(m.t.facts.noLocationBy).toBe('model')
    const c = fresh({ n: 0 })
    await c.inner.search_places.execute({ noLoc: true })
    await c.outer.search_places.execute({ noLoc: true })
    expect(c.t.facts.noLocationBy).toBe('code')
  })
  it('with the trace OFF nothing is wrapped and no fact exists to write', () => {
    const tools = { search_places: { execute: async () => ({ results: [] }) } }
    expect(traceToolsOuter(tools, null)).toBe(tools)
    expect(traceToolsInner(tools, null)).toBe(tools)
    expect(mk({}, {})).toBeNull()
  })
})

describe('Wave 2G · F-3 / F-4 / F-7: a Serper request is charged to the call that SENT it; the body knows who called it; one convention for toolsOffered', () => {
  const tick = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
  /** A place-search body that sends `n` requests, one every few ms (like serperClient: the meter is told at the moment of sending), so that bodies started together overlap in time. */
  const body = (sent: { n: number }, n: number, o: { throws?: boolean; seen?: Array<'model' | 'code' | null> } = {}) => async (_a?: unknown) => {
    o.seen?.push(traceCallBy())
    for (let i = 0; i < n; i++) { await tick(3); sent.n++; recordSerperCall('maps') }
    if (o.throws) throw new Error('provider failed')
    return { source: 'Google (Serper)', results: [{ name: 'A' }] }
  }
  const newTrace = (out: Array<Record<string, unknown>>): TurnTrace => createTurnTrace(undefined, ON, () => 1000, l => out.push(JSON.parse(l)))!
  const outcomesOf = (out: Array<Record<string, unknown>>) => out.filter(l => l.ev === 'tool' && (l.state === 'results' || l.state === 'empty' || l.state === 'error') && l.tool === 'search_places')

  it('F-3: two search_places calls of the answer model that overlap in time - the turn total is the number of real requests (it was reported as double), and the process-wide difference is kept apart as a cross-check', async () => {
    const out: Array<Record<string, unknown>> = [], sent = { n: 0 }, t = newTrace(out)
    const inner = traceToolsInner({ search_places: { execute: body(sent, 1) } }, t, () => sent.n)
    const offered = traceToolsOuter(inner, t)
    await Promise.all([offered.search_places.execute({ q: 'a' }), offered.search_places.execute({ q: 'b' })])
    expect(sent.n).toBe(2) // two real requests
    expect(t.facts.serperRequestsByModel).toBe(2)
    expect(t.facts.serperRequestsByCode).toBe(0)
    expect(outcomesOf(out).map(l => l.serperRequests)).toEqual([1, 1]) // each call is charged its own
    // the process-wide difference of the call that started first sees the other call's request as well (2 for a call that sent 1): that is why it cannot be summed
    expect(Math.max(...outcomesOf(out).map(l => l.serperRequestsProcessDelta as number))).toBe(2)
  })
  it('F-3: sequential calls give the same total; a call of the code that overlaps two calls of the model is charged to the code', async () => {
    const out: Array<Record<string, unknown>> = [], sent = { n: 0 }, t = newTrace(out)
    const inner = traceToolsInner({ search_places: { execute: body(sent, 1) } }, t, () => sent.n)
    const offered = traceToolsOuter(inner, t)
    await offered.search_places.execute({}); await offered.search_places.execute({})
    expect(t.facts.serperRequestsByModel).toBe(2)
    await Promise.all([offered.search_places.execute({}), offered.search_places.execute({}), inner.search_places.execute({})])
    expect(sent.n).toBe(5)
    expect(t.facts).toMatchObject({ serperRequestsByModel: 4, serperRequestsByCode: 1, modelPlaceCalls: 4, codePlaceCalls: 1 })
  })
  it('F-3: two turns running at the same time do not add to each other', async () => {
    const outA: Array<Record<string, unknown>> = [], outB: Array<Record<string, unknown>> = [], sent = { n: 0 }
    const tA = newTrace(outA), tB = newTrace(outB)
    const offA = traceToolsOuter(traceToolsInner({ search_places: { execute: body(sent, 1) } }, tA, () => sent.n), tA)
    const offB = traceToolsOuter(traceToolsInner({ search_places: { execute: body(sent, 3) } }, tB, () => sent.n), tB)
    await Promise.all([offA.search_places.execute({}), offB.search_places.execute({})])
    expect(tA.facts.serperRequestsByModel).toBe(1)
    expect(tB.facts.serperRequestsByModel).toBe(3)
  })
  it('F-3: a body that sends a request and then throws still sent it', async () => {
    const out: Array<Record<string, unknown>> = [], sent = { n: 0 }, t = newTrace(out)
    const offered = traceToolsOuter(traceToolsInner({ search_places: { execute: body(sent, 2, { throws: true }) } }, t, () => sent.n), t)
    await expect(offered.search_places.execute({})).rejects.toThrow('provider failed')
    expect(t.facts.serperRequestsByModel).toBe(2)
  })
  it('F-4: inside the body, traceCallBy() is "model" for a request of the answer model, "code" for the code\'s own call, null when no trace wrapper runs the body', async () => {
    const out: Array<Record<string, unknown>> = [], sent = { n: 0 }, t = newTrace(out), seen: Array<'model' | 'code' | null> = []
    const inner = traceToolsInner({ search_places: { execute: body(sent, 0, { seen }) } }, t)
    const offered = traceToolsOuter(inner, t)
    await offered.search_places.execute({})
    await inner.search_places.execute({})
    expect(seen).toEqual(['model', 'code'])
    expect(traceCallBy()).toBeNull()
    const bare: Array<'model' | 'code' | null> = []
    await body(sent, 0, { seen: bare })() // not wrapped at all
    expect(bare).toEqual([null])
  })
  it('F-7: toolsOffered has ONE convention - the names of the offered tools, or null when the model got no tool set (an empty set is "no tool set"); [] never appears', () => {
    const out: Array<Record<string, unknown>> = [], t = newTrace(out)
    traceToolsOuter({} as Record<string, { execute?: () => void }>, t)
    expect(t.facts.toolsOffered).toBeNull()
    traceToolsOuter({ search_places: { execute: async () => ({ results: [] }) }, web_search: { execute: async () => ({ results: [] }) } }, t)
    expect(t.facts.toolsOffered).toEqual(['search_places', 'web_search'])
  })
})

describe('Wave 2H · F4-1: the trace and the request path\'s listener', () => {
  afterEach(() => { setSerperCallObserver(null); vi.mocked(setSerperCallObserver).mockClear() })
  const OFF_ENVS: Array<[string, Record<string, string | undefined>]> = [
    ['flag unset', {}], ['"0"', { CONSULT_TRACE_DIAGNOSTICS: '0' }], ['"true"', { CONSULT_TRACE_DIAGNOSTICS: 'true' }], ['" 1"', { CONSULT_TRACE_DIAGNOSTICS: ' 1' }], ['"1 "', { CONSULT_TRACE_DIAGNOSTICS: '1 ' }],
    ['production NODE_ENV', { CONSULT_TRACE_DIAGNOSTICS: '1', NODE_ENV: 'production' }], ['production VERCEL_ENV', { CONSULT_TRACE_DIAGNOSTICS: '1', NODE_ENV: 'test', VERCEL_ENV: 'production' }],
  ]
  it('trace OFF (every OFF value, and a production runtime with the flag "1"): createTurnTrace returns null, never calls setSerperCallObserver, and leaves a listener that is already there intact', () => {
    for (const [name, env] of OFF_ENVS) {
      let hits = 0
      const sentinel = () => { hits++ }
      setSerperCallObserver(sentinel); vi.mocked(setSerperCallObserver).mockClear()
      expect(createTurnTrace(undefined, env as never, () => 1, () => undefined), name).toBeNull()
      expect(setSerperCallObserver, name).not.toHaveBeenCalled()
      recordSerperCall('search')
      expect(hits, name).toBe(1) // the sentinel is still the listener
    }
  })
  it('trace ON registers the trace listener (the test above is not vacuous): the earlier listener is replaced', () => {
    let hits = 0
    setSerperCallObserver(() => { hits++ }); vi.mocked(setSerperCallObserver).mockClear()
    expect(createTurnTrace(undefined, ON, () => 1, () => undefined)).not.toBeNull()
    expect(setSerperCallObserver).toHaveBeenCalledTimes(1)
    recordSerperCall('search')
    expect(hits).toBe(0)
  })
  it('a listener that is still registered after a turn ended charges a request nobody sent from a wrapped body to no turn (no scope = no charge)', async () => {
    const out: Array<Record<string, unknown>> = [], mkTrace = () => createTurnTrace(undefined, ON, () => 1000, l => out.push(JSON.parse(l)))!
    const a = mkTrace(), b = mkTrace()
    const inner = traceToolsInner({ search_places: { execute: async (_a?: unknown) => { recordSerperCall('maps'); return { results: [{ name: 'x' }] } } } }, a)
    await inner.search_places.execute({}) // turn A sends one request; turn A is over
    recordSerperCall('maps'); recordSerperCall('search') // two requests outside every wrapped body, with the listener still registered
    expect(a.facts.serperRequestsByCode).toBe(1)
    expect(a.facts.serperRequestsByModel + b.facts.serperRequestsByModel + b.facts.serperRequestsByCode).toBe(0)
  })
})
