// @vitest-environment node
// POST-CREDIT Serper cost control (09/10). Everything here runs against a STUBBED fetch: no network, no Serper, no credits.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SERPER_COST, SERPER_CREDITS, serperLedgerSnapshot, serperLedgerDelta } from './serperMeter'
import { serperPost, __resetSerperAlerts } from './serperClient'
import { withSerperToolBudget, withSerperToolScope, withSerperTurnBudget } from './serperToolBudget'
import { serperSearch, serperShopping, fetchPlacePhotosByName, __clearToolCache } from './common'
import { serperPlaces } from './serperPlaces'
import { searchProducts } from './shopping'
import { withProductFallback } from '../agent/runtime/toolState'

type Handler = (url: string, body: Record<string, unknown>) => Response | Promise<Response>
let calls: Array<{ endpoint: string; q: unknown }> = []
function stub(handler: Handler) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string; signal?: AbortSignal }) => {
    const endpoint = String(url).split('/').pop() as string
    const body = JSON.parse(init?.body ?? '{}')
    calls.push({ endpoint, q: body.q })
    return handler(endpoint, body)
  }))
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
const searchOk = (extra: Record<string, unknown> = {}) => json({ organic: [{ title: 'Kết quả', link: 'https://example.com/a', snippet: 's' }], credits: 1, ...extra })
const count = (e: string) => calls.filter(c => c.endpoint === e).length
const prev = { key: process.env.SERPER_API_KEY, ceil: process.env.SERPER_DAILY_CREDIT_CEILING }
let n = 0
const uq = (s: string) => `${s} ${++n}-${Math.random().toString(36).slice(2, 7)}`

beforeEach(() => { process.env.SERPER_API_KEY = 'test-key-not-real'; delete process.env.SERPER_DAILY_CREDIT_CEILING; __clearToolCache(); __resetSerperAlerts() })
afterEach(() => { vi.unstubAllGlobals(); if (prev.key === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prev.key; if (prev.ceil === undefined) delete process.env.SERPER_DAILY_CREDIT_CEILING; else process.env.SERPER_DAILY_CREDIT_CEILING = prev.ceil })

describe('P0 · one credit model', () => {
  it('shopping is 2 (Activity Log), maps 3, search 1; images are NEVER free and are flagged unverified', () => {
    expect(SERPER_CREDITS).toEqual({ maps: 3, search: 1, shopping: 2, images: 1 })
    expect(SERPER_COST.shopping).toEqual({ credits: 2, basis: 'activity_log' })
    expect(SERPER_COST.images.basis).toBe('unverified')
    expect(SERPER_COST.images.credits).toBeGreaterThan(0)
  })
  it('the tool budget reserves the SAME number the ledger estimates: a 3-credit tool fits one shopping request, not two', async () => {
    stub(() => json({ shopping: [], credits: 2 }))
    const before = serperLedgerSnapshot()
    const r = await withSerperToolBudget(3, async () => [await serperPost('shopping', 'k', { q: 'a' }, 1000), await serperPost('shopping', 'k', { q: 'b' }, 1000)])
    expect(r.value[0]).not.toBeNull()
    expect(r.value[1]).toBeNull() // 2 + 2 > 3
    expect(r.spent).toBe(2)
    expect(count('shopping')).toBe(1)
    const d = serperLedgerDelta(before)
    expect(d.estimatedBillable).toBe(2)
    expect(d.endpoints.shopping).toMatchObject({ attempted: 1, ok: 1, refused: 1, reported: 2 })
  })
})

describe('P0 · ledger: attempts, outcomes, reported and reconciled are different things', () => {
  it('records outcomes per request: ok (+ provider-reported credits), http error, timeout; every retry is a new attempted request', async () => {
    const before = serperLedgerSnapshot()
    stub(e => (e === 'search' ? searchOk({ credits: 1 }) : json({ message: 'boom' }, 500)))
    await serperPost('search', 'k', { q: uq('ok') }, 1000)
    await serperPost('shopping', 'k', { q: uq('err') }, 1000)
    stub(() => new Promise<Response>(() => { /* never answers */ }))
    await expect(serperPost('search', 'k', { q: uq('slow') }, 15)).rejects.toThrow('timeout')
    await serperPost('search', 'k', { q: 'same' }, 1000).catch(() => null) // a retry of an earlier request text = another attempt
    const d = serperLedgerDelta(before)
    expect(d.endpoints.search).toMatchObject({ attempted: 3, ok: 1, timeout: 2 })
    expect(d.endpoints.shopping).toMatchObject({ attempted: 1, http_error: 1, ok: 0 })
    expect(d.estimatedBillable).toBe(3 * 1 + 1 * 2) // a timeout is still estimated billable
    expect(d.reconciled).toBe(0) // only the owner can reconcile against the Activity Log
  })
  it('provider-reported credits are recorded beside the estimate and never replace it', async () => {
    stub(() => searchOk({ credits: 1 }))
    const before = serperLedgerSnapshot()
    await serperPost('search', 'k', { q: uq('r') }, 1000)
    const d = serperLedgerDelta(before)
    expect(d.reported).toBe(1)
    expect(d.estimatedBillable).toBe(1)
  })
  it('a client timeout does NOT give the reservation back (the provider may have processed the request)', async () => {
    stub(() => new Promise<Response>(() => {}))
    const r = await withSerperToolBudget(8, async () => { try { await serperPost('search', 'k', { q: uq('t') }, 10) } catch { /* timeout */ } })
    expect(r.spent).toBe(1)
  })
  it('a request refused by the daily ceiling gives its reservation back (never sent, nothing to bill)', async () => {
    process.env.SERPER_DAILY_CREDIT_CEILING = '1'
    stub(() => searchOk())
    const before = serperLedgerSnapshot()
    const r = await withSerperToolBudget(50, async () => { for (let i = 0; i < 4; i++) await serperPost('shopping', 'k', { q: uq('c') }, 1000) })
    const d = serperLedgerDelta(before)
    expect(r.spent).toBe(d.estimatedBillable) // reserved == attempted: refused requests left nothing reserved
    expect(d.endpoints.shopping.refused).toBeGreaterThan(0)
    expect(count('shopping')).toBe(d.endpoints.shopping.attempted)
  })
  it('a cancelled scope sends nothing and reserves nothing', async () => {
    stub(() => searchOk())
    const ac = new AbortController(); ac.abort()
    const r = await withSerperToolScope(8, ac.signal, async () => serperPost('search', 'k', { q: uq('x') }, 1000))
    expect(r.value).toBeNull(); expect(r.spent).toBe(0); expect(calls.length).toBe(0)
  })
})

describe('P0 · an account-level failure stops the rest of the turn', () => {
  it('HTTP 400 "Not enough credits" halts the scope: the next requests are never sent', async () => {
    stub(() => json({ message: 'Not enough credits', statusCode: 400 }, 400))
    const r = await withSerperTurnBudget(12, async () => {
      const a = await serperPost('shopping', 'k', { q: uq('h') }, 1000)
      const b = await serperPost('search', 'k', { q: uq('h') }, 1000)
      const c = await serperPost('search', 'k', { q: uq('h') }, 1000)
      return [a?.status, b, c]
    })
    expect(r.value).toEqual([400, null, null])
    expect(calls.length).toBe(1)
  })
  it('a plain HTTP 400 (bad parameters) does NOT halt; 401 / 402 / 403 do; outside a scope nothing is halted (legacy unchanged)', async () => {
    stub(() => json({ message: 'bad num' }, 400))
    const r = await withSerperTurnBudget(12, async () => [(await serperPost('search', 'k', { q: uq('p') }, 1000))?.status, (await serperPost('search', 'k', { q: uq('p') }, 1000))?.status])
    expect(r.value).toEqual([400, 400])
    stub(() => json({ message: 'forbidden' }, 403))
    const h = await withSerperTurnBudget(12, async () => [(await serperPost('search', 'k', { q: uq('f') }, 1000))?.status, await serperPost('search', 'k', { q: uq('f') }, 1000)])
    expect(h.value).toEqual([403, null])
    stub(() => json({ message: 'Not enough credits' }, 400))
    expect((await serperPost('search', 'k', { q: uq('o') }, 1000))?.status).toBe(400)
    expect((await serperPost('search', 'k', { q: uq('o') }, 1000))?.status).toBe(400) // no scope → both sent, as before
  })
})

describe('P1 · in-flight dedup and cache accounting', () => {
  it('concurrent identical searches share ONE provider request; different queries do not', async () => {
    stub(async () => { await new Promise(r => setTimeout(r, 15)); return searchOk() })
    const q = uq('dedup')
    const [a, b, c] = await Promise.all([serperSearch(q), serperSearch(q), serperSearch(q + ' khác')])
    expect(a).toEqual(b); expect(c).not.toBeNull()
    expect(count('search')).toBe(2)
  })
  it('concurrent identical shopping requests share one request; a different num is a different request', async () => {
    stub(async () => { await new Promise(r => setTimeout(r, 15)); return json({ shopping: [{ title: 'A', link: 'https://x/a', price: '1.000 ₫', source: 'S' }], credits: 2 }) })
    const q = uq('shop')
    await Promise.all([serperShopping(q, 20), serperShopping(q, 20), serperShopping(q, 12)])
    expect(count('shopping')).toBe(2)
  })
  it('concurrent identical /maps requests share ONE provider request; the price-retry mode is part of the key', async () => {
    stub(async () => { await new Promise(r => setTimeout(r, 15)); return json({ places: [], credits: 3 }) })
    const q = uq('quan com tam')
    await Promise.all([serperPlaces(q, null, { priceRetry: false }), serperPlaces(q, null, { priceRetry: false })])
    expect(count('maps')).toBe(1)
  })
  it('concurrent identical /images lookups share ONE request (L1 + in-flight only: images are not in the shared cache)', async () => {
    stub(async () => { await new Promise(r => setTimeout(r, 15)); return json({ images: [{ imageUrl: 'https://lh3.googleusercontent.com/p.jpg', title: 't' }] }) })
    const name = uq('Dinh Doc Lap')
    await Promise.all([fetchPlacePhotosByName('id1', name, 1, 'shopping'), fetchPlacePhotosByName('id1', name, 1, 'shopping')])
    expect(count('images')).toBe(1)
  })
  it('a failed or timed-out leader is not cached or shared forever: the next call asks again', async () => {
    const q = uq('retry')
    stub(() => json({ message: 'x' }, 500))
    expect(await serperSearch(q)).toBeNull()
    stub(() => searchOk())
    expect(await serperSearch(q)).not.toBeNull()
    expect(count('search')).toBe(1)
  })
  it('an L1 hit sends nothing and is counted; with no shared store every L2 read is counted as a bypass (cold cache is reported, not hidden)', async () => {
    stub(() => searchOk())
    const q = uq('l1')
    const before = serperLedgerSnapshot()
    await serperSearch(q); await serperSearch(q)
    const d = serperLedgerDelta(before)
    expect(count('search')).toBe(1)
    expect(d.l1Hits).toBe(1)
    expect(d.l2Bypass).toBeGreaterThanOrEqual(1)
  })
  it('without a key nothing is sent', async () => {
    delete process.env.SERPER_API_KEY
    stub(() => searchOk())
    expect(await serperSearch(uq('nokey'))).toBeNull()
    expect(calls.length).toBe(0)
  })
})

describe('P0 · search_products request flow', () => {
  const shoppingRow = (t: string, extra: Record<string, unknown> = {}) => ({ title: t, link: `https://www.google.com/search?q=${encodeURIComponent(t)}`, price: '25.990.000 ₫', source: 'CellphoneS', imageUrl: 'https://encrypted-tbn0.gstatic.com/img.jpg', ...extra })
  const merchantHit = (slug: string, title: string) => ({ title, link: `https://cellphones.com.vn/${slug}.html`, snippet: 'Giá tốt' })

  it('a usable /shopping answer costs 1 shopping + 1 merchant search; a merchant row that is the same product as a Shopping row of ANOTHER seller borrows its photo (0 image calls)', async () => {
    const q = uq('iPhone 17 Pro Max 256GB')
    stub(e => e === 'shopping' ? json({ shopping: [shoppingRow(`${q} Chính hãng`, { source: 'FPT Shop' })], credits: 2 }) : e === 'search' ? json({ organic: [merchantHit('iphone-17-pro-max-256gb', `${q} Chính hãng`)], credits: 1 }) : json({ images: [] }))
    const r = await withSerperToolBudget(8, () => searchProducts(q, 'vi'))
    expect(count('shopping')).toBe(1); expect(count('search')).toBe(1); expect(count('images')).toBe(0)
    expect(r.spent).toBe(3)
    const rows = (r.value as { search_results?: Array<{ link: string; photo_url?: string }> }).search_results ?? []
    expect(rows.find(x => x.link.includes('cellphones.com.vn'))?.photo_url).toBe('https://encrypted-tbn0.gstatic.com/img.jpg')
  })
  it('merchant rows with no matching Shopping photo spend at most CARDS_SHOWN /images calls (was one per row, up to 6)', async () => {
    const q = uq('Quạt điều hòa Kangaroo')
    const merchants = Array.from({ length: 6 }, (_, i) => merchantHit(`${q.replace(/\s/g, '-')}-v${i}`, `${q} model ${i} Chính hãng`))
    stub(e => e === 'shopping' ? json({ shopping: [shoppingRow('Máy lọc nước Karofi khác hẳn', { imageUrl: undefined })], credits: 2 }) : e === 'search' ? json({ organic: merchants, credits: 1 }) : json({ images: [{ imageUrl: 'https://lh3.googleusercontent.com/p.jpg', title: 't' }] }))
    await withSerperToolBudget(12, () => searchProducts(q, 'vi'))
    expect(count('images')).toBeLessThanOrEqual(3)
  })
  it('an out-of-credits first /shopping call halts the turn: NO organic searches, NO retry, nothing cached, honest ERROR shape', async () => {
    const q = uq('AirPods Pro 2')
    stub(() => json({ message: 'Not enough credits', statusCode: 400 }, 400))
    const r = await withSerperTurnBudget(12, () => searchProducts(q, 'vi'))
    expect(calls.length).toBe(1)
    expect(r.value).toMatchObject({ product_data: 'none', provider_status: 'error', halted: 'http_400_credits' })
  })
  it('the shop-info enrichment search is not sent when the search found nothing', async () => {
    const q = uq('san pham khong ton tai')
    stub(e => e === 'shopping' ? json({ shopping: [], credits: 2 }) : json({ organic: [], credits: 1 }))
    await withSerperToolBudget(12, () => searchProducts(q, 'vi'))
    const searches = calls.filter(c => c.endpoint === 'search').map(c => String(c.q))
    expect(searches.some(s => s.includes('địa chỉ facebook'))).toBe(false)
    expect(count('shopping')).toBe(1) // an answered "no listings" is not re-asked
  })
})

describe('P0 · timeout / cancellation inside search_products', () => {
  it('when the provider call times out the requests it had NOT yet sent are cancelled (they were left running before)', async () => {
    stub(() => searchOk())
    const primary = async () => { await new Promise(r => setTimeout(r, 60)); return await serperPost('search', 'k', { q: uq('late') }, 1000) }
    const exec = withProductFallback(primary as never, null, { lang: 'vi', timeoutMs: 10 })
    const r = await exec({ query: 'x' }, { toolCallId: 't', messages: [] }) as Record<string, unknown>
    expect(r.tool_state).toBe('TIMEOUT')
    await new Promise(res => setTimeout(res, 120))
    expect(calls.length).toBe(0)
  })
})
