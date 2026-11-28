import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runFreeLookup, FREE_LOOKUP_DAILY_CAP, FREE_LOOKUP_MAX_RESULTS, type FreeLookupDeps } from './freeLookup'

// Owner 28/11/2026: a Free turn may make a few LIGHT lookups a day: names and addresses of places, or a short list of web results with their sources.
// The model decides when to call it; the server holds the daily cap, keeps every call to ONE credit-bearing request and never lets a failure cost the person a lookup.

const place = (n: number) => ({ title: `Quán ${n}`, address: `${n} Phan Xích Long`, rating: 4.5, ratingCount: 100 + n, type: 'Quán cơm', phoneNumber: '0900000000', website: 'https://example.com', openingHours: { 'Thứ Hai': '07:00–21:00' }, priceLevel: '1-100.000 ₫', thumbnailUrl: 'https://img.example/x.jpg' })
const row = (n: number) => ({ title: `Kết quả ${n}`, link: `https://site${n}.example/a`, snippet: `Trích dẫn ${n}`, date: '2 giờ trước' })

let counts: Map<string, number>
const mk = (over: Partial<FreeLookupDeps> = {}): FreeLookupDeps & { places: ReturnType<typeof vi.fn>; web: ReturnType<typeof vi.fn> } => {
  const places = vi.fn(async () => Array.from({ length: 8 }, (_, i) => place(i + 1)))
  const web = vi.fn(async () => ({ rows: Array.from({ length: 8 }, (_, i) => row(i + 1)), state: 'sent_success' as const }))
  return {
    places, web,
    count: async (key: string, by: number) => { const n = (counts.get(key) ?? 0) + by; counts.set(key, n); return n },
    ...over,
  } as never
}
beforeEach(() => { counts = new Map() })

describe('runFreeLookup', () => {
  it('places: one maps call with the price retry OFF (a retry would double the credits), top results as name + address (+ rating), nothing else', async () => {
    const d = mk()
    const out = await runFreeLookup({ kind: 'places', query: 'cơm tấm Phan Xích Long Phú Nhuận', identity: 'u1' }, d)
    expect(d.places).toHaveBeenCalledTimes(1)
    expect(d.places.mock.calls[0][2]).toMatchObject({ priceRetry: false })
    expect(d.web).not.toHaveBeenCalled()
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.results).toHaveLength(FREE_LOOKUP_MAX_RESULTS)
    expect(out.results[0]).toEqual({ name: 'Quán 1', address: '1 Phan Xích Long', rating: 4.5 })
    const text = JSON.stringify(out)
    for (const leaked of ['0900000000', 'example.com', 'img.example', '07:00', '1-100.000']) expect(text).not.toContain(leaked) // no phone, hours, price, website or picture for Free
  })

  it('web: one search, top results as title + snippet + link, so every fact can carry its source', async () => {
    const d = mk()
    const out = await runFreeLookup({ kind: 'web', query: 'chủ tịch nước Việt Nam hiện nay', identity: 'u1' }, d)
    expect(d.web).toHaveBeenCalledTimes(1)
    expect(d.places).not.toHaveBeenCalled()
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.results).toHaveLength(FREE_LOOKUP_MAX_RESULTS)
    expect(out.results[0]).toEqual({ title: 'Kết quả 1', snippet: 'Trích dẫn 1', link: 'https://site1.example/a' })
  })

  it(`the ${FREE_LOOKUP_DAILY_CAP}rd lookup of the day still works, the next one is refused with a plain note and calls no provider`, async () => {
    const d = mk()
    for (let i = 0; i < FREE_LOOKUP_DAILY_CAP; i++) expect((await runFreeLookup({ kind: 'web', query: `q${i}`, identity: 'u1' }, d)).ok).toBe(true)
    d.web.mockClear(); d.places.mockClear()
    const refused = await runFreeLookup({ kind: 'web', query: 'q-extra', identity: 'u1' }, d)
    expect(refused).toMatchObject({ ok: false, reason: 'daily_cap' })
    expect(d.web).not.toHaveBeenCalled(); expect(d.places).not.toHaveBeenCalled()
  })

  it('owner 28/11/2026: at the limit the model is told to say the day\'s search allowance is used and to offer the three ways on (upgrade, come back tomorrow, keep chatting without search), and never to state the number', async () => {
    const d = mk()
    for (let i = 0; i < FREE_LOOKUP_DAILY_CAP; i++) await runFreeLookup({ kind: 'web', query: `q${i}`, identity: 'u1' }, d)
    const refused = await runFreeLookup({ kind: 'web', query: 'x', identity: 'u1' }, d)
    expect(refused.ok).toBe(false)
    const note = refused.note
    expect(note).toMatch(/search allowance/i)
    expect(note).toMatch(/upgrade/i)
    expect(note).toMatch(/tomorrow/i)
    expect(note).toMatch(/without search/i)
    expect(note).toMatch(/do not (state|say|mention) (the|any) (number|count)/i)
    expect(note).not.toMatch(/[0-9]/) // the limit is never written into what the model sees, so it cannot be repeated to the person
  })

  it('the cap is per person: another identity has its own', async () => {
    const d = mk()
    for (let i = 0; i < FREE_LOOKUP_DAILY_CAP + 1; i++) await runFreeLookup({ kind: 'web', query: `q${i}`, identity: 'u1' }, d)
    expect((await runFreeLookup({ kind: 'web', query: 'q', identity: 'u2' }, d)).ok).toBe(true)
  })

  it('a refused (over-cap) request does not keep counting against the person', async () => {
    const d = mk()
    for (let i = 0; i < FREE_LOOKUP_DAILY_CAP + 3; i++) await runFreeLookup({ kind: 'web', query: `q${i}`, identity: 'u1' }, d)
    expect(counts.get('free-lookup:u1')).toBe(FREE_LOOKUP_DAILY_CAP)
  })

  it('a failed or empty lookup is given back: it does not use up one of the day\'s lookups, and the answer says nothing was found', async () => {
    const d = mk({ web: vi.fn(async () => ({ rows: null, state: 'sent_error' as const })) as never, places: vi.fn(async () => []) as never })
    expect(await runFreeLookup({ kind: 'web', query: 'x', identity: 'u1' }, d)).toMatchObject({ ok: false, reason: 'no_results' })
    expect(await runFreeLookup({ kind: 'places', query: 'x', identity: 'u1' }, d)).toMatchObject({ ok: false, reason: 'no_results' })
    expect(counts.get('free-lookup:u1')).toBe(0)
  })

  it('a provider that throws never breaks the turn and gives the lookup back', async () => {
    const d = mk({ web: vi.fn(async () => { throw new Error('boom') }) as never })
    expect(await runFreeLookup({ kind: 'web', query: 'x', identity: 'u1' }, d)).toMatchObject({ ok: false, reason: 'no_results' })
    expect(counts.get('free-lookup:u1')).toBe(0)
  })

  it('an empty query asks for nothing and spends nothing; a long one is cut', async () => {
    const d = mk()
    expect(await runFreeLookup({ kind: 'web', query: '   ', identity: 'u1' }, d)).toMatchObject({ ok: false, reason: 'no_results' })
    expect(d.web).not.toHaveBeenCalled(); expect(counts.get('free-lookup:u1') ?? 0).toBe(0)
    await runFreeLookup({ kind: 'web', query: 'a'.repeat(900), identity: 'u1' }, d)
    expect((d.web.mock.calls[0][0] as string).length).toBeLessThanOrEqual(200)
  })
})
