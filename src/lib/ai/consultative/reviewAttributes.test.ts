import { describe, it, expect } from 'vitest'
import { extractAttributes, hardConstraintGaps, guardAtmosphereClaims, attributeSummary, moodAttribute } from './reviewAttributes'

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
    expect(hardConstraintGaps(['quiet', 'parking', 'wheelchair', 'vegetarian'], attrs)).toEqual(['vegetarian'])
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
  it('never cuts the pick sentence — counts instead', () => {
    const r = guardAtmosphereClaims('Mình chọn **Ốc Đào** vì yên tĩnh.', { attrs, names })
    expect(r.removed).toBe(0)
    expect(r.unsupportedInPick).toBe(1)
    expect(r.text).toBe('Mình chọn **Ốc Đào** vì yên tĩnh.')
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
