import { describe, it, expect } from 'vitest'
import { derivePick, buildPickBlock, buildPickPayload, buildRankingInstructionBlock, PICK_MARGIN, hasImplicitPurchaseIntent } from './pick'
import { rankCandidates, type Candidate } from './rank'
import { deriveNeedProfile, type NeedProfile } from './needProfile'
import { buildSystem } from '../promptBuilder'

// ── PICK-01…07 — Phase 2 Tappy's Pick contract ──────────────────────────────
//
// The Pick is `rank[0]`. It is a BACKEND decision, not a prompt instruction:
// runtime measurement put the prompt-only pick rate at 6/30, and §13 of the
// product contract explicitly forbids solving that with stronger wording.
//
// The model still writes the sentence. It is told WHAT was picked and WHY;
// it decides HOW to say it, in the user's language, under the existing rules.

function place(name: string, attrs: Candidate['attrs'] = {}): Candidate {
  return { id: name, name, domain: 'places', attrs, link: `https://maps/${encodeURIComponent(name)}`, raw: { name } }
}

function profile(over: Partial<NeedProfile> = {}): NeedProfile {
  return {
    domain: 'places', subject: null, budget: null, budgetStated: null,
    location: { text: null, gps: null },
    useCases: [], priorities: [], mustHave: [], avoid: [],
    turnsObserved: 1, changedAtTurn: {},
    ...over,
  }
}

const prio = (key: string, weight = 2) => ({ key, weight, source: 'stated' as const })

/** A clear winner: closer AND better reviewed, for a distance-first user. */
const DECISIVE = [
  place('Quán Gần', { rating: 4.6, reviewCount: 1200, distanceKm: 0.3, wifi: true }),
  place('Quán Xa', { rating: 4.0, reviewCount: 90, distanceKm: 7.5 }),
]
const DISTANCE_FIRST = profile({ priorities: [prio('distance')] })

describe('PICK-01 — a Pick exists when there is enough to decide on', () => {
  const r = rankCandidates(DECISIVE, DISTANCE_FIRST)
  const pick = derivePick(r, DISTANCE_FIRST)

  it('produces exactly one Pick', () => {
    expect(pick).not.toBeNull()
    expect(pick!.candidate.name).toBe('Quán Gần')
  })

  it('the Pick is rank[0] — not a separate decision', () => {
    expect(pick!.candidate).toBe(r.ranked[0].candidate)
  })

  it('names the runner-up, so a trade-off can be stated against something real', () => {
    expect(pick!.runnerUp?.candidate.name).toBe('Quán Xa')
  })
})

describe('PICK-02 — the Pick corresponds to an ACTUAL candidate', () => {
  it('is reference-identical to an object in the input array', () => {
    const r = rankCandidates(DECISIVE, DISTANCE_FIRST)
    const pick = derivePick(r, DISTANCE_FIRST)!
    expect(DECISIVE).toContain(pick.candidate)
  })

  it('carries the candidate its real provider link, unmodified', () => {
    const r = rankCandidates(DECISIVE, DISTANCE_FIRST)
    const pick = derivePick(r, DISTANCE_FIRST)!
    expect(pick.candidate.link).toBe(DECISIVE[0].link)
  })
})

describe('PICK-03 — a fabricated Pick is structurally impossible', () => {
  it('the block only ever contains names that came from the evidence', () => {
    const r = rankCandidates(DECISIVE, DISTANCE_FIRST)
    const block = buildPickBlock(derivePick(r, DISTANCE_FIRST)!)
    // Every candidate name in the block must be one we were handed. The backend
    // cannot name what it never received — there is no generation step here.
    expect(block).toContain('Quán Gần')
    expect(block).toContain('Quán Xa')
    for (const invented of ['Nhà Hàng Aroma', 'Wrap & Roll', 'AOA Da Nang Beach Hotel']) {
      expect(block).not.toContain(invented)
    }
  })

  it('emits no number that was not in the evidence', () => {
    const r = rankCandidates(DECISIVE, DISTANCE_FIRST)
    const block = buildPickBlock(derivePick(r, DISTANCE_FIRST)!)
    // Internal scores must never leak — they are not user-facing facts and the
    // product contract does not ask for them.
    expect(block).not.toMatch(/score/i)
    for (const n of block.match(/\d+(?:\.\d+)?/g) || []) {
      expect(['4.6', '4.0', '1200', '90', '0.3', '7.5']).toContain(n)
    }
  })
})

describe('PICK-04 — the explanation references real user requirements', () => {
  const r = rankCandidates(DECISIVE, DISTANCE_FIRST)
  const pick = derivePick(r, DISTANCE_FIRST)!

  it('every decisive reason is grounded in a candidate attribute', () => {
    expect(pick.reasons.length).toBeGreaterThan(0)
    for (const reason of pick.reasons) expect(reason.detail).toBeTruthy()
  })

  it('the reason that decided it is the attribute the user prioritised', () => {
    expect(pick.reasons[0].key).toBe('distance')
  })

  it('the block states the requirement it served, not just the attribute', () => {
    const block = buildPickBlock(pick)
    expect(block).toMatch(/DECIDED BY/)
    expect(block).toContain('distance')
  })

  it('a different priority produces a different explanation', () => {
    const ratingFirst = profile({ priorities: [prio('rating')] })
    const p2 = derivePick(rankCandidates(DECISIVE, ratingFirst), ratingFirst)!
    expect(p2.reasons[0].key).toBe('rating')
  })
})

describe('PICK-05 — changing the priority changes the Pick', () => {
  // Neither candidate dominates: WIFI is close but poorly rated, STAR is far but
  // excellent. Which one wins is a statement about the user.
  const SPLIT = [
    place('Gần Có Wifi', { rating: 3.6, reviewCount: 50, distanceKm: 0.2, wifi: true }),
    place('Xa Đánh Giá Cao', { rating: 4.9, reviewCount: 8000, distanceKm: 9.0 }),
  ]
  const near = profile({ priorities: [prio('distance', 4)] })
  const good = profile({ priorities: [prio('rating', 4)] })

  it('distance-first and rating-first pick differently', () => {
    expect(derivePick(rankCandidates(SPLIT, near), near)!.candidate.name).toBe('Gần Có Wifi')
    expect(derivePick(rankCandidates(SPLIT, good), good)!.candidate.name).toBe('Xa Đánh Giá Cao')
  })

  it('a refinement turn moves the Pick — end to end from raw messages', () => {
    const before = deriveNeedProfile([{ role: 'user', content: 'Tìm quán cafe đánh giá cao ở Quận 1' }])
    const after = deriveNeedProfile([
      { role: 'user', content: 'Tìm quán cafe đánh giá cao ở Quận 1' },
      { role: 'assistant', content: 'Đây là vài quán.' },
      { role: 'user', content: 'Chỗ nào gần hơn' },
    ])
    const p1 = derivePick(rankCandidates(SPLIT, before), before)
    const p2 = derivePick(rankCandidates(SPLIT, after), after)
    expect(p1!.candidate.name).toBe('Xa Đánh Giá Cao')
    expect(p2!.candidate.name).toBe('Gần Có Wifi')
  })
})

describe('PICK-06 — insufficient evidence produces NO Pick, never false confidence', () => {
  it('a single candidate is an answer, not a choice', () => {
    const one = [place('Chỉ Một', { rating: 4.5, distanceKm: 1 })]
    expect(derivePick(rankCandidates(one, DISTANCE_FIRST), DISTANCE_FIRST)).toBeNull()
  })

  it('no priority, no budget and no must-have means nothing to pick FOR', () => {
    const bare = profile()
    expect(derivePick(rankCandidates(DECISIVE, bare), bare)).toBeNull()
  })

  it('an exact tie yields no Pick — there is nothing to lean on', () => {
    const tied = [place('A', { rating: 4.5, reviewCount: 100, distanceKm: 2 }), place('B', { rating: 4.5, reviewCount: 100, distanceKm: 2 })]
    expect(derivePick(rankCandidates(tied, DISTANCE_FIRST), DISTANCE_FIRST)).toBeNull()
  })

  it('a rank[0] with no grounded reason yields no Pick', () => {
    const empty = [place('Trống A', {}), place('Trống B', {})]
    expect(derivePick(rankCandidates(empty, DISTANCE_FIRST), DISTANCE_FIRST)).toBeNull()
  })

  it('unrankable candidates yield no Pick — provider order is not a decision', () => {
    const organic: Candidate[] = ['a', 'b', 'c'].map((n, i) => ({
      id: String(i), name: n, domain: 'shopping', attrs: {}, link: `https://s/${n}`, raw: {},
    }))
    const need = profile({ domain: 'shopping', priorities: [prio('price')] })
    const r = rankCandidates(organic, need)
    expect(r.rankable).toBe(false)
    expect(derivePick(r, need)).toBeNull()
  })

  it('a NARROW win is a CONDITIONAL lean, not silence and not false certainty', () => {
    const close = [
      place('A', { rating: 4.50, reviewCount: 100, distanceKm: 2.0 }),
      place('B', { rating: 4.48, reviewCount: 100, distanceKm: 2.0 }),
    ]
    const p = derivePick(rankCandidates(close, DISTANCE_FIRST), DISTANCE_FIRST)
    expect(p).not.toBeNull()
    expect(p!.conditional).toBe(true)
    expect(buildPickBlock(p!)).toMatch(/CONDITIONAL|ĐIỀU KIỆN|condition/i)
  })

  it('a decisive win is NOT conditional', () => {
    expect(derivePick(rankCandidates(DECISIVE, DISTANCE_FIRST), DISTANCE_FIRST)!.conditional).toBe(false)
  })

  it('PICK_MARGIN is relative, so it does not drift with the number of attributes', () => {
    expect(PICK_MARGIN).toBeGreaterThan(0)
    expect(PICK_MARGIN).toBeLessThan(1)
  })
})

describe('PICK-07 — injection lands in `dynamic`, never in the cached `shared`', () => {
  // ── Why this is a two-part design ─────────────────────────────────────────
  //
  // The Pick CANNOT exist when the system prompt is built: ranking needs
  // candidates, candidates come from a tool, and the tool runs inside the stream
  // — after the prompt is fixed. So the INSTRUCTION (static) goes in the prompt
  // and the DECISION (request-specific) rides on the tool result as data. That
  // also keeps the shipped safety rule intact: tool results are DATA, never
  // commands, so an instruction must not be smuggled into one.
  const r = rankCandidates(DECISIVE, DISTANCE_FIRST)
  const block = buildRankingInstructionBlock()
  const payload = buildPickPayload(derivePick(r, DISTANCE_FIRST)!)

  const base = () => buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)

  it('the ranking instruction reaches the model through dynamic', () => {
    const withPick = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, undefined, block)
    expect(withPick.dynamic).toContain('TAPPY\'S PICK')
    expect(withPick.dynamic).toContain('_tappy_ranking')
  })

  it('the decision itself travels as tool-result DATA, naming a real candidate', () => {
    expect(payload.pick).toBe('Quán Gần')
    expect(payload.not_chosen).toBe('Quán Xa')
    expect(Array.isArray(payload.decided_by)).toBe(true)
    expect((payload.decided_by as Array<{ attribute: string }>)[0].attribute).toBe('distance')
  })

  it('the payload carries no internal score', () => {
    expect(JSON.stringify(payload)).not.toMatch(/score/i)
  })

  it('`shared` stays BYTE-IDENTICAL whether or not the block is present', () => {
    // The cache contract. `shared` is the ~11k-token prefix the provider caches;
    // request-specific content inside it would fork a cache lineage every turn.
    const withPick = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, undefined, block)
    expect(withPick.shared).toBe(base().shared)
    expect(withPick.shared).not.toContain('_tappy_ranking')
    expect(withPick.shared).not.toContain('TAPPY\'S PICK')
  })

  it('`shared` is unchanged across every combination of stage, language and Pick', () => {
    const ref = base().shared
    for (const v of [
      buildSystem(null, 'unknown', true, '', 'en', '', null, null, false, undefined, block),
      buildSystem(null, 'offline', false, 'MEM', 'vi', 'PREFS', { lat: 1, lng: 2 }, 'trip', true, 'comparison', block),
      buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'refinement', block),
      buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'comparison', undefined),
    ]) expect(v.shared).toBe(ref)
  })

  it('costs nothing on a turn with no Pick', () => {
    expect(base().dynamic).not.toContain('TAPPY\'S PICK')
  })
})

describe('the Pick block tells the model to EXPLAIN, not to re-decide', () => {
  const block = buildPickBlock(derivePick(rankCandidates(DECISIVE, DISTANCE_FIRST), DISTANCE_FIRST)!)

  it('states that the choice is already made', () => {
    expect(block).toMatch(/da chon|already|DECIDED/i)
  })

  it('forbids substituting a different candidate', () => {
    expect(block).toMatch(/KHONG doi|do not replace|KHONG thay/i)
  })

  it('forbids inventing attributes, preserving the existing grounding rules', () => {
    expect(block).toMatch(/KHONG bia|do not invent/i)
  })

  it('names the runner-up and what it leads on, so the trade-off is grounded', () => {
    expect(block).toContain('NOT CHOSEN')
    expect(block).toContain('Quán Xa')
  })

  it('surfaces unverified constraints so the reply can hedge instead of asserting', () => {
    const need = profile({ priorities: [prio('distance')], avoid: ['non-vegetarian'] })
    const p = derivePick(rankCandidates(DECISIVE, need), need)!
    expect(buildPickBlock(p)).toMatch(/UNVERIFIED|chua xac nhan/i)
  })
})

// ── PICK-08 — implicit purchase intent widens the Pick gate (2026-08-27) ────
//
// Owner-measured on production: bare purchase intents like "muốn mua ốp lưng cho iphone 17
// promax" produced NO Pick because the user stated no priority / must-have / budget, so
// `hasDecidableNeed` returned false. The reply degraded into a listing with a clarifying
// question ("bạn ưu tiên gì? — giá / chất lượng / Magsafe?") — the exact receptionist
// behaviour a paid consultative product exists to prevent.
//
// Fix: the ACT of asking to buy / find / eat / go IS the priority when no explicit one
// is given. Ranker default (rating × review count) provides the grounded reason. Every
// downstream grounding guard is unchanged: still needs ≥2 candidates, still needs a
// grounded reason, still yields null on ties or unrankable input.
describe('PICK-08 — implicit purchase intent enables a Pick without stated criteria', () => {
  it('detects Vietnamese purchase intents ("muốn mua …")', () => {
    expect(hasImplicitPurchaseIntent('muốn mua ốp lưng cho iphone 17 promax')).toBe(true)
    expect(hasImplicitPurchaseIntent('mua tai nghe không dây dưới 3 triệu')).toBe(true)
    expect(hasImplicitPurchaseIntent('em muốn mua laptop cho sinh viên')).toBe(true)
  })

  it('detects Vietnamese find / eat / travel intents ("tìm …", "kiếm …")', () => {
    expect(hasImplicitPurchaseIntent('tìm quán phở ngon ở Hà Nội')).toBe(true)
    expect(hasImplicitPurchaseIntent('kiếm chỗ nghỉ dưỡng Đà Lạt 2 đêm')).toBe(true)
    expect(hasImplicitPurchaseIntent('gợi ý mua đồng hồ nam')).toBe(true)
  })

  it('detects English purchase intents', () => {
    expect(hasImplicitPurchaseIntent('i want to buy wireless earbuds')).toBe(true)
    expect(hasImplicitPurchaseIntent('looking for a good phone case')).toBe(true)
    expect(hasImplicitPurchaseIntent('where can i find fresh sushi')).toBe(true)
  })

  it('does NOT match the mere presence of a noun (no verb)', () => {
    expect(hasImplicitPurchaseIntent('iPhone 17 ProMax rất đẹp')).toBe(false)
    expect(hasImplicitPurchaseIntent('phở ngon quá')).toBe(false)
    expect(hasImplicitPurchaseIntent('the earbuds are nice')).toBe(false)
  })

  it('does NOT match a reported decision (past-tense "mình đã mua")', () => {
    expect(hasImplicitPurchaseIntent('mình đã mua xong rồi')).toBe(false)
    expect(hasImplicitPurchaseIntent('vừa mua hôm qua')).toBe(false)
    expect(hasImplicitPurchaseIntent('đã ăn ở đó rồi')).toBe(false)
  })

  it('handles empty / null gracefully', () => {
    expect(hasImplicitPurchaseIntent(null)).toBe(false)
    expect(hasImplicitPurchaseIntent(undefined)).toBe(false)
    expect(hasImplicitPurchaseIntent('')).toBe(false)
    expect(hasImplicitPurchaseIntent('   ')).toBe(false)
  })

  // Round-2 owner-reported: the assistant asked "bạn muốn loại nào?" and the user
  // answered "ốp nhựa cứng (bảo vệ tốt, giá trung bình) hàng chính hãng nha" — a
  // refinement turn with a noun + qualifiers, no bare verb. The Round-1 regex did
  // NOT catch this and the model then asked ANOTHER clarification ("hãng nào?").
  it('Round-2 regression: catches "op nhua cung hang chinh hang" (refinement noun-first pattern)', () => {
    expect(hasImplicitPurchaseIntent('ốp nhựa cứng (bảo vệ tốt, giá trung bình) hàng chính hãng nha')).toBe(true)
    expect(hasImplicitPurchaseIntent('ốp lưng silicone chống sốc cho iphone')).toBe(true)
    expect(hasImplicitPurchaseIntent('tai nghe chống sốc chính hãng')).toBe(true)
  })

  it('Round-2: bare "hàng chính hãng" / "chính hãng" is an intent signal on its own', () => {
    // Round-2 refinement pattern — the user's SECOND turn narrows to "chính hãng"
    // without repeating "muốn mua". This is a decidable narrowing, not a clarification.
    expect(hasImplicitPurchaseIntent('hàng chính hãng nha')).toBe(true)
    expect(hasImplicitPurchaseIntent('chính hãng thôi')).toBe(true)
    expect(hasImplicitPurchaseIntent('hàng xách tay cũng được')).toBe(true)
  })

  it('Round-2: English equivalents "authentic / official / genuine"', () => {
    expect(hasImplicitPurchaseIntent('authentic product please')).toBe(true)
    expect(hasImplicitPurchaseIntent('official version only')).toBe(true)
    expect(hasImplicitPurchaseIntent('genuine one thanks')).toBe(true)
  })

  it('Round-2: still does NOT match a bare non-purchase noun ("cái ốp đẹp quá")', () => {
    expect(hasImplicitPurchaseIntent('cái ốp đẹp quá')).toBe(false)
    expect(hasImplicitPurchaseIntent('the phone case is nice')).toBe(false)
  })

  it('with no priority stated, the signal enables a Pick when candidates are rankable', () => {
    const need = profile({ priorities: [] })  // no explicit criteria
    const r = rankCandidates(DECISIVE, need)
    // Without the signal — the old strict behaviour that produced the receptionist reply.
    expect(derivePick(r, need)).toBeNull()
    // With the signal — the ranker's default (rating × reviewCount) becomes the grounded
    // reason. Same grounding guards; the WHEN widens, the WHAT does not.
    const withSignal = derivePick(r, need, { implicitPurchaseIntent: true })
    expect(withSignal).not.toBeNull()
    expect(withSignal!.reasons.length).toBeGreaterThan(0)
  })

  it('the signal STILL yields null on ties (grounding guards unchanged)', () => {
    const tied = [
      place('A', { rating: 4.5, reviewCount: 100 }),
      place('B', { rating: 4.5, reviewCount: 100 }),
    ]
    const need = profile()
    expect(derivePick(rankCandidates(tied, need), need, { implicitPurchaseIntent: true })).toBeNull()
  })

  it('the signal STILL yields null when candidates carry no rankable evidence', () => {
    const empty = [place('A', {}), place('B', {})]
    const need = profile()
    expect(derivePick(rankCandidates(empty, need), need, { implicitPurchaseIntent: true })).toBeNull()
  })

  it('the signal STILL yields null when there is only one candidate', () => {
    const one = [place('Duy Nhất', { rating: 4.6, reviewCount: 500 })]
    const need = profile()
    expect(derivePick(rankCandidates(one, need), need, { implicitPurchaseIntent: true })).toBeNull()
  })
})
