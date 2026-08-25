import { describe, it, expect } from 'vitest'
import { buildShoppingSynthesis, buildSynthesisPayload, type EntitySummary } from './synthesis'
import { buildSynthesisView, renderShoppingMarker, parseShoppingMarker } from './synthesisView'
import type { Candidate } from './candidate'
import type { Pick } from './pick'

// ── Phase 9 — the client display view is the SAME decision, re-shaped ────────
//
// The adapter must never disagree with the compact payload the model reads: same
// entities, same order, same config/price/match/recommended. It only ADDS each
// offer's own link/price. These tests pin that alignment and the UNKNOWN → null
// normalisation.

function cand(name: string, seller: string, priceVnd: number, extra: Record<string, unknown> = {}): Candidate {
  return {
    id: `${seller}:${name}`, name, domain: 'shopping',
    attrs: { priceVnd, rating: 4.7, reviewCount: 704 },
    link: `https://shop/${encodeURIComponent(seller)}`,
    raw: { title: name, source: seller, price_vnd: priceVnd, link: `https://shop/${encodeURIComponent(seller)}`, rating: 4.7, rating_count: 704, ...extra },
  }
}

const ZIN100 = cand('Macbook Pro M1 14 inch, Apple M1 | 32GB | 512GB', 'Zin100.vn', 25_800_000, { ram_gb: 32, storage_gb: 512 })
const TIN_PHAT = cand('Macbook Pro 14 inch 2021 M1 (8CPU/14GPU) 32GB/512GB', 'Tín Phát-Apple', 27_500_000, { ram_gb: 32, storage_gb: 512 })
const LAM_PHONG = cand('MacBook Pro 14 inch M1 Pro 16GB/512GB', 'Lâm Phong', 24_999_000, { ram_gb: 16, storage_gb: 512 })
const NGOC_NGUYEN = cand('Macbook Pro 14 inch 2021 M1 Pro Chính Hãng', 'Ngọc Nguyễn', 24_490_000) // uncertain identity

const REQUEST = 'Tôi muốn mua MacBook Pro 14 M1 32GB 512GB, tư vấn giúp mình chọn'

const PICK: Pick = {
  candidate: ZIN100,
  reasons: [
    { key: 'rating', detail: 'rated 4.7', contribution: 1 },
    { key: 'price', detail: '25800000 VND', contribution: 0.6 },
  ],
  runnerUp: { candidate: TIN_PHAT, leadsOn: { key: 'gia', detail: 'rẻ hơn', contribution: 0.1 } },
  conditional: false,
  unverified: [],
}

const SHORTLIST = [ZIN100, TIN_PHAT, LAM_PHONG, NGOC_NGUYEN]

describe('buildSynthesisView — faithful, additive projection', () => {
  const s = buildShoppingSynthesis(SHORTLIST, PICK, REQUEST)
  const payload = buildSynthesisPayload(s)
  const groups = payload.nhom_san_pham as EntitySummary[]
  const view = buildSynthesisView(s)

  it('has exactly one entity per backend group, in the same order', () => {
    expect(view.entities.length).toBe(s.entities.length)
    expect(view.entities.length).toBe(groups.length)
    expect(view.entities.map(e => e.config)).toEqual(groups.map(g => g.config))
  })

  it('carries the payload config / match / recommended verbatim (never a new decision)', () => {
    view.entities.forEach((e, i) => {
      expect(e.matchesRequest).toBe(groups[i].matchesRequest)
      expect(e.recommended).toBe(groups[i].recommended)
      expect(e.priceLow).toBe(groups[i].priceLow === 'KHONG CO DU LIEU' ? null : groups[i].priceLow)
    })
  })

  it('exactly one entity is recommended, and it is the M1 32/512 group', () => {
    const rec = view.entities.filter(e => e.recommended)
    expect(rec.length).toBe(1)
    expect(rec[0].config.startsWith('M1 · 32GB · 512GB')).toBe(true)
  })

  it('folds Zin100 + Tín Phát into one entity carrying BOTH offers with links + prices', () => {
    const m1 = view.entities.find(e => e.config.startsWith('M1 · 32GB · 512GB'))!
    expect(m1.offers.length).toBe(2)
    expect(m1.offers.map(o => o.seller)).toEqual(['Zin100.vn', 'Tín Phát-Apple'])
    expect(m1.offers.map(o => o.price)).toEqual([25_800_000, 27_500_000])
    expect(m1.offers.every(o => typeof o.url === 'string' && o.url!.startsWith('https://'))).toBe(true)
  })

  it('projects the recommendation (entity, reasons, trade-off) from the Pick', () => {
    expect(view.recommendation).not.toBeNull()
    expect(view.recommendation!.entityKey).toBe(s.recommendation!.entityKey)
    expect(view.recommendation!.seller).toBe('Zin100.vn')
    expect(view.recommendation!.reasons.length).toBeGreaterThan(0)
    expect(view.recommendation!.tradeOff).toEqual({ attribute: 'gia', evidence: 'rẻ hơn' })
  })

  it('normalises UNKNOWN offer fields to null — never the sentinel string', () => {
    // A row with no structured price and no link → both must surface as null.
    const bare: Candidate = {
      id: 'bare', name: 'MacBook Pro 14 M1 32GB 512GB', domain: 'shopping',
      attrs: {}, link: null,
      raw: { title: 'MacBook Pro 14 M1 32GB 512GB', ram_gb: 32, storage_gb: 512 },
    }
    const v = buildSynthesisView(buildShoppingSynthesis([bare], null, REQUEST))
    const o = v.entities[0].offers[0]
    expect(o.price).toBeNull()
    expect(o.url).toBeNull()
    expect(o.seller).toBeNull()
    expect(JSON.stringify(v).includes('KHONG CO DU LIEU')).toBe(false)
  })

  it('no recommendation → recommendation is null, entities still present', () => {
    const s2 = buildShoppingSynthesis(SHORTLIST, null, REQUEST)
    const v2 = buildSynthesisView(s2)
    expect(v2.recommendation).toBeNull()
    expect(v2.entities.length).toBe(s2.entities.length)
    expect(v2.entities.some(e => e.recommended)).toBe(false)
  })

  it('recommendation seller UNKNOWN → null, never the sentinel string', () => {
    const noSeller: Candidate = {
      id: 'ns', name: 'MacBook Pro 14 M1 32GB 512GB', domain: 'shopping',
      attrs: {}, link: null,
      raw: { title: 'MacBook Pro 14 M1 32GB 512GB', ram_gb: 32, storage_gb: 512 }, // no `source`
    }
    const pick: Pick = { candidate: noSeller, reasons: [{ key: 'rating', detail: 'x', contribution: 1 }], runnerUp: null, conditional: false, unverified: [] }
    const v = buildSynthesisView(buildShoppingSynthesis([noSeller], pick, REQUEST))
    expect(v.recommendation).not.toBeNull()
    expect(v.recommendation!.seller).toBeNull()
  })

  it('empty shortlist → empty view, never throws', () => {
    const v3 = buildSynthesisView(buildShoppingSynthesis([], null, REQUEST))
    expect(v3.entities).toEqual([])
    expect(v3.recommendation).toBeNull()
  })

  it('survives the marker round-trip a real reply uses — offers/links intact', () => {
    const reply = 'Mình gợi ý cho bạn.\n\n' + renderShoppingMarker(view)
    const parsed = parseShoppingMarker(reply)
    expect(parsed.text).toBe('Mình gợi ý cho bạn.')                 // marker stripped
    expect(parsed.view).not.toBeNull()
    const m1 = parsed.view!.entities.find(e => e.config.startsWith('M1 · 32GB · 512GB'))!
    expect(m1.offers.map(o => o.seller)).toEqual(['Zin100.vn', 'Tín Phát-Apple'])
    expect(m1.offers.every(o => o.url!.startsWith('https://'))).toBe(true)
    expect(parsed.view!.entities.filter(e => e.recommended).length).toBe(1)
  })

  it('an empty-entities marker parses to NO view (falls back to prose)', () => {
    const reply = 'x ' + renderShoppingMarker({ v: 1, entities: [], recommendation: null })
    const parsed = parseShoppingMarker(reply)
    expect(parsed.view).toBeNull()
    expect(parsed.text).not.toContain('TAPPY_SHOPPING')
  })

  it('a reply with no marker returns text unchanged, view null', () => {
    expect(parseShoppingMarker('chỉ prose')).toEqual({ text: 'chỉ prose', view: null })
  })
})
