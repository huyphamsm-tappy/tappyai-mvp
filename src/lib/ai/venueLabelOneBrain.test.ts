import { describe, it, expect } from 'vitest'
import { suppressUngroundedVenues } from './groundingGate'
import { pageGroundedNames, type GuardEvidence } from './guardEvidence'

// ── N3 (30/10): a venue the turn READ on a page is not labelled "(chưa xác minh)" because the model put its pick in the same bold ──────────
//
// Measured 30/10 (O-DEV30 k2a Q12, one brain): "**Có. Mình ưu tiên The Wiselands Coffee** (chưa xác minh) nếu bạn cần không gian yên tĩnh…"
// - the cafe's own page (wiselands.vn) had been read this turn and was linked two lines below. The gate judged the WHOLE bold span
// ("Có. Mình ưu tiên The Wiselands Coffee") against the evidence names; the span is not a name, so it matched nothing, and the label
// told the user the pick was unverified. The blind judges read it as a hedge (useful −1.5 to −3 on Q12 in every run).
// Rule kept: a bold venue name that NO evidence names still gets its label.

const ev = (passages: string[]): GuardEvidence => ({ sources: [{ id: 'S1', host: 'wiselands.vn', sourceType: 'official' as never, passages }], conflicts: [], carried: [], constraintsSig: null, userText: '' })
const PAGE = ev(['The Wiselands Coffee, 216 Điện Biên Phủ, Quận 3: không gian cà phê sách, nhiều cây xanh, khu trong nhà yên tĩnh. Mở cửa 7:00–23:00.'])
const OPTS = { placeSearch: 'ok' as const, pickAndOrderFree: true, labelUngrounded: true, dayHeadings: true }

function gate(text: string, places: string[] = ['Café Slow', 'Là Việt Coffee']) {
  return suppressUngroundedVenues(text, [...places, ...pageGroundedNames(text, PAGE)], 'vi', OPTS as never)
}

describe('N3 · venue label on the one-brain route', () => {
  it('a pick sentence in bold around a venue the page names gets no label', () => {
    const text = '**Có. Mình ưu tiên The Wiselands Coffee** nếu bạn cần không gian yên tĩnh.\n\n- **The Wiselands Coffee:** 216 Điện Biên Phủ.\n- **Café Slow:** 27/63A Huỳnh Tịnh Của.'
    expect(gate(text).text).not.toContain('(chưa xác minh)')
  })
  it('the bullet heading with a trailing colon is the same name: no label', () => {
    const text = '- **The Wiselands Coffee:** 216 Điện Biên Phủ, yên tĩnh.\n- **Café Slow:** 27/63A Huỳnh Tịnh Của.'
    expect(gate(text).text).not.toContain('(chưa xác minh)')
  })
  it('a pick sentence around an UNKNOWN venue is still labelled, once', () => {
    const text = '**Mình ưu tiên Cà Phê Mây Trời** nếu bạn cần yên tĩnh.\n\n- **Café Slow:** 27/63A Huỳnh Tịnh Của.'
    const out = gate(text).text
    expect(out).toContain('**Mình ưu tiên Cà Phê Mây Trời** (chưa xác minh)')
    expect(out.split('(chưa xác minh)').length - 1).toBe(1)
  })
  it('an answer-first pick sentence ("Có. Mình ưu tiên …") around a place ROW, with no bullet repeating it, gets no label', () => {
    const text = '**Có. Mình ưu tiên Café Slow** nếu bạn cần ngồi lâu: quán nhỏ, ít khách buổi sáng.'
    expect(gate(text).text).not.toContain('(chưa xác minh)')
  })
  it('a pick sentence that names a place ROW (no page) gets no label either', () => {
    const text = '**Mình chọn Café Slow** cho buổi làm việc dài.\n\n- **Café Slow:** 27/63A Huỳnh Tịnh Của.'
    expect(gate(text).text).not.toContain('(chưa xác minh)')
  })
})
