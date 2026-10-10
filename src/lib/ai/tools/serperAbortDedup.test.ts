// @vitest-environment node
// POST-COMMIT REVIEW A / B / C (09/10) — abort semantics, per-caller cancellation under dedup, precise error classification.
// Every test runs against a STUBBED fetch that honours `signal`: no network, no Serper, no credits.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { serperLedgerSnapshot, serperLedgerDelta } from './serperMeter'
import { serperPost, classifyThrown, __resetSerperAlerts } from './serperClient'
import { withSerperToolScope, withSerperTurnBudget } from './serperToolBudget'
import { serperSearch, fetchPlacePhotosByName, __clearToolCache } from './common'
import { withProductFallback } from '../agent/runtime/toolState'

let sent = 0
/** A fetch stub: answers after `delayMs`, rejects with AbortError the moment `signal` aborts (like undici). */
function stubFetch(o: { delayMs?: number; status?: number; body?: unknown; reject?: Error } = {}) {
  sent = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
    sent++
    if (o.reject) throw o.reject
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, o.delayMs ?? 0)
      init?.signal?.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })) }, { once: true })
      if (init?.signal?.aborted) { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) }
    })
    return new Response(JSON.stringify(o.body ?? { organic: [{ title: 'Kết quả', link: 'https://example.com/a', snippet: 's' }], credits: 1 }), { status: o.status ?? 200 })
  }))
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let n = 0
const uq = (s: string) => `${s} ${++n}-${Math.random().toString(36).slice(2, 7)}`
const prevKey = process.env.SERPER_API_KEY
beforeEach(() => { process.env.SERPER_API_KEY = 'test-key-not-real'; __clearToolCache(); __resetSerperAlerts() })
afterEach(() => { vi.unstubAllGlobals(); if (prevKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevKey })

// ── A ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('A · the runtime\'s cancellation reaches the requests inside search_products', () => {
  const ctx = { toolCallId: 't', messages: [] }
  it('runtime aborts EARLIER than the wrapper\'s own timeout, before the request is sent → nothing is sent, nothing reserved, no fallback', async () => {
    stubFetch()
    const outer = new AbortController()
    const fallback = vi.fn(async () => ({ results: [{ title: 'x' }] }))
    const events: unknown[] = []
    // like the real searchProducts: a refused / empty provider answer is the explicit `product_data: none` shape (state ERROR), never a bare null
    const exec = withProductFallback((async () => { await sleep(40); const r = await serperPost('search', 'k', { q: uq('late') }, 1000); return r ? { results: [{ title: 'x' }] } : { product_data: 'none', provider_status: 'error', links: [] } }) as never, fallback as never, { lang: 'vi', timeoutMs: 5000, onFallback: d => events.push(d) })
    const before = serperLedgerSnapshot()
    const r = await withSerperToolScope(8, outer.signal, async () => {
      const p = exec({ query: 'x' }, ctx)
      setTimeout(() => outer.abort(), 10)
      return await p
    })
    expect(sent).toBe(0)
    expect(r.spent).toBe(0)
    expect(fallback).not.toHaveBeenCalled()
    expect(events).toEqual([expect.objectContaining({ fallbackState: 'skipped_cancelled' })])
    expect(serperLedgerDelta(before).endpoints.search).toMatchObject({ attempted: 0, refused: 1 })
  })
  it('runtime aborts while the request is IN FLIGHT → it is aborted, the reservation is NOT released (the provider may have processed it), no fallback', async () => {
    stubFetch({ delayMs: 200 })
    const outer = new AbortController()
    const fallback = vi.fn(async () => ({}))
    const exec = withProductFallback((async () => await serperPost('search', 'k', { q: uq('inflight') }, 5000).catch(() => null)) as never, fallback as never, { lang: 'vi', timeoutMs: 5000 })
    const before = serperLedgerSnapshot()
    const r = await withSerperToolScope(8, outer.signal, async () => {
      const p = exec({ query: 'x' }, ctx)
      setTimeout(() => outer.abort(), 20)
      return await p
    })
    expect(sent).toBe(1)
    expect(r.spent).toBe(1) // reserved when sent, kept after the abort
    expect(fallback).not.toHaveBeenCalled()
    expect(serperLedgerDelta(before).endpoints.search).toMatchObject({ attempted: 1, aborted: 1, ok: 0 })
  })
  it('already-cancelled runtime: the provider call never starts a request; without a cancellation the fallback still runs as before', async () => {
    stubFetch()
    const outer = new AbortController(); outer.abort()
    const fb = vi.fn(async () => ({ results: [{ title: 'x', link: 'https://e.com' }] }))
    const mk = () => withProductFallback((async () => { await serperPost('search', 'k', { q: uq('x') }, 1000); throw new Error('boom') }) as never, fb as never, { lang: 'vi' })
    await withSerperToolScope(8, outer.signal, async () => await mk()({ query: 'x' }, ctx))
    expect(sent).toBe(0); expect(fb).not.toHaveBeenCalled()
    const live = await withSerperToolScope(8, new AbortController().signal, async () => await mk()({ query: 'x' }, ctx))
    expect(fb).toHaveBeenCalledTimes(1) // a provider ERROR with nobody cancelling → the B4 fallback is unchanged
    expect((live.value as { tool_state: string }).tool_state).toBe('ERROR')
  })
})

// ── B ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('B · dedup: one caller\'s cancellation never takes the shared result away from the others', () => {
  it('the leader is cancelled, a follower is not: the leader leaves at once with null, the follower gets the REAL result, ONE request, ledger ok', async () => {
    // TIMING IS RELATIVE, NOT ABSOLUTE (2026-10-10). The old assertion `leader exit < 50 ms from the start` measured two OS timers (a 5 ms sleep and a 15 ms abort timer, both rounded up to
    // the ~16 ms platform tick) against a 60 ms stub, and failed ~1 run in 10 on timer noise while the cancellation itself was correct (leader leaves in the SAME tick as the abort: 0 ms in 240/240
    // probe iterations; see docs/phase8/SERPER-ABORT-DEDUP-FLAKE-INVESTIGATION.md). What the test names is a RELATION: the leader's exit depends on its own abort, not on the shared request.
    // So the shared request is made slow (SHARED_MS) and the test asserts (a) the leader left within a small fraction of it AFTER its own abort, and (b) it left long BEFORE the follower
    // got the shared result. A leader that waited for the shared request (or cancelled late) fails both by a wide margin; scheduler noise of tens of ms cannot.
    const SHARED_MS = 600
    stubFetch({ delayMs: SHARED_MS })
    const q = uq('shared')
    const a = new AbortController()
    const before = serperLedgerSnapshot()
    let abortedAt = 0
    const leader = withSerperToolScope(8, a.signal, async () => { const v = await serperSearch(q); return { v, doneAt: Date.now() } })
    await sleep(5)
    const follower = serperSearch(q) // another turn, no cancellation
    setTimeout(() => { abortedAt = Date.now(); a.abort() }, 15)
    const l = (await leader).value
    const f = await follower
    const followerDoneAt = Date.now()
    expect(l.v).toBeNull()
    // (a) left right after its OWN abort. Measured from the abort callback to the leader's return — one tick apart, 0 ms in 240/240 probe iterations, so 60 ms is a wide noise margin that is NOT
    //     tied to any OS timer; a cancellation more than ~60 ms late (or one that waits for the shared result, >= ~SHARED_MS) fails.
    expect(l.doneAt - abortedAt).toBeLessThan(60)
    expect(followerDoneAt - l.doneAt).toBeGreaterThan(SHARED_MS * 0.4) // (b) and long before the shared result reached the follower
    expect(f).toEqual([expect.objectContaining({ title: 'Kết quả' })])
    expect(sent).toBe(1)
    expect(serperLedgerDelta(before).endpoints.search).toMatchObject({ attempted: 1, ok: 1, aborted: 0 })
  })
  it('the leader\'s scope still owns the reservation of the request it sent (a follower never spends)', async () => {
    stubFetch({ delayMs: 30 })
    const q = uq('spend')
    const leader = withSerperToolScope(8, new AbortController().signal, () => serperSearch(q))
    await sleep(5)
    const follower = withSerperToolScope(8, new AbortController().signal, () => serperSearch(q))
    const [l, f] = [await leader, await follower]
    expect(l.spent).toBe(1); expect(f.spent).toBe(0)
    expect(sent).toBe(1)
  })
  it('EVERY caller cancelled → the underlying request is aborted (ledger aborted, one request); each caller leaves with null', async () => {
    stubFetch({ delayMs: 200 })
    const q = uq('allgone')
    const a = new AbortController(), b = new AbortController()
    const before = serperLedgerSnapshot()
    const p1 = withSerperToolScope(8, a.signal, () => serperSearch(q))
    await sleep(5)
    const p2 = withSerperToolScope(8, b.signal, () => serperSearch(q))
    setTimeout(() => a.abort(), 15)
    setTimeout(() => b.abort(), 30)
    const [r1, r2] = [await p1, await p2]
    expect(r1.value).toBeNull(); expect(r2.value).toBeNull()
    await sleep(30)
    expect(sent).toBe(1)
    expect(serperLedgerDelta(before).endpoints.search).toMatchObject({ attempted: 1, aborted: 1, ok: 0 })
  })
  it('the underlying request is NOT aborted while one caller (even without any signal) still needs it', async () => {
    stubFetch({ delayMs: 80 })
    const q = uq('stillneeded')
    const a = new AbortController()
    const p1 = withSerperToolScope(8, a.signal, () => serperSearch(q))
    await sleep(5)
    const noSignal = serperSearch(q)
    a.abort()
    expect((await p1).value).toBeNull()
    expect(await noSignal).not.toBeNull()
  })
  it('a caller arriving after everyone left starts a FRESH request instead of joining the cancelled one', async () => {
    stubFetch({ delayMs: 100 })
    const q = uq('late-joiner')
    const a = new AbortController()
    const p1 = withSerperToolScope(8, a.signal, () => serperSearch(q))
    await sleep(5)
    a.abort()
    expect((await p1).value).toBeNull()
    const fresh = await serperSearch(q) // joins nothing: the old request is cancelled
    expect(fresh).not.toBeNull()
    expect(sent).toBe(2)
  })
  it('an already-cancelled caller neither starts nor joins a request; the cancelled value is typed per caller (images → [])', async () => {
    stubFetch()
    const a = new AbortController(); a.abort()
    expect((await withSerperToolScope(8, a.signal, () => serperSearch(uq('dead')))).value).toBeNull()
    expect((await withSerperToolScope(8, a.signal, () => fetchPlacePhotosByName('id', uq('Dinh Doc Lap'), 1, 'shopping'))).value).toEqual([])
    expect(sent).toBe(0)
  })
  it('a failed shared request is delivered to every waiting caller and is not kept for later ones', async () => {
    stubFetch({ status: 500, body: { message: 'x' } })
    const q = uq('fails')
    const [a, b] = await Promise.all([serperSearch(q), serperSearch(q)])
    expect(a).toBeNull(); expect(b).toBeNull(); expect(sent).toBe(1)
    stubFetch()
    expect(await serperSearch(q)).not.toBeNull()
    expect(sent).toBe(1)
  })
})

// ── C ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('C · the ledger tells the failures apart, and the credit estimate does not depend on the label', () => {
  it('classifyThrown: timeout / aborted / network_error', () => {
    expect(classifyThrown(new Error('timeout'))).toBe('timeout')
    expect(classifyThrown(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))).toBe('aborted')
    expect(classifyThrown(new Error('The operation was aborted'))).toBe('aborted')
    expect(classifyThrown(new TypeError('fetch failed'))).toBe('network_error')
    expect(classifyThrown('boom')).toBe('network_error')
  })
  it('each outcome lands in its own counter; every attempted request is estimated at the model price whatever the label', async () => {
    const before = serperLedgerSnapshot()
    stubFetch({ reject: new TypeError('fetch failed') })
    await expect(serperPost('search', 'k', { q: uq('net') }, 1000)).rejects.toThrow('fetch failed')
    stubFetch({ delayMs: 500 })
    await expect(serperPost('search', 'k', { q: uq('slow') }, 15)).rejects.toThrow('timeout')
    const ac = new AbortController()
    stubFetch({ delayMs: 500 })
    await expect(withSerperToolScope(8, ac.signal, async () => { const p = serperPost('search', 'k', { q: uq('abort') }, 2000); setTimeout(() => ac.abort(), 10); return await p })).rejects.toThrow()
    stubFetch({ status: 500, body: { message: 'x' } })
    await serperPost('search', 'k', { q: uq('500') }, 1000)
    stubFetch({ status: 429, body: { message: 'slow down' } })
    await serperPost('search', 'k', { q: uq('429') }, 1000)
    stubFetch({ status: 400, body: { message: 'Not enough credits', statusCode: 400 } })
    await serperPost('search', 'k', { q: uq('credits') }, 1000)
    stubFetch({ status: 403, body: { message: 'forbidden' } })
    await serperPost('search', 'k', { q: uq('403') }, 1000)
    stubFetch({ status: 400, body: { message: 'bad num' } })
    await serperPost('search', 'k', { q: uq('badnum') }, 1000)
    stubFetch()
    await serperPost('search', 'k', { q: uq('ok') }, 1000)
    const d = serperLedgerDelta(before)
    expect(d.endpoints.search).toMatchObject({ attempted: 9, network_error: 1, timeout: 1, aborted: 1, http_error: 3, account_error: 2, ok: 1 })
    expect(d.estimatedBillable).toBe(9) // 9 attempts × 1 credit, no outcome is assumed free
  })
  it('an account error halts the turn; a plain 4xx / 5xx does not', async () => {
    stubFetch({ status: 403, body: { message: 'forbidden' } })
    const h = await withSerperTurnBudget(12, async () => [(await serperPost('search', 'k', { q: uq('h1') }, 1000))?.status, await serperPost('search', 'k', { q: uq('h2') }, 1000)])
    expect(h.value).toEqual([403, null]); expect(sent).toBe(1)
    stubFetch({ status: 500, body: { message: 'x' } })
    const p = await withSerperTurnBudget(12, async () => [(await serperPost('search', 'k', { q: uq('p1') }, 1000))?.status, (await serperPost('search', 'k', { q: uq('p2') }, 1000))?.status])
    expect(p.value).toEqual([500, 500]); expect(sent).toBe(2)
  })
})
