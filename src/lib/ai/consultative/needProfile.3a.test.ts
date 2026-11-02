// Phase 3A — decision-state behaviour (docs/audit/PHASE-3-IMPLEMENTATION-SPECIFICATION.md 3A.1 / 3A.3 / 3A.4 / 3A.5, owner decisions D3 / D4 / D8).
// The state is STRUCTURE only: nothing here ranks, scores or weighs a candidate (3B).
import { describe, it, expect } from 'vitest'
import { deriveNeedProfile, type NeedProfile } from './needProfile'
import { validateDecisionState, mandatorySpanFor, hasMandatoryHousehold, type Constraint } from './decisionState'

const derive = (...texts: string[]): NeedProfile => deriveNeedProfile(texts.map(content => ({ role: 'user', content })))
const keys = (p: NeedProfile) => p.priorities.map(x => x.key)
const constraint = (p: NeedProfile, id: string, kind: string) => p.constraints?.find(c => c.id === id && c.kind === kind)

describe('3A.4 negation — "giá không quan trọng" never becomes a price preference (RC2)', () => {
  it('Vietnamese: price is dismissed, not prioritised; the stated quality priority survives', () => {
    const p = derive('Ăn trưa, giá không quan trọng, ưu tiên chất lượng.')
    expect(keys(p)).not.toContain('price')
    expect(p.dismissed?.map(d => d.key)).toEqual(['price'])
    expect(p.priorities.find(x => x.key === 'rating')?.weight).toBe(2)
  })
  it('"giá không quá quan trọng" (D01-2): quality is prioritised, price is dismissed', () => {
    const p = derive('Ăn ngon quan trọng, giá không quá quan trọng.')
    expect(keys(p)).toEqual(['rating'])
    expect(p.priorities[0].weight).toBe(2)
    expect(p.dismissed?.map(d => d.key)).toEqual(['price'])
  })
  it('English: "price does not matter" / "price isn\'t important"', () => {
    for (const s of ['price does not matter', "price isn't important", 'price is not important']) {
      const p = derive(s)
      expect(keys(p), s).not.toContain('price')
      expect(p.dismissed?.map(d => d.key), s).toEqual(['price'])
    }
  })
  it('a positive statement is unchanged: "Giá quan trọng." and "giá cũng quan trọng" stay price priorities', () => {
    expect(derive('Giá quan trọng.').priorities).toEqual([{ key: 'price', weight: 2, source: 'stated' }])
    expect(keys(derive('máy nhẹ và pin trâu, giá cũng quan trọng'))).toContain('price')
    expect(derive('Giá quan trọng.').dismissed).toBeUndefined()
  })
  it('"không ưu tiên giá" is a dismissal too', () => {
    const p = derive('không ưu tiên giá, muốn chỗ ngon')
    expect(keys(p)).not.toContain('price')
    expect(p.dismissed?.map(d => d.key)).toEqual(['price'])
  })
})

describe('3A.4 balance — "cân bằng" is explicit state with ONLY the criteria the user stated (D4)', () => {
  it('price + quality, nothing else', () => {
    const p = derive('Ăn trưa, muốn cân bằng giá và chất lượng.')
    expect(p.tradeoff?.kind).toBe('balanced')
    expect(p.tradeoff?.keys).toEqual(['price', 'rating'])
    expect(p.tradeoff?.keys).not.toContain('distance')
  })
  it('a third stated criterion is included, in the order said', () => {
    expect(derive('cân bằng giá, chất lượng và khoảng cách').tradeoff?.keys).toEqual(['price', 'rating', 'distance'])
  })
  it('one stated criterion does not invent a second', () => {
    expect(derive('cân bằng giá').tradeoff?.keys).toEqual(['price'])
  })
  it('no criterion stated: no tradeoff is invented and the gap is recorded', () => {
    const p = derive('cân bằng')
    expect(p.tradeoff).toBeUndefined()
    expect(p.ambiguity).toContain('tradeoff_criteria')
  })
  it('English: "balance price and quality"', () => {
    expect(derive('I want to balance price and quality').tradeoff?.keys).toEqual(['price', 'rating'])
  })
  it('the balance carries user-text provenance (USER-STATED, with the turn)', () => {
    const p = derive('muốn cân bằng giá và chất lượng')
    expect(p.tradeoff?.provenance).toMatchObject({ source: 'user_text', turn: 1 })
  })
})

describe('3A.5 must-have — "bắt buộc có mũ" is structured state, not free text (RC4)', () => {
  it('registry must_have, stated, hard against contradicting evidence only', () => {
    const p = derive('Muốn rẻ nhưng bắt buộc có mũ.')
    const c = constraint(p, 'helmet_included', 'must_have')
    expect(c).toMatchObject({ strength: 'stated', against: 'contradiction' })
    expect(c?.provenance).toMatchObject({ source: 'user_text', turn: 1 })
    expect(keys(p)).toContain('price') // the stated priority survives next to it
  })
  it('equivalent mandatory wordings are all hard (D8.b)', () => {
    for (const s of ['phải có mũ bảo hiểm', 'không thể thiếu mũ', 'nhất định phải có mũ', 'không chấp nhận nếu không có mũ', 'must have a helmet', 'a helmet is required', 'helmet is mandatory']) {
      expect(constraint(derive(s), 'helmet_included', 'must_have'), s).toBeDefined()
    }
  })
  it('a wish or a negated marker is NOT a requirement', () => {
    for (const s of ['có mũ cũng được', 'không bắt buộc có mũ', 'nếu có mũ thì tốt', 'không cần mũ']) {
      expect(constraint(derive(s), 'helmet_included', 'must_have'), s).toBeUndefined()
    }
  })
  it('the mandatory predicate reads unaccented typing the same', () => {
    expect(mandatorySpanFor('helmet_included', 'bat buoc co mu')).not.toBeNull()
    expect(mandatorySpanFor('helmet_included', 'khong bat buoc co mu')).toBeNull()
  })
})

describe('3A.5 avoid / dietary — "không ăn cay" survives as structured state (RC5)', () => {
  it('avoid spicy, stated', () => {
    const p = derive('Muốn món Việt và không ăn cay.')
    expect(constraint(p, 'spicy', 'avoid')).toMatchObject({ strength: 'stated', against: 'contradiction' })
    expect(keys(p)).toContain('cuisine:vietnamese')
  })
  it('unaccented and English forms', () => {
    expect(constraint(derive('khong an cay'), 'spicy', 'avoid')).toBeDefined()
    expect(constraint(derive('no spicy food please'), 'spicy', 'avoid')).toBeDefined()
    expect(constraint(derive('tránh đồ cay'), 'spicy', 'avoid')).toBeDefined()
  })
  it('"ăn cay được" is not an avoid', () => {
    expect(constraint(derive('ăn cay được'), 'spicy', 'avoid')).toBeUndefined()
  })
  it('the avoidance persists across later turns (multi-turn preservation)', () => {
    const p = derive('không ăn cay', 'Đi 2 người nhé', 'khoảng 500k')
    expect(constraint(p, 'spicy', 'avoid')).toBeDefined()
    expect(p.budgetStated).toBe(500000)
  })
  it('vegetarian stays a hard exclusion in the legacy array AND the registry', () => {
    const p = derive('tìm quán chay')
    expect(p.avoid).toContain('non-vegetarian')
    expect(constraint(p, 'vegetarian', 'must_have')).toMatchObject({ strength: 'stated' })
  })
  it('a stored dietary restriction is MEMORY provenance, never user_text', () => {
    const p = deriveNeedProfile([{ role: 'user', content: 'tìm quán ăn' }], { storedPreferences: { dietary_restrictions: 'ăn chay' } })
    expect(constraint(p, 'vegetarian', 'must_have')?.provenance.source).toBe('memory')
  })
})

describe('3A.5 household — "đi với bé" is context / soft; hard only on mandatory wording (D8)', () => {
  it('"đi với bé 3 tuổi" records household context and NO constraint', () => {
    const p = deriveNeedProfile([{ role: 'user', content: 'Đi với bé 3 tuổi, muốn chỗ thoải mái.' }])
    expect(p.household).toMatchObject({ kids: true, childAges: [3] })
    expect(p.household?.provenance.source).toBe('user_text')
    expect(p.constraints).toBeUndefined()
    expect(p.mustHave).toEqual([])
  })
  it('child context alone, in several phrasings, is never hard', () => {
    for (const s of ['đi với bé', 'dẫn con đi ăn', 'có em bé đi cùng', 'with my kids tonight', 'bé 5 tuổi thích chỗ rộng']) {
      const p = derive(s)
      expect(p.household?.kids, s).toBe(true)
      expect(constraint(p, 'family_friendly', 'must_have'), s).toBeUndefined()
    }
  })
  it('the two owner phrases are hard', () => {
    for (const s of ['Bắt buộc phù hợp cho bé.', 'Không thể chọn chỗ không phù hợp cho bé.']) {
      const c = constraint(derive(s), 'family_friendly', 'must_have')
      expect(c, s).toMatchObject({ strength: 'stated', against: 'contradiction' })
      expect(hasMandatoryHousehold(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'))).toBe(true)
    }
  })
  it('semantic equivalents are hard (owner list), negated / conditional forms are not', () => {
    for (const s of ['phải có chỗ phù hợp cho bé', 'nhất định phải phù hợp cho trẻ em', 'không thể thiếu chỗ phù hợp cho bé', 'không chấp nhận nếu không phù hợp cho bé', 'must be kid-friendly']) {
      expect(constraint(derive(s), 'family_friendly', 'must_have'), s).toBeDefined()
    }
    for (const s of ['không bắt buộc phải phù hợp cho bé', 'nếu có chỗ phù hợp cho bé thì tốt', 'đi với bé']) {
      expect(constraint(derive(s), 'family_friendly', 'must_have'), s).toBeUndefined()
    }
  })
  it('child ages are collected only from the child context', () => {
    expect(derive('đi với bé 3 tuổi và bé 7 tuổi').household?.childAges).toEqual([3, 7])
    expect(derive('tôi 30 tuổi, đi với bé').household?.childAges).toBeUndefined()
  })
})

describe('OWNER (3A) — generic child mentions are household context only; mandatory wording is the only way to hard', () => {
  it('"đi với bé", "có trẻ em", "đi cùng con", "kids" record household and no constraint', () => {
    for (const s of ['Đi với bé', 'Có trẻ em đi cùng', 'Đi cùng con', 'kids friendly place?', 'I am with kids']) {
      const p = derive(s)
      expect(p.household?.kids, s).toBe(true)
      expect(p.constraints, s).toBeUndefined()
      expect(p.mustHave, s).toEqual([])
    }
  })
  it('no candidate evidence is invented: the state holds no family-suitability attribute, only the user own context', () => {
    const p = derive('Đi với bé')
    expect(JSON.stringify(p)).not.toMatch(/family_friendly|kid_friendly|suitable/)
  })
  it('"phải có khu vui chơi cho trẻ" and "không chấp nhận chỗ không phù hợp cho bé" are hard (D8.b)', () => {
    for (const s of ['Phải có khu vui chơi cho trẻ', 'Không chấp nhận chỗ không phù hợp cho bé']) {
      expect(constraint(derive(s), 'family_friendly', 'must_have'), s).toMatchObject({ strength: 'stated', against: 'contradiction' })
    }
  })
})

describe('G budget semantics are preserved (Benchmark V1 §14): HARD vs SOFT, and revision across turns', () => {
  it('HARD: dưới / không quá / tối đa / under / at most', () => {
    for (const s of ['dưới 300k', 'không quá 500k', 'tối đa 1 triệu', 'under 300k', 'at most 2M']) {
      expect(derive(`Ngân sách ${s}`).budget?.type, s).toBe('under')
    }
  })
  it('SOFT: khoảng / tầm / around / roughly', () => {
    for (const s of ['Ngân sách khoảng 500k', 'Ngân sách tầm 500k', 'around 30M', 'roughly 30M']) {
      expect(derive(s).budget?.type, s).toBe('around')
    }
  })
  it('a later turn REVISES the budget deterministically (no two active values)', () => {
    const p = derive('Ngân sách dưới 300k.', 'Có thể tăng ngân sách lên 500k.')
    expect(p.budgetStated).toBe(500000)
    expect(p.budget).toMatchObject({ type: 'under', max: 500000 })
    expect(p.changedAtTurn.budget).toBe(2)
  })
  it('hard → soft and soft → hard revisions follow the latest wording', () => {
    expect(derive('dưới 300k', 'thôi khoảng 400k').budget?.type).toBe('around')
    expect(derive('khoảng 500k', 'tối đa 400k').budget).toMatchObject({ type: 'under', max: 400000 })
  })
})

describe('multi-turn preservation (H02) and cross-turn conflicts', () => {
  it('area, party budget, avoid and cuisine are all present at turn 3', () => {
    const p = derive('Tôi ở Quận 3.', 'Đi 2 người, khoảng 500k tổng cộng.', 'Muốn món Việt và không ăn cay.')
    expect(p.location.text).toBe('quan 3')
    expect(p.budget).toMatchObject({ type: 'around' })
    expect(p.budgetStated).toBe(500000)
    expect(constraint(p, 'spicy', 'avoid')).toBeDefined()
    expect(keys(p)).toContain('cuisine:vietnamese')
  })
  it('a priority later dismissed: the latest turn wins and the contradiction stays visible', () => {
    const p = derive('Giá quan trọng.', 'Thực ra giá không quan trọng.')
    expect(keys(p)).not.toContain('price')
    expect(p.dismissed?.map(d => d.key)).toEqual(['price'])
    expect(p.conflicts).toEqual(['price'])
  })
  it('a dismissal later reversed: the priority is active again, the dismissal is gone, the conflict is recorded', () => {
    const p = derive('Giá không quan trọng.', 'À mà giá quan trọng đấy.')
    expect(keys(p)).toContain('price')
    expect(p.dismissed).toBeUndefined()
    expect(p.conflicts).toEqual(['price'])
  })
  it('a task switch still resets the decision state (existing semantics)', () => {
    const p = derive('muốn quán phở, không ăn cay', 'giờ tìm laptop pin trâu')
    expect(p.domain).toBe('shopping')
    expect(p.constraints).toBeUndefined()
  })
})

describe('ambiguity is named, never filled in (UNKNOWN stays UNKNOWN)', () => {
  it('decision state with no domain records `domain` as ambiguous and invents none', () => {
    const p = derive('Ngân sách dưới 300k.')
    expect(p.domain).toBeNull()
    expect(p.ambiguity).toEqual(['domain'])
  })
  it('a named domain leaves no domain ambiguity', () => {
    expect(derive('Ăn ngon quan trọng, giá không quá quan trọng.').ambiguity).toBeUndefined()
  })
  it('nothing said → no optional field exists at all (absent = unknown, never a default)', () => {
    const p = derive('xin chào')
    for (const k of ['tradeoff', 'household', 'constraints', 'dismissed', 'ambiguity', 'conflicts'] as const) expect(p[k], k).toBeUndefined()
  })
  it('"ăn trưa" invents no household, budget, constraint or avoid', () => {
    const p = derive('Ăn trưa.')
    expect(p.household).toBeUndefined()
    expect(p.budget).toBeNull()
    expect(p.constraints).toBeUndefined()
    expect(p.avoid).toEqual([])
  })
})

describe('provenance — USER-STATED is never blurred with ASSUMED / MEMORY', () => {
  it('every structured item carries a provenance with a source and a turn', () => {
    const p = derive('Muốn rẻ nhưng bắt buộc có mũ.', 'đi với bé 3 tuổi, không ăn cay, giá không quan trọng, cân bằng chất lượng và khoảng cách')
    const items = [...(p.constraints ?? []).map(c => c.provenance), ...(p.dismissed ?? []).map(d => d.provenance), p.household!.provenance, p.tradeoff!.provenance]
    expect(items.length).toBeGreaterThanOrEqual(5)
    for (const pr of items) { expect(pr.source).toBe('user_text'); expect(pr.turn).toBeGreaterThan(0) }
    expect(constraint(p, 'helmet_included', 'must_have')?.provenance.turn).toBe(1)
    expect(constraint(p, 'spicy', 'avoid')?.provenance.turn).toBe(2)
  })
  it('no hard constraint is ever sourced from `assumed`', () => {
    const p = derive('Muốn rẻ nhưng bắt buộc có mũ, không ăn cay, đi với bé')
    for (const c of p.constraints ?? []) expect(c.provenance.source).not.toBe('assumed')
  })
})

describe('3A.3 validation — deterministic, never silently stronger', () => {
  const base = (): Parameters<typeof validateDecisionState>[0] => ({ priorities: [] })
  const c = (over: Partial<Constraint> & { id: any }): Constraint => ({ kind: 'must_have', strength: 'stated', against: 'contradiction', provenance: { source: 'user_text', turn: 1 }, ...over }) as Constraint

  it('an id outside the registry is dropped, never guessed', () => {
    const s = { ...base(), constraints: [c({ id: 'jacuzzi' as any }), c({ id: 'helmet_included' })] }
    const dropped = validateDecisionState(s)
    expect(s.constraints?.map(x => x.id)).toEqual(['helmet_included'])
    expect(dropped).toContain('unknown_constraint:jacuzzi')
  })
  it('an inferred or assumed hard constraint is DOWNGRADED to soft, not kept hard', () => {
    const s = { ...base(), constraints: [c({ id: 'family_friendly', strength: 'inferred' }), c({ id: 'helmet_included', provenance: { source: 'assumed', turn: 0 } })] }
    validateDecisionState(s)
    for (const x of s.constraints!) { expect(x.kind).toBe('soft_pref'); expect(x.against).toBeUndefined(); expect(x.strength).toBe('inferred') }
  })
  it('a kind the registry does not allow for an id is dropped (a spicy MUST-have is nonsense)', () => {
    const s = { ...base(), constraints: [c({ id: 'spicy', kind: 'must_have' })] }
    expect(validateDecisionState(s)).toContain('kind_not_allowed:spicy:must_have')
    expect(s.constraints).toBeUndefined()
  })
  it('a dismissed key can never also be a positive priority', () => {
    const s = { priorities: [{ key: 'price', weight: 2, source: 'stated' }], dismissed: [{ key: 'price', provenance: { source: 'user_text' as const, turn: 2 } }] }
    validateDecisionState(s)
    expect(s.priorities).toEqual([])
    expect((s as any).conflicts).toEqual(['price'])
  })
  it('duplicates collapse to the most recent turn; tradeoff keys are unique', () => {
    const s = {
      ...base(),
      constraints: [c({ id: 'helmet_included', provenance: { source: 'user_text', turn: 1 } }), c({ id: 'helmet_included', provenance: { source: 'user_text', turn: 3 } })],
      tradeoff: { kind: 'balanced' as const, keys: ['price', 'price', 'rating', ''], provenance: { source: 'user_text' as const, turn: 1 } },
    }
    validateDecisionState(s)
    expect(s.constraints).toHaveLength(1)
    expect(s.constraints![0].provenance.turn).toBe(3)
    expect(s.tradeoff!.keys).toEqual(['price', 'rating'])
  })
  it('an item with no provenance becomes `assumed` and can never stay hard', () => {
    const s = { ...base(), constraints: [{ id: 'helmet_included', kind: 'must_have', strength: 'stated', against: 'contradiction' } as unknown as Constraint] }
    validateDecisionState(s)
    expect(s.constraints![0].kind).toBe('soft_pref')
    expect(s.constraints![0].provenance.source).toBe('assumed')
  })
})
