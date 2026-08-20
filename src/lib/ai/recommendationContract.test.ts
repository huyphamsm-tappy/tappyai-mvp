import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSystem } from './promptBuilder'
import { detectDecisionStage, detectLocationIntent } from './intent'

// C3-B contract. These assert the SHAPE of the instruction set, not that a model
// obeyed it — behaviour is measured by the 40-request benchmark. What they do
// guard is the three things that silently rot: a rule getting appended instead
// of consolidated, request-specific content leaking into the cached segment, and
// the scope boundary drifting.

const base = () => buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)

describe('consolidated recommendation rule', () => {
  const { shared } = base()

  it('exists as ONE rule, not a new appended series', () => {
    expect(shared).toContain('R1: CACH GOI Y & GIUP QUYET DINH')
    // R8/R9 were merged into R1. If they come back, someone appended instead of
    // consolidating — the C1 prompt-size finding this phase is bound by.
    expect(shared).not.toContain('R8: GIAI THICH LY DO GOI Y')
    expect(shared).not.toContain('R9: MINH BACH NGUON')
    expect(shared.split('R1: CACH GOI Y').length).toBe(2)
  })

  it('carries every element of the decision contract', () => {
    for (const [what, marker] of [
      ['option count', '2-4'],
      ['differentiation', 'KHAC BIET'],
      ['grounded why', 'LY DO'],
      ['trade-off', 'DANH DOI'],
      ['calibrated pick', 'NGHIENG VE'],
      ['source attribution', 'nguon'],
      ['uncertainty', 'hedging'],
    ] as const) {
      expect(shared, `${what} missing from the consolidated rule`).toContain(marker)
    }
  })

  it('forbids inventing a reason or a downside — checked per clause', () => {
    // A bare `toContain('KHONG BIA')` passes off EITHER clause, so deleting the
    // anti-fabrication guard from the trade-off clause survived. Scope each one.
    const why = shared.slice(shared.indexOf('(c) LY DO'), shared.indexOf('(d) DANH DOI'))
    const tradeoff = shared.slice(shared.indexOf('(d) DANH DOI'), shared.indexOf('(e) NGHIENG VE'))
    expect(why, 'the reason clause must forbid fabricated reasons').toMatch(/KHONG BIA/)
    // Trade-off is where fabrication is most tempting: the rule asks for a downside,
    // so the model manufactures one unless the same clause forbids it.
    expect(tradeoff, 'the trade-off clause must forbid a manufactured downside').toMatch(/KHONG bia/i)
    expect(tradeoff, 'no evidence must mean omit, not invent').toMatch(/bo qua/)
  })

  it('keeps the response adaptive — trade-off/pick must not apply to lookups', () => {
    expect(shared).toContain('KHONG ap dung')  // the exclusion clause
    for (const bare of ['thoi tiet', 'gia vang', 'tin tuc', 'chao hoi']) {
      expect(shared, `"${bare}" must be named as trade-off/pick exempt`).toContain(bare)
    }
  })
})

describe('scope — product comparison is supported, general tech advice is not', () => {
  const { shared } = base()

  it('names product comparison and selection as supported', () => {
    expect(shared).toContain('so sanh san pham')
    expect(shared).toContain('chon giua cac san pham')
  })

  // ── C3-B.3 ────────────────────────────────────────────────────────────────
  // This assertion is INVERTED from C3-B, deliberately and on measured grounds.
  // C3-B added "tu van cong nghe chung" to the REFUSAL EXAMPLE LIST, and the
  // isolated A/B of 2026-08-11 (docs/consultative/C3B2_2026-08-11.md §5, n=4)
  // showed that entry is what blocks the owner-approved case:
  //
  //     with it     2/4 refused,  1/4 called search_products
  //     without it  0/4 refused,  4/4 called search_products
  //
  // The BOUNDARY it was meant to draw is not lost — it moved to where it always
  // belonged, inside the permission sentence (next test). Naming it as a refusal
  // EXAMPLE made the model refuse the very requests the sentence above permits.
  it('does NOT list general technology consulting as a refusal example', () => {
    const refusal = shared.slice(shared.indexOf('Neu user hoi chu de NGOAI'))
    expect(refusal, 'the C3-B prohibition blocks approved product comparison — see C3B2 §5')
      .not.toContain('tu van cong nghe chung')
  })

  it('bounds the shopping permission to purchase decisions, in the permission itself', () => {
    // The boundary survives as a QUALIFIER on what is allowed, never as a
    // refusal trigger. Scoped to the shopping clause so it cannot be satisfied
    // by the phrase appearing anywhere else in the prompt.
    const shopping = shared.slice(shared.indexOf('MUA SAM bao gom'), shared.indexOf('Neu user hoi chu de NGOAI'))
    expect(shopping, 'the shopping expansion must bound itself to a purchase decision')
      .toContain('ho tro quyet dinh MUA')
    expect(shopping, 'and must say what it is NOT, so the scope cannot drift open')
      .toContain('khong phai tu van cong nghe chung')
  })

  it('keeps every unrelated refusal example untouched', () => {
    // Removing one entry must not quietly open the rest of the scope.
    const refusal = shared.slice(shared.indexOf('Neu user hoi chu de NGOAI'))
    for (const kept of ['toan hoc', 'lap trinh', 'y te', 'phap luat', 'chinh tri', 'dich thuat', 'viet lach']) {
      expect(refusal, `"${kept}" must remain out of scope`).toContain(kept)
    }
  })

  it('no longer lists weather as out of scope — get_weather is a shipped tool', () => {
    const scope = shared.slice(shared.indexOf('PHAM VI HOAT DONG'))
    expect(scope).not.toMatch(/vi du:[^)]*thoi tiet/)
  })

  it('keeps the five domains and the hard refusal for everything else', () => {
    expect(shared).toContain('PHAM VI HOAT DONG')
    expect(shared).toContain('TUYET DOI KHONG tra loi cac cau hoi ngoai pham vi')
  })
})

// ── C3-B.3: the approved requests must actually reach the shopping tool ──────
//
// The scope prompt is only half of it. A supported comparison also has to
// survive the route's own branching: it must be recognised as a comparison, and
// search_products must still be in the tool set when it gets there (the route
// drops that tool whenever locationIntent is 'offline'). These assert the
// PIPELINE for the six requests the owner named, not the model's reply —
// behaviour is measured by the benchmark.
describe('approved product comparisons reach search_products', () => {
  const APPROVED = [
    'Nên mua iPhone hay Samsung?',
    'So sánh iPhone với Samsung',
    'Nên chọn iPhone 15 hay Galaxy S24?',
    'Should I buy an iPhone or a Samsung?',
    'Compare iPhone and Samsung',
    'Which should I choose, iPhone 15 or Galaxy S24?',
  ]

  for (const request of APPROVED) {
    it(`"${request}" is a comparison with search_products available`, () => {
      expect(detectDecisionStage(request, { hasPriorAssistantTurn: false }),
        'must reach the comparison stage block').toBe('comparison')
      expect(detectLocationIntent(request),
        "'offline' would delete search_products from the tool set (route.ts)").not.toBe('offline')
    })
  }

  it('the comparison stage block is what such a turn receives', () => {
    const cmp = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'comparison')
    expect(cmp.dynamic).toContain('GIAI DOAN: SO SANH')
  })
})

describe('comparison stage block', () => {
  const cmp = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'comparison')

  it('asks for symmetric comparison, trade-off, pick and action', () => {
    expect(cmp.dynamic).toContain('GIAI DOAN: SO SANH')
    expect(cmp.dynamic).toContain('CAN XUNG')      // symmetric
    expect(cmp.dynamic).toContain('DANH DOI')      // trade-off
    expect(cmp.dynamic).toContain('NGHIENG VE')    // calibrated pick
  })

  it('stays OUT of the cached segment', () => {
    expect(cmp.shared).toBe(base().shared)
  })
})

// ── C3-B.5: grounding honesty ────────────────────────────────────────────────
//
// Measured 2026-08-11 (docs/consultative/C3B4_2026-08-11.md): on
// "Nên chọn iPhone 15 hay Galaxy S24?" the reply quoted a grounded iPhone price
// AND an invented Galaxy S24 range, 5/5 runs, under the heading "Based on
// current pricing in Vietnam". The returned evidence contradicted it by ~8M VND.
// Qualitative claims (camera, ecosystem, resale, service network) were asserted
// from marketplace listings that can never support them.
//
// The old criteria line was not merely weak — it NAMED "chat luong/danh gia,
// tinh nang" as comparison criteria, licensing exactly those claims. It is
// replaced, not supplemented.
describe('grounding honesty — what the evidence can and cannot support', () => {
  const cmp = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'comparison')
  /** The comparison block only — so no assertion can be satisfied from elsewhere. */
  const block = cmp.dynamic.slice(cmp.dynamic.indexOf('GIAI DOAN: SO SANH'))
  const clause = (from: string, to?: string) =>
    block.slice(block.indexOf(from), to ? block.indexOf(to) : undefined)

  it('states what a marketplace result CAN support', () => {
    const c = clause('NGUON', 'CHI dan')
    for (const [what, marker] of [
      ['the listed price', 'gia'],
      ['the product/version', 'phien ban'],
      ['where it is sold', 'noi ban'],
    ] as const) {
      expect(c, `${what} must be named as supportable`).toContain(marker)
    }
  })

  it('names the qualitative claim classes a listing CANNOT support', () => {
    const c = clause('NGUON', 'CHI dan')
    for (const [what, marker] of [
      ['camera quality', 'camera'],
      ['durability', 'do ben'],
      ['ecosystem', 'he sinh thai'],
      ['resale value', 'gia tri ban lai'],
      ['a bare "better overall"', 'tot hon noi chung'],
    ] as const) {
      expect(c, `${what} must be named as NOT supported by a listing`).toContain(marker)
    }
  })

  it('forbids estimating a missing number instead of saying it was not found', () => {
    const c = clause('CHI dan gia', 'Neu van muon')
    expect(c, 'only figures present in the tool result may be quoted').toMatch(/CHI dan gia/)
    expect(c, 'a missing side must be stated, not estimated').toMatch(/chua tim thay/)
    expect(c, 'estimating is forbidden').toMatch(/KHONG uoc luong/)
    expect(c, 'inferring from prior knowledge is forbidden').toMatch(/kien thuc san co/)
  })

  it('allows a general opinion but forbids attributing it to the search', () => {
    const c = clause('Neu van muon')
    expect(c, 'a general judgement must remain sayable — this is not a refusal rule').toMatch(/Y KIEN CHUNG/)
    // Binds in BOTH languages: the model answers in the user's language, so a
    // Vietnamese-only ban would leave the English phrasing unguarded — which is
    // exactly the phrasing measured in C3-B.4 ("Based on current pricing…").
    expect(c, 'the Vietnamese attribution phrase must be banned').toContain('theo ket qua tim kiem')
    expect(c, 'the English attribution phrase must be banned').toContain('based on the search results')
  })

  it('replaced the old criteria line rather than stacking on top of it', () => {
    // The old line invited comparison on "chat luong/danh gia, tinh nang".
    expect(block, 'the licensing line must be gone').not.toContain('So sanh theo cac tieu chi CO DU LIEU that')
  })

  it('keeps the pick reachable — a priority-based lean is not an evidence claim', () => {
    const c = clause('NGHIENG VE')
    expect(c, 'the calibrated pick must survive the grounding rule').toContain('NGHIENG VE')
    // NOT a bare /uu tien/ — that already matched the pre-existing example
    // ("neu uu tien gia thi A"), so deleting the new clause would have gone
    // undetected. Pin the guarantee itself: leaning on priorities is exempt
    // from the source rule. C3-B.4 measured picks falling 3/3 → 1/3 when the
    // grounding sentence was added without this carve-out.
    expect(c, 'a priority lean must be exempted from the source rule').toContain('KHONG phai la mot khang dinh du lieu')
    expect(c, 'the model must still be told to conclude').toContain('khong cam ban ket luan')
  })

  it('lives entirely in dynamic — shared is untouched', () => {
    expect(cmp.shared).toBe(base().shared)
    expect(cmp.shared).not.toContain('tot hon noi chung')
    expect(cmp.shared).not.toContain('Y KIEN CHUNG')
  })

  it('costs nothing on turns that are not comparisons', () => {
    for (const stage of [undefined, 'refinement', 'confirmation'] as const) {
      const v = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, stage)
      expect(v.dynamic, `stage=${stage} must not carry the comparison grounding rule`).not.toContain('Y KIEN CHUNG')
    }
  })
})

describe('B1 cache contract still holds with every C3 addition', () => {
  it('shared is byte-identical across stages, languages, memory and context', () => {
    const ref = base().shared
    const variants = [
      buildSystem(null, 'unknown', true, '', 'en', '', null, null, false),
      buildSystem(null, 'offline', false, 'MEM', 'vi', 'PREFS', { lat: 1, lng: 2 }, 'trip', true, 'comparison'),
      buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'refinement'),
      buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'confirmation'),
    ]
    for (const v of variants) expect(v.shared).toBe(ref)
  })
})

// REMOVED ON INTEGRATION — the block that stood here asserted how /api/chat WIRES the D3
// decision turn: a second AI.stream call site, maxSteps 1, a forced tool named
// submit_recommendation, and the product pre-search predicate. None of that is on this branch:
// the D3 stateful pipeline is one Owner decision away (see the W4 report), and the release
// route still makes exactly ONE model request per turn under the existing architecture lock
// (src/lib/ai/consultative/architectureLock.test.ts, 29 assertions, green).
//
// 🚨 Restore it in the same change that wires that pipeline. Every property it held is real and
// was learned the hard way: ai@4.3.19 re-applies toolChoice on every step, so a forced tool with
// maxSteps > 1 loops and returns EMPTY text; and a second stream call site is a cost regression
// unless the two are provably mutually exclusive.
