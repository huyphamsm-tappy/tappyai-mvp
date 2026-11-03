import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUSINESS_CATEGORIES,
  CreateOrderSchema,
  resolveSelectedOptions,
  CreateMerchantSchema,
  CreateProductSchema,
  MERCHANT_TERMS_VERSION,
  MAX_OPTION_GROUPS,
  MAX_OPTION_VALUES,
  UpdateMerchantSchema,
  UpdateProductSchema,
  isOwnedProductImageKey,
} from './schema'

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260908_tappy_business_p0.sql'),
  'utf8'
)

const merchant = {
  businessCategory: 'CAFE',
  shopName: 'Lan Shop',
  address: '128 Nguyễn Văn Cừ, Q5',
  phone: '0901234567',
  acceptedTermsVersion: MERCHANT_TERMS_VERSION,
}
const product = { name: 'Áo thun cotton', priceAmount: 45_000 }

describe('the category list matches the database', () => {
  it('🔑 every category validation accepts, the CHECK constraint also accepts', () => {
    // Two copies of one list. If they drift, a category that passes validation
    // reaches an INSERT the database rejects — a 500 for the merchant, on data
    // the API told them was fine.
    const check = /business_category\s+TEXT NOT NULL CHECK \(business_category IN \(([\s\S]*?)\)\)/.exec(
      MIGRATION
    )
    expect(check).not.toBeNull()
    const inDb = [...check![1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort()
    expect(inDb).toEqual([...BUSINESS_CATEGORIES].sort())
  })

  it('rejects a category the database would refuse', () => {
    expect(CreateMerchantSchema.safeParse({ ...merchant, businessCategory: 'CRYPTO' }).success).toBe(
      false
    )
  })
})

describe('merchant onboarding validation', () => {
  it('accepts a well-formed shop', () => {
    expect(CreateMerchantSchema.safeParse(merchant).success).toBe(true)
  })

  it('requires the current terms version, refusing a stale one', () => {
    expect(
      CreateMerchantSchema.safeParse({ ...merchant, acceptedTermsVersion: '2020-01-01' }).success
    ).toBe(false)
  })

  it('rejects blank or whitespace-only required text', () => {
    for (const field of ['shopName', 'address', 'phone']) {
      expect(CreateMerchantSchema.safeParse({ ...merchant, [field]: '   ' }).success, field).toBe(
        false
      )
    }
  })

  it('trims before measuring, so " Lan " is a valid name', () => {
    const parsed = CreateMerchantSchema.safeParse({ ...merchant, shopName: '  Lan Shop  ' })
    expect(parsed.success && parsed.data.shopName).toBe('Lan Shop')
  })

  it('🔑 offers no way to set status or the legal identity fields', () => {
    const parsed = UpdateMerchantSchema.safeParse({
      shopName: 'x',
      status: 'ACTIVE',
      legalName: 'Injected Co',
      taxOrIdentityNumber: '0123456789',
    })
    // Zod strips unknown keys, so the escalation never reaches the repository.
    expect(parsed.success && parsed.data).toEqual({ shopName: 'x' })
  })

  it('rejects an empty patch rather than issuing a pointless write', () => {
    expect(UpdateMerchantSchema.safeParse({}).success).toBe(false)
  })
})

describe('price is integer VND', () => {
  it('accepts 45000, meaning 45,000 ₫', () => {
    const parsed = CreateProductSchema.safeParse(product)
    expect(parsed.success && parsed.data.priceAmount).toBe(45_000)
    expect(parsed.success && parsed.data.currency).toBe('VND')
  })

  it('🔑 rejects a float instead of rounding it into a customer’s total', () => {
    expect(CreateProductSchema.safeParse({ ...product, priceAmount: 45.5 }).success).toBe(false)
    expect(CreateProductSchema.safeParse({ ...product, priceAmount: 0.1 + 0.2 }).success).toBe(false)
  })

  it('rejects a negative price, and accepts a free product', () => {
    expect(CreateProductSchema.safeParse({ ...product, priceAmount: -1 }).success).toBe(false)
    expect(CreateProductSchema.safeParse({ ...product, priceAmount: 0 }).success).toBe(true)
  })

  it('rejects a price sent as a string', () => {
    expect(CreateProductSchema.safeParse({ ...product, priceAmount: '45000' }).success).toBe(false)
  })

  it('rejects a currency other than VND — MVP is single-currency', () => {
    expect(CreateProductSchema.safeParse({ ...product, currency: 'USD' }).success).toBe(false)
  })
})

describe('product field limits', () => {
  it('requires a name and caps its length', () => {
    expect(CreateProductSchema.safeParse({ ...product, name: '' }).success).toBe(false)
    expect(CreateProductSchema.safeParse({ ...product, name: '   ' }).success).toBe(false)
    expect(CreateProductSchema.safeParse({ ...product, name: 'x'.repeat(201) }).success).toBe(false)
    expect(CreateProductSchema.safeParse({ ...product, name: 'x'.repeat(200) }).success).toBe(true)
  })

  it('caps the description', () => {
    expect(
      CreateProductSchema.safeParse({ ...product, description: 'x'.repeat(2001) }).success
    ).toBe(false)
  })

  it('defaults availability to true', () => {
    const parsed = CreateProductSchema.safeParse(product)
    expect(parsed.success && parsed.data.isAvailable).toBe(true)
  })

  it('rejects an empty update patch', () => {
    expect(UpdateProductSchema.safeParse({}).success).toBe(false)
  })

  it('lets an update clear the image with null, distinct from omitting it', () => {
    // Two different intentions that a single `undefined` could not express.
    expect(UpdateProductSchema.safeParse({ imageAssetKey: null }).success).toBe(true)
  })
})

describe('options are structured, never free-form', () => {
  const group = { name: 'Màu', values: ['Đỏ', 'Xanh'] }

  it('accepts predefined groups and values', () => {
    const parsed = CreateProductSchema.safeParse({ ...product, options: [group] })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.options?.[0].isRequired).toBe(false)
  })

  it('requires at least one value in a group', () => {
    expect(
      CreateProductSchema.safeParse({ ...product, options: [{ name: 'Màu', values: [] }] }).success
    ).toBe(false)
  })

  it('rejects duplicate values, which the database would refuse anyway', () => {
    expect(
      CreateProductSchema.safeParse({ ...product, options: [{ name: 'Màu', values: ['Đỏ', 'Đỏ'] }] })
        .success
    ).toBe(false)
  })

  it('rejects duplicate group names', () => {
    expect(CreateProductSchema.safeParse({ ...product, options: [group, group] }).success).toBe(false)
  })

  it('caps groups and values', () => {
    const many = Array.from({ length: MAX_OPTION_GROUPS + 1 }, (_, i) => ({
      name: `G${i}`,
      values: ['a'],
    }))
    expect(CreateProductSchema.safeParse({ ...product, options: many }).success).toBe(false)

    const wide = [{ name: 'Màu', values: Array.from({ length: MAX_OPTION_VALUES + 1 }, (_, i) => `v${i}`) }]
    expect(CreateProductSchema.safeParse({ ...product, options: wide }).success).toBe(false)
  })

  it('🔑 offers no price delta and no per-variant stock', () => {
    // P0 §12. Zod strips them, so a client sending either changes nothing —
    // this is the boundary that keeps a variant matrix from arriving by accident.
    const parsed = CreateProductSchema.safeParse({
      ...product,
      options: [{ name: 'Màu', values: ['Đỏ'], priceDelta: 5000, stock: 3 }],
    })
    expect(parsed.success && parsed.data.options?.[0]).toEqual({
      name: 'Màu',
      isRequired: false,
      values: ['Đỏ'],
    })
  })
})

describe('a product image must belong to the merchant naming it', () => {
  const MINE = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
  const THEIRS = '01BX5ZZKBKACTAV9WEVGEMMVRZ'

  it('accepts a key minted for this merchant', () => {
    expect(isOwnedProductImageKey(`products/${MINE}/abc123.jpg`, MINE)).toBe(true)
  })

  it('🔑 rejects another merchant’s image', () => {
    expect(isOwnedProductImageKey(`products/${THEIRS}/abc123.jpg`, MINE)).toBe(false)
  })

  it('🔑 rejects a key pointing outside the products prefix', () => {
    // `avatars/…` is somebody's face; `reviews/…` is somebody's photo.
    expect(isOwnedProductImageKey(`avatars/${MINE}/abc123.jpg`, MINE)).toBe(false)
    expect(isOwnedProductImageKey(`reviews/${MINE}/abc123.jpg`, MINE)).toBe(false)
  })

  it('rejects traversal and malformed shapes', () => {
    for (const key of [
      `products/${MINE}/../../etc/passwd`,
      `products/${MINE}`,
      `products/${MINE}/a/b`,
      `products//abc.jpg`,
      `https://example.com/products/${MINE}/a.jpg`,
      '',
    ]) {
      expect(isOwnedProductImageKey(key, MINE), key).toBe(false)
    }
  })
})

describe('guest order input — what the server refuses to take from a client', () => {
  const order = {
    productPublicId: '01BX5ZZKBKACTAV9WEVGEMMVRZ',
    quantity: 2,
    customer: {
      name: 'Nguyễn Thị Lan',
      phone: '0901 234 567',
      address: '128 Nguyễn Văn Cừ, Q5',
    },
  }

  it('accepts a well-formed order', () => {
    const parsed = CreateOrderSchema.safeParse(order)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.source).toBe('DIRECT')
    expect(parsed.success && parsed.data.selectedOptions).toEqual([])
  })

  it('🔑 strips price, currency, totals, status and merchantId', () => {
    // Every one of these is computed server-side from the product row. Zod
    // dropping them is what makes a hostile body inert rather than an error
    // message that tells the caller what the server reads.
    const parsed = CreateOrderSchema.safeParse({
      ...order,
      merchantId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
      priceAmount: 1,
      unitPriceAmount: 1,
      currency: 'USD',
      totalAmount: 1,
      totalItems: 999,
      status: 'ACCEPTED',
      trackingToken: 'mine',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(Object.keys(parsed.data).sort()).toEqual(
      ['customer', 'productPublicId', 'quantity', 'selectedOptions', 'source'].sort()
    )
  })

  it('requires a valid product public id', () => {
    expect(CreateOrderSchema.safeParse({ ...order, productPublicId: 'nope' }).success).toBe(false)
  })

  it('requires a positive, bounded, whole quantity', () => {
    for (const q of [0, -1, 1.5, 100, '2']) {
      expect(CreateOrderSchema.safeParse({ ...order, quantity: q }).success, String(q)).toBe(false)
    }
    expect(CreateOrderSchema.safeParse({ ...order, quantity: 99 }).success).toBe(true)
  })

  it('requires name, phone and address; note is optional', () => {
    for (const field of ['name', 'phone', 'address']) {
      const customer = { ...order.customer, [field]: '   ' }
      expect(CreateOrderSchema.safeParse({ ...order, customer }).success, field).toBe(false)
    }
    expect(
      CreateOrderSchema.safeParse({ ...order, customer: { ...order.customer, note: 'Giao sau 18h' } })
        .success
    ).toBe(true)
  })

  it('accepts a phone written the way a customer writes it, but needs real digits', () => {
    for (const phone of ['0901234567', '090 123 4567', '+84 90 123 4567']) {
      expect(CreateOrderSchema.safeParse({ ...order, customer: { ...order.customer, phone } }).success, phone).toBe(true)
    }
    // Long enough to pass the length check, but not a phone number.
    expect(
      CreateOrderSchema.safeParse({ ...order, customer: { ...order.customer, phone: 'not-a-phone' } })
        .success
    ).toBe(false)
  })

  it('caps the note and the address', () => {
    expect(
      CreateOrderSchema.safeParse({ ...order, customer: { ...order.customer, note: 'x'.repeat(501) } })
        .success
    ).toBe(false)
    expect(
      CreateOrderSchema.safeParse({ ...order, customer: { ...order.customer, address: 'x'.repeat(301) } })
        .success
    ).toBe(false)
  })

  it('constrains the attribution source to the locked set', () => {
    expect(CreateOrderSchema.safeParse({ ...order, source: 'CLIP' }).success).toBe(true)
    expect(CreateOrderSchema.safeParse({ ...order, source: 'MARKETPLACE' }).success).toBe(false)
  })
})

describe('option selection is decidable because options are structured', () => {
  const groups = [
    { name: 'Màu', is_required: true, values: ['Đỏ', 'Xanh'] },
    { name: 'Size', is_required: false, values: ['S', 'M'] },
  ]

  it('accepts a valid selection and returns it in the product’s own order', () => {
    const resolved = resolveSelectedOptions(
      [{ group: 'Size', value: 'M' }, { group: 'Màu', value: 'Đỏ' }],
      groups
    )
    // Stored the way the page read, not the way the client happened to send.
    expect(resolved).toEqual([
      { group: 'Màu', value: 'Đỏ' },
      { group: 'Size', value: 'M' },
    ])
  })

  it('🔑 rejects a group the product does not offer', () => {
    expect(resolveSelectedOptions([{ group: 'Chất liệu', value: 'Lụa' }], groups)).toBeNull()
  })

  it('🔑 rejects a value the group does not offer', () => {
    // Free text here would become an order line a merchant never agreed to sell.
    expect(resolveSelectedOptions([{ group: 'Màu', value: 'Vàng kim' }], groups)).toBeNull()
  })

  it('rejects the same group chosen twice', () => {
    expect(
      resolveSelectedOptions(
        [{ group: 'Màu', value: 'Đỏ' }, { group: 'Màu', value: 'Xanh' }],
        groups
      )
    ).toBeNull()
  })

  it('rejects a missing required group', () => {
    expect(resolveSelectedOptions([{ group: 'Size', value: 'M' }], groups)).toBeNull()
  })

  it('allows omitting an optional group', () => {
    expect(resolveSelectedOptions([{ group: 'Màu', value: 'Đỏ' }], groups)).toEqual([
      { group: 'Màu', value: 'Đỏ' },
    ])
  })

  it('a product with no options accepts an empty selection', () => {
    expect(resolveSelectedOptions([], [])).toEqual([])
  })
})
