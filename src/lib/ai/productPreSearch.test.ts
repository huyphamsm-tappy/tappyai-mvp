import { describe, expect, it } from 'vitest'
import {
  buildProductQuery, classifyProductResult, filterIrrelevantProducts, productRecordsFrom, shouldPreSearchProducts,
} from './productPreSearch'
import { createState, newConversationId, ownerScopeFor, type ConversationState } from './conversationState'
import type { ConsultationDelta } from './consultationDelta'

const OWNER = ownerScopeFor({ userId: 'alice' })

function macState(): ConversationState {
  const s = createState(newConversationId(), OWNER)
  s.goal = 'tôi muốn mua máy MacPro M1, dram 32gb, ổ cứng 512gb trở lên, máy cũ'
  s.hardConstraints = [
    { key: 'ram_gb', op: '=', value: 32, statedAs: 'dram 32gb', turn: 1 },
    { key: 'storage_gb', op: '>=', value: 512, statedAs: 'ổ cứng 512gb trở lên', turn: 1 },
    { key: 'condition', op: '=', value: 'used', statedAs: 'máy cũ', turn: 1 },
  ]
  return s
}
const delta = (required: boolean): ConsultationDelta => ({
  hardConstraintAdds: [], hardConstraintChanges: [], softPreferenceAdds: [],
  decisionIntent: false, searchImpact: { required, reason: 'test' },
})

/**
 * The activation predicate IS the C3-B.3 exception (amended 2026-08-18). Every
 * assertion here is load-bearing: widening any of them widens a deliberately
 * narrow architectural carve-out.
 */
describe('activation — the authorised exception, and nothing more', () => {
  it('fires for a required product search', () => {
    expect(shouldPreSearchProducts({ delta: delta(true), forcedTool: 'search_products', state: macState() })).toBe(true)
  })

  it('does NOT fire when the search is not required (decision / explanation turns)', () => {
    expect(shouldPreSearchProducts({ delta: delta(false), forcedTool: 'search_products', state: macState() })).toBe(false)
  })

  // `null` was removed from this list when the predicate was corrected: no
  // signal is not a signal for another tool, and requiring one meant every
  // refinement and rejection turn skipped the pre-search and let the model
  // free-form a product. An explicit signal for a DIFFERENT tool still blocks —
  // that is what keeps the exception products-only, and it is still asserted here.
  it.each(['search_places', 'get_hotel_prices', 'web_search', 'get_news', 'get_weather', 'get_flight_prices'])(
    'does NOT fire for forcedTool=%s — the exception is products only', (forcedTool) => {
      expect(shouldPreSearchProducts({ delta: delta(true), forcedTool, state: macState() })).toBe(false)
    },
  )

  it('does NOT fire without conversation state', () => {
    expect(shouldPreSearchProducts({ delta: delta(true), forcedTool: 'search_products', state: null })).toBe(false)
  })

  it('does NOT fire without a delta', () => {
    expect(shouldPreSearchProducts({ delta: null, forcedTool: 'search_products', state: macState() })).toBe(false)
  })
})

describe('query construction — deterministic, no LLM, nothing invented', () => {
  it('keeps the product intent and every stated requirement', () => {
    const q = buildProductQuery(macState(), 'tầm 25 triệu')

    for (const needed of ['MacPro', 'M1', '32gb', '512gb', 'cũ']) {
      expect(q.toLowerCase()).toContain(needed.toLowerCase())
    }
  })

  it('appends a requirement stated on a LATER turn than the goal', () => {
    const s = macState()
    s.hardConstraints.push({ key: 'budget_max', op: '<=', value: 25_000_000, statedAs: 'dưới 25 triệu', turn: 2 })

    expect(buildProductQuery(s, 'dưới 25 triệu')).toContain('dưới 25 triệu')
  })

  it('does not duplicate a requirement already present in the goal', () => {
    const q = buildProductQuery(macState(), 'x')
    expect(q.match(/dram 32gb/gi) ?? []).toHaveLength(1)
  })

  it('invents nothing — every token traces to the user', () => {
    const q = buildProductQuery(macState(), 'tầm 25 triệu').toLowerCase()
    for (const invented of ['16gb', '256gb', '28 triệu', '30 triệu']) {
      expect(q).not.toContain(invented)
    }
  })

  it('falls back to this turn\'s text when there is no goal yet', () => {
    const bare = createState(newConversationId(), OWNER)
    expect(buildProductQuery(bare, 'mua tai nghe Sony')).toBe('mua tai nghe Sony')
  })

  it('stays within the provider length cap', () => {
    const s = macState()
    s.goal = 'x'.repeat(400)
    expect(buildProductQuery(s, '').length).toBeLessThanOrEqual(160)
  })
})

describe('result classification — empty is not failure', () => {
  it('candidates -> ok', () => {
    expect(classifyProductResult({ search_results: [{ title: 'A' }] })).toBe('ok')
  })

  it('answered with nothing -> empty', () => {
    expect(classifyProductResult({ search_results: [] })).toBe('empty')
  })

  it('provider error -> failed, NOT empty', () => {
    // Reporting a timeout as "there is nothing" would state a market fact we
    // never learned.
    expect(classifyProductResult({ error: 'timeout', search_results: [] })).toBe('failed')
  })

  it('null / malformed -> failed, never ok', () => {
    expect(classifyProductResult(null)).toBe('failed')
    expect(classifyProductResult('nope')).toBe('failed')
  })

  it('missing search_results is empty, not a crash', () => {
    expect(classifyProductResult({})).toBe('empty')
  })
})

describe('evidence extraction for the money guard', () => {
  it('passes the tool records through verbatim', () => {
    const rec = { title: 'MacBook Pro M1 - Shopee', link: 'https://shopee.vn/x', price: '25.800.000 ₫' }
    expect(productRecordsFrom({ search_results: [rec] })).toEqual([rec])
  })

  it('returns nothing for empty or malformed results', () => {
    expect(productRecordsFrom({ search_results: [] })).toEqual([])
    expect(productRecordsFrom(null)).toEqual([])
    expect(productRecordsFrom({})).toEqual([])
  })
})

/**
 * PHASE 6 — the gate is decided by the consultation, not by whether the client
 * or model happened to pre-select the tool.
 */
describe('pre-search gate covers the turns that used to miss', () => {
  const need = { hardConstraintAdds: [], hardConstraintChanges: [], softPreferenceAdds: [], decisionIntent: false, searchImpact: { required: true, reason: 'x' } }
  const noNeed = { ...need, searchImpact: { required: false, reason: '' } }

  function productState(): ConversationState {
    const s = createState(newConversationId(), ownerScopeFor({ userId: 'u' }))
    s.hardConstraints = [{ key: 'ram_gb', op: '=', value: 32, statedAs: '32GB', turn: 1 }]
    return s
  }
  function placeState(): ConversationState {
    const s = createState(newConversationId(), ownerScopeFor({ userId: 'u' }))
    s.candidates = [{ candidateId: 'c', name: 'Cà Phê AnAn', type: 'place', source: 'search_places', retrievedAt: 0, facts: {} }]
    return s
  }

  it('fires WITHOUT a forcedTool signal once the consultation is product-shaped', () => {
    // The measured miss: refinement and rejection turns carry no forcedTool, so
    // the old predicate skipped them and the model invented a product instead.
    expect(shouldPreSearchProducts({ delta: need, forcedTool: null, state: productState() })).toBe(true)
  })

  it('still fires on the explicit forcedTool signal', () => {
    const s = createState(newConversationId(), ownerScopeFor({ userId: 'u' }))
    expect(shouldPreSearchProducts({ delta: need, forcedTool: 'search_products', state: s })).toBe(true)
  })

  it('fires once product candidates are held, even with no constraints left', () => {
    const s = createState(newConversationId(), ownerScopeFor({ userId: 'u' }))
    s.candidates = [{ candidateId: 'p', name: 'MacBook', type: 'product', source: 'search_products', retrievedAt: 0, facts: {} }]
    expect(shouldPreSearchProducts({ delta: need, forcedTool: null, state: s })).toBe(true)
  })

  it('does NOT fire when the turn needs no new evidence', () => {
    expect(shouldPreSearchProducts({ delta: noNeed, forcedTool: null, state: productState() })).toBe(false)
  })

  it('does NOT fire on a place turn — C3-B.3 still holds', () => {
    expect(shouldPreSearchProducts({ delta: need, forcedTool: null, state: placeState() })).toBe(false)
    expect(shouldPreSearchProducts({ delta: need, forcedTool: null, state: productState(), locationIntent: true })).toBe(false)
  })

  it('does NOT fire on a bare consultation with no product signal at all', () => {
    const s = createState(newConversationId(), ownerScopeFor({ userId: 'u' }))
    s.hardConstraints = [{ key: 'budget_max', op: '<=', value: 200_000, statedAs: 'dưới 200k', turn: 1 }]
    // Budget alone is not a product signal — a cafe has a budget too.
    expect(shouldPreSearchProducts({ delta: need, forcedTool: null, state: s })).toBe(false)
  })
})

/**
 * Query quality. Measured: "Mac cũ" returned MAC cosmetics — "Son MAC 835
 * Modesty", "Son Mac Lunar Luck" — because MAC is a cosmetics brand here too.
 */
describe('the query lands in the right aisle', () => {
  const withGoal = (goal: string): ConversationState => {
    const s = createState(newConversationId(), ownerScopeFor({ userId: 'u' }))
    s.goal = goal
    return s
  }

  it('anchors a bare "Mac" to a computing category', () => {
    const q = buildProductQuery(withGoal('Tôi muốn mua một chiếc Mac cũ để code.'), '')
    expect(q).toMatch(/Apple laptop/)
    expect(q).toContain('Mac cũ')
  })

  it('does NOT invent a model — "Mac" never becomes "MacBook Pro"', () => {
    const q = buildProductQuery(withGoal('Tôi muốn mua một chiếc Mac cũ để code.'), '')
    expect(q).not.toMatch(/MacBook Pro|MacBook Air/i)
  })

  it.each([
    ['Mua MacBook Pro cũ RAM 32GB', /macbook pro/i],
    ['Mua MacBook Air M2', /macbook air/i],
    ['iPhone cũ giá bao nhiêu', /iphone/i],
  ])('leaves an already-specific query alone: %s', (goal, expected) => {
    const q = buildProductQuery(withGoal(goal), '')
    expect(q).toMatch(expected)
    expect(q).not.toMatch(/Apple laptop/)
  })

  it('still carries every stated requirement into the query', () => {
    const s = withGoal('Tôi muốn mua một chiếc Mac cũ để code.')
    s.hardConstraints = [
      { key: 'ram_gb', op: '=', value: 32, statedAs: 'RAM 32GB', turn: 2 },
      { key: 'storage_gb', op: '>=', value: 512, statedAs: 'ổ cứng từ 512GB trở lên', turn: 2 },
    ]
    const q = buildProductQuery(s, '')

    expect(q).toContain('RAM 32GB')
    expect(q).toContain('512GB')
    expect(q).toMatch(/Apple laptop/)
  })

  it('a place consultation never reaches this builder at all', () => {
    const s = createState(newConversationId(), ownerScopeFor({ userId: 'u' }))
    s.goal = 'cà phê gần Hoàn Kiếm'
    const need = { hardConstraintAdds: [], hardConstraintChanges: [], softPreferenceAdds: [], decisionIntent: false, searchImpact: { required: true, reason: 'x' } }

    expect(shouldPreSearchProducts({ delta: need, forcedTool: null, state: s })).toBe(false)
    expect(shouldPreSearchProducts({ delta: need, forcedTool: null, state: s, locationIntent: true })).toBe(false)
  })
})

/**
 * Irrelevant rows. All five titles below came back from the live "Mac cũ"
 * shopping search; three of them are lipstick.
 */
describe('irrelevant results never reach ranking', () => {
  const row = (name: string, facts: Record<string, string | number> = {}) =>
    ({ candidateId: name, name, type: 'product', facts: { price_vnd: 500_000, ...facts } })

  const LIVE = [
    row('Son MAC 835 Modesty Màu Hồng Khô'),
    row('Son Mac Lunar Luck Powder Kiss Pure Luck'),
    row('Giấy Dán Tường Giá Rẻ Albany 6822-1'),
    row('MacBook Pro 14 inch M1 Pro 2021 8CPU/32GB/512GB/14GPU cũ', { ram_gb: 32, storage_gb: 512 }),
    row('Macbook Pro 16 2019'),
  ]

  it('drops the cosmetics and keeps the computers', () => {
    const s = macState()
    const kept = filterIrrelevantProducts(LIVE, s).map(c => c.name)

    expect(kept).toEqual([
      'MacBook Pro 14 inch M1 Pro 2021 8CPU/32GB/512GB/14GPU cũ',
      'Macbook Pro 16 2019',
    ])
    expect(kept.join(' ')).not.toMatch(/Son |Giấy/)
  })

  it('keeps a row that has computer SPECS even when the title says nothing', () => {
    const s = macState()
    expect(filterIrrelevantProducts([row('MDM 2021 Silver', { ram_gb: 32 })], s)).toHaveLength(1)
  })

  it('leaves a non-computer consultation completely alone', () => {
    // No RAM/storage requirement -> this must not start filtering headphones
    // out of a headphone search.
    const s = createState(newConversationId(), OWNER)
    s.goal = 'mua tai nghe Sony'
    expect(filterIrrelevantProducts([row('Tai nghe Sony WH-1000XM5')], s)).toHaveLength(1)
  })

  it('never filters places', () => {
    const s = macState()
    const place = { candidateId: 'p', name: 'Cà Phê AnAn', type: 'place', facts: { address: 'x' } }
    expect(filterIrrelevantProducts([place], s)).toHaveLength(1)
  })
})
