import { describe, expect, it } from 'vitest'
import { buildRankingBlock, checkConstraint, parseVnd, rankCandidates } from './candidateRanking'
import { createState, newConversationId, ownerScopeFor, type Candidate, type ConversationState } from './conversationState'
import { buildStateContextBlock } from './stateContext'

const OWNER = ownerScopeFor({ userId: 'alice' })

function product(name: string, facts: Record<string, string | number> = {}): Candidate {
  return { candidateId: name, name, type: 'product', source: 'search_products', retrievedAt: 0, facts }
}
function place(name: string, facts: Record<string, string | number> = {}): Candidate {
  return { candidateId: name, name, type: 'place', source: 'search_places', retrievedAt: 0, facts }
}
function stateWith(over: Partial<ConversationState>): ConversationState {
  return { ...createState(newConversationId(), OWNER), ...over }
}

describe('hard constraints dominate and are never silently relaxed', () => {
  const need32 = stateWith({
    hardConstraints: [{ key: 'ram_gb', op: '>=', value: 32, statedAs: '32gb', turn: 1 }],
  })

  it('EXCLUDES a candidate the evidence shows violates the requirement', () => {
    const out = rankCandidates([
      product('MacBook Pro M1 16GB 512GB'),
      product('MacBook Pro M1 32GB 512GB'),
    ], need32)

    expect(out.ranked.map(r => r.candidate.name)).toEqual(['MacBook Pro M1 32GB 512GB'])
    expect(out.excluded[0]).toMatchObject({ name: 'MacBook Pro M1 16GB 512GB', failed: 'ram_gb' })
    expect(out.excluded[0].evidence).toContain('16gb')
  })

  it('KEEPS a candidate whose evidence is silent, but marks it unverified', () => {
    // The honest middle case: absent evidence is not a violation, and it is not
    // a pass either. Dropping it hides a real option; passing it invents a fact.
    const out = rankCandidates([product('MacBook Pro M1 (liên hệ)')], need32)

    expect(out.ranked).toHaveLength(1)
    expect(out.ranked[0].unverified).toContain('ram_gb')
    expect(out.ranked[0].reasons.join(' ')).not.toMatch(/meets ram_gb/)
  })

  it('ranks a VERIFIED fit above an unverified one', () => {
    const out = rankCandidates([
      product('MacBook Pro M1 (chưa rõ cấu hình)'),
      product('MacBook Pro M1 32GB'),
    ], need32)

    expect(out.ranked[0].candidate.name).toBe('MacBook Pro M1 32GB')
  })

  it('reports NO_FULL_MATCH instead of quietly lowering the bar', () => {
    const out = rankCandidates([product('MacBook Air M1 (không rõ RAM)')], need32)

    expect(out.noFullMatch).toBe(true)
    expect(buildRankingBlock(out, need32)).toMatch(/KHONG CO LUA CHON NAO DAT DU MOI YEU CAU/)
  })

  it('no hard constraints means no false NO_FULL_MATCH', () => {
    const out = rankCandidates([place('Cà Phê AnAn')], stateWith({}))
    expect(out.noFullMatch).toBe(false)
  })
})

describe('budget semantics carry through from 3E', () => {
  it('a HARD ceiling excludes anything above it', () => {
    const s = stateWith({ hardConstraints: [{ key: 'budget_max', op: '<=', value: 25_000_000, statedAs: 'dưới 25 triệu', turn: 1 }] })
    const out = rankCandidates([
      product('Máy A', { price: '31.600.000 ₫' }),
      product('Máy B', { price: '24.500.000 ₫' }),
    ], s)

    expect(out.ranked.map(r => r.candidate.name)).toEqual(['Máy B'])
    expect(out.excluded[0]).toMatchObject({ name: 'Máy A', failed: 'budget_max' })
  })

  it('a SOFT target ranks by closeness and excludes nothing', () => {
    const s = stateWith({ softPreferences: [{ key: 'budget~25000000', weight: 1, statedAs: 'tầm 25 triệu', turn: 2 }] })
    const out = rankCandidates([
      product('Xa target', { price: '35.000.000 ₫' }),
      product('Gan target', { price: '25.800.000 ₫' }),
    ], s)

    // Both survive — "around" is not a wall — but the near one leads.
    expect(out.ranked).toHaveLength(2)
    expect(out.ranked[0].candidate.name).toBe('Gan target')
    expect(out.ranked[0].reasons.join(' ')).toMatch(/25M target/)
  })

  it('parses VND figures out of the tool\'s own price strings', () => {
    expect(parseVnd('25.800.000 ₫')).toBe(25800000)
    expect(parseVnd('từ 363,416 VND')).toBe(363416)
    expect(parseVnd('liên hệ')).toBeNull()
  })
})

describe('ranking is USER-SPECIFIC — the same set orders differently', () => {
  const pool = [
    place('Quán A', { snippet: 'không gian yên tĩnh, có wifi, phù hợp làm việc' }),
    place('Quán B', { snippet: 'gần biển, view đẹp, giá bình dân' }),
  ]

  it('a quiet-work user and a beach user get different winners', () => {
    const worker = stateWith({
      useCase: 'work',
      softPreferences: [{ key: 'quiet', weight: 2, statedAs: 'yên tĩnh hơn', turn: 2 }],
    })
    const beachgoer = stateWith({
      softPreferences: [{ key: 'near-beach', weight: 1, statedAs: 'gần biển', turn: 2 }],
    })

    expect(rankCandidates(pool, worker).ranked[0].candidate.name).toBe('Quán A')
    expect(rankCandidates(pool, beachgoer).ranked[0].candidate.name).toBe('Quán B')
  })

  it('a repeated preference (higher weight) outranks a single one', () => {
    const mild = stateWith({ softPreferences: [{ key: 'quiet', weight: 1, statedAs: 'yên tĩnh', turn: 1 }] })
    const insistent = stateWith({ softPreferences: [{ key: 'quiet', weight: 3, statedAs: 'yên tĩnh hơn nữa', turn: 3 }] })

    const a = rankCandidates(pool, mild).ranked.find(r => r.candidate.name === 'Quán A')!
    const b = rankCandidates(pool, insistent).ranked.find(r => r.candidate.name === 'Quán A')!
    expect(b.score).toBeGreaterThan(a.score)
  })

  it('use case shifts the ordering on its own', () => {
    const coder = stateWith({ useCase: 'coding' })
    const out = rankCandidates([product('Máy văn phòng cơ bản'), product('MacBook Pro M1 Pro 32GB SSD')], coder)

    expect(out.ranked[0].candidate.name).toBe('MacBook Pro M1 Pro 32GB SSD')
    expect(out.ranked[0].reasons.join(' ')).toMatch(/relevant to coding/)
  })
})

describe('rejection-aware ranking', () => {
  it('never re-ranks something the user already turned down', () => {
    const s = stateWith({ rejections: [{ ref: 'Cà Phê HAN, Cà Phê AnAn', turn: 2 }] })
    const out = rankCandidates([place('Cà Phê HAN'), place('Quán Mới')], s)

    expect(out.ranked.map(r => r.candidate.name)).toEqual(['Quán Mới'])
    expect(out.excluded[0].failed).toMatch(/rejected/)
  })
})

describe('the block handed to the model', () => {
  const s = stateWith({
    hardConstraints: [{ key: 'ram_gb', op: '>=', value: 32, statedAs: '32gb', turn: 1 }],
  })

  it('caps at three, with distinct roles', () => {
    const out = rankCandidates(
      ['A', 'B', 'C', 'D', 'E'].map(n => product(`Máy ${n} 32GB`)), s,
    )
    const block = buildRankingBlock(out, s)

    expect(block).toContain('PHU HOP NHAT')
    expect(block).toContain('LUA CHON THAY THE')
    expect(block).not.toContain('Máy D')
    expect(block).not.toContain('Máy E')
  })

  it('tells the model to choose one and not to re-list', () => {
    const block = buildRankingBlock(rankCandidates([product('Máy A 32GB')], s), s)

    expect(block).toMatch(/chon MOT phuong an chinh/)
    expect(block).toMatch(/KHONG liet ke lai/)
  })

  it('names unverified requirements so they cannot be implied as met', () => {
    const block = buildRankingBlock(rankCandidates([product('Máy bí ẩn')], s), s)

    expect(block).toMatch(/CHUA XAC MINH DUOC: ram_gb/)
    expect(block).toMatch(/KHONG duoc khang dinh la dat/)
  })

  it('lists exclusions with the requirement each failed', () => {
    const out = rankCandidates([product('Máy 16GB'), product('Máy 32GB')], s)
    const block = buildRankingBlock(out, s)

    expect(block).toMatch(/DA LOAI: Máy 16GB \(khong dat: ram_gb/)
    expect(block).toMatch(/KHONG goi y lai/)
  })

  it('is empty when there is nothing to rank', () => {
    expect(buildRankingBlock(rankCandidates([], s), s)).toBe('')
  })
})

describe('constraint checking detail', () => {
  it('distinguishes a RAM figure from a storage figure in the same listing', () => {
    const c = product('MacBook Pro M1 32GB RAM 512GB SSD')

    expect(checkConstraint(c, { key: 'ram_gb', op: '>=', value: 32, statedAs: '', turn: 1 }).verdict).toBe('satisfied')
    expect(checkConstraint(c, { key: 'storage_gb', op: '>=', value: 512, statedAs: '', turn: 1 }).verdict).toBe('satisfied')
  })

  it('reads 1TB as 1024GB', () => {
    const c = product('MacBook Pro 1TB SSD')
    expect(checkConstraint(c, { key: 'storage_gb', op: '>=', value: 512, statedAs: '', turn: 1 }).verdict).toBe('satisfied')
  })

  it('flags a new machine as violating a used-only requirement', () => {
    const c = product('MacBook Pro M1 new seal nguyên seal')
    expect(checkConstraint(c, { key: 'condition', op: '=', value: 'used', statedAs: '', turn: 1 }).verdict).toBe('violated')
  })
})

/**
 * CASE G/H — identity survives ranking and the prompt.
 *
 * The measured failure was a price landing on the wrong product, so the test is
 * that each rendered line carries its OWN price and nobody else's.
 */
describe('identity survives ranking and prompt rendering', () => {
  const listing = (name: string, price: number, over: Record<string, string | number> = {}) => ({
    candidateId: `pid:${price}`, name, type: 'product' as const, source: 'search_products',
    retrievedAt: 0, facts: { price: `${price}`, price_vnd: price, ram_gb: 32, storage_gb: 512, condition: 'used', source_site: 'Shop', ...over },
  })

  function stateWith(cands: ReturnType<typeof listing>[]): ConversationState {
    const s = createState(newConversationId(), ownerScopeFor({ userId: 'u' }))
    s.candidates = cands
    s.hardConstraints = [
      { key: 'ram_gb', op: '=', value: 32, statedAs: '32GB', turn: 1 },
      { key: 'storage_gb', op: '>=', value: 512, statedAs: '512GB+', turn: 1 },
    ]
    return s
  }

  const A = listing('MacBook Pro 14 M1 Pro 32GB/512GB cũ', 29_550_000)
  const B = listing('Macbook Pro 16 M1 Max 32GB/512GB', 34_500_000)

  it('CASE G — ranking keeps each candidate whole, with its own price', () => {
    const out = rankCandidates([A, B], stateWith([A, B]))
    const byName = Object.fromEntries(out.ranked.map(r => [r.candidate.name, r.candidate.facts.price_vnd]))

    expect(byName['MacBook Pro 14 M1 Pro 32GB/512GB cũ']).toBe(29_550_000)
    expect(byName['Macbook Pro 16 M1 Max 32GB/512GB']).toBe(34_500_000)
    expect(out.ranked.map(r => r.candidate.candidateId)).toHaveLength(new Set(out.ranked.map(r => r.candidate.candidateId)).size)
  })

  it('CASE H — every prompt line carries its own price, never a neighbour\'s', () => {
    const block = buildStateContextBlock(stateWith([A, B]))
    const lineA = block.split('\n').find(l => l.includes('MacBook Pro 14 M1 Pro')) ?? ''
    const lineB = block.split('\n').find(l => l.includes('Macbook Pro 16 M1 Max')) ?? ''

    expect(lineA).toContain('29550000')
    expect(lineA).not.toContain('34500000')
    expect(lineB).toContain('34500000')
    expect(lineB).not.toContain('29550000')
  })

  it('two listings that differ only in price are never collapsed into one line', () => {
    const cheap = listing('MacBook Pro 16 2019 32GB/512GB', 22_390_000)
    const dear = { ...listing('MacBook Pro 16 2019 32GB/512GB', 29_550_000), candidateId: 'pid:other' }
    const block = buildStateContextBlock(stateWith([cheap, dear]))

    expect(block.split('\n').filter(l => l.includes('MacBook Pro 16 2019'))).toHaveLength(2)
  })
})
