import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The daily Accesstrade importer: cron secret required, key required, a bad fetch or an empty result leaves the page as it is, old importer rows go only after the new ones are in.
const h = vi.hoisted(() => ({
  authorized: true,
  calls: [] as string[],
  inserted: [] as unknown[],
  insertError: null as null | { message: string },
  oldIds: ['old1'] as string[],
  diag: [] as Array<Record<string, unknown>>,
  diagThrows: false,
}))
vi.mock('@/lib/security/cronAuth', () => ({ isAuthorizedCronRequest: () => h.authorized }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => table === 'cron_diagnostics' ? ({
      insert: async (row: Record<string, unknown>) => { if (h.diagThrows) throw new Error('relation "cron_diagnostics" does not exist'); h.diag.push(row); return { error: null } },
      delete: () => ({ lt: async () => ({ error: null }) }),
    }) : ({
      select: () => ({ eq: () => ({ eq: async () => { h.calls.push('select-old'); return { data: h.oldIds.map(id => ({ id })), error: null } } }) }),
      insert: (rows: unknown[]) => ({ select: async () => { h.calls.push('insert'); h.inserted.push(...rows); return h.insertError ? { data: null, error: h.insertError } : { data: rows.map((_, i) => ({ id: `n${i}` })), error: null } } }),
      delete: () => ({ in: async () => { h.calls.push('delete-old'); return { error: null } } }),
    }),
  }),
}))
import { GET } from './route'

const goodOffer = { id: 'a1', name: 'Giảm 10%', aff_link: 'https://go.isclix.com/deep_link/1?url=https%3A%2F%2Fwww.lazada.vn%2F', end_time: '2099-01-01', coupons: [{ coupon_code: 'X1', coupon_desc: 'Giảm 10%' }] }
const call = () => GET(new Request('https://www.tappyai.com/api/cron/deal-ingest'))

describe('GET /api/cron/deal-ingest', () => {
  const prevKey = process.env.ACCESSTRADE_API_KEY
  beforeEach(() => { h.authorized = true; h.calls = []; h.inserted = []; h.insertError = null; h.oldIds = ['old1']; process.env.ACCESSTRADE_API_KEY = 'test-key' })
  afterEach(() => { vi.unstubAllGlobals(); if (prevKey === undefined) delete process.env.ACCESSTRADE_API_KEY; else process.env.ACCESSTRADE_API_KEY = prevKey })

  it('401 without the cron secret, 503 without the key; nothing is fetched or written', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    h.authorized = false
    expect((await call()).status).toBe(401)
    h.authorized = true; delete process.env.ACCESSTRADE_API_KEY
    expect((await call()).status).toBe(503)
    expect(f).not.toHaveBeenCalled(); expect(h.calls).toEqual([])
  })

  it('sends the token header, writes the valid offers, and deletes the previous importer rows only AFTER inserting the new ones', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: [goodOffer] }), { status: 200 })); vi.stubGlobal('fetch', f)
    const body = await (await call()).json()
    expect(body.ok).toBe(true)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('offers_informations')
    expect(url).toContain('domain=lazada.vn')
    expect((init.headers as Record<string, string>).Authorization).toBe('Token test-key')
    expect(h.inserted.length).toBeGreaterThan(0)
    expect(h.calls.indexOf('insert')).toBeLessThan(h.calls.indexOf('delete-old'))
    expect(JSON.stringify(body)).not.toContain('test-key')
  })

  it('a failed fetch or an answer with no valid offer leaves the page as it is (nothing inserted, nothing deleted)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    expect((await (await call()).json()).outcomes.every((o: { skipped?: string }) => o.skipped === 'fetch_failed')).toBe(true)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'z', aff_link: 'https://evil.example/x' }] }), { status: 200 })))
    expect((await (await call()).json()).outcomes.every((o: { skipped?: string }) => o.skipped === 'no_valid_offers')).toBe(true)
    expect(h.calls).toEqual([])
  })

  it('a 429 is retried once and then used (Accesstrade rate-limits quick successive calls); an empty answer logs its shape', async () => {
    let n = 0
    const f = vi.fn(async () => (++n === 1 ? new Response('slow down', { status: 429 }) : new Response(JSON.stringify({ data: [goodOffer] }), { status: 200 })))
    vi.stubGlobal('fetch', f)
    const body = await (await call()).json()
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(body.outcomes[0]).toMatchObject({ partner: 'lazada', written: 1 })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })))
    await call()
    expect(warn.mock.calls.some(c => String(c[0]).includes('tappyai_deal_ingest_empty'))).toBe(true)
  })

  it('keeps the shape of an empty answer in cron_diagnostics (the Vercel log lives about an hour), without the key, a code or a full link', async () => {
    h.diag = []; h.diagThrows = false
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const odd = { id: 'q1', name: 'Voucher', aff_link: 'https://pub.example-affiliate.vn/deep/1?secret=ZZZ', coupons: [{ coupon_code: 'SECRETCODE' }], end_time: '2099-01-01' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [odd] }), { status: 200 })))
    await call()
    const row = h.diag.find(r => r.partner === 'lazada')
    expect(row).toMatchObject({ job: 'deal-ingest', kind: 'no_valid_offers' })
    const text = JSON.stringify(row)
    expect(text).toContain('link_host')
    expect(text).toContain('pub.example-affiliate.vn')
    expect(text).not.toContain('test-key'); expect(text).not.toContain('SECRETCODE'); expect(text).not.toContain('ZZZ')
  })

  it('records the HTTP status of a failed fetch', async () => {
    h.diag = []; h.diagThrows = false
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })))
    await call()
    expect(h.diag.find(r => r.partner === 'lazada')).toMatchObject({ kind: 'fetch_failed', detail: { status: 403 } })
  })

  it('a missing diagnostics table never breaks the import', async () => {
    h.diag = []; h.diagThrows = true
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [goodOffer] }), { status: 200 })))
    const res = await call()
    expect(res.status).toBe(200)
    expect(h.inserted.length).toBeGreaterThan(0)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })))
    expect((await call()).status).toBe(200)
    h.diagThrows = false
  })

  it('a failed insert deletes nothing', async () => {
    h.insertError = { message: 'boom' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [goodOffer] }), { status: 200 })))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await call()
    expect(h.calls).not.toContain('delete-old')
  })
})
