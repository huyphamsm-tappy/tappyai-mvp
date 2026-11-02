import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { __resetBusinessDb, __setBusinessDb } from './client'
import { createFakeDb, callsFor, type FakeDb } from './__fixtures__/fakeDb'
import {
  createProduct,
  findProduct,
  listOptions,
  listProducts,
  replaceOptions,
  softDeleteProduct,
  updateProduct,
  findPublicProduct,
} from './products'
import type { MerchantContext } from '../authz'

// Tappy Business — merchant isolation in the product repository.
//
// 🔑 THE PROPERTY UNDER TEST: every merchant-scoped query carries `merchant_id`
// taken from the MerchantContext, so a caller holding another shop's public id
// matches zero rows instead of somebody else's product.
//
// This matters more here than it would in most codebases: the Business tables
// grant to `service_role` with RLS carrying no policies, so PostgreSQL has no
// row-level opinion about who is asking. A query that omits the filter succeeds
// and returns the wrong merchant's data. These tests are the check that the
// filter is there.

const ALICE: MerchantContext = {
  merchantId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  merchantPublicId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  controllerUserId: '11111111-1111-4111-8111-111111111111',
  status: 'ACTIVE',
}
const BOB: MerchantContext = {
  merchantId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  merchantPublicId: '01BX5ZZKBKACTAV9WEVGEMMVRZ',
  controllerUserId: '22222222-2222-4222-8222-222222222222',
  status: 'ACTIVE',
}

/** A product public id that belongs to Bob. Alice will try to use it. */
const BOBS_PRODUCT = '01CRZ3NDEKTSV4RRFFQ69G5FAV'

let db: FakeDb

beforeEach(() => {
  db = createFakeDb()
  __setBusinessDb(db.client as never)
})

afterEach(() => {
  __resetBusinessDb()
})

const productRow = (publicId: string) => ({
  public_id: publicId,
  name: 'Áo thun cotton',
  description: null,
  image_asset_key: null,
  price_amount: '45000',
  currency: 'VND',
  is_available: true,
  status: 'ACTIVE',
  created_at: '2026-09-08T00:00:00Z',
  updated_at: '2026-09-08T00:00:00Z',
  deleted_at: null,
})

describe('every read carries the merchant filter', () => {
  it('listProducts scopes to the context merchant', async () => {
    db.queue('business_products', { data: [] })
    await listProducts(ALICE)

    const [call] = callsFor(db, 'business_products')
    expect(call.filters.merchant_id).toBe(ALICE.merchantId)
  })

  it('findProduct scopes by public_id AND merchant_id', async () => {
    db.queue('business_products', { data: productRow('01DRZ3NDEKTSV4RRFFQ69G5FAV') })
    await findProduct(ALICE, '01DRZ3NDEKTSV4RRFFQ69G5FAV')

    const [call] = callsFor(db, 'business_products')
    // The public id alone would be an address anyone could guess at. Both, or
    // the lookup is an IDOR.
    expect(call.filters.public_id).toBe('01DRZ3NDEKTSV4RRFFQ69G5FAV')
    expect(call.filters.merchant_id).toBe(ALICE.merchantId)
  })

  it('the same call as a different merchant carries a different filter', async () => {
    db.queue('business_products', { data: null })
    await findProduct(BOB, '01DRZ3NDEKTSV4RRFFQ69G5FAV')

    const [call] = callsFor(db, 'business_products')
    expect(call.filters.merchant_id).toBe(BOB.merchantId)
    expect(call.filters.merchant_id).not.toBe(ALICE.merchantId)
  })
})

describe('IDOR — Alice reaching for Bob’s product', () => {
  it('🔑 read: the query is scoped to Alice, so Bob’s id matches nothing', async () => {
    // The fake returns null because the real database would: the row exists,
    // but not with Alice's merchant_id.
    db.queue('business_products', { data: null })
    const result = await findProduct(ALICE, BOBS_PRODUCT)

    expect(result).toBeNull()
    expect(callsFor(db, 'business_products')[0].filters).toEqual({
      public_id: BOBS_PRODUCT,
      merchant_id: ALICE.merchantId,
    })
  })

  it('🔑 update: the write is scoped, and reports null rather than touching the row', async () => {
    db.queue('business_products', { data: null })
    const result = await updateProduct(ALICE, BOBS_PRODUCT, { name: 'hijacked' })

    expect(result).toBeNull()
    const [call] = callsFor(db, 'business_products')
    expect(call.op).toBe('update')
    expect(call.filters.merchant_id).toBe(ALICE.merchantId)
  })

  it('🔑 delete: the tombstone write is scoped too', async () => {
    db.queue('business_products', { data: null })
    const result = await softDeleteProduct(ALICE, BOBS_PRODUCT)

    expect(result).toBeNull()
    const [call] = callsFor(db, 'business_products')
    expect(call.filters.merchant_id).toBe(ALICE.merchantId)
  })

  it('🔑 options: a foreign product resolves to no id, so nothing is written', async () => {
    // The ownership check happens FIRST, and a miss means the delete-then-insert
    // never runs. If it ran, it would clear another merchant's options.
    db.queue('business_products', { data: null })
    const result = await replaceOptions(ALICE, BOBS_PRODUCT, [
      { name: 'Màu', isRequired: false, values: ['Đỏ'] },
    ])

    expect(result).toEqual([])
    expect(callsFor(db, 'business_product_option_groups')).toHaveLength(0)
    expect(callsFor(db, 'business_product_option_values')).toHaveLength(0)
  })

  it('🔑 listing options for a foreign product returns nothing and queries nothing', async () => {
    db.queue('business_products', { data: null })
    expect(await listOptions(ALICE, BOBS_PRODUCT)).toEqual([])
    expect(callsFor(db, 'business_product_option_groups')).toHaveLength(0)
  })
})

describe('merchant_id always comes from the context, never from input', () => {
  it('createProduct stamps the context merchant onto the row', async () => {
    db.queue('business_products', { data: productRow('01ERZ3NDEKTSV4RRFFQ69G5FAV') })
    await createProduct(ALICE, {
      name: 'Áo thun cotton',
      priceAmount: 45_000,
      currency: 'VND',
      isAvailable: true,
    })

    const payload = callsFor(db, 'business_products')[0].payload as Record<string, unknown>
    expect(payload.merchant_id).toBe(ALICE.merchantId)
  })

  it('createProduct has no parameter through which a merchant could be named', () => {
    // `createProduct(ctx, input)` — two parameters, the first of which is the
    // identity. If a third appears carrying an id, this fails and the review
    // happens.
    expect(createProduct.length).toBe(2)
    expect(findProduct.length).toBe(2)
    expect(updateProduct.length).toBe(3)
    expect(softDeleteProduct.length).toBe(2)
  })

  it('an input carrying merchant_id cannot override the context', async () => {
    db.queue('business_products', { data: productRow('01FRZ3NDEKTSV4RRFFQ69G5FAV') })
    // `merchantId`/`merchant_id` are not part of CreateProductData; they are
    // passed anyway to prove the repository builds its own payload rather than
    // spreading whatever it is handed.
    await createProduct(ALICE, {
      name: 'x',
      priceAmount: 1,
      currency: 'VND',
      isAvailable: true,
      merchantId: BOB.merchantId,
      merchant_id: BOB.merchantId,
    } as unknown as Parameters<typeof createProduct>[1])

    const payload = callsFor(db, 'business_products')[0].payload as Record<string, unknown>
    expect(payload.merchant_id).toBe(ALICE.merchantId)
    expect(payload.merchant_id).not.toBe(BOB.merchantId)
  })

  it('updateProduct never writes merchant_id, public_id or status', async () => {
    db.queue('business_products', { data: productRow('01GRZ3NDEKTSV4RRFFQ69G5FAV') })
    await updateProduct(ALICE, '01GRZ3NDEKTSV4RRFFQ69G5FAV', {
      name: 'new name',
      merchant_id: BOB.merchantId,
      public_id: 'x',
      status: 'ACTIVE',
    } as unknown as Parameters<typeof updateProduct>[2])

    const payload = callsFor(db, 'business_products')[0].payload as Record<string, unknown>
    // Ownership cannot be transferred by an edit, the external id is stable for
    // the life of the row, and deletion goes through softDeleteProduct so the
    // tombstone timestamp is always written with the status.
    expect(payload).toEqual({ name: 'new name' })
  })
})

describe('soft delete is a tombstone, never a removal', () => {
  it('writes DELETED plus a timestamp, and never issues a DELETE', async () => {
    db.queue('business_products', { data: { ...productRow('01H'), status: 'DELETED' } })
    await softDeleteProduct(ALICE, '01HRZ3NDEKTSV4RRFFQ69G5FAV')

    const [call] = callsFor(db, 'business_products')
    expect(call.op).toBe('update')
    const payload = call.payload as Record<string, unknown>
    expect(payload.status).toBe('DELETED')
    // The schema's deletion-consistency CHECK requires both together.
    expect(typeof payload.deleted_at).toBe('string')
    expect(payload.is_available).toBe(false)
    expect(db.calls.some((c) => c.op === 'delete' && c.table === 'business_products')).toBe(false)
  })
})

describe('the public read is the one unscoped query, and is narrow instead', () => {
  it('takes no context and applies no merchant filter', async () => {
    db.queue('business_products', { data: null })
    await findPublicProduct('01JRZ3NDEKTSV4RRFFQ69G5FAV')

    const [call] = callsFor(db, 'business_products')
    expect(call.filters).toEqual({ public_id: '01JRZ3NDEKTSV4RRFFQ69G5FAV' })
    expect(findPublicProduct.length).toBe(1)
  })

  it('selects an explicit column list that excludes every internal and audit field', async () => {
    db.queue('business_products', { data: null })
    await findPublicProduct('01KRZ3NDEKTSV4RRFFQ69G5FAV')

    const columns = callsFor(db, 'business_products')[0].columns ?? ''
    // `select('*')` here would hand a customer every column the table ever
    // grows, including ones added long after anyone read this file.
    expect(columns).not.toContain('*')
    for (const forbidden of ['created_at', 'updated_at', 'deleted_at']) {
      expect(columns, forbidden).not.toContain(forbidden)
    }
    // `id` must not appear as its own column. `public_id` legitimately contains
    // the substring, so the check is on the comma-separated list.
    expect(columns.split(',').map((c) => c.trim())).not.toContain('id')
  })
})
