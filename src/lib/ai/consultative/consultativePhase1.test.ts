import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { deriveNeedProfile, type NeedProfile } from './needProfile'
import { rankCandidates } from './rank'
import { derivePick, buildPickPayload, buildRankingInstructionBlock } from './pick'
import { classifyTurnIntent } from './intentGate'
import { renderNeedBrief, unverifiableCriteria, unknownDecisionFactors, buildClarificationAnsweredBlock } from './needBrief'
import { buildSystem } from '../promptBuilder'
import type { Candidate } from './candidate'

// ── V3 Phase 1 — AI Consultative, measured as BEHAVIOUR ──────────────────────
//
// Every assertion here is about what the pipeline DOES with a sentence a user
// actually types. Nothing asserts that a function exists, that a marker name
// appears, or that a string is present somewhere in a file — those pass on code
// that has been gutted, which is the failure this repo has been bitten by
// repeatedly.
//
// The four properties under test are the four measured gaps that opened this
// phase (probe, 2026-09-03):
//
//   1. PURPOSE — "để tiếp khách" / "for a business dinner" folded to an EMPTY
//      useCases, so the single most decision-shaping phrase in the sentence
//      carried no signal.
//   2. PARTY SIZE — "cho 10 người" was invisible, so a birthday for ten could be
//      answered with a two-seat cafe.
//   3. UNVERIFIABLE CRITERIA — a stated `quiet` scored nothing, was reported in
//      neither `missing` nor `unverified`, and reached the model as silence.
//   4. THE UNDERSTOOD NEED — the folded profile drove ranking and was never
//      shown to the model, so nothing structurally stopped a reply re-asking a
//      constraint stated twelve turns ago and trimmed out of the window.

const user = (...texts: string[]) => texts.map(content => ({ role: 'user', content }))

const place = (name: string, attrs: Candidate['attrs'] = {}): Candidate =>
  ({ id: name, name, domain: 'places', attrs, link: null, raw: { name } })

/** Source with comments stripped, so a comment discussing an option cannot pass a check. */
const code = (f: string) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

const ROUTE = 'src/app/api/chat/route.ts'

// ═══════════════════════════════════════════════════════════════════════════
// UNDERSTANDING
// ═══════════════════════════════════════════════════════════════════════════

describe('understanding — purpose, constraint, budget and preference all survive one sentence', () => {
  it('EN: "a quiet restaurant for a business dinner under 1m" keeps all four', () => {
    const p = deriveNeedProfile(user('I need a quiet restaurant for a business dinner under 1m.'))
    expect(p.domain).toBe('places')          // what kind of decision
    expect(p.subject).toBe('restaurant')     // the thing being chosen
    expect(p.useCases).toContain('business_meal')  // the PURPOSE
    expect(p.priorities.map(x => x.key)).toContain('quiet') // the CONSTRAINT
    expect(p.budgetStated).toBe(1_000_000)   // the BUDGET
  })

  it('VI: the same request in Vietnamese keeps the same four', () => {
    const p = deriveNeedProfile(user('Tôi cần tìm quán phở để tiếp khách, yên tĩnh, khoảng 500k/người.'))
    expect(p.domain).toBe('places')
    expect(p.useCases).toContain('business_meal')
    expect(p.priorities.map(x => x.key)).toContain('quiet')
    expect(p.budgetStated).toBe(500_000)
  })

  it('a bare lookup states no purpose and none is invented', () => {
    const p = deriveNeedProfile(user('Quán phở nào ngon ở Quận 1?'))
    expect(p.useCases).toEqual([])
    expect(p.partySize).toBeNull()
  })
})

describe('understanding — party size', () => {
  it('VI: "cho 10 người" is read as ten people', () => {
    expect(deriveNeedProfile(user('Tìm nhà hàng tổ chức sinh nhật cho 10 người ở Đà Nẵng')).partySize).toBe(10)
  })

  it('EN: "table for 8" is read as eight people', () => {
    expect(deriveNeedProfile(user('Book me a table for 8 in District 1')).partySize).toBe(8)
  })

  it('🔑 a PER-PERSON budget is not a party size — "khoảng 500k/người" stays a budget', () => {
    const p = deriveNeedProfile(user('Tôi cần tìm quán phở để tiếp khách, yên tĩnh, khoảng 500k/người.'))
    expect(p.partySize).toBeNull()
    expect(p.budgetStated).toBe(500_000)
  })

  it('a later correction overrides, it does not add a second party', () => {
    const p = deriveNeedProfile(user('Đặt bàn cho 10 người ở Quận 1', 'Thật ra 6 người thôi nhé'))
    expect(p.partySize).toBe(6)
  })

  it('a number that is not a headcount is ignored', () => {
    expect(deriveNeedProfile(user('Tìm quán cafe ở Quận 3')).partySize).toBeNull()
  })
})

describe('understanding — the occasion lexicon is precise, not greedy', () => {
  it('"cuối tuần" is a weekend, not an anniversary', () => {
    expect(deriveNeedProfile(user('Cuối tuần này đi ăn ở đâu?')).useCases).not.toContain('anniversary')
  })

  it('"khảo sát" is not a celebration', () => {
    expect(deriveNeedProfile(user('Tìm quán cafe để khảo sát thị trường')).useCases).not.toContain('celebration')
  })

  it('a birthday is a birthday', () => {
    expect(deriveNeedProfile(user('Tìm nhà hàng sinh nhật ở Đà Nẵng')).useCases).toContain('birthday')
  })
})

describe('understanding — a venue-seeking verb resolves the domain', () => {
  it('"đặt bàn" is a places decision even with no venue noun', () => {
    expect(deriveNeedProfile(user('Đặt bàn kỷ niệm ngày cưới, lãng mạn, dưới 2 triệu')).domain).toBe('places')
  })

  it('"tìm quán" is a places decision', () => {
    expect(deriveNeedProfile(user('Mình ăn chay, tìm quán gần Quận 1')).domain).toBe('places')
  })

  it('🔑 the district word alone is NOT a venue — a bare "Quận 3" claims no domain', () => {
    expect(deriveNeedProfile(user('Quận 3 có gì hay không?')).domain).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT — the system does not re-ask what it already folded
// ═══════════════════════════════════════════════════════════════════════════

describe('context — a constraint outlives the model window', () => {
  // route.ts trims the conversation to the last 10 messages before the model
  // sees it. The profile folds ALL of them, so the brief is what carries a
  // turn-1 constraint past the trim.
  const long = user(
    'Mình ăn chay, tìm quán ăn ở Quận 1, ngân sách 300k',
    ...Array.from({ length: 12 }, (_, i) => `câu hỏi phụ số ${i + 1}`),
  )

  it('the fold still holds the dietary exclusion and the budget after 13 turns', () => {
    const p = deriveNeedProfile(long)
    expect(p.avoid).toContain('non-vegetarian')
    expect(p.budgetStated).toBe(300_000)
  })

  it('the brief states them back and forbids re-asking', () => {
    const brief = renderNeedBrief(deriveNeedProfile(long))
    expect(brief).toContain('an chay')
    expect(brief).toContain('300.000')
    expect(brief).toContain('quan 1')
    expect(brief).toMatch(/KHONG hoi lai/)
  })

  it('every stated priority appears in the brief', () => {
    const brief = renderNeedBrief(deriveNeedProfile(user('Tìm quán cafe yên tĩnh có wifi ở Quận 1')))
    expect(brief).toContain('khong gian yen tinh')
    expect(brief).toContain('wifi')
  })
})

describe('context — the brief costs nothing on turns that are not choosing anything', () => {
  for (const text of ['Chào bạn', 'Thời tiết Đà Nẵng hôm nay thế nào?', 'Giá vàng SJC hôm nay bao nhiêu?']) {
    it(`"${text}" produces no brief`, () => {
      const p = deriveNeedProfile(user(text))
      expect(p.domain).toBeNull()
      expect(unknownDecisionFactors(p)).toEqual([])
    })
  }

  it('GPS alone is not a fact worth a block', () => {
    const p = deriveNeedProfile([], { gps: { lat: 10, lng: 106 } })
    expect(renderNeedBrief(p)).toBe('')
  })

  it('the brief stays bounded even on an absurd profile', () => {
    const p: NeedProfile = {
      ...deriveNeedProfile(user('Tìm quán cafe ở Quận 1')),
      useCases: ['coding', 'ai', 'gaming', 'study', 'work', 'travel', 'family', 'date', 'birthday'],
      priorities: ['quiet', 'beach', 'central', 'battery', 'gpu', 'performance', 'camera', 'storage', 'screen']
        .map(key => ({ key, weight: 1, source: 'stated' as const })),
      mustHave: ['quiet', 'wifi', 'outdoor', 'beach', 'central'],
      avoid: ['non-vegetarian'],
    }
    expect(renderNeedBrief(p).length).toBeLessThan(2000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// UNCERTAINTY — what the evidence cannot establish is SAID, not guessed
// ═══════════════════════════════════════════════════════════════════════════

describe('uncertainty — criteria no provider can confirm are disclosed', () => {
  it('🔑 a stated "yên tĩnh" is named as unverifiable — it used to be silent', () => {
    const p = deriveNeedProfile(user('Tìm quán cafe yên tĩnh ở Quận 1'))
    expect(p.priorities.map(x => x.key)).toContain('quiet')
    expect(unverifiableCriteria(p)).toContain('quiet')
  })

  it('a must-have the hard filter cannot enforce is disclosed too', () => {
    const p = deriveNeedProfile(user('Tìm quán cafe phải có yên tĩnh ở Quận 3'))
    expect(p.mustHave).toContain('quiet')
    // rank.hardFilter only eliminates on wifi / outdoor / vegetarian, so this
    // must-have removes nobody. Saying so is the only honest option.
    const ranked = rankCandidates([place('A', { rating: 4.6 }), place('B', { rating: 4.4 })], p)
    expect(ranked.filtered).toHaveLength(0)
    expect(unverifiableCriteria(p)).toContain('quiet')
  })

  it('🔑 a must-have that was never ALSO a priority is still disclosed', () => {
    // The previous assertion used "phải có yên tĩnh", where `quiet` is a
    // QUALIFIER and so becomes a priority as well — the must-have branch was
    // never the thing being exercised, and a mutation that deleted it survived.
    // A SPEC noun with no quality word attached sets a must-have and nothing
    // else, which is the only input that isolates that branch.
    const p = deriveNeedProfile(user('Mua laptop phải có GPU, ngân sách 30 triệu'))
    expect(p.mustHave).toContain('gpu')
    expect(p.priorities.map(x => x.key)).not.toContain('gpu')
    expect(unverifiableCriteria(p)).toContain('gpu')
  })

  it('a criterion the ranker CAN score is not disclaimed', () => {
    const p = deriveNeedProfile(user('Tìm quán cafe gần đây đánh giá cao'))
    expect(unverifiableCriteria(p)).toEqual([])
  })

  it('🔑 a durable stored preference is a prior, not a claim, so it is never disclaimed', () => {
    // Built directly rather than through `storedPreferences`, and deliberately:
    // stored preferences can only produce `cuisine:*` today, which is scoreable,
    // so routing through them exercises the SCOREABLE skip and never the
    // preference skip — a mutation removing the preference guard survived that
    // version of this test. The guard is a policy about the SOURCE of a
    // priority, so the test states it at that level.
    const p: NeedProfile = {
      ...deriveNeedProfile(user('Tìm quán cafe ở Quận 1')),
      priorities: [{ key: 'quiet', weight: 0.25, source: 'preference' }],
    }
    expect(unverifiableCriteria(p)).toEqual([])
  })

  it('the brief carries the disclosure only when there IS something to disclose', () => {
    const withQuiet = renderNeedBrief(deriveNeedProfile(user('Tìm quán cafe yên tĩnh ở Quận 1')))
    const without = renderNeedBrief(deriveNeedProfile(user('Tìm quán cafe đánh giá cao ở Quận 1')))
    expect(withQuiet).toContain('KHONG THE KIEM CHUNG')
    expect(without).not.toContain('KHONG THE KIEM CHUNG')
  })

  it('the disclosure forbids asserting the criterion and forbids inferring it', () => {
    const brief = renderNeedBrief(deriveNeedProfile(user('Tìm quán cafe yên tĩnh ở Quận 1')))
    expect(brief).toMatch(/TUYET DOI KHONG khang dinh/)
    expect(brief).toMatch(/KHONG suy ra/)
  })
})

describe('uncertainty — the Pick says which of the user\'s criteria it could not check', () => {
  const priceNeed = () => deriveNeedProfile(user('Tìm quán cafe giá rẻ gần Quận 1'))

  it('🔑 a stated price priority against rows with no price is reported, not filled in', () => {
    const need = priceNeed()
    const ranked = rankCandidates(
      [place('Alpha', { rating: 4.6, reviewCount: 400 }), place('Beta', { rating: 4.4, reviewCount: 1200 })],
      need,
    )
    const pick = derivePick(ranked, need, { implicitPurchaseIntent: true })
    expect(pick).not.toBeNull()
    expect(pick!.cannotVerify).toContain('price')
    expect(buildPickPayload(pick!).cannot_verify).toContain('price')
  })

  it('a criterion the winning row DOES carry is not reported as uncheckable', () => {
    const need = priceNeed()
    const ranked = rankCandidates(
      [place('Alpha', { rating: 4.6, priceVnd: 50_000, distanceKm: 1 }), place('Beta', { rating: 4.4, priceVnd: 90_000, distanceKm: 2 })],
      need,
    )
    const pick = derivePick(ranked, need, { implicitPurchaseIntent: true })
    expect(pick!.cannotVerify).not.toContain('price')
  })

  it('🔑 nothing appears in both `unverified` and `cannot_verify` — one word, one rule', () => {
    // "phải có wifi" with no other qualifier: `wifi` becomes BOTH a must-have
    // (unconfirmed, so `unverified`) and a stated priority the winning row has
    // no evidence for (so `missing`). That collision is the only input that can
    // catch the de-duplication — the earlier version said "phải có wifi, giá
    // rẻ", where `attributeIn` resolves the must-have to `price` instead and no
    // overlap was ever produced, so the assertion could not fail.
    const need = deriveNeedProfile(user('Tìm quán cafe phải có wifi ở Quận 1'))
    expect(need.mustHave).toContain('wifi')
    const ranked = rankCandidates(
      [place('Alpha', { rating: 4.6, reviewCount: 10 }), place('Beta', { rating: 4.4, reviewCount: 20 })],
      need,
    )
    const pick = derivePick(ranked, need, { implicitPurchaseIntent: true })
    expect(pick).not.toBeNull()
    expect(pick!.unverified).toContain('wifi')
    expect(pick!.cannotVerify).not.toContain('wifi')
    for (const k of pick!.cannotVerify) expect(pick!.unverified).not.toContain(k)
  })

  it('the payload omits the key entirely when there is nothing uncheckable', () => {
    const need = deriveNeedProfile(user('Tìm quán cafe đánh giá cao ở Quận 1'))
    const ranked = rankCandidates(
      [place('Alpha', { rating: 4.8, reviewCount: 900 }), place('Beta', { rating: 4.1, reviewCount: 30 })],
      need,
    )
    const pick = derivePick(ranked, need, { implicitPurchaseIntent: true })
    expect(pick!.cannotVerify).toEqual([])
    expect(buildPickPayload(pick!)).not.toHaveProperty('cannot_verify')
  })

  it('the ranking instruction tells the model what cannot_verify means', () => {
    const block = buildRankingInstructionBlock()
    expect(block).toContain('cannot_verify')
    expect(block).toMatch(/KHONG doan/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// RECOMMENDATION — a pick still has to be earned
// ═══════════════════════════════════════════════════════════════════════════

describe('recommendation — a disclosure never replaces a reason', () => {
  it('the Pick still carries grounded reasons even when a criterion is uncheckable', () => {
    const need = deriveNeedProfile(user('Tìm quán cafe giá rẻ gần Quận 1'))
    const ranked = rankCandidates(
      [place('Alpha', { rating: 4.8, reviewCount: 900 }), place('Beta', { rating: 4.0, reviewCount: 20 })],
      need,
    )
    const pick = derivePick(ranked, need, { implicitPurchaseIntent: true })!
    expect(pick.cannotVerify.length).toBeGreaterThan(0)
    expect(pick.reasons.length).toBeGreaterThan(0)
    expect(pick.reasons.every(r => r.detail.length > 0)).toBe(true)
  })

  it('a single candidate is still an answer, not a choice — no pick is manufactured', () => {
    const need = deriveNeedProfile(user('Tìm quán cafe giá rẻ gần Quận 1'))
    expect(derivePick(rankCandidates([place('Solo', { rating: 4.5 })], need), need, { implicitPurchaseIntent: true })).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION — one question, and never two turns in a row
// ═══════════════════════════════════════════════════════════════════════════

describe('clarification — the one permitted question is drawn from what is actually unknown', () => {
  it('a venue decision with no budget and no area names both, and nothing else', () => {
    const p = deriveNeedProfile(user('Tìm nhà hàng cho sinh nhật'))
    expect(unknownDecisionFactors(p)).toEqual(['ngan sach', 'khu vuc', 'so nguoi'])
  })

  it('what the user already said is never listed as unknown', () => {
    const p = deriveNeedProfile(user('Tìm nhà hàng sinh nhật cho 10 người ở Đà Nẵng, ngân sách 2 triệu'))
    expect(unknownDecisionFactors(p)).toEqual([])
  })

  it('a headcount is only missing once an occasion is known', () => {
    const plain = deriveNeedProfile(user('Quán cafe nào ngon ở Quận 1?'))
    expect(unknownDecisionFactors(plain)).not.toContain('so nguoi')
  })

  it('the brief restricts the question rather than prompting one', () => {
    const brief = renderNeedBrief(deriveNeedProfile(user('Tìm nhà hàng cho sinh nhật')))
    expect(brief).toContain('CHUA BIET')
    expect(brief).toMatch(/chi duoc hoi ve MOT/)
  })
})

describe('clarification — answering a question must not produce another question', () => {
  it('the gate recognises the answering turn', () => {
    expect(classifyTurnIntent({
      stage: null, hasPriorAssistantTurn: true, taskSwitched: false, assistantAskedClarification: true,
    })).toBe('clarification_response')
  })

  it('the block forbids a follow-up question outright', () => {
    const block = buildClarificationAnsweredBlock()
    expect(block).toMatch(/TUYET DOI KHONG hoi them/)
    expect(block).toMatch(/PHAI dua ra lua chon/)
  })

  it('🔑 the route actually sends it — the gate was computed and dropped before this phase', () => {
    expect(code(ROUTE)).toMatch(/turnIntent === 'clarification_response'\s*\?\s*buildClarificationAnsweredBlock\(\)/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ARCHITECTURE & COST — the brief must not buy understanding with a model call
// ═══════════════════════════════════════════════════════════════════════════

describe('architecture — the brief is deterministic prompt text, nothing more', () => {
  it('the route builds it from the folded profile, with no extra model call', () => {
    const src = code(ROUTE)
    expect(src).toMatch(/needProfile\.domain\s*\?\s*renderNeedBrief\(needProfile\)/)
    expect((src.match(/AI\.stream\(/g) || []).length).toBe(1)
    expect(src).not.toContain('AI.generate(')
  })

  it('🔑 the brief never reaches the cached `shared` prefix', () => {
    const brief = renderNeedBrief(deriveNeedProfile(user('Tìm quán cafe yên tĩnh ở Quận 1, ngân sách 200k')))
    expect(brief.length).toBeGreaterThan(0)
    const ref = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false).shared
    const withBrief = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, undefined, brief)
    expect(withBrief.shared).toBe(ref)
    expect(withBrief.dynamic).toContain('HE THONG DA HIEU NHU CAU NAY')
  })

  it('the same profile always renders the same brief', () => {
    const p = deriveNeedProfile(user('Tìm quán cafe yên tĩnh ở Quận 1, ngân sách 200k'))
    expect(renderNeedBrief(p)).toBe(renderNeedBrief(deriveNeedProfile(user('Tìm quán cafe yên tĩnh ở Quận 1, ngân sách 200k'))))
  })
})

describe('decision boundary — consultation recommends, it never acts', () => {
  it('no consultative module can perform a write', () => {
    for (const f of ['needBrief', 'needProfile', 'rank', 'pick', 'shortlist', 'relaxation']) {
      const src = code(`src/lib/ai/consultative/${f}.ts`)
      expect(src, `${f} must not run an action`).not.toContain('runAiWriteAction')
      expect(src, `${f} must not reach a database`).not.toContain('supabase')
      expect(src, `${f} must not reach the network`).not.toContain('fetch(')
    }
  })

  it('the route\'s only write tool still goes through the Phase 0 boundary', () => {
    const src = code(ROUTE)
    const tool = src.slice(src.indexOf('save_price_watch: tool('), src.indexOf('onFinish:'))
    expect(tool).toContain('runAiWriteAction')
    expect(tool).not.toMatch(/\.from\(['"]price_watches['"]\)/)
  })
})
