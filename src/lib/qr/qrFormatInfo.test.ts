import { describe, it, expect } from 'vitest'
import { encodeQR } from './qrcode'

// UAT3 (2026-09-27): the second copy of the 15-bit format information was transposed, so the two
// copies disagreed and OpenCV decoded none of the codes this encoder produced (measured on the
// exported card and on bare matrices for "HELLO" and a profile URL). Both copies must carry the
// same valid BCH(15,5) word (ISO/IEC 18004 §7.9).
function copies(m: number[][]) {
  const n = m.length
  let a = 0
  let b = 0
  const bitA = (i: number) => {
    if (i <= 5) return m[i][8]
    if (i === 6) return m[7][8]
    if (i === 7) return m[8][8]
    if (i === 8) return m[8][7]
    return m[8][14 - i]
  }
  const bitB = (i: number) => (i <= 7 ? m[8][n - 1 - i] : m[n - 15 + i][8])
  for (let i = 0; i < 15; i++) { a |= bitA(i) << i; b |= bitB(i) << i }
  return { a, b, dark: m[n - 8][8] }
}
const bchValid = (word: number) => {
  let d = (word ^ 0x5412)
  for (let i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= 0x537 << (i - 10)
  return d === 0
}

describe('QR format information', () => {
  const inputs = ['HELLO', 'https://example.com', 'https://www.tappyai.com/users/3a87306c-e06b-482d-8480-547ed3d1fe93']
  it.each(inputs)('both copies agree and are valid for %s, every mask', (text) => {
    for (let mask = 0; mask < 8; mask++) {
      const { a, b, dark } = copies(encodeQR(text, mask))
      expect(b).toBe(a)
      expect(bchValid(a)).toBe(true)
      // EC level M (00) and the requested mask.
      expect(((a ^ 0x5412) >> 10) & 0b11111).toBe(mask)
      expect(dark).toBe(1)
    }
  })
})
