import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildShoppingSynthesis,
  buildSynthesisPayload,
  buildSynthesisInstructionBlock,
} from './synthesis'
import type { Candidate } from './candidate'
import type { Pick } from './pick'
import { UNKNOWN } from './normalizedEvidence'

// ── Phase 4 — SYNTHESIS / DECISION ──────────────────────────────────────────
//
// Fixtures are the verbatim MacBook shortlist from the production UAT. The
// synthesis groups them into entities (by configuration), maps the shipped Pick
// onto the entity it belongs to, and exposes a grounded, compact decision.

function cand(name: string, seller: string, priceVnd: number, extra: Record<string, unknown> = {}): Candidate {
  return {
    id: `${seller}:${name}`, name, domain: 'shopping',
    attrs: { priceVnd, rating: 4.7, reviewCount: 704 },
    link: `https://shop/${encodeURIComponent(seller)}`,
    raw: { title: name, source: seller, price_vnd: priceVnd, rating: 4.7, rating_count: 704, ...extra },
  }
}

const ZIN100 = cand('Macbook Pro M1 14 inch, Apple M1 | 32GB | 512GB', 'Zin100.vn', 25_800_000, { ram_gb: 32, storage_gb: 512 })
const TIN_PHAT = cand('Macbook Pro 14 inch 2021 M1 (8CPU/14GPU) 32GB/512GB', 'Tín Phát-Apple', 27_500_000, { ram_gb: 32, storage_gb: 512 })
const BACH_LONG = cand('MacBook Pro 14 inch M1 Pro 2021 8CPU/32GB/512GB/14GPU cũ', 'Bạch Long', 29_550_000, { ram_gb: 32, storage_gb: 512 })
const LAM_PHONG = cand('MacBook Pro 14 inch M1 Pro 16GB/512GB', 'Lâm Phong', 24_999_000, { ram_gb: 16, storage_gb: 512 })
const NGOC_NGUYEN = cand('Macbook Pro 14 inch 2021 M1 Pro Chính Hãng', 'Ngọc Nguyễn', 24_490_000) // no ram/storage → uncertain

const REQUEST = 'Tôi muốn mua MacBook Pro 14 M1 32GB 512GB, tư vấn giúp mình chọn'

/** A Pick on Zin100 (M1 32/512), runner-up Tín Phát leading on price. */
const PICK: Pick = {
  candidate: ZIN100,
  reasons: [
    { key: 'rating', detail: 'rated 4.7', contribution: 1 },
    { key: 'price', detail: '25800000 VND', contribution: 0.6 },
  ],
  runnerUp: { candidate: TIN_PHAT, leadsOn: { key: 'seller', detail: 'chuyên Apple', contribution: 0.1 } },
  conditional: false,
  unverified: [],
}

const SHORTLIST = [ZIN100, TIN_PHAT, BACH_LONG, LAM_PHONG, NGOC_NGUYEN]

describe('same entity / multiple offers, different configs separate', () => {
  const s = buildShoppingSynthesis(SHORTLIST, PICK, REQUEST)
  const p = buildSynthesisPayload(s)
  const groups = p.nhom_san_pham as Array<Record<string, unknown>>

  it('groups Zin100 + Tín Phát into one M1 32/512 entity with two offers', () => {
    const m1_32 = groups.find(g => String(g.config).startsWith('M1 · 32GB · 512GB'))!
    expect(m1_32.offerCount).toBe(2)
    expect(m1_32.sellers).toEqual(['Zin100.vn', 'Tín Phát-Apple'])
  })
  it('keeps M1 Pro configs as their own entities', () => {
    expect(groups.some(g => String(g.config).includes('M1 Pro') && String(g.config).includes('16GB'))).toBe(true)
    expect(groups.some(g => String(g.config).includes('M1 Pro') && String(g.config).includes('Cũ'))).toBe(true)
  })
  it('produces the right number of distinct entities', () => {
    // M1 32/512 (2 offers), M1 Pro 32/512 cũ, M1 Pro 16/512, M1 Pro uncertain → 4
    expect(groups).toHaveLength(4)
  })
})

describe('grounded price ranges — real numbers, not invented', () => {
  const p = buildSynthesisPayload(buildShoppingSynthesis(SHORTLIST, PICK, REQUEST))
  const groups = p.nhom_san_pham as Array<Record<string, unknown>>
  it('the M1 32/512 range is exactly its two offers min/max', () => {
    const m1_32 = groups.find(g => String(g.config).startsWith('M1 · 32GB · 512GB'))!
    expect(m1_32.priceLow).toBe(25_800_000)
    expect(m1_32.priceHigh).toBe(27_500_000)
  })
})

describe('recommendation is the shipped Pick, mapped to its entity', () => {
  const s = buildShoppingSynthesis(SHORTLIST, PICK, REQUEST)
  const p = buildSynthesisPayload(s)
  it('recommends the entity that contains the Pick, and names the offer seller', () => {
    const rec = p.de_xuat as Record<string, unknown>
    expect(rec.noi_ban).toBe('Zin100.vn')
    const groups = p.nhom_san_pham as Array<Record<string, unknown>>
    const recGroup = groups.find(g => g.recommended === true)!
    expect(String(recGroup.config).startsWith('M1 · 32GB · 512GB')).toBe(true)
  })
  it('carries grounded reasons and a trade-off from the Pick', () => {
    const rec = p.de_xuat as Record<string, unknown>
    expect(rec.ly_do).toEqual([
      { attribute: 'rating', evidence: 'rated 4.7' },
      { attribute: 'price', evidence: '25800000 VND' },
    ])
    expect(rec.danh_doi).toEqual({ attribute: 'seller', evidence: 'chuyên Apple' })
  })
  it('does not invent a trade-off when the Pick has none', () => {
    const noTrade: Pick = { ...PICK, runnerUp: { candidate: TIN_PHAT, leadsOn: null } }
    const rec = buildSynthesisPayload(buildShoppingSynthesis(SHORTLIST, noTrade, REQUEST)).de_xuat as Record<string, unknown>
    expect(rec.danh_doi).toBeNull()
  })
})

describe('matchesRequest — a different config is flagged, not passed off', () => {
  const p = buildSynthesisPayload(buildShoppingSynthesis(SHORTLIST, PICK, REQUEST))
  const groups = p.nhom_san_pham as Array<Record<string, unknown>>
  it('the requested config is echoed', () => {
    expect(p.ban_hoi).toBe('M1 · 32GB · 512GB')
  })
  it('M1 32/512 matches; M1 Pro 16/512 does not (chip AND ram differ)', () => {
    const m1_32 = groups.find(g => String(g.config).startsWith('M1 · 32GB · 512GB'))!
    const m1pro16 = groups.find(g => String(g.config).includes('M1 Pro') && String(g.config).includes('16GB'))!
    expect(m1_32.matchesRequest).toBe('khop')
    expect(m1pro16.matchesRequest).toBe('khac')
  })
  it('the M1 Pro no-capacity group is "khac" — its chip is known and differs, not a false match', () => {
    const uncertain = groups.find(g => String(g.config).includes('RAM ?'))!
    expect(uncertain.matchesRequest).toBe('khac')
  })
  it('a matching chip with UNKNOWN capacity is "chua_ro", never a false "khop"', () => {
    // Request M1 32/512; a listing that states M1 but no RAM/storage cannot be
    // confirmed as the exact config — it must be "chua_ro", not "khop".
    const m1NoCaps = cand('Macbook Pro 14 M1 Chính Hãng', 'ShopZ', 20_000_000)
    const p = buildSynthesisPayload(buildShoppingSynthesis([m1NoCaps], null, REQUEST))
    const g = (p.nhom_san_pham as Array<Record<string, unknown>>)[0]
    expect(g.matchesRequest).toBe('chua_ro')
  })
})

describe('UNKNOWN and no-pick states', () => {
  it('an entity with no priced offers reports UNKNOWN price range', () => {
    const s = buildShoppingSynthesis([NGOC_NGUYEN], PICK, REQUEST)
    // NGOC_NGUYEN has a price, so build one with none:
    const noPrice = cand('Macbook Pro 14 M9 Pro 32GB 512GB', 'X', 0)
    delete (noPrice.raw as Record<string, unknown>).price_vnd
    noPrice.attrs = {}
    const p = buildSynthesisPayload(buildShoppingSynthesis([noPrice], null, REQUEST))
    const g = (p.nhom_san_pham as Array<Record<string, unknown>>)[0]
    expect(g.priceLow).toBe(UNKNOWN)
    expect(g.priceHigh).toBe(UNKNOWN)
    void s
  })
  it('no Pick → no recommendation, but entities still grouped', () => {
    const p = buildSynthesisPayload(buildShoppingSynthesis(SHORTLIST, null, REQUEST))
    expect(p.de_xuat).toBeNull()
    expect((p.nhom_san_pham as unknown[]).length).toBeGreaterThan(0)
  })
  it('empty shortlist → empty groups, no recommendation', () => {
    const p = buildSynthesisPayload(buildShoppingSynthesis([], null, REQUEST))
    expect(p.nhom_san_pham).toEqual([])
    expect(p.de_xuat).toBeNull()
  })
})

describe('the two-layer instruction block', () => {
  const b = buildSynthesisInstructionBlock()
  it('permits the education layer explicitly', () => {
    expect(b).toContain('TANG 1 — GIAO DUC')
    expect(b).toContain('M1 khac M1 Pro')
  })
  it('binds listing-specific claims to evidence (grounded decision layer)', () => {
    expect(b).toContain('TANG 2 — QUYET DINH CO CAN CU')
    expect(b).toContain('_tappy_synthesis')
    expect(b).toContain('KHONG CO DU LIEU')
  })
  it('forbids a catalogue dump and forbids re-grouping', () => {
    expect(b).toMatch(/Trinh bay theo NHOM, KHONG do tung tin dang/)
    expect(b).toMatch(/KHONG duoc gom lai khac di/)
  })
  it('forbids presenting a different config as the requested one', () => {
    expect(b).toMatch(/KHONG trinh bay mot cau hinh KHAC nhu dung cai user hoi/)
  })
})

// ── the route wires synthesis in, without a second model call ───────────────

describe('the route wires synthesis into the shopping turn', () => {
  const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
  it('injects _tappy_synthesis on the shopping tool result', () => {
    expect(route).toContain('_tappy_synthesis')
    expect(route).toContain('buildSynthesisPayload(buildShoppingSynthesis(')
  })
  it('adds the synthesis instruction block on shopping turns', () => {
    expect(route).toContain('buildSynthesisInstructionBlock()')
  })
  it('still makes exactly one model call', () => {
    expect((route.match(/AI\.stream\(/g) || []).length).toBe(1)
  })
  it('does not touch the Decision Evidence injection (still present)', () => {
    expect(route).toContain('_tappy_evidence')
    expect(route).toContain('_tappy_ranking')
  })
})
