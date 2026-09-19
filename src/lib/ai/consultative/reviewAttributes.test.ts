import { describe, it, expect } from 'vitest'
import { extractAttributes, hardConstraintGaps, rowSupportedHards, guardAtmosphereClaims, attributeSummary, moodAttribute } from './reviewAttributes'

// Consultative V1 §4 — attributes come from FETCHED text only, keep their
// evidence snippet, and a claim about a named venue with no supporting
// attribute is removed (never the pick sentence).

const texts = new Map<string, string[]>([
  ['Cơm Niêu Sài Gòn', ['Không gian yên tĩnh, hợp gia đình, có chỗ đậu xe ô tô', 'Giá hơi cao nhưng phục vụ tốt']],
  ['Ốc Đào', ['Quán rất đông, xếp hàng chờ lâu nhưng ốc ngon rẻ', 'Mở khuya tới 2h sáng']],
  ['Rooftop Bar X', ['View thành phố đẹp, sôi động, có DJ cuối tuần']],
  ['Quán im', ['không yên tĩnh lắm, khá ồn']],
  ['Tiệm rỗng', []],
])

describe('extractAttributes', () => {
  const attrs = extractAttributes(texts)
  it('finds atmosphere / audience attributes with their evidence snippet', () => {
    const cn = attrs.get('Cơm Niêu Sài Gòn')!.map(a => a.attribute)
    expect(cn).toEqual(expect.arrayContaining(['quiet', 'family', 'parking']))
    expect(attrs.get('Cơm Niêu Sài Gòn')!.find(a => a.attribute === 'quiet')!.snippet).toContain('yên tĩnh')
    expect(attrs.get('Ốc Đào')!.map(a => a.attribute)).toEqual(expect.arrayContaining(['crowded', 'cheap', 'late_open']))
    // The NAME is not evidence: "Rooftop" in the name does not make it outdoor.
    expect(attrs.get('Rooftop Bar X')!.map(a => a.attribute)).toEqual(['lively', 'view'])
  })
  it('a negated word is not evidence; a venue with no text has no attributes', () => {
    expect(attrs.get('Quán im')?.map(a => a.attribute) ?? []).not.toContain('quiet')
    expect(attrs.has('Tiệm rỗng')).toBe(false)
  })
  it('"50.000 đồng" is a price, not a crowd', () => {
    const a = extractAttributes(new Map([['Q', ['Tô bún 50.000 đồng']]]))
    expect(a.get('Q')?.map(x => x.attribute) ?? []).not.toContain('crowded')
  })
  it('attributeSummary renders Vietnamese labels with the snippet', () => {
    expect(attributeSummary(attrs.get('Ốc Đào')!)).toContainEqual(expect.stringMatching(/^thường đông \("Quán rất đông/))
  })
})

describe('hardConstraintGaps + moodAttribute', () => {
  const attrs = extractAttributes(texts)
  it('a stated hard constraint with no supporting evidence anywhere is a gap', () => {
    // wheelchair has no review-lexicon entry and no row flag: nothing can vouch for it ⇒ gap.
    expect(hardConstraintGaps(['quiet', 'parking', 'wheelchair', 'vegetarian'], attrs)).toEqual(['wheelchair', 'vegetarian'])
  })
  // Measured 2026-09-19 (F8 "phòng riêng", 4 runs): a constraint outside the lexicon was
  // skipped, no BANG CHUNG THIEU line reached the prompt, and the model asserted a private
  // room for a venue nothing vouched for.
  it('a constraint the lexicon cannot read is a gap, unless a row flag vouches for it', () => {
    expect(hardConstraintGaps(['private_room'], attrs)).toEqual(['private_room'])
    expect(hardConstraintGaps(['delivery'], attrs)).toEqual(['delivery'])
    expect(hardConstraintGaps(['delivery'], attrs, rowSupportedHards([{ name: 'A', has_delivery: true }]))).toEqual([])
    expect(hardConstraintGaps(['delivery', 'private_room'], attrs, rowSupportedHards([{ has_order: true }]))).toEqual(['private_room'])
    expect(rowSupportedHards([{ has_delivery: false }, null, 'x'])).toEqual([])
  })
  it('maps moods to the attribute that answers them', () => {
    expect(moodAttribute('romantic')).toBe('date')
    expect(moodAttribute('cheap_good')).toBe('cheap')
    expect(moodAttribute(null)).toBeNull()
  })
})

describe('guardAtmosphereClaims', () => {
  const attrs = extractAttributes(texts)
  const names = [...texts.keys()]
  it('removes an unsupported atmosphere claim about a named venue, keeps a supported one', () => {
    const text = 'Mình chọn **Cơm Niêu Sài Gòn** vì yên tĩnh và có chỗ đậu xe.\n\nNgoài ra **Ốc Đào** rất yên tĩnh, hợp hẹn hò.\n\nĐi sớm nhé.'
    const r = guardAtmosphereClaims(text, { attrs, names })
    expect(r.removed).toBe(1)
    expect(r.text).not.toContain('Ốc Đào')
    expect(r.text).toContain('Cơm Niêu Sài Gòn')
    expect(r.text).toContain('Đi sớm nhé.')
  })
  it('never cuts the pick sentence — an unsupported clause is stripped, the decision stays', () => {
    const r = guardAtmosphereClaims('Mình chọn **Ốc Đào** vì yên tĩnh.', { attrs, names })
    expect(r.removed).toBe(0)
    expect(r.unsupportedInPick).toBe(1)
    // No clause boundary ⇒ nothing to strip ⇒ the sentence stands (counted).
    expect(r.text).toBe('Mình chọn **Ốc Đào** vì yên tĩnh.')
    const clause = guardAtmosphereClaims('Mình chọn **Ốc Đào** cho bạn — quán ăn chay sang trọng với không khí yên tĩnh, lãng mạn, đúng vibe cho hẹn hò tối nay. Có 4.4⭐ (589 đánh giá).', { attrs, names })
    expect(clause.removed).toBe(0)
    // "sang trọng" (fancy) and "yên tĩnh" are both unsupported for Ốc Đào ⇒ both clauses go.
    expect(clause.text).toBe('Mình chọn **Ốc Đào** cho bạn. Có 4.4⭐ (589 đánh giá).')
  })
  it('a stated constraint with no evidence anywhere is unsupported even in a nameless sentence (measured F4)', () => {
    const text = 'Mình chọn **Cơm Niêu Sài Gòn** cho cả nhà. Không gian rộng rãi, phù hợp 6 người, và đặc biệt là có chỗ đậu xe ô tô mà bạn cần. Đi sớm nhé.'
    const r = guardAtmosphereClaims(text, { attrs: new Map(), names: ['Cơm Niêu Sài Gòn'], gapAttributes: ['parking'] })
    expect(r.removed).toBe(1)
    expect(r.text).toBe('Mình chọn **Cơm Niêu Sài Gòn** cho cả nhà. Đi sớm nhé.')
    // The honest gap sentence itself is never a claim.
    const honest = 'Mình chọn **Cơm Niêu Sài Gòn**. Mình chưa thấy bằng chứng về chỗ đậu xe ở các quán này.'
    expect(guardAtmosphereClaims(honest, { attrs: new Map(), names: ['Cơm Niêu Sài Gòn'], gapAttributes: ['parking'] }).removed).toBe(0)
  })
  it('the user\'s wish is not a venue claim; a sentence without a venue is untouched', () => {
    const text = 'Mình chọn **Cơm Niêu Sài Gòn**. Bạn muốn yên tĩnh nên **Ốc Đào** không hợp. Nhìn chung nên chọn chỗ yên tĩnh.'
    expect(guardAtmosphereClaims(text, { attrs, names }).removed).toBe(0)
  })
  it('no names ⇒ untouched', () => {
    const s = 'Quán X rất yên tĩnh.'
    expect(guardAtmosphereClaims(s, { attrs, names: [] }).text).toBe(s)
  })
})

describe('guardAtmosphereClaims — anaphora', () => {
  const attrs = extractAttributes(new Map([['Nhà Hàng Du Ký', ['hải sản tươi']]]))
  it('"Quán có … yên tĩnh" right after the named pick is about the pick and is unsupported', () => {
    const text = 'Mình gợi ý **Nhà Hàng Du Ký** — 4.7⭐. Quán có phòng riêng, không khí sân vườn yên tĩnh. Với 8 người là hợp lý.'
    const r = guardAtmosphereClaims(text, { attrs, names: ['Nhà Hàng Du Ký'] })
    expect(r.removed).toBe(1)
    expect(r.text).toBe('Mình gợi ý **Nhà Hàng Du Ký** — 4.7⭐. Với 8 người là hợp lý.')
  })
  it('a nameless sentence that does not open with an anaphor is left alone', () => {
    const text = 'Mình gợi ý **Nhà Hàng Du Ký**. Nhìn chung khu này khá yên tĩnh buổi tối.'
    expect(guardAtmosphereClaims(text, { attrs, names: ['Nhà Hàng Du Ký'] }).removed).toBe(0)
  })
})

describe('guardAtmosphereClaims — the pick is the first sentence that NAMES a venue', () => {
  it('a preamble before the pick does not make the pick cuttable (measured F3)', () => {
    const attrs = extractAttributes(new Map([['Padme Chay', ['chay']]]))
    const text = 'Mình tìm những quán lãng mạn yên tĩnh ở Quận 3 cho bạn nhé.\n\nMình chọn **Padme Chay** — không gian yên tĩnh, 4.9⭐.\n\nNếu muốn gần hơn, **Lil Sago** cũng yên tĩnh.'
    const r = guardAtmosphereClaims(text, { attrs, names: ['Padme Chay', 'Lil Sago'] })
    expect(r.text).toContain('Mình chọn **Padme Chay**')
    expect(r.unsupportedInPick).toBe(1)
    expect(r.removed).toBe(1)
    expect(r.text).not.toContain('Lil Sago')
  })
})

describe('guardAtmosphereClaims — a bolded name with a dash is atomic', () => {
  it('"**Tám Riêu - Phan Xích Long**" survives the clause strip (measured: "Mình chọn **Tám Riêu.")', () => {
    const text = 'Mình chọn **Tám Riêu - Phan Xích Long** cho bữa trưa gia đình — không gian yên tĩnh, có chỗ đậu xe. Đi sớm nhé.'
    const r = guardAtmosphereClaims(text, { attrs: new Map(), names: ['Tám Riêu - Phan Xích Long'], gapAttributes: ['parking', 'quiet'] })
    expect(r.text).toBe('Mình chọn **Tám Riêu - Phan Xích Long** cho bữa trưa gia đình. Đi sớm nhé.')
  })
})
