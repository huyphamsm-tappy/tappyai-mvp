import { describe, it, expect } from 'vitest'
import { analyzeConsultativeReply } from './replyAnalysis'
import { rankCandidates, type Candidate } from './rank'
import { derivePick } from './pick'
import { buildShoppingGroundingBlock } from './pick'
import type { NeedProfile } from './needProfile'

// ── GROUND-01…10 — Shopping prose grounding ────────────────────────────────
//
// Found by live acceptance 2026-08-17. The user asked for a light laptop with
// good battery; `/shopping` supplies only title, source, price, link, productId
// and sometimes rating — no weight, no battery. The reply nonetheless asserted
// "nhẹ" and "pin tốt".
//
// THE DISTINCTION THIS FILE ENFORCES:
//
//   a USER REQUIREMENT is not CANDIDATE EVIDENCE.
//
// "ưu tiên máy nhẹ" tells us what the user wants. It does not make any candidate
// light. Restating the requirement is fine; asserting the product satisfies it
// is not — unless the evidence says so.

function product(name: string, attrs: Candidate['attrs'] = {}): Candidate {
  return { id: name, name, domain: 'shopping', attrs, link: `https://shop/${encodeURIComponent(name)}`, raw: { title: name } }
}

function profile(over: Partial<NeedProfile> = {}): NeedProfile {
  return {
    domain: 'shopping', subject: 'laptop', budget: null, budgetStated: null,
    location: { text: null, gps: null },
    useCases: ['coding', 'ai'], priorities: [], mustHave: [], avoid: [],
    turnsObserved: 1, changedAtTurn: {},
    ...over,
  }
}
const prio = (key: string, weight = 2) => ({ key, weight, source: 'stated' as const })

/** The live shape: price + rating only. No weight, no battery. */
const NO_SPEC = [
  product('Asus Vivobook 16 A1607QA', { priceVnd: 18_590_000, rating: 5 }),
  product('Acer Aspire Go 15 AG15-52P', { priceVnd: 22_490_000, rating: 4.8 }),
]
const TRAVEL_NEED = profile({
  priorities: [prio('portability'), prio('battery')],
  budget: { min: 0, max: 30_000_000, type: 'under' }, budgetStated: 30_000_000,
})

const analyze = (text: string, cands = NO_SPEC, need = TRAVEL_NEED) => {
  const ranked = rankCandidates(cands, need)
  return analyzeConsultativeReply(text, { ranked, need, pick: derivePick(ranked, need) })
}

describe('GROUND-01 — an unsupported WEIGHT claim is caught', () => {
  it('VI: "máy nhẹ" with no weight evidence', () => {
    const a = analyze('**Asus Vivobook 16 A1607QA** giá 18.59 triệu, máy nhẹ nên dễ mang đi.')
    expect(a.ungroundedClaims).toContain('Asus Vivobook 16 A1607QA:weight')
  })

  it('EN: "lightweight" with no weight evidence', () => {
    const a = analyze('**Asus Vivobook 16 A1607QA** costs 18,590,000 VND and is lightweight.')
    expect(a.ungroundedClaims).toContain('Asus Vivobook 16 A1607QA:weight')
  })

  it('VI: "nhẹ hơn" comparative is equally unsupported', () => {
    const a = analyze('**Asus Vivobook 16 A1607QA** nhẹ hơn **Acer Aspire Go 15 AG15-52P**.')
    expect(a.ungroundedClaims.some(c => c.endsWith(':weight'))).toBe(true)
  })
})

describe('GROUND-02 — an unsupported BATTERY claim is caught', () => {
  it('VI: "pin tốt"', () => {
    const a = analyze('**Asus Vivobook 16 A1607QA** có pin tốt, dùng cả ngày.')
    expect(a.ungroundedClaims).toContain('Asus Vivobook 16 A1607QA:battery')
  })

  it('VI: "pin lâu"', () => {
    const a = analyze('**Asus Vivobook 16 A1607QA** pin lâu lắm.')
    expect(a.ungroundedClaims).toContain('Asus Vivobook 16 A1607QA:battery')
  })

  it('EN: "good battery life"', () => {
    const a = analyze('**Asus Vivobook 16 A1607QA** has good battery life.')
    expect(a.ungroundedClaims).toContain('Asus Vivobook 16 A1607QA:battery')
  })
})

describe('GROUND-03 — both requested, neither evidenced', () => {
  it('claiming both is caught', () => {
    const a = analyze('**Asus Vivobook 16 A1607QA** vừa nhẹ vừa pin tốt, rất hợp đi công tác.')
    expect(a.ungroundedClaims).toEqual(expect.arrayContaining([
      'Asus Vivobook 16 A1607QA:weight',
      'Asus Vivobook 16 A1607QA:battery',
    ]))
  })

  it('a reply that OMITS the unsupported attributes is clean', () => {
    const a = analyze('**Asus Vivobook 16 A1607QA** giá 18.59 triệu, đánh giá 5 sao — rẻ nhất trong nhóm.')
    expect(a.ungroundedClaims).toEqual([])
  })

  it('a reply that ACKNOWLEDGES the missing evidence is clean', () => {
    const a = analyze(
      '**Asus Vivobook 16 A1607QA** giá 18.59 triệu, đánh giá 5 sao. '
      + 'Nguồn hiện tại chưa có thông tin về trọng lượng và pin nên mình chưa khẳng định được hai tiêu chí đó.')
    expect(a.ungroundedClaims).toEqual([])
  })
})

describe('restating the USER REQUIREMENT is not a product claim', () => {
  it('VI: "vì bạn ưu tiên máy nhẹ" is allowed', () => {
    const a = analyze('Vì bạn ưu tiên máy nhẹ và pin tốt, mình nghiêng về **Asus Vivobook 16 A1607QA** nhờ giá 18.59 triệu.')
    expect(a.ungroundedClaims).toEqual([])
  })

  it('EN: "since you want something light" is allowed', () => {
    const a = analyze('Since you want something light with good battery, I\'d go with **Asus Vivobook 16 A1607QA** for its 18,590,000 VND price.')
    expect(a.ungroundedClaims).toEqual([])
  })

  it('but asserting the product HAS it, in the same reply, is still caught', () => {
    const a = analyze('Bạn ưu tiên máy nhẹ. **Asus Vivobook 16 A1607QA** rất nhẹ.')
    expect(a.ungroundedClaims).toContain('Asus Vivobook 16 A1607QA:weight')
  })
})

describe('GROUND-04/05/06 — claims ARE allowed once evidence exists', () => {
  const WITH_SPEC = [
    product('Asus Zenbook S14', { priceVnd: 28_000_000, rating: 4.7, weightKg: 1.2, batteryHours: 12 }),
    product('Acer Aspire Go 15 AG15-52P', { priceVnd: 22_490_000, rating: 4.8 }),
  ]

  it('GROUND-04: a weight claim is clean when weight evidence exists', () => {
    const a = analyze('**Asus Zenbook S14** nặng 1.2 kg, rất nhẹ.', WITH_SPEC)
    expect(a.ungroundedClaims.filter(c => c.startsWith('Asus Zenbook S14'))).toEqual([])
  })

  it('GROUND-05: a battery claim is clean when battery evidence exists', () => {
    const a = analyze('**Asus Zenbook S14** pin khoảng 12 giờ.', WITH_SPEC)
    expect(a.ungroundedClaims.filter(c => c.startsWith('Asus Zenbook S14'))).toEqual([])
  })

  it('GROUND-06: both allowed together when both are evidenced', () => {
    const a = analyze('**Asus Zenbook S14** nặng 1.2 kg và pin 12 giờ.', WITH_SPEC)
    expect(a.ungroundedClaims.filter(c => c.startsWith('Asus Zenbook S14'))).toEqual([])
  })

  it('…while the OTHER candidate, with no such evidence, is still guarded', () => {
    const a = analyze('**Acer Aspire Go 15 AG15-52P** cũng rất nhẹ.', WITH_SPEC)
    expect(a.ungroundedClaims).toContain('Acer Aspire Go 15 AG15-52P:weight')
  })
})

describe('GROUND-07/08 — ranking never uses evidence it does not have', () => {
  it('GROUND-07: a portability/battery preference awards NO score without evidence', () => {
    const r = rankCandidates(NO_SPEC, TRAVEL_NEED)
    for (const e of r.ranked) {
      expect(e.reasons.map(x => x.key)).not.toContain('portability')
      expect(e.reasons.map(x => x.key)).not.toContain('battery')
      expect(e.reasons.map(x => x.key)).not.toContain('weight')
    }
  })

  it('the ranking is identical with and without those preferences', () => {
    const withPref = rankCandidates(NO_SPEC, TRAVEL_NEED)
    const without = rankCandidates(NO_SPEC, profile({
      budget: { min: 0, max: 30_000_000, type: 'under' }, budgetStated: 30_000_000,
    }))
    expect(withPref.ranked.map(e => [e.candidate.name, e.score]))
      .toEqual(without.ranked.map(e => [e.candidate.name, e.score]))
  })

  it('GROUND-08: candidates stay rankable on the evidence that DOES exist', () => {
    const r = rankCandidates(NO_SPEC, TRAVEL_NEED)
    expect(r.rankable).toBe(true)
    expect(r.ranked[0].reasons.map(x => x.key)).toEqual(expect.arrayContaining(['rating']))
  })

  it('missing evidence is neither a bonus nor a penalty — unknown stays unknown', () => {
    const mixed = [...NO_SPEC, product('Không Rõ Gì', { priceVnd: 20_000_000 })]
    const r = rankCandidates(mixed, TRAVEL_NEED)
    const unknown = r.ranked.find(e => e.candidate.name === 'Không Rõ Gì')!
    expect(unknown.score).toBeGreaterThan(0)   // still scored on its real price
    expect(unknown.reasons.map(x => x.key)).not.toContain('rating')
  })
})

describe('GROUND-09/10 — no inference from unrelated signals', () => {
  it('GROUND-09: a 15.6" screen does not make a laptop light', () => {
    const a = analyze('**Acer Aspire Go 15 AG15-52P** màn 15.6 inch nhưng vẫn nhẹ.')
    expect(a.ungroundedClaims).toContain('Acer Aspire Go 15 AG15-52P:weight')
  })

  it('GROUND-10: a high rating does not imply good battery', () => {
    const a = analyze('**Asus Vivobook 16 A1607QA** đánh giá 5 sao nên pin chắc chắn tốt.')
    expect(a.ungroundedClaims).toContain('Asus Vivobook 16 A1607QA:battery')
  })

  it('a premium price does not imply either attribute', () => {
    const a = analyze('**Acer Aspire Go 15 AG15-52P** giá cao hơn nên máy nhẹ và pin trâu hơn.')
    expect(a.ungroundedClaims.some(c => c.endsWith(':weight'))).toBe(true)
    expect(a.ungroundedClaims.some(c => c.endsWith(':battery'))).toBe(true)
  })
})

describe('the Shopping grounding block tells the model the rule', () => {
  const block = buildShoppingGroundingBlock()

  it('names what /shopping evidence CAN support', () => {
    for (const m of ['gia', 'ten', 'noi ban']) expect(block).toContain(m)
  })

  it('names weight and battery as NOT supportable', () => {
    expect(block).toMatch(/trong luong/)
    expect(block).toMatch(/\bpin\b/)
  })

  it('separates USER REQUIREMENT from CANDIDATE EVIDENCE explicitly', () => {
    expect(block).toMatch(/YEU CAU CUA USER|user muon/i)
    expect(block).toMatch(/KHONG.*(bien|dong nghia|suy ra)/i)
  })

  it('offers the honest fallback instead of silence or invention', () => {
    expect(block).toMatch(/chua co (du )?thong tin|chua du du lieu/i)
  })

  it('forbids inferring from screen size, brand, price or rating', () => {
    for (const m of ['man hinh', 'thuong hieu', 'gia cao', 'danh gia']) {
      expect(block.toLowerCase()).toContain(m)
    }
  })

  it('carries no URL and no provider name — it is a grounding rule, not link guidance', () => {
    expect(block).not.toContain('http')
    expect(block.toLowerCase()).not.toContain('shopee')
  })
})
