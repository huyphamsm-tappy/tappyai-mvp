import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { __resetBusinessDb, __setBusinessDb } from './client'
import { createFakeDb, callsFor, type FakeDb } from './__fixtures__/fakeDb'
import { createOrder, findOrderableProduct } from './orders'

// Tappy Business — guest order creation is the ONE path with no MerchantContext.
//
// 🔑 THE PROPERTY UNDER TEST: merchant ownership is derived from the PRODUCT
// row, never from anything the client sent. A guest has no session, so the
// usual "context first" rule cannot apply — this file is the check that the
// replacement is the product and not the request body.

const MERCHANT_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const MERCHANT_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const PRODUCT_ID = 'cccccccc-3333-4333-8333-cccccccccccc'
const PRODUCT_PUBLIC = '01BX5ZZKBKACTAV9WEVGEMMVRZ'

let db: FakeDb

beforeEach(() => {
  db = createFakeDb()
  __setBusinessDb(db.client as never)
})
afterEach(() => __resetBusinessDb())

const productRow = {
  id: PRODUCT_ID,
  public_id: PRODUCT_PUBLIC,
  merchant_id: MERCHANT_A,
  name: 'Áo thun cotton',
  price_amount: '45000',
  currency: 'VND',
  is_available: true,
  status: 'ACTIVE',
}
const merchantRow = {
  id: MERCHANT_A,
  public_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  status: 'ACTIVE',
  controller_user_id: '11111111-1111-4111-8111-111111111111',
  shop_name: 'Lan Shop',
}

describe('resolving a product for ordering', () => {
  it('🔑 takes the merchant FROM THE PRODUCT, not from any argument', async () => {
    db.queue('business_products', { data: productRow })
    db.queue('business_merchants', { data: merchantRow })

    const resolved = await findOrderableProduct(PRODUCT_PUBLIC)

    expect(resolved?.merchantId).toBe(MERCHANT_A)
    // The merchant lookup filtered on the id the PRODUCT carried.
    expect(callsFor(db, 'business_merchants')[0].filters).toEqual({ id: MERCHANT_A })
    // And it takes exactly one argument: the product's public id.
    expect(findOrderableProduct.length).toBe(1)
  })

  it('returns everything the caller needs to refuse an order', async () => {
    db.queue('business_products', { data: { ...productRow, is_available: false, status: 'UNPUBLISHED' } })
    db.queue('business_merchants', { data: { ...merchantRow, status: 'SUSPENDED' } })

    const resolved = await findOrderableProduct(PRODUCT_PUBLIC)
    // The route collapses all three into one customer-facing answer; the
    // repository reports them separately so the decision stays server-side.
    expect(resolved?.isAvailable).toBe(false)
    expect(resolved?.status).toBe('UNPUBLISHED')
    expect(resolved?.merchantStatus).toBe('SUSPENDED')
  })

  it('returns null when the product is unknown, without reading a merchant', async () => {
    db.queue('business_products', { data: null })
    expect(await findOrderableProduct(PRODUCT_PUBLIC)).toBeNull()
    expect(callsFor(db, 'business_merchants')).toHaveLength(0)
  })

  it('never selects the price as anything but the stored column', async () => {
    db.queue('business_products', { data: productRow })
    db.queue('business_merchants', { data: merchantRow })
    await findOrderableProduct(PRODUCT_PUBLIC)

    const columns = callsFor(db, 'business_products')[0].columns ?? ''
    expect(columns).toContain('price_amount')
    expect(columns).not.toContain('*')
  })
})

describe('writing the order', () => {
  const args = {
    orderPublicId: '01CRZ3NDEKTSV4RRFFQ69G5FAV',
    merchantId: MERCHANT_A,
    trackingTokenHash: Buffer.alloc(32, 7),
    customerName: 'Nguyễn Thị Lan',
    customerPhone: '0901234567',
    customerAddress: '128 Nguyễn Văn Cừ, Q5',
    customerNote: null,
    source: 'DIRECT',
    sourceContentPublicId: null,
    expiresAt: '2026-09-11T00:00:00Z',
    productId: PRODUCT_ID,
    productPublicId: PRODUCT_PUBLIC,
    productNameSnapshot: 'Áo thun cotton',
    unitPriceAmount: 45_000,
    quantity: 2,
    selectedOptionsSnapshot: [{ group: 'Màu', value: 'Đỏ' }],
  }

  it('🔑 goes through the atomic function, not three separate inserts', async () => {
    db.queue('fn_business_create_order', {
      data: [
        {
          order_public_id: args.orderPublicId,
          status: 'PENDING',
          total_amount: '90000',
          total_items: 2,
          created_at: 'x',
          expires_at: args.expiresAt,
        },
      ],
    })
    await createOrder(args)

    // Three inserts from the application could leave an order with no item
    // after a crash — wrong totals, no product, unrepairable.
    expect(db.calls.map((c) => c.op)).toEqual(['rpc'])
    expect(db.calls[0].table).toBe('fn_business_create_order')
    expect(callsFor(db, 'business_orders')).toHaveLength(0)
    expect(callsFor(db, 'business_order_items')).toHaveLength(0)
  })

  it('passes the merchant, price and name that the caller resolved from the product', async () => {
    db.queue('fn_business_create_order', {
      data: [{ order_public_id: args.orderPublicId, status: 'PENDING', total_amount: '90000', total_items: 2, created_at: 'x', expires_at: 'y' }],
    })
    await createOrder(args)

    const payload = db.calls[0].payload as Record<string, unknown>
    expect(payload.p_merchant_id).toBe(MERCHANT_A)
    expect(payload.p_merchant_id).not.toBe(MERCHANT_B)
    expect(payload.p_unit_price_amount).toBe(45_000)
    expect(payload.p_product_name_snapshot).toBe('Áo thun cotton')
    expect(payload.p_quantity).toBe(2)
  })

  it('🔑 sends no total, no status and no currency — the database computes them', async () => {
    db.queue('fn_business_create_order', {
      data: [{ order_public_id: args.orderPublicId, status: 'PENDING', total_amount: '90000', total_items: 2, created_at: 'x', expires_at: 'y' }],
    })
    await createOrder(args)

    const payload = db.calls[0].payload as Record<string, unknown>
    for (const absent of ['p_total_amount', 'p_total_items', 'p_status', 'p_currency', 'p_line_total_amount']) {
      expect(payload, absent).not.toHaveProperty(absent)
    }
  })

  it('sends the token as a digest, never the token itself', async () => {
    db.queue('fn_business_create_order', {
      data: [{ order_public_id: args.orderPublicId, status: 'PENDING', total_amount: '90000', total_items: 2, created_at: 'x', expires_at: 'y' }],
    })
    await createOrder(args)

    const payload = db.calls[0].payload as Record<string, unknown>
    // PostgREST takes bytea as a hex escape. 32 bytes → 64 hex characters.
    expect(payload.p_tracking_token_hash).toBe(`\\x${'07'.repeat(32)}`)
  })

  it('throws rather than inventing a result when the function returns nothing', async () => {
    db.queue('fn_business_create_order', { data: [] })
    await expect(createOrder(args)).rejects.toThrow(/no row/)
  })
})
