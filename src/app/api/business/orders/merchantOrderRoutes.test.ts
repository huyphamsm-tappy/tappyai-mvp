import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tappy Business — the merchant order routes' HTTP semantics.
//
// What this file is for: how each repository outcome becomes a status code, and
// that a retry is not mistaken for a conflict. The authorization and concurrency
// themselves are proved elsewhere — authz.test.ts drives the real guard, and
// supabase/tests/tappy_business_p3_order_transitions.test.ts drives the real
// database with two sessions.

const h = vi.hoisted(() => ({
  requireMerchant: vi.fn(),
  transitionOrder: vi.fn(),
  findMerchantOrder: vi.fn(),
  listMerchantOrders: vi.fn(),
  rateLimit: vi.fn(),
  refuseAnon: vi.fn(),
}))

vi.mock('@/lib/business/routeGuard', () => ({ requireMerchant: h.requireMerchant }))
vi.mock('@/lib/business/repositories/orders', () => ({
  transitionOrder: h.transitionOrder,
  findMerchantOrder: h.findMerchantOrder,
  listMerchantOrders: h.listMerchantOrders,
}))
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))
vi.mock('@/lib/auth/socialWriteAccess', () => ({ refuseAnonymousSocialWrite: h.refuseAnon }))

const { POST: accept } = await import('./[publicId]/accept/route')
const { POST: reject } = await import('./[publicId]/reject/route')
const { GET: detail } = await import('./[publicId]/route')
const { GET: list } = await import('./route')

const CTX = {
  merchantId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  merchantPublicId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  controllerUserId: '11111111-1111-4111-8111-111111111111',
  status: 'ACTIVE' as const,
}
const ORDER = '01BX5ZZKBKACTAV9WEVGEMMVRZ'
const params = { params: { publicId: ORDER } }

const post = (body?: unknown) =>
  new Request(`https://tappyai.com/api/business/orders/${ORDER}/accept`, {
    method: 'POST',
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  })

beforeEach(() => {
  h.requireMerchant.mockReset().mockResolvedValue({ ok: true, ctx: CTX, user: { id: CTX.controllerUserId } })
  h.transitionOrder.mockReset()
  h.findMerchantOrder.mockReset()
  h.listMerchantOrders.mockReset().mockResolvedValue([])
  h.rateLimit.mockReset().mockResolvedValue({ ok: true, retryAfter: 0 })
  h.refuseAnon.mockReset().mockReturnValue(null)
})

describe('accept', () => {
  it('200 and the new state on a successful transition', async () => {
    h.transitionOrder.mockResolvedValue({ kind: 'transitioned', status: 'ACCEPTED', updatedAt: 't' })
    const res = await accept(post(), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      order: { reference: ORDER, status: 'ACCEPTED', updatedAt: 't' },
      alreadyApplied: false,
    })
  })

  it('🔑 asks for ACCEPTED with a server-chosen reason, and reads no body', async () => {
    h.transitionOrder.mockResolvedValue({ kind: 'transitioned', status: 'ACCEPTED', updatedAt: 't' })
    // A hostile body that names a status, an actor and a timestamp.
    await accept(post({ status: 'REJECTED', actor: 'SYSTEM', updatedAt: '1999-01-01' }), params)

    const [, , to, reason] = h.transitionOrder.mock.calls[0]
    expect(to).toBe('ACCEPTED')
    expect(reason).toBe('MERCHANT_ACCEPTED')
  })

  it('🔑 a retry of a successful accept is 200, not a conflict', async () => {
    // The order is already where this request wanted it. State-based
    // idempotency: no key, no duplicate history, a stable answer.
    h.transitionOrder.mockResolvedValue({ kind: 'already_terminal', status: 'ACCEPTED', updatedAt: 't' })
    const res = await accept(post(), params)
    expect(res.status).toBe(200)
    expect((await res.json()).alreadyApplied).toBe(true)
  })

  it('🔑 409 when something else won — the state that won is not silently accepted', async () => {
    h.transitionOrder.mockResolvedValue({ kind: 'already_terminal', status: 'REJECTED', updatedAt: 't' })
    const res = await accept(post(), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('order_not_pending')
  })

  it('404 for an order that is not this merchant’s', async () => {
    h.transitionOrder.mockResolvedValue({ kind: 'not_found' })
    expect((await accept(post(), params)).status).toBe(404)
  })

  it('404 for a malformed public id, without touching the database', async () => {
    const res = await accept(post(), { params: { publicId: 'not-a-ulid' } })
    expect(res.status).toBe(404)
    expect(h.transitionOrder).not.toHaveBeenCalled()
  })

  it('refuses an anonymous session before doing anything', async () => {
    h.refuseAnon.mockReturnValue(new Response(null, { status: 403 }))
    const res = await accept(post(), params)
    expect(res.status).toBe(403)
    expect(h.transitionOrder).not.toHaveBeenCalled()
  })

  it('passes the guard failure straight through', async () => {
    h.requireMerchant.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) })
    expect((await accept(post(), params)).status).toBe(401)
  })
})

describe('reject', () => {
  it('defaults the reason to OTHER when no body is sent', async () => {
    h.transitionOrder.mockResolvedValue({ kind: 'transitioned', status: 'REJECTED', updatedAt: 't' })
    await reject(post(), params)
    expect(h.transitionOrder.mock.calls[0][3]).toBe('MERCHANT_REJECTED:OTHER')
  })

  it('carries a bounded reason into the history', async () => {
    h.transitionOrder.mockResolvedValue({ kind: 'transitioned', status: 'REJECTED', updatedAt: 't' })
    await reject(post({ reason: 'OUT_OF_STOCK' }), params)
    expect(h.transitionOrder.mock.calls[0][3]).toBe('MERCHANT_REJECTED:OUT_OF_STOCK')
  })

  it('🔑 refuses a reason outside the bounded set', async () => {
    const res = await reject(post({ reason: 'because I felt like it' }), params)
    expect(res.status).toBe(422)
    expect(h.transitionOrder).not.toHaveBeenCalled()
  })

  it('🔑 strips a status, actor or timestamp sent alongside the reason', async () => {
    h.transitionOrder.mockResolvedValue({ kind: 'transitioned', status: 'REJECTED', updatedAt: 't' })
    await reject(post({ reason: 'SPAM', status: 'ACCEPTED', actor: 'ADMIN', updatedAt: 'x' }), params)

    const [, , to, reason] = h.transitionOrder.mock.calls[0]
    expect(to).toBe('REJECTED')
    expect(reason).toBe('MERCHANT_REJECTED:SPAM')
  })

  it('a retry of a reject — including one the expiry job already did — is 200', async () => {
    h.transitionOrder.mockResolvedValue({ kind: 'already_terminal', status: 'REJECTED', updatedAt: 't' })
    const res = await reject(post(), params)
    expect(res.status).toBe(200)
    expect((await res.json()).alreadyApplied).toBe(true)
  })

  it('409 when the order was already accepted', async () => {
    h.transitionOrder.mockResolvedValue({ kind: 'already_terminal', status: 'ACCEPTED', updatedAt: 't' })
    expect((await reject(post(), params)).status).toBe(409)
  })
})

describe('detail', () => {
  it('404 for an order that is not this merchant’s', async () => {
    h.findMerchantOrder.mockResolvedValue(null)
    expect((await detail(post(), params)).status).toBe(404)
  })

  it('passes the context to the repository, never a merchant from the request', async () => {
    h.findMerchantOrder.mockResolvedValue(null)
    await detail(post(), params)
    expect(h.findMerchantOrder).toHaveBeenCalledWith(CTX, ORDER)
  })
})

describe('inbox', () => {
  const get = (qs = '') => new Request(`https://tappyai.com/api/business/orders${qs}`)

  it('🔑 a malformed cursor is a 422, never a silent restart at page one', async () => {
    // A merchant paging their inbox would otherwise loop over the newest page
    // forever and never reach the older orders.
    const res = await list(get('?cursor=not-a-cursor'))
    expect(res.status).toBe(422)
    expect(h.listMerchantOrders).not.toHaveBeenCalled()
  })

  it('rejects a limit outside the allowed range', async () => {
    expect((await list(get('?limit=0'))).status).toBe(422)
    expect((await list(get('?limit=500'))).status).toBe(422)
  })

  it('rejects a status outside the three locked ones', async () => {
    expect((await list(get('?status=COMPLETED'))).status).toBe(422)
  })

  it('asks for one more row than requested, to answer hasMore from the query', async () => {
    await list(get('?limit=5'))
    expect(h.listMerchantOrders.mock.calls[0][1]).toMatchObject({ limit: 6 })
  })

  it('reports hasMore and a cursor only when there is another page', async () => {
    const row = (n: number) => ({
      public_id: `0000000000000000000000000${n}`,
      status: 'PENDING',
      created_at: `2026-09-1${n}T00:00:00Z`,
      updated_at: 'u',
      expires_at: 'e',
      customer_name: 'Lan',
      customer_phone: '0901234567',
      total_amount: '90000',
      total_items: 2,
      currency: 'VND',
      source: 'DIRECT',
    })
    h.listMerchantOrders.mockResolvedValue([row(1), row(2), row(3)])
    const body = await (await list(get('?limit=2'))).json()

    expect(body.orders).toHaveLength(2)
    expect(body.page.hasMore).toBe(true)
    expect(typeof body.page.cursor).toBe('string')

    h.listMerchantOrders.mockResolvedValue([row(1)])
    const last = await (await list(get('?limit=2'))).json()
    expect(last.page).toEqual({ cursor: null, hasMore: false })
  })
})
