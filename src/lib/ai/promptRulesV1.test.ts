import { describe, it, expect } from 'vitest'
import { systemBase, RULES_OVERRIDDEN_BY_CONSULTATIVE_V1 } from './promptBuilder'

// Cost optimization item 2 (2026-09-18): the rules the CONSULTATIVE_V1 block overrides leave the
// cached rulebook when the flag is ON; with it OFF the rulebook is byte-identical.

describe('rules overridden by CONSULTATIVE_V1', () => {
  it('every listed rule exists in the rulebook (the list cannot drift from the text)', () => {
    const off = systemBase(false)
    for (const r of RULES_OVERRIDDEN_BY_CONSULTATIVE_V1) {
      expect(off.split('\n').some(l => l.startsWith(r.startsWith)), r.id).toBe(true)
    }
  })
  it('flag ON removes exactly those lines and widens the shortlist wording to 1..5', () => {
    const off = systemBase(false), on = systemBase(true)
    expect(on).not.toContain('dua 2-4 lua chon')
    expect(on).not.toContain('R2: Toi da 3 bullet')
    expect(on).not.toContain('cu goi y 2-3 lua chon truoc')
    expect(on).not.toContain('Neu 2: viet 2. Neu 3: viet toi da 3.')
    expect(on).toContain("'_tappy_shortlist' la MANG 1..5")
    expect(off.split('\n').length - on.split('\n').length).toBe(4)
    // Anti-fabrication rules stay, verbatim.
    for (const must of ['TUYET DOI KHONG bia', 'KHONG CO DU LIEU', 'MO TA DIA DIEM CHI TU DU LIEU THAT', 'DECISION-FIRST OPENING']) {
      expect(on).toContain(must)
    }
  })
  it('flag OFF is byte-identical to the rulebook', () => {
    expect(systemBase(false)).toBe(systemBase(false))
    expect(systemBase(false)).toContain('dua 2-4 lua chon')
  })
})
