import { describe, it, expect } from 'vitest'
import { priorVenuesIn, resolveReferences, factsAsked, referencedVenues, priorTextStates, renderReferencedBlock } from './referenceResolver'

// Consultative V1 §3 — "quán này / quán số 2 / 3 quán này / Quán X" resolve to
// venues the previous reply NAMED, deterministically; never to a new search.

const PRIOR = `Mình chọn **Bún Bò Huế Bến Ngự** cho tối nay: 4.4⭐ từ 589 đánh giá, mở 06:00–20:00, tầm 50-70k/tô.

Nếu muốn yên tĩnh hơn thì **Cơm Niêu Sài Gòn** (585 Huỳnh Tấn Phát, Quận 7) là phương án hai.

**Lưu ý:** cuối tuần khá đông. Còn **Ốc Đào** thì hợp đi nhóm.

[FOLLOWUPS] a | b`

describe('priorVenuesIn', () => {
  it('reads bolded venue names in order of mention, skipping labels and machine blocks', () => {
    expect(priorVenuesIn(PRIOR).map(v => v.name)).toEqual(['Bún Bò Huế Bến Ngự', 'Cơm Niêu Sài Gòn', 'Ốc Đào'])
    expect(priorVenuesIn(PRIOR)[2].index).toBe(3)
  })
  it('dedupes a name mentioned twice and returns nothing for prose without names', () => {
    expect(priorVenuesIn('**A** rồi lại **A**').length).toBe(1)
    expect(priorVenuesIn('không có quán nào')).toEqual([])
    expect(priorVenuesIn('')).toEqual([])
  })
})

describe('resolveReferences', () => {
  const prior = priorVenuesIn(PRIOR)
  it('"quán này" / "chỗ đó" → the pick (first named), accented or not', () => {
    expect(resolveReferences('quán này mở mấy giờ?', prior)[0]).toMatchObject({ kind: 'this', venues: [{ index: 1 }] })
    expect(resolveReferences('cho do co dau xe ko', prior)[0]).toMatchObject({ kind: 'this' })
    expect(resolveReferences('is this place open now', prior)[0]).toMatchObject({ kind: 'this' })
  })
  it('ordinals: đầu tiên / số 2 / thứ ba / cuối', () => {
    expect(resolveReferences('ok chon quan dau tien', prior)[0]).toMatchObject({ kind: 'ordinal', venues: [{ index: 1 }] })
    expect(resolveReferences('quán số 2 giá sao', prior)[0]).toMatchObject({ kind: 'ordinal', venues: [{ index: 2 }] })
    expect(resolveReferences('cái thứ ba thì sao', prior)[0]).toMatchObject({ kind: 'ordinal', venues: [{ index: 3 }] })
    expect(resolveReferences('quán cuối cùng', prior)[0]).toMatchObject({ kind: 'ordinal', venues: [{ index: 3 }] })
  })
  it('counts and "all": 2 quán này / cả 3', () => {
    expect(resolveReferences('2 quán này quán nào rẻ hơn', prior)[0]).toMatchObject({ kind: 'count' })
    expect(resolveReferences('2 quán này quán nào rẻ hơn', prior)[0].venues.map(v => v.index)).toEqual([1, 2])
    expect(resolveReferences('cả 3 quán có chỗ đậu xe không', prior)[0]).toMatchObject({ kind: 'all' })
    expect(resolveReferences('cả 3 quán có chỗ đậu xe không', prior)[0].venues.length).toBe(3)
  })
  it('by name, diacritics or not', () => {
    expect(resolveReferences('Ốc Đào có mở khuya không', prior)[0]).toMatchObject({ kind: 'name', venues: [{ index: 3 }] })
    expect(resolveReferences('oc dao co mo khuya khong', prior)[0]).toMatchObject({ kind: 'name', venues: [{ index: 3 }] })
  })
  it('a new question resolves to nothing — never a new search', () => {
    expect(resolveReferences('tìm quán sushi gần đây', prior)).toEqual([])
    expect(resolveReferences('quán này', [])).toEqual([])
  })
  it('referencedVenues dedupes across references, in prior order', () => {
    const refs = resolveReferences('cả 3 quán, nhất là Ốc Đào', prior)
    expect(referencedVenues(refs).map(v => v.index)).toEqual([1, 2, 3])
  })
})

describe('factsAsked + priorTextStates — when a real re-search by name is warranted', () => {
  const prior = priorVenuesIn(PRIOR)
  it('detects the fact asked, folded', () => {
    expect(factsAsked('quán này mở mấy giờ')).toEqual(['hours'])
    expect(factsAsked('cho do con mo khong')).toContain('open_now')
    expect(factsAsked('giá sao')).toEqual(['price'])
    expect(factsAsked('sdt quán này')).toEqual(['phone'])
    expect(factsAsked('có chỗ đậu xe không')).toEqual(['parking'])
    expect(factsAsked('what time does it close')).toContain('hours')
  })
  it('"gia đình" is not a price question; "cách đặt bàn" is not a distance question', () => {
    expect(factsAsked('quán này hợp gia đình không')).toEqual([])
    expect(factsAsked('cách đặt bàn')).toEqual(['booking'])
  })
  it('the prior prose already states hours and price for the pick, but nothing for Ốc Đào', () => {
    expect(priorTextStates(PRIOR, prior[0], 'hours')).toBe(true)
    expect(priorTextStates(PRIOR, prior[0], 'price')).toBe(true)
    expect(priorTextStates(PRIOR, prior[0], 'phone')).toBe(false)
    expect(priorTextStates(PRIOR, prior[1], 'address')).toBe(true)
    expect(priorTextStates(PRIOR, prior[2], 'hours')).toBe(false)
    expect(priorTextStates(PRIOR, prior[2], 'parking')).toBe(false)
  })
})

describe('renderReferencedBlock', () => {
  it('names the venues and states honestly whether the re-search found anything', () => {
    const b = renderReferencedBlock([{ index: 3, name: 'Ốc Đào' }], [{ name: 'Ốc Đào', found: false }])
    expect(b).toContain('REFERENCED (user đang nói về): #3 Ốc Đào')
    expect(b).toContain('KHÔNG có kết quả')
    expect(b).toContain('mình không tìm thấy')
    expect(renderReferencedBlock([], [])).toBe('')
  })
})
