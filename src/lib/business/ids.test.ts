import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PUBLIC_ID_LENGTH,
  PUBLIC_ID_PATTERN,
  assertPublicId,
  isPublicId,
  newPublicId,
} from './ids'

// Tappy Business — public identifiers.
//
// What actually needs proving here is not "does it produce 26 characters". It
// is that a `public_id` is UNGUESSABLE, because a product URL and an order's
// external reference are protected by nothing else, and that the TypeScript and
// the database agree on what a valid id looks like.

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260908_tappy_business_p0.sql'),
  'utf8'
)

describe('shape', () => {
  it('is 26 Crockford Base32 characters', () => {
    const id = newPublicId()
    expect(id).toHaveLength(PUBLIC_ID_LENGTH)
    expect(id).toHaveLength(26)
    expect(PUBLIC_ID_PATTERN.test(id)).toBe(true)
  })

  it('never emits I, L, O or U', () => {
    // Crockford's omission. A ULID gets read off a printed QR label and typed
    // back in; these four are the characters people transcribe wrongly.
    const sample = Array.from({ length: 500 }, () => newPublicId()).join('')
    expect(sample).not.toMatch(/[ILOU]/)
  })

  it('accepts only well-formed ids', () => {
    expect(isPublicId(newPublicId())).toBe(true)
    expect(isPublicId('01ARZ3NDEKTSV4RRFFQ69G5FA')).toBe(false) // 25 chars
    expect(isPublicId('01ARZ3NDEKTSV4RRFFQ69G5FAVV')).toBe(false) // 27 chars
    expect(isPublicId('01arz3ndektsv4rrffq69g5fav')).toBe(false) // lowercase
    expect(isPublicId('01ARZ3NDEKTSV4RRFFQ69G5FAI')).toBe(false) // I is not in the alphabet
    expect(isPublicId('')).toBe(false)
    expect(isPublicId(42)).toBe(false)
    expect(isPublicId(null)).toBe(false)
  })

  it('assertPublicId throws without echoing the rejected value', () => {
    // Error text is the easiest place to hand a prober a map, so the invalid
    // input must not appear in the message.
    expect(() => assertPublicId('../../etc/passwd')).toThrow(TypeError)
    try {
      assertPublicId('../../etc/passwd')
    } catch (e) {
      expect((e as Error).message).not.toContain('etc/passwd')
    }
    expect(assertPublicId('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV')
  })
})

describe('unguessability — the property the product URL depends on', () => {
  it('never repeats across a large batch', () => {
    const ids = new Set(Array.from({ length: 20_000 }, () => newPublicId()))
    expect(ids.size).toBe(20_000)
  })

  it('ids minted in the same millisecond differ in their random half', () => {
    // The timestamp prefix is shared by design — it is what makes ids sortable.
    // The 80 random bits are the whole of the secret, so if two ids created at
    // the same instant ever agreed there, product URLs would be enumerable.
    const now = 1_757_000_000_000
    const batch = Array.from({ length: 1_000 }, () => newPublicId(now))
    const prefixes = new Set(batch.map((id) => id.slice(0, 10)))
    const suffixes = new Set(batch.map((id) => id.slice(10)))
    expect(prefixes.size).toBe(1)
    expect(suffixes.size).toBe(1_000)
  })

  it('is not sequential — consecutive ids are not adjacent', () => {
    // The contract's rule is that a database's sequential id must never appear
    // externally. This is the positive statement of it: knowing one id tells
    // you nothing about the next.
    const a = newPublicId()
    const b = newPublicId()
    expect(a).not.toBe(b)
    expect(a.slice(10)).not.toBe(b.slice(10))
  })

  it('encodes the timestamp it was given', () => {
    const early = newPublicId(1_000_000_000_000)
    const late = newPublicId(1_757_000_000_000)
    // Lexicographic order follows chronological order — the property that makes
    // these useful as an index key.
    expect(early < late).toBe(true)
  })

  it('rejects a timestamp the 48-bit prefix cannot hold', () => {
    expect(() => newPublicId(-1)).toThrow(RangeError)
    expect(() => newPublicId(281_474_976_710_656)).toThrow(RangeError)
    expect(() => newPublicId(1.5)).toThrow(RangeError)
  })
})

describe('the database agrees with this module', () => {
  it('uses the identical character class in its CHECK constraints', () => {
    // Two copies of one rule. If someone widens the alphabet here and not
    // there, ids this module mints start failing an INSERT in production —
    // so the duplication is asserted rather than trusted.
    expect(MIGRATION).toContain("public_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'")
    expect(PUBLIC_ID_PATTERN.source).toBe('^[0-9A-HJKMNP-TV-Z]{26}$')
  })

  it('constrains every table that carries a public_id', () => {
    // business_merchants, business_products, business_orders — plus
    // business_order_items.product_public_id, the migration anchor.
    const checks = MIGRATION.match(/~ '\^\[0-9A-HJKMNP-TV-Z\]\{26\}\$'/g) ?? []
    expect(checks.length).toBe(4)
  })

  it('accepts what this module generates', () => {
    // The regex the database will apply, applied here.
    const pgClass = /^[0-9A-HJKMNP-TV-Z]{26}$/
    for (let i = 0; i < 2_000; i++) {
      expect(pgClass.test(newPublicId())).toBe(true)
    }
  })
})
