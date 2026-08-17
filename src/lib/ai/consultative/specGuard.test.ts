import { describe, it, expect } from 'vitest'
import { guardSpecClaimsInText, type SpecEvidence } from './specGuard'

// ── SPEC-GUARD-01…14 — deterministic Shopping specification guard ──────────
//
// Prompt-only grounding was MEASURED insufficient: the block reduced unsupported
// weight/battery claims but did not eliminate them, because a prompt is an
// instruction and not a guarantee. This guard runs AFTER generation and BEFORE
// the user sees the reply, so compliance is no longer required — it is enforced.
//
// The invariant: NO CANDIDATE EVIDENCE → NO ASSERTION OF THAT ATTRIBUTE.
// The counterpart: a USER REQUIREMENT is not candidate evidence, and restating
// it must survive untouched.

const NO_SPEC: SpecEvidence[] = [
  { name: 'Asus Vivobook 16 A1607QA' },
  { name: 'Acer Aspire Go 15 AG15-52P' },
]
const A_ONLY: SpecEvidence[] = [
  { name: 'Asus Vivobook 16 A1607QA', weightKg: 1.4, batteryHours: 10 },
  { name: 'Acer Aspire Go 15 AG15-52P' },
]
const BOTH: SpecEvidence[] = [
  { name: 'Asus Vivobook 16 A1607QA', weightKg: 1.4, batteryHours: 12 },
  { name: 'Acer Aspire Go 15 AG15-52P', weightKg: 1.7, batteryHours: 8 },
]

const g = (text: string, ev = NO_SPEC) => guardSpecClaimsInText(text, ev)

describe('SPEC-GUARD-01 — unsupported WEIGHT claim is blocked', () => {
  it('EN: "Asus Vivobook 16 A1607QA is lightweight."', () => {
    const r = g('Asus Vivobook 16 A1607QA is lightweight.')
    expect(r.text).not.toMatch(/lightweight/i)
    expect(r.removed).toContain('Asus Vivobook 16 A1607QA:weight')
  })

  it('VI: "Asus Vivobook 16 A1607QA là máy nhẹ."', () => {
    const r = g('Asus Vivobook 16 A1607QA là máy nhẹ.')
    expect(r.text).not.toMatch(/nhẹ/)
    expect(r.removed).toContain('Asus Vivobook 16 A1607QA:weight')
  })

  it('keeps the grounded half of a mixed sentence', () => {
    const r = g('Asus Vivobook 16 A1607QA giá 18.59 triệu, máy rất nhẹ.')
    expect(r.text).toContain('18.59 triệu')
    expect(r.text).not.toMatch(/nhẹ/)
  })
})

describe('SPEC-GUARD-02 — unsupported BATTERY claim is blocked', () => {
  it('EN: "has excellent battery life"', () => {
    const r = g('Asus Vivobook 16 A1607QA has excellent battery life.')
    expect(r.text).not.toMatch(/battery/i)
    expect(r.removed).toContain('Asus Vivobook 16 A1607QA:battery')
  })

  for (const claim of ['pin tốt', 'pin lâu', 'thời lượng pin rất ổn', 'pin bền']) {
    it(`VI: "${claim}"`, () => {
      const r = g(`Asus Vivobook 16 A1607QA ${claim}.`)
      expect(r.text).not.toMatch(/pin/)
      expect(r.removed).toContain('Asus Vivobook 16 A1607QA:battery')
    })
  }
})

describe('SPEC-GUARD-03 — both unsupported claims blocked together', () => {
  it('EN', () => {
    const r = g('Asus Vivobook 16 A1607QA is lightweight and has excellent battery life.')
    expect(r.text).not.toMatch(/lightweight|battery/i)
    expect(r.removed).toEqual(expect.arrayContaining([
      'Asus Vivobook 16 A1607QA:weight', 'Asus Vivobook 16 A1607QA:battery',
    ]))
  })

  it('VI', () => {
    const r = g('Asus Vivobook 16 A1607QA vừa nhẹ vừa pin tốt.')
    expect(r.text).not.toMatch(/nhẹ|pin/)
  })
})

describe('SPEC-GUARD-04/05 — SUPPORTED claims survive', () => {
  it('04: weight claim kept when weightKg exists', () => {
    const r = guardSpecClaimsInText('Asus Vivobook 16 A1607QA nặng 1.4 kg.', A_ONLY)
    expect(r.text).toContain('1.4 kg')
    expect(r.removed).toEqual([])
  })

  it('04 EN: "weighs 1.4 kg"', () => {
    const r = guardSpecClaimsInText('Asus Vivobook 16 A1607QA weighs 1.4 kg.', A_ONLY)
    expect(r.text).toContain('1.4 kg')
  })

  it('05: battery claim kept when batteryHours exists', () => {
    const r = guardSpecClaimsInText('Asus Vivobook 16 A1607QA offers 10 hours of battery life.', A_ONLY)
    expect(r.text).toMatch(/battery/i)
    expect(r.removed).toEqual([])
  })

  it('05 VI: "pin khoảng 10 giờ"', () => {
    const r = guardSpecClaimsInText('Asus Vivobook 16 A1607QA pin khoảng 10 giờ.', A_ONLY)
    expect(r.text).toContain('pin')
  })

  it('the OTHER candidate is still guarded in the same reply', () => {
    const r = guardSpecClaimsInText('Acer Aspire Go 15 AG15-52P cũng rất nhẹ.', A_ONLY)
    expect(r.removed).toContain('Acer Aspire Go 15 AG15-52P:weight')
  })
})

describe('SPEC-GUARD-06/07/14 — USER REQUIREMENT framing survives', () => {
  it('06: "Bạn ưu tiên máy nhẹ và pin tốt." is untouched', () => {
    const r = g('Bạn ưu tiên máy nhẹ và pin tốt.')
    expect(r.text.trim()).toBe('Bạn ưu tiên máy nhẹ và pin tốt.')
    expect(r.removed).toEqual([])
  })

  it('07: preference framing beside a Pick survives, and asserts nothing', () => {
    const r = g('Asus Vivobook 16 A1607QA là lựa chọn tốt cho bạn vì bạn ưu tiên máy nhẹ.')
    expect(r.text).toContain('lựa chọn tốt')
    expect(r.removed).toEqual([])
  })

  it('07 EN: "since you want something light"', () => {
    const r = g("Since you want something light, I'd go with Asus Vivobook 16 A1607QA.")
    expect(r.text).toMatch(/light/i)
    expect(r.removed).toEqual([])
  })

  it('14: "Bạn thường xuyên đi lại." is user context, not a product claim', () => {
    const r = g('Bạn thường xuyên đi lại.')
    expect(r.text.trim()).toBe('Bạn thường xuyên đi lại.')
  })

  it('but a separate sentence asserting the product IS light is still blocked', () => {
    const r = g('Bạn ưu tiên máy nhẹ. Asus Vivobook 16 A1607QA rất nhẹ.')
    expect(r.text).toContain('Bạn ưu tiên máy nhẹ.')
    expect(r.removed).toContain('Asus Vivobook 16 A1607QA:weight')
  })
})

describe('SPEC-GUARD-08/09/10/11/12 — comparatives need evidence on BOTH sides', () => {
  it('08: neither has weight evidence → comparison blocked', () => {
    const r = g('Asus Vivobook 16 A1607QA nhẹ hơn Acer Aspire Go 15 AG15-52P.')
    expect(r.text).not.toMatch(/nhẹ hơn/)
    expect(r.removed.some(x => x.endsWith(':weight'))).toBe(true)
  })

  it('09: only A has weight evidence → comparison STILL blocked', () => {
    const r = guardSpecClaimsInText('Asus Vivobook 16 A1607QA nhẹ hơn Acer Aspire Go 15 AG15-52P.', A_ONLY)
    expect(r.text).not.toMatch(/nhẹ hơn/)
    expect(r.removed).toContain('Acer Aspire Go 15 AG15-52P:weight')
  })

  it('10: both have weight evidence → comparison preserved', () => {
    const r = guardSpecClaimsInText('Asus Vivobook 16 A1607QA nhẹ hơn Acer Aspire Go 15 AG15-52P.', BOTH)
    expect(r.text).toContain('nhẹ hơn')
    expect(r.removed).toEqual([])
  })

  it('11 VI: battery comparative blocked without evidence on both sides', () => {
    const r = guardSpecClaimsInText('Asus Vivobook 16 A1607QA pin tốt hơn Acer Aspire Go 15 AG15-52P.', A_ONLY)
    expect(r.text).not.toMatch(/pin tốt hơn/)
  })

  it('12 EN: battery comparative blocked without evidence on both sides', () => {
    const r = guardSpecClaimsInText('Asus Vivobook 16 A1607QA has better battery life than Acer Aspire Go 15 AG15-52P.', A_ONLY)
    expect(r.text).not.toMatch(/battery/i)
  })

  it('12b: battery comparative preserved when both are evidenced', () => {
    const r = guardSpecClaimsInText('Asus Vivobook 16 A1607QA pin tốt hơn Acer Aspire Go 15 AG15-52P.', BOTH)
    expect(r.text).toContain('pin')
    expect(r.removed).toEqual([])
  })
})

describe('SPEC-GUARD-13 — legitimate prose is never touched', () => {
  it('a grounded price comparison survives', () => {
    const r = g('Giá của Asus Vivobook 16 A1607QA thấp hơn Acer Aspire Go 15 AG15-52P.')
    expect(r.text).toContain('thấp hơn')
    expect(r.removed).toEqual([])
  })

  it('rating, store and price prose survive', () => {
    const t = 'Asus Vivobook 16 A1607QA giá 18.590.000đ tại Thế Giới Di Động, đánh giá 5 sao.'
    expect(g(t).text.trim()).toBe(t)
  })

  it('a reply with no candidate names is untouched', () => {
    const t = 'Mình tìm được vài lựa chọn phù hợp với ngân sách của bạn.'
    expect(g(t).text.trim()).toBe(t)
  })
})

// ── Found by the final live acceptance run ─────────────────────────────────
//
// A real marketplace title was "Lenovo ThinkBook 16 G8+ 2026 (00CD) Laptop Văn
// Phòng 16 inch, …". The model opened with "Tôi hiểu yêu cầu của bạn: cần
// laptop văn phòng, nhẹ, pin lâu" — a restatement of the USER'S OWN WORDS — and
// the guard deleted "nhẹ, pin lâu" from it. Two independent causes:
//
//   1. `van` + `phong` are ordinary Vietnamese category words ("văn phòng" =
//      office). Two of them cleared the ≥2-distinctive-token bar, so the generic
//      phrase "laptop văn phòng" identified a specific product.
//   2. REQUIREMENT_FRAMING only knew the pre-posed "bạn cần / bạn ưu tiên". The
//      natural Vietnamese possessive is post-posed — "yêu cầu CỦA BẠN" — and
//      that form was not recognised as user framing.
//
// The invariant is unchanged. What changes is that a category noun is not an
// identity, and a requirement restated in the ordinary word order is still a
// requirement.
describe('SPEC-GUARD-15 — a product CATEGORY in a title is not an identity', () => {
  const OFFICE: SpecEvidence[] = [{
    name: 'Lenovo ThinkBook 16 G8+ 2026 (00CD) Laptop Văn Phòng 16 inch, Ryzen 7 H255, 32GB RAM, 1TB SSD, 3.2K 165Hz, Star White',
  }]

  it('"laptop văn phòng nhẹ" does not name the ThinkBook', () => {
    const r = guardSpecClaimsInText('Mình gợi ý một chiếc laptop văn phòng nhẹ.', OFFICE)
    expect(r.removed).toEqual([])
    expect(r.text).toContain('nhẹ')
  })

  it('EN: "an office laptop with good battery" names nothing', () => {
    const r = guardSpecClaimsInText('I can look for an office laptop with good battery life.', OFFICE)
    expect(r.removed).toEqual([])
  })

  it('but the DISTINCTIVE part of the same title still identifies it', () => {
    const r = guardSpecClaimsInText('Lenovo ThinkBook 16 G8+ rất nhẹ.', OFFICE)
    expect(r.removed.some(x => x.endsWith(':weight'))).toBe(true)
  })
})

describe('SPEC-GUARD-16 — post-posed Vietnamese possessive is user framing', () => {
  const OFFICE: SpecEvidence[] = [{
    name: 'Lenovo ThinkBook 16 G8+ 2026 (00CD) Laptop Văn Phòng 16 inch, Ryzen 7 H255, 32GB RAM, 1TB SSD, 3.2K 165Hz, Star White',
  }]

  it('the exact live sentence survives intact', () => {
    const t = 'Tôi hiểu yêu cầu của bạn: cần laptop văn phòng, nhẹ, pin lâu, giá khoảng 30 triệu.'
    const r = guardSpecClaimsInText(t, OFFICE)
    expect(r.text.trim()).toBe(t)
    expect(r.removed).toEqual([])
  })

  for (const f of ['nhu cầu của bạn', 'tiêu chí của bạn', 'mong muốn của bạn']) {
    it(`"${f}" frames the attribute as the user's`, () => {
      const r = g(`Theo ${f}: máy nhẹ, pin tốt, giá hợp lý.`)
      expect(r.removed).toEqual([])
      expect(r.text).toContain('nhẹ')
    })
  }

  it('EN: "your needs" and "your criteria" frame it too', () => {
    expect(g('Based on your needs: light weight and long battery.').removed).toEqual([])
    expect(g('Given your criteria — light, long battery — here are the options.').removed).toEqual([])
  })

  // The framing OPENER does not license an assertion later in the same sentence.
  // "Theo nhu cầu của bạn, X nhẹ" still claims X *is* light, and nothing in the
  // evidence says so.
  it('a framing opener does NOT license an assertion about a named candidate', () => {
    const r = g('Theo nhu cầu của bạn, Asus Vivobook 16 A1607QA nhẹ và pin tốt.')
    expect(r.removed).toContain('Asus Vivobook 16 A1607QA:weight')
    expect(r.text).not.toMatch(/nhẹ/)
  })

  it('framing does NOT license a separate unsupported product claim', () => {
    const r = g('Tôi hiểu yêu cầu của bạn. Asus Vivobook 16 A1607QA rất nhẹ và pin trâu.')
    expect(r.text).toContain('Tôi hiểu yêu cầu của bạn.')
    expect(r.removed).toContain('Asus Vivobook 16 A1607QA:weight')
  })
})

// ── SPEC-GUARD-17…20 — defects found in the final live acceptance run ───────
//
// Every string below is VERBATIM model output from the 2026-08-17 acceptance
// run (VI and EN, one request each, same cached candidate array). They are
// fixtures, not inventions.
describe('SPEC-GUARD-17 — an ABSENCE statement is not an assertion', () => {
  // The VI run did exactly what the grounding contract asks: it named the gap.
  // The guard then deleted the admission — removing the honest disclaimer and,
  // with it, the grounded trade-off the reply had earned.
  const LIVE: SpecEvidence[] = [
    { name: 'Laptop Asus Vivobook 16 A1607QA - MB067W (X1 26 100, 16GB, 512GB, WUXGA, Win11)' },
    { name: '[New 100%] Lenovo ThinkBook 16 G5+ (Ryzen 7-7735H, 32GB, 512GB, 16.0 2K+ IPS)' },
  ]

  it('the exact live sentence keeps its "chưa có dữ liệu" clause', () => {
    const t = 'Ngoài ra còn có **Asus Vivobook 16** (18.6 triệu, đánh giá 5⭐) và **Lenovo ThinkBook 16 G5+** (19.4 triệu) cũng nằm trong ngân sách, nhưng mình cũng chưa có dữ liệu cụ thể về trọng lượng và pin của chúng.'
    const r = guardSpecClaimsInText(t, LIVE)
    expect(r.text).toContain('chưa có dữ liệu cụ thể về trọng lượng và pin')
    expect(r.removed).toEqual([])
  })

  for (const neg of [
    'mình chưa xác nhận được trọng lượng',
    'không rõ thời lượng pin',
    'chưa có thông tin về pin',
    'mình không có dữ liệu về trọng lượng',
  ]) {
    it(`VI absence: "${neg}"`, () => {
      const r = g(`Asus Vivobook 16 A1607QA giá 18.59 triệu, ${neg}.`)
      expect(r.removed).toEqual([])
    })
  }

  for (const neg of [
    "I couldn't confirm the weight",
    'there is no data on battery life',
    'the weight is unknown',
  ]) {
    it(`EN absence: "${neg}"`, () => {
      const r = g(`Asus Vivobook 16 A1607QA costs 18.59M, ${neg}.`)
      expect(r.removed).toEqual([])
    })
  }

  it('but a POSITIVE claim in the same reply is still blocked', () => {
    const r = g('Asus Vivobook 16 A1607QA rất nhẹ. Mình chưa có dữ liệu về pin.')
    expect(r.removed).toContain('Asus Vivobook 16 A1607QA:weight')
    expect(r.text).toContain('chưa có dữ liệu về pin')
  })
})

describe('SPEC-GUARD-18 — one strongly distinctive token identifies a candidate', () => {
  const E16: SpecEvidence[] = [
    { name: 'Laptop Máy tính bàn & Netbooks Lenovo Thinkpad E16 Gen 1 21JN0073US' },
  ]

  it('the live EN sentence that ESCAPED the guard is now caught', () => {
    const t = 'ThinkPad is built for business travel — lightweight, reliable battery, and you\'re saving 14M VND from your budget.'
    const r = guardSpecClaimsInText(t, E16)
    expect(r.text).not.toMatch(/lightweight/i)
    expect(r.text).not.toMatch(/reliable battery/i)
    expect(r.text).toContain('14M VND')
  })

  it('a SHORT token still identifies nothing — "chỗ gần" is not "Quán Gần"', () => {
    const r = guardSpecClaimsInText('Chỗ gần đây khá nhẹ nhàng.', [{ name: 'Quán Gần' }])
    expect(r.removed).toEqual([])
  })
})

describe('SPEC-GUARD-19 — framing exempts only the clause that carries it', () => {
  const G5: SpecEvidence[] = [
    { name: '[New 100%] Lenovo ThinkBook 16 G5+ (Ryzen 7-7735H, 32GB, 512GB, 16.0 2K+ IPS)' },
  ]

  it('the live EN sentence where "if you need" shielded a battery claim', () => {
    const t = '**Lenovo ThinkBook 16 G5+** — **19.4M VND** 32GB RAM if you need more power for heavy workloads, still under budget and known for decent battery life.'
    const r = guardSpecClaimsInText(t, G5)
    expect(r.text).not.toMatch(/decent battery life/i)
    expect(r.text).toContain('19.4M VND')
    expect(r.removed).toContain('[New 100%] Lenovo ThinkBook 16 G5+ (Ryzen 7-7735H, 32GB, 512GB, 16.0 2K+ IPS):battery')
  })

  it('an attribute mentioned ONLY inside the framing clause stays exempt', () => {
    const r = g('Asus Vivobook 16 A1607QA giá 18.59 triệu, vì bạn ưu tiên máy nhẹ.')
    expect(r.removed).toEqual([])
    expect(r.text).toContain('máy nhẹ')
  })
})

describe('SPEC-GUARD-20 — the weight lexicon covers the other half of the axis', () => {
  const E16: SpecEvidence[] = [
    { name: 'Laptop Máy tính bàn & Netbooks Lenovo Thinkpad E16 Gen 1 21JN0073US' },
  ]

  it('the live EN comparative "Slightly heavier than ThinkPad but still portable"', () => {
    const r = guardSpecClaimsInText('Slightly heavier than ThinkPad but still portable, and the rating is excellent.', E16)
    expect(r.text).not.toMatch(/heavier|portable/i)
    expect(r.text).toMatch(/rating is excellent/i)
  })

  for (const w of ['nặng 2kg', 'khá nặng', 'rất mỏng', 'gọn nhẹ']) {
    it(`VI weight phrasing: "${w}"`, () => {
      const r = g(`Asus Vivobook 16 A1607QA ${w}.`)
      expect(r.removed).toContain('Asus Vivobook 16 A1607QA:weight')
    })
  }

  it('"hiệu năng" is NOT a weight claim — the bare token "nang" must not fire', () => {
    const r = g('Asus Vivobook 16 A1607QA có hiệu năng tốt cho công việc văn phòng.')
    expect(r.removed).toEqual([])
    expect(r.text).toContain('hiệu năng')
  })
})

describe('the guard never invents, never empties, never breaks structure', () => {
  it('introduces no word that was not in the input, except the fixed evidence note', () => {
    const r = g('Asus Vivobook 16 A1607QA rất nhẹ.')
    // Either the clause is gone, or an explicit evidence-limitation note replaces
    // it. What must NEVER appear is a substituted product claim.
    expect(r.text).not.toMatch(/mỏng|gọn|ổn|khá tốt|thin|compact|decent/i)
  })

  it('never returns an empty string, even when every sentence is unsupported', () => {
    const r = g('Asus Vivobook 16 A1607QA rất nhẹ.')
    expect(r.text.trim().length).toBeGreaterThan(0)
  })

  it('leaves CTA_BUTTONS, FOLLOWUPS and TAPPY_PLAN byte-intact', () => {
    const blocks = '[CTA_BUTTONS]{"buttons":[{"label":"🛒 Shopee","url":"https://shopee.vn/search?keyword=nhe"}]}[/CTA_BUTTONS]\n[FOLLOWUPS]máy nhẹ|pin tốt[/FOLLOWUPS]'
    const r = g(`Asus Vivobook 16 A1607QA rất nhẹ.\n${blocks}`)
    expect(r.text).toContain(blocks)
  })

  it('leaves URLs untouched even when they contain trigger words', () => {
    const t = 'Xem thêm: https://shopee.vn/search?keyword=laptop+nhe+pin+tot'
    expect(g(t).text).toContain('https://shopee.vn/search?keyword=laptop+nhe+pin+tot')
  })

  it('is deterministic', () => {
    const t = 'Asus Vivobook 16 A1607QA giá 18.59 triệu, máy rất nhẹ và pin tốt.'
    expect(g(t)).toEqual(g(t))
  })

  it('is inert when there are no candidates', () => {
    const t = 'Asus Vivobook 16 A1607QA rất nhẹ.'
    expect(guardSpecClaimsInText(t, []).text).toBe(t)
  })

  it('never throws on degenerate input', () => {
    for (const t of ['', '   ', 'x'.repeat(4000), '\n\n']) {
      expect(() => g(t)).not.toThrow()
    }
  })

  it('a short generic word alone never identifies a candidate', () => {
    const r = guardSpecClaimsInText('Máy này rất nhẹ.', [{ name: 'Máy' }])
    expect(r.removed).toEqual([])
  })
})

// ── SPEC-GUARD-21…22 — clause surgery must leave a grammatical sentence ─────
describe('SPEC-GUARD-21 — framing carries across a requirement LIST', () => {
  it('the live EN opener keeps every item the user asked for', () => {
    const t = "Based on your need for light weight, long battery, and good price, here's what stands out:"
    const r = g(t)
    expect(r.text).toContain('long battery')
    expect(r.text).toContain('light weight')
    expect(r.removed).toEqual([])
  })

  it('but the carry STOPS at a clause that names a candidate', () => {
    const r = g('Based on your need for light weight, Asus Vivobook 16 A1607QA is very light, and it is cheap.')
    expect(r.removed).toContain('Asus Vivobook 16 A1607QA:weight')
  })
})

describe('SPEC-GUARD-22 — no stranded conjunctions, no lost full stops', () => {
  const E16: SpecEvidence[] = [
    { name: 'Laptop Máy tính bàn & Netbooks Lenovo Thinkpad E16 Gen 1 21JN0073US' },
  ]

  it('dropping the first clause does not strand "and"', () => {
    const r = guardSpecClaimsInText('Slightly heavier than ThinkPad but still portable, and the rating is excellent.', E16)
    expect(r.text).not.toMatch(/^and\b/i)
    expect(r.text).toMatch(/^The rating is excellent\.|^the rating is excellent\./)
  })

  it('dropping the last clause does not lose the full stop', () => {
    const t = 'Lenovo Thinkpad E16 costs 15.8M, still under budget and known for decent battery life.'
    const r = guardSpecClaimsInText(t, E16)
    expect(r.text).not.toMatch(/battery/i)
    expect(r.text.trim()).toMatch(/[.!?]$/)
  })
})

// ── SPEC-GUARD-23/24 — found on a DEPLOYED build, in the real output shape ──
//
// The production reply put each candidate's name inside a markdown link and its
// description in the sentence after it:
//
//   **[ASUS Vivobook S14 S3407CA-LY096WS](https://…)** - **27.49 triệu**
//   CPU Intel Ultra 7 255H, RAM 16GB, SSD 512GB. Máy này cân bằng tốt …, pin khá lâu.
//
// Both halves of that shape defeated the guard, and together they made it inert
// for every real Shopping answer:
//
//   1. PROTECTED vaults markdown links BEFORE matching, so the only place the
//      name appears was hidden from names(). Never REWRITING a link is right;
//      refusing to READ it is not.
//   2. The claim lives in the next sentence, which refers back as "Máy này".
//
// So "pin khá lâu" and "nhẹ & pin lâu" reached a user as fact, with no weight or
// battery evidence behind either — the exact assertion this guard exists to stop.
describe('SPEC-GUARD-23 — a name inside a markdown link still identifies', () => {
  const ASUS: SpecEvidence[] = [{ name: 'ASUS Vivobook S14 S3407CA-LY096WS' }]

  it('the production sentence loses its battery claim', () => {
    const t = '**[ASUS Vivobook S14 S3407CA-LY096WS](https://shopee.vn/p/123)** - **27.49 triệu**, pin khá lâu.'
    const r = guardSpecClaimsInText(t, ASUS)
    expect(r.text).not.toMatch(/pin khá lâu/)
    expect(r.removed).toContain('ASUS Vivobook S14 S3407CA-LY096WS:battery')
  })

  it('and the link itself is still byte-intact', () => {
    const link = '[ASUS Vivobook S14 S3407CA-LY096WS](https://shopee.vn/p/123?utm=x&y=2)'
    const r = guardSpecClaimsInText(`**${link}** - **27.49 triệu**, pin khá lâu.`, ASUS)
    expect(r.text).toContain(link)
  })

  it('a grounded price beside the link survives', () => {
    const t = '**[ASUS Vivobook S14 S3407CA-LY096WS](https://shopee.vn/p/123)** - **27.49 triệu**.'
    expect(guardSpecClaimsInText(t, ASUS).removed).toEqual([])
  })
})

describe('SPEC-GUARD-24 — a claim about "Máy này" belongs to the last candidate named', () => {
  const C: SpecEvidence[] = [
    { name: 'ASUS Vivobook S14 S3407CA-LY096WS' },
    { name: 'HP 14 ep1137TU' },
  ]

  it('the production VI paragraph loses both ungrounded claims', () => {
    const t = '**[ASUS Vivobook S14 S3407CA-LY096WS](https://shopee.vn/a)** - **27.49 triệu** 💻\n'
      + 'CPU Intel Ultra 7 255H, RAM 16GB, SSD 512GB. Máy này cân bằng tốt giữa hiệu năng & tính di động, CPU mạnh cho AI training, pin khá lâu.'
    const r = guardSpecClaimsInText(t, C)
    expect(r.text).not.toMatch(/pin khá lâu/)
    expect(r.text).toContain('CPU Intel Ultra 7 255H')
    expect(r.text).toContain('hiệu năng')
  })

  it('EN: "This machine is light with long battery" after a linked name', () => {
    const t = '**[HP 14 ep1137TU](https://tiki.vn/b)** - **24.89M**\nThis machine is light with long battery.'
    const r = guardSpecClaimsInText(t, C)
    expect(r.text).not.toMatch(/light|battery/i)
    expect(r.removed).toContain('HP 14 ep1137TU:weight')
  })

  it('the subject RESETS when a different candidate is named', () => {
    const t = '**[ASUS Vivobook S14 S3407CA-LY096WS](https://shopee.vn/a)** giá 27.49 triệu.\n'
      + '**[HP 14 ep1137TU](https://tiki.vn/b)** - **24.89 triệu**. Máy này pin lâu.'
    const r = guardSpecClaimsInText(t, C)
    expect(r.removed).toContain('HP 14 ep1137TU:battery')
    expect(r.removed).not.toContain('ASUS Vivobook S14 S3407CA-LY096WS:battery')
  })

  it('a user-requirement sentence is still not a claim, even while carrying', () => {
    const t = '**[HP 14 ep1137TU](https://tiki.vn/b)** - **24.89 triệu**. Bạn ưu tiên máy nhẹ và pin tốt.'
    expect(guardSpecClaimsInText(t, C).removed).toEqual([])
  })

  it('the carry does not reach a reply with no candidate named at all', () => {
    const t = 'Mình tìm được vài lựa chọn. Máy này rất nhẹ.'
    expect(guardSpecClaimsInText(t, C).removed).toEqual([])
  })
})
