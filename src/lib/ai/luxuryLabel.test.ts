import { describe, it, expect } from 'vitest'
import { labelLuxuryBrands } from './budget'

// CONSULT_V3 Đợt 2 review (owner 17/10): the luxury rename's replacement — label the segment, keep the name. Pure unit.
const N = ' (phân khúc cao cấp, khó vừa mức dưới 1.000.000đ bạn nêu)'

describe('labelLuxuryBrands', () => {
  it('labels after the bold name that contains the brand, once per brand', () => {
    const out = labelLuxuryBrands('Chọn **Hilton Garden Inn** nha. Hilton thì đẹp.', 1_000_000)
    expect(out).toBe(`Chọn **Hilton Garden Inn**${N} nha. Hilton thì đẹp.`)
  })
  it('a plain mention is labelled right after the brand word; case does not matter', () => {
    expect(labelLuxuryBrands('ở pullman gần biển', 1_000_000)).toBe(`ở pullman${N} gần biển`)
  })
  it('never touches a URL or a machine block', () => {
    const t = 'Xem [đây](https://www.hilton.com/vi/hotels/) và [TAPPY_PLAN]{"name":"Hilton Đà Nẵng"}[/TAPPY_PLAN]'
    expect(labelLuxuryBrands(t, 1_000_000)).toBe(t)
  })
  it('a brand that names one of this turn\'s card candidates is not labelled', () => {
    expect(labelLuxuryBrands('**Novotel Hạ Long** view đẹp', 1_000_000, new Set(['novotel']))).toBe('**Novotel Hạ Long** view đẹp')
  })
  it('a brand already labelled in an earlier frame is not labelled again; a word that merely contains a brand is not a brand', () => {
    const seen = new Set<string>()
    expect(labelLuxuryBrands('Có Melia.', 1_000_000, undefined, seen)).toBe(`Có Melia${N}.`)
    expect(labelLuxuryBrands('Melia vẫn đẹp.', 1_000_000, undefined, seen)).toBe('Melia vẫn đẹp.')
    expect(labelLuxuryBrands('Ameliani cafe', 1_000_000)).toBe('Ameliani cafe')
  })
  it('running twice does not double the label', () => {
    const once = labelLuxuryBrands('**Sheraton Sài Gòn** nha', 1_000_000)
    expect(labelLuxuryBrands(once, 1_000_000)).toBe(once)
  })
})
