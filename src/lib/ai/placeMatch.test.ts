// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { findPlaceOffset, proseHeaders, norm } from './placeMatch'

// Realistic assistant prose (bold place headers + rating/address lines), normalized
// the same way the enrichment pipeline builds its dedup view.
const PROSE = [
  'Mình tìm được vài quán hủ tiếu ngon ở quận 1 cho bạn!',
  '',
  '**Dì Năm Sa Đéc** — 4.3⭐ (727 đánh giá Google Maps)',
  '📍 166 Bùi Thị Xuân',
  '',
  '**Hủ Tiếu Chú Thành** — 4.7⭐ (268 đánh giá Google Maps)',
  '📍 61 Phó Đức Chính',
  '',
  '**Hủ tiếu mực Ông Già (Chính Gốc)** — 4.3⭐ (594 đánh giá Google Maps)',
  '📍 62/3 Tôn Thất Thiệp',
].join('\n')
const D = norm(PROSE)
const at = (headerNorm: string) => D.indexOf(`**${headerNorm}**`)

describe('findPlaceOffset — canonical → exact → segment → token', () => {
  it('TIER 1 canonical: LLM SHORTENED the long tool name → matches its bold header', () => {
    // tool name is the full Google-Maps string; prose header is the clean short name
    const tool = 'Hủ tiếu Sa Đéc & Bánh tằm - DÌ NĂM SA ĐÉC - 166 Bùi Thị Xuân, Quận 1'
    expect(findPlaceOffset(tool, D)).toBe(at('di nam sa dec'))
  })

  it('TIER 2 exact: identical name matches verbatim', () => {
    expect(findPlaceOffset('Hủ tiếu mực Ông Già (Chính Gốc)', D)).toBe(at('hu tieu muc ong gia (chinh goc)'))
  })

  it('TIER 4 token: RESPELLED name (tool "Hủ Tíu" vs prose "Hủ Tiếu") still matches', () => {
    expect(findPlaceOffset('Hủ Tíu Chú Thành', D)).toBe(at('hu tieu chu thanh'))
  })

  it('returns -1 for a place not mentioned in the prose (no mis-attribution)', () => {
    expect(findPlaceOffset('Phở Hòa Pasteur', D)).toBe(-1)
  })

  it('maps each place to its OWN header, never a neighbour', () => {
    const dnsd = findPlaceOffset('Hủ tiếu Sa Đéc & Bánh tằm - DÌ NĂM SA ĐÉC', D)
    const chuThanh = findPlaceOffset('Hủ Tíu Chú Thành', D)
    const ongGia = findPlaceOffset('Hủ tiếu mực Ông Già (Chính Gốc)', D)
    expect(new Set([dnsd, chuThanh, ongGia]).size).toBe(3) // three distinct offsets
    expect(dnsd).toBeLessThan(chuThanh)
    expect(chuThanh).toBeLessThan(ongGia)
  })
})

describe('proseHeaders', () => {
  it('picks bold place names but skips rating/meta bold text', () => {
    const withRating = norm('**Quán Ngon** ăn ngon\n**4.9⭐ (100 đánh giá Google Maps)**')
    const heads = proseHeaders(withRating).map(h => h.norm)
    expect(heads).toContain('quan ngon')
    expect(heads.some(h => /⭐|danh gia/.test(h))).toBe(false)
  })
})
