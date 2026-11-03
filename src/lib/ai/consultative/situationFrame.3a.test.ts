// Phase 3A / D8 — child context in the situation frame: context by default, hard only on mandatory wording.
import { describe, it, expect } from 'vitest'
import { deriveSituation } from './situationFrame'

const frame = (...t: string[]) => deriveSituation(t, { budget: null, location: { text: null, gps: null } })

describe('3A.6 — "bé" is household context in the frame', () => {
  it('"đi với bé 3 tuổi" reads as a family outing and is NOT a hard constraint', () => {
    const f = frame('Đi với bé 3 tuổi, muốn chỗ thoải mái.')
    expect(f.who).toBe('family')
    expect(f.hard).not.toContain('kids')
  })
  it('"bé 5 tuổi" and "con 4 tuổi" also name the household', () => {
    expect(frame('bé 5 tuổi thích chạy nhảy').who).toBe('family')
    expect(frame('con 4 tuổi đi cùng').who).toBe('family')
  })
  it('mandatory wording (D8) makes it hard — the same predicate the need profile uses', () => {
    expect(frame('Bắt buộc phù hợp cho bé.').hard).toContain('kids')
    expect(frame('Không thể chọn chỗ không phù hợp cho bé.').hard).toContain('kids')
  })
  it('a negated or conditional marker does not', () => {
    expect(frame('không bắt buộc phải phù hợp cho bé').hard).not.toContain('kids')
    expect(frame('đi với bé').hard).not.toContain('kids')
  })
  it('OWNER: every generic child / household mention is soft context — family, never a hard `kids`', () => {
    for (const s of ['Đi với bé', 'Có trẻ em đi cùng', 'Đi cùng con', 'family lunch with kids', 'cả nhà có con nít', 'kids']) {
      const f = frame(s)
      expect(f.hard, s).not.toContain('kids')
    }
    for (const s of ['Đi với bé', 'Có trẻ em đi cùng', 'Đi cùng con', 'family lunch with kids']) expect(frame(s).who, s).toBe('family')
  })
  it('OWNER: explicit mandatory household wording stays HARD (D8.b), including "phải có khu vui chơi cho trẻ"', () => {
    for (const s of ['bắt buộc phù hợp cho bé', 'Phải có khu vui chơi cho trẻ', 'Không chấp nhận chỗ không phù hợp cho bé']) {
      expect(frame(s).hard, s).toContain('kids')
    }
  })
})
