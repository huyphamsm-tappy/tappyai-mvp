import { describe, it, expect } from 'vitest'
import { normalizeShoppingRow, UNKNOWN } from './normalizedEvidence'
import { groupIntoEntities } from './entityModel'

// ── Phase 3 — NORMALIZED EVIDENCE → ENTITY / OFFERS ─────────────────────────
//
// Fixtures are the verbatim MacBook rows from the production UAT, normalised
// through Phase 2 and then grouped. The rules under test: same configuration
// across sellers folds into ONE entity with many offers; every configuration
// difference (chip, RAM, storage, condition) stays a separate entity; uncertain
// identity never merges.

const rowZin100 = { title: 'Macbook Pro M1 14,2inch, Apple M1 | 32GB | 512GB', source: 'Zin100.vn', price_vnd: 25_800_000, ram_gb: 32, storage_gb: 512, link: 'https://zin100.vn/mac' }
const rowTinPhat = { title: 'Macbook Pro 14inch 2021 M1 (8CPU/14GPU) 32GB/512GB', source: 'Tín Phát-Apple', price_vnd: 27_500_000, ram_gb: 32, storage_gb: 512, link: 'https://tinphat.vn/mac' }
const rowThinkpro = { title: 'Apple Macbook Pro 14 inch M1 32GB 512GB', source: 'thinkpro.vn', price_vnd: 27_990_000, ram_gb: 32, storage_gb: 512, link: 'https://thinkpro.vn/mac' }
const rowBachLong = { title: 'MacBook Pro 14 inch M1 Pro 2021 8CPU/32GB/512GB/14GPU', source: 'Bạch Long', price_vnd: 29_550_000, ram_gb: 32, storage_gb: 512, link: 'https://bachlong.vn/mac' }
const rowLamPhong = { title: 'MacBook Pro M1 Pro 16GB/512GB', source: 'Lâm Phong', price_vnd: 24_999_000, ram_gb: 16, storage_gb: 512, link: 'https://lamphong.vn/mac' }
const rowNgocNguyen = { title: 'Macbook Pro 14 inch 2021 M1 Pro 8-CPU/14-GPU Chính Hãng', source: 'Ngọc Nguyễn', price_vnd: 24_490_000, link: 'https://ngocnguyen.vn/mac' } // no RAM/storage → uncertain

const n = (r: Record<string, unknown>) => normalizeShoppingRow(r, 'Google Shopping (Serper)')

describe('same configuration, multiple sellers → ONE entity, multiple offers', () => {
  const entities = groupIntoEntities([n(rowZin100), n(rowTinPhat), n(rowThinkpro)])
  it('folds three M1 32/512 sellers into a single entity', () => {
    expect(entities).toHaveLength(1)
    expect(entities[0].identityCertain).toBe(true)
    expect(entities[0].type).toBe('product')
    expect(entities[0].identity.model).toBe('M1')
    expect(entities[0].identity.ramGb).toBe(32)
    expect(entities[0].identity.storageGb).toBe(512)
  })
  it('keeps all three offers with their own sellers and prices', () => {
    const offers = entities[0].offers
    expect(offers).toHaveLength(3)
    expect(offers.map(o => o.seller)).toEqual(['Zin100.vn', 'Tín Phát-Apple', 'thinkpro.vn'])
    expect(offers.map(o => o.price)).toEqual([25_800_000, 27_500_000, 27_990_000])
    expect(offers.every(o => o.currency === 'VND')).toBe(true)
  })
  it('every offer traces back to its normalized evidence', () => {
    expect(entities[0].offers[0].evidence.raw).toBe(rowZin100)
  })
})

describe('a different configuration stays a different entity', () => {
  it('M1 and M1 Pro do not merge', () => {
    const e = groupIntoEntities([n(rowZin100), n(rowBachLong)])
    expect(e).toHaveLength(2)
    expect(e.map(x => x.identity.model).sort()).toEqual(['M1', 'M1 Pro'])
  })
  it('16GB and 32GB do not merge', () => {
    const e = groupIntoEntities([n(rowLamPhong), n(rowBachLong)])   // both M1 Pro, 16 vs 32
    expect(e).toHaveLength(2)
    expect(e.map(x => x.identity.ramGb).sort()).toEqual([16, 32])
  })
  it('512GB and 1TB do not merge', () => {
    const a = { title: 'MacBook Pro M1 Pro 32GB 512GB', source: 'A', price_vnd: 30_000_000, ram_gb: 32, storage_gb: 512, link: 'https://a.vn/p' }
    const b = { title: 'MacBook Pro M1 Pro 32GB 1TB', source: 'B', price_vnd: 34_000_000, ram_gb: 32, storage_gb: 1024, link: 'https://b.vn/p' }
    const e = groupIntoEntities([n(a), n(b)])
    expect(e).toHaveLength(2)
    expect(e.map(x => x.identity.storageGb).sort((p, q) => (p as number) - (q as number))).toEqual([512, 1024])
  })
})

describe('condition is identity-bearing — different condition stays separate', () => {
  it('same chip/RAM/storage but "cũ" vs "Chính hãng" → two entities', () => {
    const used = { title: 'MacBook Pro M1 Pro 32GB 512GB cũ', source: 'A', price_vnd: 26_000_000, ram_gb: 32, storage_gb: 512, link: 'https://a.vn/p' }
    const genuine = { title: 'MacBook Pro M1 Pro 32GB 512GB Chính Hãng', source: 'B', price_vnd: 40_000_000, ram_gb: 32, storage_gb: 512, link: 'https://b.vn/p' }
    const e = groupIntoEntities([n(used), n(genuine)])
    expect(e).toHaveLength(2)
    expect(e.map(x => x.identity.condition).sort()).toEqual(['Chính hãng', 'Cũ'])
  })
})

describe('missing fields are not merged over (safety > aggregation)', () => {
  it('a size-UNKNOWN row does not merge with a size-14inch row of the same chip/RAM/storage', () => {
    // The row that omits size has an uncertain size; folding it into the 14-inch
    // entity would assert a size nobody stated. They stay separate.
    const known = { title: 'MacBook Pro 14 inch M1 32GB 512GB', source: 'A', price_vnd: 25_000_000, ram_gb: 32, storage_gb: 512, link: 'https://a.vn/p' }
    const noSize = { title: 'MacBook Pro M1 32GB 512GB', source: 'B', price_vnd: 26_000_000, ram_gb: 32, storage_gb: 512, link: 'https://b.vn/p' }
    const e = groupIntoEntities([n(known), n(noSize)])
    expect(e).toHaveLength(2)
    expect(new Set(e.map(x => x.identity.size))).toEqual(new Set(['14 inch', UNKNOWN]))
  })
})

describe('same identity, different prices → one entity, many offers', () => {
  it('two sellers of the exact same config at different prices', () => {
    const cheap = { title: 'MacBook Pro M1 32GB 512GB', source: 'Cheap', price_vnd: 25_000_000, ram_gb: 32, storage_gb: 512, link: 'https://cheap.vn/p' }
    const dear = { title: 'MacBook Pro M1 32GB 512GB', source: 'Dear', price_vnd: 28_000_000, ram_gb: 32, storage_gb: 512, link: 'https://dear.vn/p' }
    const e = groupIntoEntities([n(cheap), n(dear)])
    expect(e).toHaveLength(1)
    expect(e[0].offers.map(o => o.price)).toEqual([25_000_000, 28_000_000])
  })
})

describe('deduping and uncertain identity', () => {
  it('the identical listing appearing twice is deduped to one offer', () => {
    const e = groupIntoEntities([n(rowZin100), n(rowZin100)])
    expect(e).toHaveLength(1)
    expect(e[0].offers).toHaveLength(1)
  })
  it('the same seller at the same price but no URL is deduped', () => {
    const noUrl = { title: 'MacBook Pro M1 32GB 512GB', source: 'Shop', price_vnd: 25_000_000, ram_gb: 32, storage_gb: 512 }
    const e = groupIntoEntities([n(noUrl), n({ ...noUrl })])
    expect(e[0].offers).toHaveLength(1)
  })
  it('the same seller at DIFFERENT prices keeps both offers', () => {
    const p1 = { title: 'MacBook Pro M1 32GB 512GB', source: 'Shop', price_vnd: 25_000_000, ram_gb: 32, storage_gb: 512 }
    const p2 = { title: 'MacBook Pro M1 32GB 512GB', source: 'Shop', price_vnd: 26_000_000, ram_gb: 32, storage_gb: 512 }
    const e = groupIntoEntities([n(p1), n(p2)])
    expect(e[0].offers).toHaveLength(2)
  })

  it('uncertain identity (missing RAM/storage) never merges — each stands alone', () => {
    // Ngọc Nguyễn states a chip but no capacity → identityCertain false. Two such
    // rows must NOT collapse into one entity even though both are "M1 Pro".
    const a = rowNgocNguyen
    const b = { ...rowNgocNguyen, source: 'Another Shop', link: 'https://other.vn/mac' }
    const e = groupIntoEntities([n(a), n(b)])
    expect(e).toHaveLength(2)
    expect(e.every(x => x.identityCertain === false)).toBe(true)
    expect(e.every(x => x.offers.length === 1)).toBe(true)
  })

  it('a malformed/empty row stays its own uncertain entity, never merged', () => {
    const empty = { source: 'X', link: 'https://x.vn/p' }
    const e = groupIntoEntities([n(rowZin100), n(empty)])
    expect(e).toHaveLength(2)
    const uncertain = e.find(x => !x.identityCertain)!
    expect(uncertain.identity.model).toBe(UNKNOWN)
    expect(uncertain.offers).toHaveLength(1)
  })
})

describe('the full production shortlist folds sensibly', () => {
  it('the 5 measured M-config rows → distinct entities by configuration', () => {
    // M1 32/512 (Zin100+TinPhat = 1 entity, 2 offers), M1 Pro 32/512 (BachLong),
    // M1 Pro 16/512 (LamPhong), M1 Pro no-caps (NgocNguyen, uncertain) → 4 entities.
    const e = groupIntoEntities([
      n(rowZin100), n(rowTinPhat), n(rowBachLong), n(rowLamPhong), n(rowNgocNguyen),
    ])
    expect(e).toHaveLength(4)
    const m1_32 = e.find(x => x.identity.model === 'M1' && x.identity.ramGb === 32)!
    expect(m1_32.offers).toHaveLength(2)   // Zin100 + Tín Phát
    expect(e.filter(x => !x.identityCertain)).toHaveLength(1)   // Ngọc Nguyễn
  })

  it('is deterministic and order-preserving', () => {
    const rows = [n(rowZin100), n(rowBachLong), n(rowTinPhat)]
    const a = groupIntoEntities(rows)
    const b = groupIntoEntities(rows)
    expect(a).toEqual(b)
    // Zin100 (M1) appears before BachLong (M1 Pro) in the input → and in the output.
    expect(a[0].identity.model).toBe('M1')
    expect(a[1].identity.model).toBe('M1 Pro')
  })

  it('handles null / empty without throwing', () => {
    expect(groupIntoEntities(null)).toEqual([])
    expect(groupIntoEntities([])).toEqual([])
  })
})
