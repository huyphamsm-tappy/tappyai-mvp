/**
 * G2 — a lowercase "m" is never money (owner rule, Q2).
 *
 * `UNIT_ALT` carries `M` (million) under the `i` flag, so "cách bạn chỉ 100m" read as
 * 100 000 000 ₫ and the snippet-price guard deleted both recommendation paragraphs
 * of "quán cafe chill gần đây" (2026-09-17 V3 capture, run 2 #11). The fix is a
 * post-filter on the matched unit (`=== 'm'`), not a regex edit — the "đồng"
 * incident showed what an `i`-flag regex rule does silently.
 *
 * Documented residual: Vietnamese chat slang "tầm 2m" (= 2 triệu) is invisible to
 * the guard from now on. Pinned below so a future change that starts deleting it
 * is visible, not silent.
 */
import { describe, expect, it } from 'vitest'
import { extractMoneyClaims, extractMoneyClaimsDetailed } from './moneyGuard'
import { guardSnippetPricesInText } from './snippetPriceGuard'

describe('metres are not money', () => {
  it('"100m", "300 m", "cách 50m" produce no claim', () => {
    for (const s of ['Quán này cách bạn chỉ 100m, mở cửa đến 21:00.', '**BẢN Cà Phê** cách 300 m cũng là lựa chọn tốt.', 'đi bộ 50m là tới']) {
      expect(extractMoneyClaims(s), s).toHaveLength(0)
    }
  })
  it('the skip is counted for telemetry', () => {
    const d = extractMoneyClaimsDetailed('cách bạn chỉ 100m, còn quán kia 300 m')
    expect(d.claims).toHaveLength(0)
    expect(d.lowercase_m_skipped).toBe(2)
  })
  it('uppercase M is still a million; "km" was never a unit', () => {
    expect(extractMoneyClaims('tầm 7-8M')).toHaveLength(1)
    expect(extractMoneyClaims('11.8–14.7M VND')[0]).toMatchObject({ lo: 11.8e6, hi: 14.7e6 })
    expect(extractMoneyClaims('cách 1.2 km')).toHaveLength(0)
  })
  it('every other unit is untouched', () => {
    for (const [s, lo] of [['500k', 5e5], ['2 triệu', 2e6], ['2tr', 2e6], ['40.000 đồng/tô', 4e4], ['₫6.490.000', 6.49e6], ['200-600k', 2e5]] as const) {
      expect(extractMoneyClaims(s)[0]?.lo, s).toBe(lo)
    }
  })
  it('RESIDUAL (accepted, documented): "tầm 2m" slang is invisible, so an echoed one survives the snippet guard whole', () => {
    expect(extractMoneyClaims('tầm 2m')).toHaveLength(0)
    const text = 'Bạn nói budget tầm 2m nên mình chọn quán này.'
    expect(guardSnippetPricesInText(text, [], '').text).toBe(text)
  })
  it('the metre sentence survives the snippet-price guard (v1 and v2)', () => {
    const text = 'Mình chọn **Hoff Coffee** cho bạn 👌 Quán này cách bạn chỉ 100m, mở cửa đến 21:00 hôm nay.'
    expect(guardSnippetPricesInText(text, [], 'quán cafe chill gần đây').text).toBe(text)
    expect(guardSnippetPricesInText(text, [], 'quán cafe chill gần đây', undefined, { v2: true }).text).toBe(text)
  })
})
