/**
 * G2 — SNIPPET_PRICE_GUARD_V2 (`opts.v2`).
 *
 * The sentences are the real shapes from the 2026-09-17 V3 capture; the bands are
 * the Serper `price_range_text` values the runner recorded for those very rows. The
 * guard used to delete 13 of these 17 sentences because its evidence never held the
 * band the model was quoting.
 */
import { describe, expect, it } from 'vitest'
import { guardSnippetPricesInText, type SnippetPriceScope } from './snippetPriceGuard'
import { parsePriceBand, type PriceBand } from '@/lib/recommendation/priceBand'

const NAMES = ['GÀ RÁN K- JEJU CHICKEN-Quận 1', 'BÒ TƠ QUÁN MỘC 486 Nguyễn Thị Minh Khai', 'Wego Coffee Thảo Điền', 'SOO COFFEE', 'Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM', 'RuNam Vincom Landmark 81', 'Highlands Coffee Vincom Landmark 81', 'Nhà hàng chay Phương Mai']
const BANDS = new Map<string, PriceBand>([
  ['GÀ RÁN K- JEJU CHICKEN-Quận 1', parsePriceBand('100-200 N ₫')!],
  ['BÒ TƠ QUÁN MỘC 486 Nguyễn Thị Minh Khai', parsePriceBand('200-400 N ₫')!],
  ['Wego Coffee Thảo Điền', parsePriceBand('1-100.000 ₫')!],
  ['SOO COFFEE', parsePriceBand('100-200 N ₫')!],
  ['Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM', parsePriceBand('100-300 N ₫')!],
  ['RuNam Vincom Landmark 81', parsePriceBand('100-700 N ₫')!],
  ['Nhà hàng chay Phương Mai', parsePriceBand('100-200 N ₫')!],
])
const scope: SnippetPriceScope = { byEntity: new Map(), placeNames: NAMES }
const v1 = (text: string, user = '') => guardSnippetPricesInText(text, [], user, scope)
const v2 = (text: string, user = '', bands = BANDS) => guardSnippetPricesInText(text, [], user, scope, { v2: true, priceBandsByEntity: bands })

describe('G2 · the provider band is entity-level evidence (Q3)', () => {
  it('"Giá 100-200k/người" under the named pick survives when it is the row\'s band; v1 deleted it', () => {
    const text = 'Mình chọn **GÀ RÁN K- JEJU CHICKEN-Quận 1** cho bạn 👍 Giá 100-200k/người rất hợp budget, không gian yên tĩnh, mở đến 3h sáng.'
    expect(v1(text).text).not.toContain('100-200k')
    const r = v2(text)
    expect(r.text).toBe(text)
    expect(r.stats?.supported_by_band).toBe(1)
  })
  it('the band carries forward by anaphora within a paragraph', () => {
    const text = 'Mình chọn **RuNam Vincom Landmark 81** cho bạn. Giá khoảng 100-700k, mở từ 7h-22h.'
    expect(v2(text).text).toBe(text)
  })
  it('a single-subject reply carries the pick across blank lines (the model\'s real layout)', () => {
    const text = 'Mình chọn **GÀ RÁN K- JEJU CHICKEN-Quận 1** — lựa chọn tốt nhất cho bạn 👌\n\n**4.9⭐ (7.166 đánh giá)**\n\nĐịa chỉ: Quận 1\n\nQuán có không gian yên tĩnh. Mở cửa đến 02:00, giá khoảng 100-200k/người.'
    const r = v2(text)
    expect(r.text).toBe(text)
    expect(r.stats?.supported_by_band).toBe(1)
  })
  it('…but not once a second venue has been named earlier in the reply', () => {
    const text = 'Mình chọn **GÀ RÁN K- JEJU CHICKEN-Quận 1** cho bạn.\n\nSo với **SOO COFFEE** thì rẻ hơn.\n\nGiá khoảng 100-200k/người.'
    expect(v2(text).text).not.toContain('100-200k')
  })
  it('a comparison sentence (one venue by name, one by its distinctive token) does not steal the subject', () => {
    const text = 'Mình chọn **RuNam Vincom Landmark 81** cho bạn. Mặc dù SOO COFFEE có rating cao hơn, nhưng RuNam vượt trội về số đánh giá. Giá khoảng 100-700k, mở từ 7h-22h.'
    expect(v2(text).text).toBe(text)
  })
  it('"dưới 100k" is inside "1-100.000 ₫" (open below)', () => {
    const text = 'Mình chọn **Wego Coffee Thảo Điền** — quán này có 4.8⭐ từ 337 đánh giá, giá phải chăng (dưới 100k).'
    expect(v2(text).text).toBe(text)
  })
  it('partial overlap is unsupported — no tolerance (owner rule)', () => {
    const text = 'Mình chọn **SOO COFFEE** cho bạn. Giá khoảng 100-250k.'
    const r = v2(text)
    expect(r.text).not.toContain('100-250k')
    expect(r.stats?.unsupported).toBe(1)
  })
  it('a price outside the band is removed', () => {
    const text = 'Mình chọn **SOO COFFEE** cho bạn. Giá khoảng 1-2tr.'
    expect(v2(text).text).not.toContain('1-2tr')
  })
  it('a comparison sentence checks each amount against the named venues\' own bands', () => {
    const ok = 'Ngoài ra còn **BÒ TƠ QUÁN MỘC** (200-400k/người) hoặc **SOO COFFEE** (100-200k) nếu bạn muốn khác.'
    expect(v2(ok).text).toBe(ok)
    const bad = 'Ngoài ra còn **BÒ TƠ QUÁN MỘC** (200-400k/người) hoặc **SOO COFFEE** (900-950k) nếu bạn muốn khác.'
    expect(v2(bad).text).not.toContain('900-950k')
  })
  it('a venue with no band gets no band support (falls back to snippet evidence: none ⇒ removed)', () => {
    const text = 'Mình chọn **SOO COFFEE** cho bạn. Giá khoảng 100-200k.'
    expect(v2(text, '', new Map()).text).not.toContain('100-200k')
  })
  it('a user-stated price is still never redacted', () => {
    const text = 'Mình tìm quán dưới 500k cho bạn.'
    expect(v2(text, 'Tìm quán ăn tối dưới 500k cho 2 người').text).toBe(text)
  })
})

describe('G2 · embellished bands (owner remark 4, pinned)', () => {
  it('"/người", "/phần" are the unit of account, not a claim — kept', () => {
    const text = 'Mình chọn **Vua Chả Cá** cho bạn! Chuyên chả cá Hà Nội, giá hợp lý (100-300k/người), mở cửa đến 22:30.'
    expect(v2(text).text).toBe(text)
  })
  it('evaluative words ("giá rẻ", "hợp lý") carry no amount and are out of this guard\'s scope', () => {
    const text = 'Mình chọn **Nhà hàng chay Phương Mai** — quán ăn chay với giá rẻ và hợp lý.'
    expect(v2(text).text).toBe(text)
    expect(v2(text).stats?.claims).toBe(0)
  })
})

describe('G2 · R3′ clause cut (Q1)', () => {
  it('cuts a price-only parenthetical and keeps the rating: "(4.9⭐, 500-900k/người)" → "(4.9⭐)"', () => {
    const text = 'Ngoài ra còn **BÒ TƠ QUÁN MỘC** (4.9⭐, 500-900k/người) nếu bạn muốn thử thịt bò nướng.'
    const r = v2(text)
    expect(r.text).toBe('Ngoài ra còn **BÒ TƠ QUÁN MỘC** (4.9⭐) nếu bạn muốn thử thịt bò nướng.')
    expect(r.stats?.clause_cut).toBe(1)
  })
  it('cuts a trailing price clause and keeps the rating/hours clause', () => {
    const text = 'Hoặc **SOO COFFEE** (4.7⭐, 556 đánh giá) nếu bạn thích không gian hiện đại, mở đến 23h với giá khoảng 500-900k.'
    const r = v2(text)
    expect(r.text).toBe('Hoặc **SOO COFFEE** (4.7⭐, 556 đánh giá) nếu bạn thích không gian hiện đại, mở đến 23h.')
    expect(r.stats?.clause_cut).toBe(1)
  })
  it('a clause that carries anything besides the price is not cut — whole sentence goes', () => {
    const text = 'Mình chọn **SOO COFFEE** — 4.7⭐, không gian rộng với giá 500-900k và có chỗ đậu xe.'
    const r = v2(text)
    expect(r.text).toBe('')
    expect(r.stats?.clause_cut).toBe(0)
    expect(r.stats?.sentences_removed).toBe(1)
  })
  it('never leaves "— 4.8⭐, " behind: the comma goes with the price clause', () => {
    const text = 'Mình chọn **SOO COFFEE** — 4.8⭐, 500-900k/người.'
    const r = v2(text)
    expect(r.text).toBe('Mình chọn **SOO COFFEE** — 4.8⭐.')
    expect(r.text).not.toMatch(/[,—–-]\s*[.!?]?\s*$/)
    expect(r.stats?.clause_cut).toBe(1)
  })
  it('a remainder that would dangle ("… với giá" left over) means the whole sentence goes', () => {
    const text = 'Mình chọn **SOO COFFEE** — 4.8⭐ với giá (500-900k).'
    const r = v2(text)
    expect(r.text).not.toContain('500-900k')
    expect(r.text).not.toMatch(/giá\s*[.!?]?\s*$/)
  })
  it('a sentence with no evidence-backed fact beside the price is removed whole, as R3 locks', () => {
    const text = 'Mình chọn **SOO COFFEE** cho bạn.\n\nGiá khoảng 1-2tr, hợp túi tiền.'
    const r = v2(text)
    expect(r.text).toBe('Mình chọn **SOO COFFEE** cho bạn.')
    expect(r.stats?.clause_cut).toBe(0)
  })
  it('the remainder never keeps a second, unsupported amount', () => {
    const text = 'Hoặc **SOO COFFEE** (4.7⭐) mở đến 23h với giá khoảng 500-900k, combo 2 người 2tr.'
    const r = v2(text)
    expect(r.text).not.toContain('2tr')
    expect(r.text).not.toContain('500-900k')
  })
})

describe('G2 · mixed-unit ranges ("500k-1tr") — two single amounts, each checked; fail-closed (owner follow-up 2)', () => {
  it('"500k-1tr" is read as 500k AND 1tr; one amount outside the band removes the sentence (v1 and v2)', () => {
    const text = 'Mình chọn **BÒ TƠ QUÁN MỘC** cho bạn. Giá khoảng 300k-1tr/người.' // band 200-400 N ₫: 300k inside, 1tr outside
    expect(v1(text).text).not.toContain('300k-1tr')
    const r = v2(text)
    expect(r.text).not.toContain('300k-1tr')
    expect(r.stats?.claims).toBe(2)
    expect(r.stats?.unsupported).toBe(1)
  })
  it('"200k-1,5tr" likewise; the clause cut never rescues a mixed range with one bad half', () => {
    const text = 'Hoặc **SOO COFFEE** (4.7⭐, 556 đánh giá) nếu bạn thích không gian hiện đại, giá 200k-1,5tr.'
    const r = v2(text)
    expect(r.text).toBe('')
    expect(r.stats?.clause_cut).toBe(0)
  })
  it('both halves inside the band ⇒ kept', () => {
    const text = 'Mình chọn **RuNam Vincom Landmark 81** cho bạn. Giá khoảng 500k-0,7tr.' // band 100-700 N ₫
    expect(v2(text).text).toBe(text)
  })
})

describe('G2 · single-subject carry-over is v2-only and bounded (owner follow-up 3)', () => {
  const pickThenPrice = 'Mình chọn **GÀ RÁN K- JEJU CHICKEN-Quận 1** — lựa chọn tốt nhất cho bạn 👌\n\n**4.9⭐ (7.166 đánh giá)**\n\nGiá khoảng 100-200k/người, mở đến 02:00.'
  it('v1 never carries a subject across a blank line (the sentence stays area-level and, with no snippet, is removed)', () => {
    expect(v1(pickThenPrice).text).not.toContain('100-200k')
  })
  it('a DIFFERENT venue named in a LATER paragraph does not retract the carry-over for the earlier price sentence', () => {
    const text = pickThenPrice + '\n\nNgoài ra, **SOO COFFEE** (4.7⭐) cũng đáng thử nếu bạn muốn cafe.'
    const r = v2(text)
    expect(r.text).toBe(text)
    expect(r.stats?.supported_by_band).toBe(1)
  })
  it('a different venue named BEFORE the price sentence ends the carry-over (already pinned above); a later price after that second venue is judged by paragraph anaphora, not by the pick', () => {
    const text = 'Mình chọn **GÀ RÁN K- JEJU CHICKEN-Quận 1** cho bạn.\n\nNgoài ra có **SOO COFFEE** (4.7⭐).\n\nGiá khoảng 100-200k/người.'
    expect(v2(text).text).not.toContain('100-200k')
  })
  it('a carried subject whose band does not support the amount falls back to area snippet evidence, and with none the sentence goes', () => {
    const text = 'Mình chọn **SOO COFFEE** cho bạn.\n\n**4.7⭐**\n\nGiá dịch vụ ở khu này thường khoảng 1-2tr.'
    expect(v2(text).text).not.toContain('1-2tr')
    const withArea = guardSnippetPricesInText(text, [1000000, 2000000], '', scope, { v2: true, priceBandsByEntity: BANDS })
    expect(withArea.text).toBe(text)
  })
})

describe('G2 · v1 byte-identical without the flag', () => {
  it('same text, same result, no stats', () => {
    const text = 'Mình chọn **SOO COFFEE** cho bạn. Giá khoảng 100-200k.'
    const a = guardSnippetPricesInText(text, [], '', scope)
    const b = guardSnippetPricesInText(text, [], '', scope, { v2: false, priceBandsByEntity: BANDS })
    expect(b.text).toBe(a.text)
    expect(b.text).not.toContain('100-200k')
  })
})
