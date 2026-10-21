import { describe, it, expect } from 'vitest'
import {
  toMerchantOrderDetail,
  toMerchantOrderSummary,
  toMerchantProduct,
  toPublicProduct,
} from './views'
import type { ProductRow, PublicProductRow } from './repositories/products'

// Tappy Business — the public response boundary.
//
// 🔑 THE TEST THAT MATTERS HERE drives a row carrying deliberately poisoned
// internal fields through the public mapper and asserts none of them survive.
//
// It is written this way because the leak this guards against does not arrive
// with the code that exposes it. It arrives months later with a migration that
// adds a column, at which point a `{...row}` response starts shipping it and
// nothing in that review looks wrong. An allow-list makes the new column
// invisible until somebody decides otherwise — and this test fails if anyone
// swaps the allow-list back for a spread.

/** A row as PostgREST would return it, plus every field that must not escape. */
const poisoned = {
  public_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  name: 'Áo thun cotton',
  description: 'Cotton 100%',
  image_asset_key: 'products/01ARZ3NDEKTSV4RRFFQ69G5FAV/abc123.jpg',
  price_amount: '45000',
  currency: 'VND',
  is_available: true,
  status: 'ACTIVE',
  merchant_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  // Everything below is what a spread would leak.
  id: 'dddddddd-4444-4444-8444-dddddddddddd',
  created_at: '2026-09-08T00:00:00Z',
  updated_at: '2026-09-08T01:00:00Z',
  deleted_at: null,
  controller_user_id: '11111111-1111-4111-8111-111111111111',
  legal_name: 'Lan Trading Co',
  tax_or_identity_number: '0123456789',
  customer_phone: '0901234567',
  terms_version: '2026-09-08',
} as unknown as PublicProductRow

const SHOP = { shop_name: 'Lan Shop', status: 'ACTIVE' }

/** Every string anywhere in a value — the only reliable way to check a leak. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => allStrings(v, out))
  return out
}

describe('the public product response', () => {
  const view = toPublicProduct(poisoned, SHOP)
  const keys = Object.keys(view).sort()

  it('🔑 exposes exactly the customer-facing fields, and no others', () => {
    expect(keys).toEqual(
      [
        'currency',
        'description',
        'imageUrl',
        'isAvailable',
        'isOrderable',
        'name',
        'options',
        'priceAmount',
        'priceFormatted',
        'publicId',
        'shop',
        'status',
      ].sort()
    )
  })

  it('🔑 leaks no internal UUID — not the product’s, not the merchant’s', () => {
    const strings = allStrings(view)
    expect(strings).not.toContain('dddddddd-4444-4444-8444-dddddddddddd')
    expect(strings).not.toContain('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')
    expect(strings).not.toContain('11111111-1111-4111-8111-111111111111')
  })

  it('🔑 leaks no merchant private data, audit field or terms record', () => {
    const strings = allStrings(view)
    for (const secret of ['Lan Trading Co', '0123456789', '0901234567', '2026-09-08T01:00:00Z']) {
      expect(strings, secret).not.toContain(secret)
    }
    expect(view).not.toHaveProperty('createdAt')
    expect(view).not.toHaveProperty('updatedAt')
    expect(view).not.toHaveProperty('deletedAt')
  })

  it('🔑 does not expose the storage key, only a resolved URL', () => {
    // The bucket layout is ours. A customer gets somewhere to fetch the image,
    // not the shape of the object store.
    expect(view).not.toHaveProperty('imageAssetKey')
    expect(allStrings(view)).not.toContain(poisoned.image_asset_key)
  })

  it('shows the shop by display name only', () => {
    expect(view.shop).toEqual({ name: 'Lan Shop' })
  })

  it('renders VND with no fractional part', () => {
    expect(view.priceAmount).toBe(45_000)
    expect(view.priceFormatted).toBe('45.000₫')
  })
})

describe('orderability is decided on the server', () => {
  const base = { ...poisoned }

  it('is orderable when product and shop are both active and available', () => {
    expect(toPublicProduct(base, SHOP).isOrderable).toBe(true)
  })

  it('is not orderable when the merchant marked it unavailable', () => {
    expect(toPublicProduct({ ...base, is_available: false }, SHOP).isOrderable).toBe(false)
  })

  it('🔑 is not orderable when the shop is suspended', () => {
    // The moderation action must stop sales the moment it lands. A client
    // deciding for itself would keep selling until it next reloaded.
    const view = toPublicProduct(base, { shop_name: 'Lan Shop', status: 'SUSPENDED' })
    expect(view.isOrderable).toBe(false)
  })

  it('is not orderable when the shop cannot be resolved at all', () => {
    expect(toPublicProduct(base, null).isOrderable).toBe(false)
  })
})

describe('a retired product still renders (P0 §11)', () => {
  it('reports RETIRED rather than disappearing', () => {
    // A link a merchant posted to Facebook outlives the product, so the page
    // says "ngừng bán" instead of 404ing.
    const view = toPublicProduct({ ...poisoned, status: 'DELETED' }, SHOP)
    expect(view.status).toBe('RETIRED')
    expect(view.isOrderable).toBe(false)
    expect(view.name).toBe('Áo thun cotton')
  })

  it('collapses UNPUBLISHED to the same customer-facing state', () => {
    // A customer has no business learning whether a product was withdrawn by
    // its merchant or unpublished by moderation.
    expect(toPublicProduct({ ...poisoned, status: 'UNPUBLISHED' }, SHOP).status).toBe('RETIRED')
  })
})

describe('the merchant view of their own product', () => {
  const row = {
    ...poisoned,
    created_at: '2026-09-08T00:00:00Z',
    updated_at: '2026-09-08T01:00:00Z',
    deleted_at: null,
  } as unknown as ProductRow
  const view = toMerchantProduct(row)

  it('includes the storage key, because the merchant uploaded it', () => {
    expect(view.imageAssetKey).toBe(poisoned.image_asset_key)
    expect(view.imageUrl).toContain('abc123.jpg')
  })

  it('still exposes no internal UUID and no other merchant’s data', () => {
    const strings = allStrings(view)
    expect(strings).not.toContain('dddddddd-4444-4444-8444-dddddddddddd')
    expect(strings).not.toContain('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')
    expect(view).not.toHaveProperty('merchantId')
  })

  it('carries the price as an integer count of đồng', () => {
    expect(view.priceAmount).toBe(45_000)
  })
})

describe('P4 audit — the merchant order views leak no internals', () => {
  // The deferred "MerchantContext serializer" finding was that `merchantId`
  // (an internal UUID) sits beside `merchantPublicId`, so a route that spread a
  // context or a row could publish it. These mappers are the only path from a
  // merchant order row to the network, so this is where that is settled.
  const poisonedOrder = {
    public_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    status: 'ACCEPTED',
    created_at: '2026-09-11T00:00:00Z',
    updated_at: '2026-09-11T01:00:00Z',
    expires_at: '2026-09-14T00:00:00Z',
    customer_name: 'Nguyễn Thị Lan',
    customer_phone: '0901234567',
    customer_address: '128 Nguyễn Văn Cừ, Q5',
    customer_note: 'Giao sau 18h',
    total_amount: '90000',
    total_items: 2,
    currency: 'VND',
    source: 'CLIP',
    // Everything below must not survive the mapper.
    id: 'dddddddd-4444-4444-8444-dddddddddddd',
    merchant_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    tracking_token_hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    source_content_public_id: '01J8ZACLIPCONTENTID0000000',
  } as never

  const items = [
    {
      product_name_snapshot: 'Áo thun cotton',
      quantity: 2,
      unit_price_amount: '45000',
      line_total_amount: '90000',
      currency: 'VND',
      selected_options_snapshot: [{ group: 'Màu', value: 'Đỏ' }],
    },
  ]
  const history = [
    { from_status: null, to_status: 'PENDING', actor_type: 'CUSTOMER', reason: 'CREATED', created_at: 'a' },
    {
      from_status: 'PENDING',
      to_status: 'ACCEPTED',
      actor_type: 'MERCHANT',
      reason: 'MERCHANT_ACCEPTED',
      created_at: 'b',
    },
  ]

  it('🔑 the summary exposes no internal UUID, token hash or Explore id', () => {
    const raw = JSON.stringify(toMerchantOrderSummary(poisonedOrder))
    for (const secret of [
      'dddddddd-4444-4444-8444-dddddddddddd',
      'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      '01J8ZACLIPCONTENTID0000000',
    ]) {
      expect(raw, secret).not.toContain(secret)
    }
  })

  it('🔑 the detail does the same, and drops the history actor id', () => {
    const view = toMerchantOrderDetail(poisonedOrder, items, history as never)
    const raw = JSON.stringify(view)
    expect(raw).not.toContain('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')
    expect(raw).not.toContain('dddddddd-4444-4444-8444-dddddddddddd')
    // Which staff account acted is internal identity, not order data.
    expect(raw).not.toContain('actorId')
    expect(view.history[1]).toEqual({
      from: 'PENDING',
      to: 'ACCEPTED',
      actor: 'MERCHANT',
      reason: 'MERCHANT_ACCEPTED',
      at: 'b',
    })
  })

  it('shows the merchant their own customer unmasked — this is their surface', () => {
    // Deliberately different from the public tracking view: P0 §6 makes the
    // merchant the party who has to contact the customer.
    const view = toMerchantOrderDetail(poisonedOrder, items, history as never)
    expect(view.customerPhone).toBe('0901234567')
    expect(view.customerAddress).toBe('128 Nguyễn Văn Cừ, Q5')
    expect(view.customerNote).toBe('Giao sau 18h')
  })

  it('exposes exactly the agreed detail fields', () => {
    const keys = Object.keys(toMerchantOrderDetail(poisonedOrder, items, history as never)).sort()
    expect(keys).toEqual(
      [
        'currency', 'customerAddress', 'customerName', 'customerNote', 'customerPhone',
        'expiresAt', 'history', 'items', 'placedAt', 'reference', 'source', 'status',
        'totalAmount', 'totalFormatted', 'totalItems', 'updatedAt',
      ].sort()
    )
  })
})
