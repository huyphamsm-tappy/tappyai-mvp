import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

const STAY = { destination: 'Đà Lạt', checkIn: '2026-10-20', checkOut: '2026-10-22', adults: 2 }
const body = (over: Record<string, unknown> = {}) => ({ provider: 'agoda', providerItemId: '4942635', previousPrice: 1_800_000, currency: 'VND', stay: STAY, ...over })
const call = (b: unknown, ip = '10.0.0.1') => POST(new NextRequest('http://localhost/api/booking/recheck', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, 'x-real-ip': ip }, body: JSON.stringify(b) }))
const KEYS = ['CCP_REALTIME_AGODA', 'AGODA_DEMAND_API_BASE', 'AGODA_DEMAND_SITE_ID', 'AGODA_DEMAND_KEY']
const saved: Record<string, string | undefined> = {}
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k] }; vi.spyOn(console, 'log').mockImplementation(() => {}) })
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }; vi.unstubAllGlobals(); vi.restoreAllMocks() })

const on = () => { Object.assign(process.env, { CCP_REALTIME_AGODA: '1', AGODA_DEMAND_API_BASE: 'https://agoda-api.test/search', AGODA_DEMAND_SITE_ID: '1', AGODA_DEMAND_KEY: 'k' }) }
const provider = (inclusive: number | null) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ searchId: 's', properties: inclusive === null ? [] : [{ propertyId: 4942635, rooms: [{ totalPayment: { inclusive, currency: 'VND' }, landingUrl: 'https://www.agoda.com/x?hid=4942635' }] }] }), { status: 200 })))

describe('POST /api/booking/recheck', () => {
  it('provider OFF: 200 unchecked — the CTA still works, the page re-checks', async () => {
    const r = await call(body())
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ status: 'unchecked', sentence: 'Giá và tình trạng phòng được kiểm tra trên Agoda khi bạn mở trang.' })
    expect(r.headers.get('cache-control')).toBe('no-store')
  })

  it('price unchanged / changed / gone are answered from the provider, with a sentence', async () => {
    on()
    provider(1_800_000)
    expect(await (await call(body(), '10.0.0.2')).json()).toMatchObject({ status: 'ok', price: 1_800_000, bookingUrl: 'https://www.agoda.com/x?hid=4942635' })
    provider(2_000_000)
    expect(await (await call(body(), '10.0.0.3')).json()).toMatchObject({ status: 'price_changed', price: 2_000_000, sentence: expect.stringMatching(/Giá đã đổi còn 2\.000\.000đ/) })
    provider(null)
    expect(await (await call(body(), '10.0.0.4')).json()).toMatchObject({ status: 'unavailable', sentence: expect.stringMatching(/hết chỗ/) })
  })

  it('a provider failure never leaks: 200 unchecked, no credential or error text in the body', async () => {
    on()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Authorization: k exploded') }))
    const r = await call(body(), '10.0.0.5')
    expect(r.status).toBe(200)
    const text = JSON.stringify(await r.json())
    expect(text).toContain('unchecked')
    expect(text).not.toMatch(/Authorization|exploded|agoda-api/)
  })

  it('rejects bad input (provider, id, dates, party) and rate-limits a flood', async () => {
    expect((await call(body({ provider: 'evil' }), '10.0.1.1')).status).toBe(400)
    expect((await call(body({ providerItemId: '1; DROP' }), '10.0.1.2')).status).toBe(400)
    expect((await call(body({ stay: { ...STAY, checkOut: '2026-10-19' } }), '10.0.1.3')).status).toBe(400)
    expect((await call(body({ stay: { ...STAY, adults: 0 } }), '10.0.1.4')).status).toBe(400)
    let last = 200
    for (let i = 0; i < 25; i++) last = (await call(body(), '10.0.2.1')).status
    expect(last).toBe(429)
  })
})
