// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { stripRemainingFooter } from './footerLine'

describe('stripRemainingFooter', () => {
  it('removes the Luna-6 and the classic wording, vi and en, wherever it sits', () => {
    expect(stripRemainingFooter('Mình chọn A.\n\nCòn 5 lựa chọn nữa — bạn muốn xem thêm không?')).toBe('Mình chọn A.')
    expect(stripRemainingFooter('Mình chọn A.\n\nMình còn 9 lựa chọn nữa, muốn xem thêm không?\n\nHết.')).toBe('Mình chọn A.\n\nHết.')
    expect(stripRemainingFooter('Pick A.\n\nI have 4 more options up my sleeve — want a look?')).toBe('Pick A.')
  })
  it('leaves other sentences that merely contain the words', () => {
    const t = 'Có nhiều lựa chọn khác nhau; còn tùy ngân sách.'
    expect(stripRemainingFooter(t)).toBe(t)
  })
  it('returns the same string when there is nothing to remove', () => {
    expect(stripRemainingFooter('Xin chào')).toBe('Xin chào')
  })
})
