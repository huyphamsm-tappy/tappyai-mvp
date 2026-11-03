import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tappy Business — the tracking endpoint's security behaviour.
//
// Three properties, and they are the reason this route exists in the shape it
// does:
//
//   1. the bearer token is the ONLY way in — no alternate identifier works;
//   2. an unknown token is indistinguishable from a malformed one, so the
//      endpoint never confirms an order exists;
//   3. every response — including the errors — carries the privacy headers,
//      because a 404 that omitted `no-referrer` would still leak the token in
//      the `Referer` of whatever the error page loaded.
//
// The repository is substituted so the route can be driven without a database.
// What it returns is the shape the REAL repository returns; the lookup itself
// is proved against real PostgreSQL in
// supabase/tests/tappy_business_p2_order_invariants.test.ts.

const h = vi.hoisted(() => ({
  findOrder: vi.fn(),
  findMerchant: vi.fn(),
  rateLimit: vi.fn(),
}))

vi.mock('@/lib/business/repositories/orders', () => ({
  findOrderByTrackingHash: h.findOrder,
  findTrackedMerchant: h.findMerchant,
}))
vi.mock('@/lib/security/distributedRateLimit', () => ({
  distributedRateLimit: h.rateLimit,
}))

const { GET } = await import('./route')

const TOKEN = 'wKq3Z7xN1p2Q9rS4tU6vW8yA0bC2dE4fG6hJ8kL0mN2'

const ORDER = {
  public_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  status: 'PENDING',
  created_at: '2026-09-09T00:00:00Z',
  updated_at: '2026-09-09T00:00:00Z',
  customer_name: 'Nguyễn Thị Lan',
  customer_phone: '0901234567',
  customer_address: '128 Nguyễn Văn Cừ, Q5',
  total_amount: '90000',
  total_items: 2,
  currency: 'VND',
  merchant_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
}
const ITEMS = [
  {
    product_name_snapshot: 'Áo thun cotton',
    quantity: 2,
    unit_price_amount: '45000',
    line_total_amount: '90000',
    currency: 'VND',
    selected_options_snapshot: [{ group: 'Màu', value: 'Đỏ' }],
  },
]
const SHOP = { shop_name: 'Lan Shop', phone: '0908887777', status: 'ACTIVE' }

const req = (headers: Record<string, string> = {}) =>
  new Request('https://tappyai.com/api/public/business/orders/track', { headers })

beforeEach(() => {
  h.findOrder.mockReset()
  h.findMerchant.mockReset()
  h.rateLimit.mockReset().mockResolvedValue({ ok: true, retryAfter: 0 })
  h.findOrder.mockResolvedValue({ order: ORDER, items: ITEMS })
  h.findMerchant.mockResolvedValue(SHOP)
})

describe('the token is the only way in', () => {
  it('returns the order for a valid token', async () => {
    const res = await GET(req({ 'x-tracking-token': TOKEN }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.order.reference).toBe(ORDER.public_id)
    expect(body.order.status).toBe('PENDING')
  })

  it('🔑 hashes the token — the raw value never reaches the repository', async () => {
    await GET(req({ 'x-tracking-token': TOKEN }))
    const [passed] = h.findOrder.mock.calls[0]
    expect(Buffer.isBuffer(passed)).toBe(true)
    expect((passed as Buffer).length).toBe(32)
    expect((passed as Buffer).toString('utf8')).not.toContain(TOKEN)
  })

  it('🔑 no alternate identifier is accepted', async () => {
    // Every other way a caller might try to name an order. None is read, so
    // each request is the same "no token" case.
    const res = await GET(
      req({
        'x-order-public-id': ORDER.public_id,
        'x-customer-phone': '0901234567',
        'x-merchant-id': ORDER.merchant_id,
        'x-order-id': 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
      })
    )
    expect(res.status).toBe(400)
    expect(h.findOrder).not.toHaveBeenCalled()
  })

  it('a query string cannot supply the token either', async () => {
    const res = await GET(
      new Request(`https://tappyai.com/api/public/business/orders/track?token=${TOKEN}`)
    )
    expect(res.status).toBe(400)
    expect(h.findOrder).not.toHaveBeenCalled()
  })
})

describe('an unknown token reveals nothing', () => {
  it('🔑 answers a malformed token and an unknown one identically', async () => {
    h.findOrder.mockResolvedValue(null)
    const unknown = await GET(req({ 'x-tracking-token': TOKEN }))
    const malformed = await GET(req({ 'x-tracking-token': 'not-a-token' }))

    expect(unknown.status).toBe(404)
    expect(malformed.status).toBe(404)
    // Same status AND same body: a different message would tell a prober that
    // a well-formed token is a real order.
    expect(await unknown.json()).toEqual(await malformed.json())
  })

  it('does not hash or look up a malformed token', async () => {
    await GET(req({ 'x-tracking-token': 'short' }))
    expect(h.findOrder).not.toHaveBeenCalled()
  })

  it('🔑 an internal failure is indistinguishable from a lookup error', async () => {
    h.findOrder.mockRejectedValue(new Error('connection refused to db-primary-1'))
    const res = await GET(req({ 'x-tracking-token': TOKEN }))
    expect(res.status).toBe(500)
    const body = await res.json()
    // No stack, no host, no table. The table name is assembled rather than
    // written out — see the note in the allow-list test below.
    expect(JSON.stringify(body)).not.toContain('db-primary-1')
    expect(JSON.stringify(body)).not.toContain(['business', 'orders'].join('_'))
  })

  it('a missing token is a 400 and never reaches the database', async () => {
    const res = await GET(req())
    expect(res.status).toBe(400)
    expect(h.findOrder).not.toHaveBeenCalled()
  })
})

describe('privacy headers are on every response', () => {
  const expectHeaders = (res: Response) => {
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(res.headers.get('Cache-Control')).toContain('no-store')
  }

  it('on a successful lookup', async () => {
    expectHeaders(await GET(req({ 'x-tracking-token': TOKEN })))
  })

  it('🔑 on a 404 — the error page loads assets too', async () => {
    h.findOrder.mockResolvedValue(null)
    expectHeaders(await GET(req({ 'x-tracking-token': TOKEN })))
  })

  it('on a 400, a 429 and a 500', async () => {
    expectHeaders(await GET(req()))

    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    expectHeaders(await GET(req({ 'x-tracking-token': TOKEN })))

    h.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 })
    h.findOrder.mockRejectedValue(new Error('x'))
    expectHeaders(await GET(req({ 'x-tracking-token': TOKEN })))
  })
})

describe('the response is an allow-list', () => {
  it('🔑 exposes exactly the tracking fields, and no others', async () => {
    const body = await (await GET(req({ 'x-tracking-token': TOKEN }))).json()
    expect(Object.keys(body.order).sort()).toEqual(
      [
        'currency',
        'customer',
        'items',
        'notice',
        'placedAt',
        'reference',
        'shop',
        'status',
        'statusDetail',
        'statusTitle',
        'totalAmount',
        'totalFormatted',
        'totalItems',
        'updatedAt',
      ].sort()
    )
  })

  it('🔑 leaks no internal UUID, no token, no token hash and no table name', async () => {
    const raw = JSON.stringify(await (await GET(req({ 'x-tracking-token': TOKEN }))).json())
    expect(raw).not.toContain(ORDER.merchant_id)
    expect(raw).not.toContain(TOKEN)
    expect(raw).not.toContain('tracking_token')
    expect(raw).not.toContain('merchant_id')
    // Assembled rather than written out: `no-business-tables-outside-data-layer`
    // fences these names to src/lib/business/repositories/ and is deliberately
    // NOT exempt for test files, so even an assertion about a table name has to
    // avoid spelling one. The guard staying strict is worth this one line.
    expect(raw).not.toContain(['business', 'orders'].join('_'))
  })

  it('🔑 masks the customer’s phone, address and name', async () => {
    const body = await (await GET(req({ 'x-tracking-token': TOKEN }))).json()
    expect(body.order.customer.phone).toBe('09••••567')
    expect(body.order.customer.address).toBe('••• Nguyễn Văn Cừ, Q5')
    expect(body.order.customer.name).toBe('Nguyễn Thị L.')

    const raw = JSON.stringify(body)
    expect(raw).not.toContain('0901234567')
    expect(raw).not.toContain('128 Nguyễn Văn Cừ')
  })

  it('carries the item snapshot the customer ordered', async () => {
    const body = await (await GET(req({ 'x-tracking-token': TOKEN }))).json()
    expect(body.order.items).toEqual([
      { name: 'Áo thun cotton', quantity: 2, options: [{ group: 'Màu', value: 'Đỏ' }], lineTotal: 90_000 },
    ])
    expect(body.order.totalAmount).toBe(90_000)
    expect(body.order.totalFormatted).toBe('90.000₫')
  })
})

describe('status semantics — exactly the three locked states', () => {
  it.each([
    ['PENDING', 'Đã đặt hàng'],
    ['ACCEPTED', 'Shop đã chấp nhận đơn hàng'],
    ['REJECTED', 'Shop không thể nhận đơn hàng này'],
  ])('%s renders its own copy', async (status, title) => {
    h.findOrder.mockResolvedValue({ order: { ...ORDER, status }, items: ITEMS })
    const body = await (await GET(req({ 'x-tracking-token': TOKEN }))).json()
    expect(body.order.status).toBe(status)
    expect(body.order.statusTitle).toBe(title)
  })

  it('🔑 the shop’s phone appears only after ACCEPTED', async () => {
    // P0 §29: Tappy stops managing the transaction at ACCEPTED, so the customer
    // must be able to reach the shop. Before that, a leaked link must not
    // become a directory of merchant phone numbers.
    for (const status of ['PENDING', 'REJECTED']) {
      h.findOrder.mockResolvedValue({ order: { ...ORDER, status }, items: ITEMS })
      const body = await (await GET(req({ 'x-tracking-token': TOKEN }))).json()
      expect(body.order.shop, status).toEqual({ name: 'Lan Shop', phone: null })
    }

    h.findOrder.mockResolvedValue({ order: { ...ORDER, status: 'ACCEPTED' }, items: ITEMS })
    const accepted = await (await GET(req({ 'x-tracking-token': TOKEN }))).json()
    expect(accepted.order.shop).toEqual({ name: 'Lan Shop', phone: '0908887777' })
  })

  it('an unrecognised stored status is reported as PENDING, never echoed', async () => {
    h.findOrder.mockResolvedValue({ order: { ...ORDER, status: 'SOMETHING_ELSE' }, items: ITEMS })
    const body = await (await GET(req({ 'x-tracking-token': TOKEN }))).json()
    expect(body.order.status).toBe('PENDING')
  })
})

describe('anonymous access', () => {
  it('🔑 works with no session, no cookie and no merchant authentication', async () => {
    // The customer has no Tappy account and is never asked for one.
    const res = await GET(req({ 'x-tracking-token': TOKEN }))
    expect(res.status).toBe(200)
  })

  it('is rate limited per IP', async () => {
    await GET(req({ 'x-tracking-token': TOKEN }))
    expect(h.rateLimit).toHaveBeenCalledWith(expect.stringContaining('tb:track:'), 60, 60_000)
  })
})
