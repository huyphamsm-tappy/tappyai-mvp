// @vitest-environment node
// Wave 2H (F4-1) - the request-time listener of serperMeter.ts sits on the PAID request path (recordSerperCall runs right before the fetch of serperPost). It exists for the trace only, so the one thing that
// must hold whatever it does is: a listener that fails changes nothing - no thrown error, no count, no ledger row, no credit estimate, no request. MOCK ONLY: a stubbed fetch, no network, no Serper, no credits.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { recordSerperCall, serperSnapshot, serperLedgerSnapshot, serperLedgerDelta, setSerperCallObserver } from './serperMeter'
import { serperPost, __resetSerperAlerts } from './serperClient'

let sent = 0
function stubFetch() {
  sent = 0
  vi.stubGlobal('fetch', vi.fn(async () => { sent++; return new Response(JSON.stringify({ organic: [{ title: 'Kết quả', link: 'https://example.com/a', snippet: 's' }], credits: 1 }), { status: 200 }) }))
}
let n = 0
const uq = (s: string) => `${s} ${++n}-${Math.random().toString(36).slice(2, 7)}`
beforeEach(() => { __resetSerperAlerts(); setSerperCallObserver(null) })
afterEach(() => { setSerperCallObserver(null); vi.unstubAllGlobals() })

const counts = () => { const s = serperSnapshot(); return [s.maps, s.search, s.shopping, s.images] }
const attempted = () => { const l = serperLedgerSnapshot().endpoints; return [l.maps.attempted, l.search.attempted, l.shopping.attempted, l.images.attempted] }
const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i])

describe('serperMeter listener · a listener that fails changes nothing on the request path', () => {
  const burst = () => { for (let i = 0; i < 4; i++) recordSerperCall('maps'); recordSerperCall('search'); recordSerperCall('shopping'); recordSerperCall('images') }
  it('a listener that THROWS (synchronously): recordSerperCall does not throw, and counts and ledger move exactly as with no listener', () => {
    let c0 = counts(), a0 = attempted()
    burst()
    const plain = { counts: sub(counts(), c0), attempted: sub(attempted(), a0) }
    let calls = 0
    setSerperCallObserver(() => { calls++; throw new Error('listener failure') })
    c0 = counts(); a0 = attempted()
    expect(() => burst()).not.toThrow()
    expect({ counts: sub(counts(), c0), attempted: sub(attempted(), a0) }).toEqual(plain)
    expect(plain).toEqual({ counts: [4, 1, 1, 1], attempted: [4, 1, 1, 1] })
    expect(calls).toBe(7) // it WAS called for every request (the test is not vacuous)
  })
  it('a listener is told once per request, with the endpoint, after the counters moved', () => {
    const seen: string[] = []
    setSerperCallObserver(e => { seen.push(e + ':' + counts().join('/')) })
    const c0 = counts()
    recordSerperCall('maps'); recordSerperCall('search')
    expect(seen).toEqual([`maps:${c0[0] + 1}/${c0[1]}/${c0[2]}/${c0[3]}`, `search:${c0[0] + 1}/${c0[1] + 1}/${c0[2]}/${c0[3]}`])
  })
  it('through serperPost (the real door of a paid request, stubbed fetch): a throwing listener leaves the response, the number of requests sent, the counts, the ledger outcome and the credit estimate exactly as without a listener', async () => {
    const run = async () => {
      stubFetch()
      const before = serperLedgerSnapshot(), c0 = counts()
      const res = await serperPost('search', 'k', { q: uq('listener') }, 1000)
      const d = serperLedgerDelta(before)
      return { ok: res !== null && res.ok, sent, counts: sub(counts(), c0), search: { attempted: d.endpoints.search.attempted, ok: d.endpoints.search.ok, refused: d.endpoints.search.refused }, billable: d.estimatedBillable }
    }
    const plain = await run()
    expect(plain).toMatchObject({ ok: true, sent: 1, counts: [0, 1, 0, 0], search: { attempted: 1, ok: 1, refused: 0 }, billable: 1 })
    let calls = 0
    setSerperCallObserver(() => { calls++; throw new Error('listener failure') })
    const withThrow = await run()
    expect(withThrow).toEqual(plain)
    expect(calls).toBe(1)
  })
  it('a listener that is SLOW delays only the caller by its own time and changes no count', () => {
    setSerperCallObserver(() => { const t = Date.now(); while (Date.now() - t < 5) { /* a deliberately slow listener */ } })
    const c0 = counts(), t0 = Date.now()
    recordSerperCall('images')
    expect(Date.now() - t0).toBeGreaterThanOrEqual(5)
    expect(sub(counts(), c0)).toEqual([0, 0, 0, 1])
  })
})
