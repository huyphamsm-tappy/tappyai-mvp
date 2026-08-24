import { describe, it, expect } from 'vitest'
import {
  UNKNOWN,
  normalizeShoppingRow,
  modelFromTitle,
  sizeFromTitle,
  conditionFromTitle,
} from './normalizedEvidence'

// ── Phase 2 — RAW PROVIDER RESULT → CLEAN EVIDENCE ──────────────────────────
//
// Every fixture is a VERBATIM row captured from the Phase 1 / earlier
// production UAT (bd89c5d, e347a21) — the same MacBook shortlist the shopping
// tool returns. Not tidied: real "14,2inch", real "8CPU/14GPU" noise, real
// missing-spec rows, real "cũ"/"Chính Hãng" wording.

const ZIN100 = { title: 'Macbook Pro M1 14,2inch, Apple M1 | 32GB | 512GB', source: 'Zin100.vn', price_vnd: 25_800_000, ram_gb: 32, storage_gb: 512, rating: 4.7, rating_count: 704, link: 'https://zin100.vn/mac' }
const TIN_PHAT = { title: 'Macbook Pro 14inch 2021 M1 (8CPU/14GPU) 32GB/512GB - tinphatapple.vn', source: 'Tín Phát-Apple', price_vnd: 27_500_000, ram_gb: 32, storage_gb: 512, link: 'https://tinphatapple.vn/mac' }
const BACH_LONG = { title: 'MacBook Pro 14 inch M1 Pro 2021 8CPU/32GB/512GB/14GPU cũ', source: 'Bạch Long Store', price_vnd: 29_550_000, ram_gb: 32, storage_gb: 512, link: 'https://bachlong.vn/mac' }
const VENDER = { title: 'MacBook Pro M4 14 inch 10CPU 10GPU 32GB RAM 512GB – Chính Hãng Việt Nam', source: 'Vender.vn', price_vnd: 48_000_000, link: 'https://vender.vn/mac' }
const LAPVIP = { title: 'Macbook Pro 14 2021 M1 Pro (8CPU - 14GPU/32GB/512GB) - Like New', source: 'Lapvip', price_vnd: 38_990_000, link: 'https://lapvip.vn/mac' }
const NGOC_NGUYEN = { title: 'Macbook Pro 14 inch 2021 M1 Pro 8-CPU/14-GPU (Sliver|Gray) Chính Hãng', source: 'Ngọc Nguyễn Store', price_vnd: 24_490_000, rating: 4.7, rating_count: 704, link: 'https://ngocnguyen.vn/mac' }
const LAM_PHONG = { title: 'Macbook Pro 14 inch 2021 Gray (MKGP3) - M1 Pro 8CPU-14GPU/ 16G/ 512G - 99%', source: 'Lâm Phong Store', price_vnd: 24_999_000, ram_gb: 16, storage_gb: 512, link: 'https://lamphong.vn/mac' }
const ARTICLE = { title: 'Từng là giấc mơ kỳ lân tỷ đô, Tiki giờ được định giá chỉ bằng…', source: 'CafeF', link: 'https://cafef.vn/x.chn' }

describe('a valid listing normalises to clean, grounded evidence', () => {
  const e = normalizeShoppingRow(ZIN100, 'Google Shopping (Serper)')
  it('reads identity from the title/structured fields', () => {
    expect(e.identity.model).toBe('M1')
    expect(e.identity.ramGb).toBe(32)
    expect(e.identity.storageGb).toBe(512)
    expect(e.identity.size).toBe('14 inch')
    expect(e.identity.name).toBe(ZIN100.title)
  })
  it('keeps the offer separate from the identity', () => {
    expect(e.offer.seller).toBe('Zin100.vn')
    expect(e.offer.price).toBe(25_800_000)
    expect(e.offer.currency).toBe('VND')
    expect(e.offer.url).toBe('https://zin100.vn/mac')
  })
  it('carries the signals it has', () => {
    expect(e.signals.rating).toBe(4.7)
    expect(e.signals.reviewCount).toBe(704)
  })
  it('states condition UNKNOWN when the title says none (Zin100 states no condition)', () => {
    expect(e.identity.condition).toBe(UNKNOWN)
  })
  it('is groupable and preserves the raw row', () => {
    expect(e.identityCertain).toBe(true)
    expect(e.raw).toBe(ZIN100)
    expect(e.providerSource).toBe('Google Shopping (Serper)')
  })
})

describe('rule 1/2/3 — nothing is invented or inferred', () => {
  it('a title-less / spec-less row is all UNKNOWN, not guessed', () => {
    const e = normalizeShoppingRow({ source: 'SomeShop', link: 'https://x.vn/p' })
    expect(e.identity.name).toBe('')
    expect(e.identity.model).toBe(UNKNOWN)
    expect(e.identity.ramGb).toBe(UNKNOWN)
    expect(e.identity.storageGb).toBe(UNKNOWN)
    expect(e.identity.size).toBe(UNKNOWN)
    expect(e.identity.condition).toBe(UNKNOWN)
    expect(e.offer.price).toBe(UNKNOWN)
    expect(e.offer.currency).toBe(UNKNOWN)
    expect(e.signals.rating).toBe(UNKNOWN)
    expect(e.identityCertain).toBe(false)
  })
  it('condition is NOT inferred from a seller named "Chính Hãng Apple Store"', () => {
    const e = normalizeShoppingRow({ title: 'MacBook Pro M1 32GB 512GB', source: 'Chính Hãng Apple Store', link: 'https://x.vn/p' })
    expect(e.identity.condition).toBe(UNKNOWN)   // title states none
    expect(e.offer.seller).toBe('Chính Hãng Apple Store')
  })
  it('identity is NOT inferred from a seller domain "tinphatapple.vn" — only the title', () => {
    const e = normalizeShoppingRow(TIN_PHAT)
    expect(e.identity.model).toBe('M1')          // the title says M1, not "Apple/Pro" from the domain
    expect(e.offer.seller).toBe('Tín Phát-Apple')
  })
  it('a premium price does not upgrade condition', () => {
    const e = normalizeShoppingRow({ title: 'MacBook Pro M1 32GB 512GB', price_vnd: 99_000_000, link: 'https://x.vn/p' })
    expect(e.identity.condition).toBe(UNKNOWN)
  })
})

describe('rule 6 — a different configuration stays different', () => {
  it('M1 and M1 Pro are different models and different keys', () => {
    const m1 = normalizeShoppingRow(ZIN100)
    const m1pro = normalizeShoppingRow(BACH_LONG)
    expect(m1.identity.model).toBe('M1')
    expect(m1pro.identity.model).toBe('M1 Pro')
    expect(m1.identityKey).not.toBe(m1pro.identityKey)
  })
  it('16GB and 32GB are different keys', () => {
    const g16 = normalizeShoppingRow(LAM_PHONG)   // M1 Pro 16/512
    const g32 = normalizeShoppingRow(BACH_LONG)   // M1 Pro 32/512
    expect(g16.identity.ramGb).toBe(16)
    expect(g32.identity.ramGb).toBe(32)
    expect(g16.identityKey).not.toBe(g32.identityKey)
  })
  it('M4 is not M1', () => {
    expect(normalizeShoppingRow(VENDER).identity.model).toBe('M4')
  })

  it('a minimal pair differing ONLY in chip has different keys (model is in the key)', () => {
    // Everything else identical (32/512, no condition, no size), so the key can
    // only differ because the model does — this pins the model into identityKey.
    const m1 = normalizeShoppingRow({ title: 'MacBook Pro M1 32GB 512GB', link: 'https://a.vn/p' })
    const m1pro = normalizeShoppingRow({ title: 'MacBook Pro M1 Pro 32GB 512GB', link: 'https://b.vn/p' })
    expect(m1.identity.ramGb).toBe(m1pro.identity.ramGb)
    expect(m1.identity.condition).toBe(m1pro.identity.condition)   // both UNKNOWN
    expect(m1.identityKey).not.toBe(m1pro.identityKey)
  })

  it('a minimal pair differing ONLY in RAM has different keys (RAM is in the key)', () => {
    const g16 = normalizeShoppingRow({ title: 'MacBook Pro M1 Pro 16GB 512GB', link: 'https://a.vn/p' })
    const g32 = normalizeShoppingRow({ title: 'MacBook Pro M1 Pro 32GB 512GB', link: 'https://b.vn/p' })
    expect(g16.identity.model).toBe(g32.identity.model)            // both M1 Pro
    expect(g16.identity.storageGb).toBe(g32.identity.storageGb)    // both 512
    expect(g16.identityKey).not.toBe(g32.identityKey)
  })
})

describe('rule 5 — multiple sellers of the SAME config share an identity key', () => {
  it('Zin100 and Tín Phát are both M1 32/512, no stated condition → same key', () => {
    // Same identity, different offers. This is what a later grouping step needs.
    const a = normalizeShoppingRow(ZIN100)
    const b = normalizeShoppingRow(TIN_PHAT)
    expect(a.identity.model).toBe(b.identity.model)
    expect(a.identity.ramGb).toBe(b.identity.ramGb)
    expect(a.identity.condition).toBe(UNKNOWN)
    expect(b.identity.condition).toBe(UNKNOWN)
    expect(a.identityKey).toBe(b.identityKey)
    // …but the offers differ.
    expect(a.offer.seller).not.toBe(b.offer.seller)
    expect(a.offer.price).not.toBe(b.offer.price)
  })
})

describe('condition/provenance is the seller\'s own title term', () => {
  it('reads "cũ" (with the VN-letter boundary that plain \\b misses)', () => {
    expect(normalizeShoppingRow(BACH_LONG).identity.condition).toBe('Cũ')
  })
  it('reads "Like New"', () => {
    expect(normalizeShoppingRow(LAPVIP).identity.condition).toBe('Like new')
  })
  it('reads "Chính Hãng"', () => {
    expect(normalizeShoppingRow(VENDER).identity.condition).toBe('Chính hãng')
    expect(normalizeShoppingRow(NGOC_NGUYEN).identity.condition).toBe('Chính hãng')
  })
  it('reads "99%"', () => {
    expect(normalizeShoppingRow(LAM_PHONG).identity.condition).toBe('99%')
  })
  it('does not read "cũ" out of "cũng"', () => {
    expect(conditionFromTitle('Macbook cũng đẹp lắm')).toBe(UNKNOWN)
  })
})

describe('rule 7 — unknown identity stays ungroupable', () => {
  it('a chip alone (no capacity) is NOT groupable — Ngọc Nguyễn: M1 Pro, no RAM/storage stated', () => {
    const e = normalizeShoppingRow(NGOC_NGUYEN)
    expect(e.identity.model).toBe('M1 Pro')
    expect(e.identity.ramGb).toBe(UNKNOWN)
    expect(e.identity.storageGb).toBe(UNKNOWN)
    expect(e.identityCertain).toBe(false)
  })
  it('an article/category row normalises without inventing identity, and is ungroupable', () => {
    const e = normalizeShoppingRow(ARTICLE)
    expect(e.identity.model).toBe(UNKNOWN)
    expect(e.identity.ramGb).toBe(UNKNOWN)
    expect(e.identityCertain).toBe(false)
    expect(e.raw).toBe(ARTICLE)   // still preserved for traceability
  })
})

describe('the extractors, in isolation', () => {
  it('model: longest chip wins, "m1 pro" is not "m1"', () => {
    expect(modelFromTitle('MacBook Pro M1 Pro 32GB')).toBe('M1 Pro')
    expect(modelFromTitle('MacBook Pro M1 32GB')).toBe('M1')
    expect(modelFromTitle('MacBook Pro M1 Max')).toBe('M1 Max')
    expect(modelFromTitle('MacBook Air 13')).toBe(UNKNOWN)
  })
  it('size: reads 13–17 inch, incl. "14,2inch", not "8CPU"', () => {
    expect(sizeFromTitle('Macbook Pro M1 14,2inch 32GB')).toBe('14 inch')
    expect(sizeFromTitle('MacBook Pro 16 inch M1 Pro')).toBe('16 inch')
    expect(sizeFromTitle('MacBook Pro M1 8CPU 14GPU')).toBe(UNKNOWN)
  })
})
