import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { taskSwitched, resolveDecisionStage } from './refinement'
import { deriveNeedProfile } from './needProfile'
import { classifyTurnIntent, shouldRunRetrieval, shouldRenderCards } from './intentGate'

// ── Phase A.5 §4 — Domain-switch audit + the dish-lexicon gap it exposed ─────
//
// Owner scenario:
//   Turn 1: "Tìm quán hủ tiếu ở Phú Nhuận"   → domain should be places
//   Turn 2: "Còn khách sạn ở Đà Nẵng?"        → domain should be hotel
//
// MEASURED 2026-08-27, before the fix: `deriveNeedProfile` returned
// `domain: null` for EVERY dish-name query, because `SUBJECTS` covered only the
// venue nouns ("quan an", "nha hang", "cafe") and never the dish. Null domain
// silently disabled two things:
//
//   1. `isDecisionDomain` in route.ts — which gates `buildRankingInstructionBlock()`,
//      the block telling the model "the system already picked, you only explain".
//      Without it the model got `_tappy_ranking` data and no instruction for what
//      it meant, so it listed options instead of deciding. This is the
//      "AI trả lời như liệt kê" report.
//   2. `taskSwitched()` — guarded by `if (before.domain === null) return false`,
//      so a food → hotel switch was structurally undetectable.
//
// The fix is one DOMAIN_HINTS lexicon entry. These tests lock both halves.

const FOOD_THEN_HOTEL = [
  { role: 'user', content: 'Tìm quán hủ tiếu ở Phú Nhuận' },
  { role: 'assistant', content: 'Hủ Tiếu Nam Vang Nhất Phẩm là lựa chọn mình nghiêng về nhất.' },
  { role: 'user', content: 'Còn khách sạn ở Đà Nẵng?' },
]

const FOOD_THEN_REFINE = [
  { role: 'user', content: 'Tìm quán hủ tiếu ở Phú Nhuận' },
  { role: 'assistant', content: 'Hủ Tiếu Nam Vang Nhất Phẩm là lựa chọn mình nghiêng về nhất.' },
  { role: 'user', content: 'Quán nào rẻ hơn?' },
]

describe('dish-name lexicon — the measured gap', () => {
  // Every one of these returned `null` before the DOMAIN_HINTS fix.
  const DISHES = [
    'Tìm quán hủ tiếu ở Phú Nhuận',
    'tìm quán phở ngon Hà Nội',
    'bún bò Huế quận 1',
    'cơm tấm gần đây',
    'bánh mì ngon',
  ]

  for (const q of DISHES) {
    it(`resolves a domain for "${q}"`, () => {
      expect(deriveNeedProfile([{ role: 'user', content: q }]).domain).toBe('places')
    })
  }

  it('a null domain would disable the ranking-instruction gate — that is why this matters', () => {
    // route.ts: isDecisionDomain = domain === 'places' || 'hotel' || 'shopping'
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(route).toContain('isDecisionDomain')
    expect(route).toMatch(/isDecisionDomain\s*\?\s*buildRankingInstructionBlock\(\)/)
    // With domain now 'places' for a dish query, that gate opens.
    const p = deriveNeedProfile([{ role: 'user', content: 'tìm quán hủ tiếu Phú Nhuận' }])
    const isDecisionDomain = p.domain === 'places' || p.domain === 'hotel' || p.domain === 'shopping'
    expect(isDecisionDomain).toBe(true)
  })
})

describe('dish-name lexicon — no cross-domain regressions', () => {
  const CASES: ReadonlyArray<[string, string | null]> = [
    ['quán ăn ngon quận 3', 'places'],
    ['nhà hàng hải sản', 'places'],
    ['cafe view đẹp', 'places'],
    ['spa massage quận 7', 'places'],
    ['khách sạn Đà Nẵng', 'hotel'],
    ['muốn mua ốp lưng iPhone 17 Pro Max', 'shopping'],
    ['tai nghe không dây', 'shopping'],
    ['vé xe khách đi Đà Lạt', 'transport'],
    // A non-decision lookup must stay domainless so it pays nothing for the
    // ranking block it can never use.
    ['thời tiết hôm nay', null],
    ['giá vàng', null],
  ]

  for (const [q, expected] of CASES) {
    it(`"${q}" → ${expected}`, () => {
      expect(deriveNeedProfile([{ role: 'user', content: q }]).domain).toBe(expected)
    })
  }

  it('the "phở"/"phố" homograph resolves to shopping when a product noun is present', () => {
    // Both normalize to "pho". SUBJECTS is matched before DOMAIN_HINTS, and
    // DOMAIN_HINTS only fires when no domain was set, so the product wins.
    expect(deriveNeedProfile([{ role: 'user', content: 'mua điện thoại ở phố Huế' }]).domain).toBe('shopping')
  })
})

describe('domain switch — detection now works end to end', () => {
  it('taskSwitched() is TRUE for food → hotel', () => {
    expect(taskSwitched(FOOD_THEN_HOTEL)).toBe(true)
  })

  it('taskSwitched() is FALSE for a same-domain refinement', () => {
    expect(taskSwitched(FOOD_THEN_REFINE)).toBe(false)
  })

  it('the switch turn classifies as new_consultation, so retrieval and cards run', () => {
    const intent = classifyTurnIntent({
      stage: resolveDecisionStage(FOOD_THEN_HOTEL),
      hasPriorAssistantTurn: true,
      taskSwitched: taskSwitched(FOOD_THEN_HOTEL),
      assistantAskedClarification: false,
    })
    expect(intent).toBe('new_consultation')
    expect(shouldRunRetrieval(intent)).toBe(true)
    expect(shouldRenderCards(intent)).toBe(true)
  })

  it('a same-domain refinement stays a refinement, not a restart', () => {
    const intent = classifyTurnIntent({
      stage: resolveDecisionStage(FOOD_THEN_REFINE),
      hasPriorAssistantTurn: true,
      taskSwitched: taskSwitched(FOOD_THEN_REFINE),
      assistantAskedClarification: false,
    })
    expect(intent).not.toBe('new_consultation')
  })

  it('the route reads the REAL taskSwitched value, not a hardcoded false', () => {
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(route).toMatch(/taskSwitched:\s*taskSwitched\(messages\)/)
    expect(route).not.toMatch(/taskSwitched:\s*false/)
  })
})
