import { describe, it, expect } from 'vitest'

// ── Gate 2 · 6a (gate2/p18/P18-DECISIONS.json): which follow-ups get the stored rows as guard evidence ──
//
// `refersToStoredVenue` is new in this round (registered after Step 0, as disclosed): a follow-up that names a stored venue, points at it by
// position on the cards the user saw ("quán đầu tiên") or by "quán đó / này", gets the stored rows as evidence; any other message does not.

import { refersToStoredVenue } from './referenceResolver'

const ROWS = ['Phở Hòa Pasteur', 'Bún Bò Huế Đông Ba']
const CARDS = ['Phở Hòa Pasteur', 'Bún Bò Huế Đông Ba']

describe('6a — refersToStoredVenue', () => {
  it('a stored venue named in the message', () => {
    expect(refersToStoredVenue('Phở Hòa Pasteur mấy giờ đóng cửa?', '', CARDS, ROWS)).toBe(true)
    expect(refersToStoredVenue('pho hoa pasteur con mo khong', '', null, ROWS)).toBe(true)
  })
  it('an ordinal on the cards, even when the previous reply bolds nothing (S1B-FOLLOW)', () => {
    expect(refersToStoredVenue('quán đầu tiên tối nay mấy giờ đóng cửa, lên lịch tối nay ở quán đầu tiên giúp mình', 'Mình chọn: Phở Hòa Pasteur nước dùng thanh.', CARDS, ROWS)).toBe(true)
    expect(refersToStoredVenue('quán thứ hai có đông không?', '', CARDS, ROWS)).toBe(true)
  })
  it('"quán đó" -- the first card / the venue the previous reply named', () => {
    expect(refersToStoredVenue('quán đó mở tới mấy giờ?', '**Mình chọn: Phở Hòa Pasteur**', CARDS, ROWS)).toBe(true)
  })
  it('no reference to a stored venue → no evidence', () => {
    expect(refersToStoredVenue('lên lịch tối nay giúp mình một chỗ khác', 'Mình chọn: Phở Hòa Pasteur.', CARDS, ROWS)).toBe(false)
    expect(refersToStoredVenue('thời tiết hôm nay thế nào?', '', CARDS, ROWS)).toBe(false)
    expect(refersToStoredVenue('quán thứ ba thì sao?', '', CARDS, ROWS)).toBe(false) // only two cards
    expect(refersToStoredVenue('quán đó mở mấy giờ?', '', CARDS, [])).toBe(false) // nothing stored
    expect(refersToStoredVenue('Bún Chả Hương Liên có ngon không?', '**Bún Chả Hương Liên**', CARDS, ROWS)).toBe(false) // named, not stored
  })
})
