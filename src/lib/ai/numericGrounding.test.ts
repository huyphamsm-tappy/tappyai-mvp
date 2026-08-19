import { describe, expect, it } from 'vitest'
import { buildNumericGroundingRule, collectAllowedNumbers, findUnsupportedNumericClaims } from './numericGrounding'
import { buildEvidenceStatusBlock } from './stateContext'
import { createState, newConversationId, ownerScopeFor, type Candidate, type ConversationState } from './conversationState'

const OWNER = ownerScopeFor({ userId: 'alice' })

function macState(): ConversationState {
  const s = createState(newConversationId(), OWNER)
  s.hardConstraints = [
    { key: 'ram_gb', op: '=', value: 32, statedAs: 'dram 32gb', turn: 1 },
    { key: 'storage_gb', op: '>=', value: 512, statedAs: 'ổ cứng 512gb trở lên', turn: 1 },
  ]
  s.softPreferences = [{ key: 'budget~25000000', weight: 1, statedAs: 'tầm 25 triệu', turn: 2 }]
  return s
}

const allowedFor = (s: ConversationState, texts: string[] = []) => collectAllowedNumbers(s, texts)

/**
 * REGRESSION (permanent): with zero candidates the model offered figures nothing
 * supported — "nâng ngân sách lên 28-30 triệu", "pin 15-20 giờ", and a 16GB /
 * 256GB downgrade of the user's own 32GB / 512GB requirement. Measured 12
 * unsupported numeric claims across one 5-turn run.
 *
 * The fix must NOT be "ban digits": the user's own 32/512/25-triệu and any real
 * tool price have to stay usable.
 */
describe('unsupported numbers are detected', () => {
  const s = macState()

  it('flags an invented budget range', () => {
    expect(findUnsupportedNumericClaims('nâng ngân sách lên 28-30 triệu', allowedFor(s)))
      .toEqual(expect.arrayContaining([expect.stringContaining('30')]))
  })

  it('flags invented battery hours', () => {
    expect(findUnsupportedNumericClaims('pin lên tới 20 giờ', allowedFor(s))).toHaveLength(1)
  })

  it('flags an invented percentage', () => {
    expect(findUnsupportedNumericClaims('pin còn trên 80%', allowedFor(s))).toHaveLength(1)
  })

  it('flags a downgraded spec the user never said', () => {
    // The exact live failure: user requires 32GB, reply proposes 16GB.
    expect(findUnsupportedNumericClaims('16GB đã quá đủ', allowedFor(s))).toHaveLength(1)
    expect(findUnsupportedNumericClaims('ổ cứng 256GB cũng ổn', allowedFor(s))).toHaveLength(1)
  })
})

describe('legitimate numbers are NOT blocked — the over-correction guard', () => {
  const s = macState()

  it('allows the user\'s own stated requirements', () => {
    expect(findUnsupportedNumericClaims('bạn cần 32GB và 512GB', allowedFor(s))).toEqual([])
  })

  it('allows the user\'s own stated budget, in either scale', () => {
    expect(findUnsupportedNumericClaims('ngân sách khoảng 25 triệu', allowedFor(s))).toEqual([])
    expect(findUnsupportedNumericClaims('25.000.000 ₫', allowedFor(s))).toEqual([])
  })

  it('allows a number the user typed even if state never parsed it', () => {
    expect(findUnsupportedNumericClaims('màn 14 inch như bạn nói', allowedFor(s, ['mình muốn máy 14 inch']))).toEqual([])
  })

  it('allows figures a TOOL returned on a candidate', () => {
    const withEvidence = macState()
    const c: Candidate = {
      candidateId: 'p1', name: 'MacBook Pro M1 32GB', type: 'product', source: 'search_products',
      retrievedAt: 0, facts: { price: '25.800.000 ₫', google_rating: '4.6' },
    }
    withEvidence.candidates = [c]

    const allowed = allowedFor(withEvidence)
    expect(findUnsupportedNumericClaims('giá 25.800.000 ₫', allowed)).toEqual([])
    expect(findUnsupportedNumericClaims('đánh giá 4.6 sao', allowed)).toEqual([])
  })

  it('allows arithmetic DERIVED from two grounded values', () => {
    // candidate 25.8M vs user budget 25M -> "cao hơn khoảng 800 nghìn".
    const withEvidence = macState()
    withEvidence.candidates = [{
      candidateId: 'p1', name: 'Máy A', type: 'product', source: 'search_products',
      retrievedAt: 0, facts: { price: '25.800.000 ₫' },
    }]
    // 800000 (and its 800-nghìn short form) derive from 25.800.000 − 25.000.000.
    const allowed = allowedFor(withEvidence)
    allowed.add('800000'); allowed.add('800')

    expect(findUnsupportedNumericClaims('cao hơn ngân sách khoảng 800 nghìn', allowed)).toEqual([])
  })

  it('does not mistake percent-encoded URLs for invented percentages', () => {
    // "%C3%A0" read as "3%" and "0%": 18 phantom claims in one cafe reply that
    // contained nothing but markdown links.
    const withLinks = 'Xem [Maps](https://maps.google.com/?q=C%C3%A0%20Ph%C3%AA%20AnAn) nhé'
    expect(findUnsupportedNumericClaims(withLinks, allowedFor(s))).toEqual([])
  })

  it('allows purely qualitative relaxation advice', () => {
    expect(findUnsupportedNumericClaims(
      'Bạn muốn mình thử nới ngân sách một chút, hay hạ bớt cấu hình?', allowedFor(s),
    )).toEqual([])
  })
})

describe('the directive handed to the model', () => {
  it('lists the user\'s figures as the only permitted ones', () => {
    const rule = buildNumericGroundingRule(macState())

    expect(rule).toContain('CHI DUOC DUNG NHUNG CON SO SAU')
    expect(rule).toContain('dram 32gb')
    expect(rule).toContain('tầm 25 triệu')
  })

  it('names the exact forbidden move and requires qualitative wording instead', () => {
    const rule = buildNumericGroundingRule(macState())

    expect(rule).toMatch(/KHONG duoc dua ra muc gia moi, khoang gia moi/)
    expect(rule).toMatch(/noi DINH TINH/)
    expect(rule).toMatch(/28-30 triệu/)   // the observed failure, quoted as the counter-example
  })

  it('is embedded in the zero-evidence block, not a separate opt-in', () => {
    const block = buildEvidenceStatusBlock('search_empty', macState())
    expect(block).toContain('CHI DUOC DUNG NHUNG CON SO SAU')
  })

  it('stays absent when candidates exist — real prices must remain usable', () => {
    expect(buildEvidenceStatusBlock('candidates', macState())).toBe('')
  })

  it('forbids proposing a lower spec and then justifying it', () => {
    const block = buildEvidenceStatusBlock('none', macState())
    expect(block).toMatch(/KHONG duoc tu de xuat mot cau hinh THAP HON roi bien minh cho no/)
  })

  it('copes with a state that has no numbers yet', () => {
    const bare = createState(newConversationId(), OWNER)
    expect(buildNumericGroundingRule(bare)).toContain('user chua neu con so nao')
  })
})
