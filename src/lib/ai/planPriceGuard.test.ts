import { describe, it, expect } from 'vitest'
import { guardPlanPrices, planPriceEvidenceFromRows, planNoPriceSentinel } from './planPriceGuard'
import { guardMoneyClaimsInText } from './moneyGuard'
import { guardSnippetPricesInText as snippetGuard } from './snippetPriceGuard'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

// ─────────────────────────────────────────────────────────────────────────────
// MEASURED 2026-09-14 on the planning probe ("lập kế hoạch ăn chơi nhảy múa tối
// nay cho 2 người, budget 5 triệu ở Sài Gòn") against OSM rows, which carry no
// price field of any kind: 4 of 5 delivered plans wrote
// "800,000 – 1,200,000 VND (estimated for 2)" per item and summed them.
// ─────────────────────────────────────────────────────────────────────────────

const USER_VI = 'lập kế hoạch ăn chơi nhảy múa tối nay cho 2 người, budget 5 triệu ở Sài Gòn đi'
const USER_AMOUNTS = [5_000_000]

const plan = (over: Record<string, unknown> = {}) => ({
  type: 'evening', title: 'Tối nay ở Sài Gòn', people: [2], budget_total: '5.000.000 VND',
  days: [{ label: 'Tối nay', items: [
    { time: '19:00', category: 'food', name: 'Nhà Hàng Jaspas', description: 'Nhà hàng có wifi.', price: 'khoảng 800.000 - 1.200.000 VND (cho 2 người)', maps_link: 'https://www.google.com/maps?q=10.778168,106.7037041' },
    { time: '21:30', category: 'entertainment', name: 'Mimi Ultra Lounge', description: 'Bar lounge.', price: 'khoảng 1.500.000 - 2.000.000 VND', maps_link: 'https://www.google.com/maps?q=10.7718973,106.7005703' },
  ] }],
  cost_breakdown: { 'Ăn tối tại Nhà Hàng Jaspas': '1.000.000 VND', 'Nhảy múa tại Mimi Ultra Lounge': '2.000.000 VND', 'Còn dư': '2.000.000 VND' },
  ...over,
})
const wrap = (p: object) => 'Kế hoạch đây.\n\n[TAPPY_PLAN]\n' + JSON.stringify(p) + '\n[/TAPPY_PLAN]\n\nChúc vui!'
const parse = (text: string) => JSON.parse(text.slice(text.indexOf('[TAPPY_PLAN]') + 12, text.indexOf('[/TAPPY_PLAN]')).trim())

describe('CASE A — OSM rows, no price evidence at all', () => {
  const rows = [
    { name: 'Nhà Hàng Jaspas', address: '33 Đồng Khởi, Quận 1', maps_link: 'https://www.google.com/maps?q=10.778168,106.7037041' },
    { name: 'Mimi Ultra Lounge', address: '61 Nam Kỳ Khởi Nghĩa, Quận 1' },
  ]
  const evidence = { byEntity: planPriceEvidenceFromRows(rows), userAmounts: USER_AMOUNTS }

  it('replaces every invented item price with the sentinel and keeps the user total', () => {
    const out = guardPlanPrices(wrap(plan()), evidence, 'vi')
    const p = parse(out.text)
    expect(p.days[0].items.map((i: { price: string }) => i.price)).toEqual(['chưa có giá', 'chưa có giá'])
    expect(p.budget_total).toBe('5.000.000 VND')
    expect(out.redacted).toBe(5)
  })

  it('does not leave a fabricated cost_breakdown or remaining budget', () => {
    const p = parse(guardPlanPrices(wrap(plan()), evidence, 'vi').text)
    // Item lines are blanked; the model's derived "Còn dư" line is removed outright,
    // and with no priced item the server writes no total and no remainder.
    expect(p.cost_breakdown).toEqual({ 'Ăn tối tại Nhà Hàng Jaspas': 'chưa có giá', 'Nhảy múa tại Mimi Ultra Lounge': 'chưa có giá' })
    expect(JSON.stringify(p)).not.toMatch(/1\.000\.000|2\.000\.000|800\.000/)
  })

  it('keeps everything that is not a numeric price, and the block shape the client parses', () => {
    const out = guardPlanPrices(wrap(plan()), evidence, 'vi').text
    const p = parse(out)
    expect(p.days[0].items[0].name).toBe('Nhà Hàng Jaspas')
    expect(p.days[0].items[0].maps_link).toBe('https://www.google.com/maps?q=10.778168,106.7037041')
    expect(out.startsWith('Kế hoạch đây.\n\n[TAPPY_PLAN]\n')).toBe(true)
    expect(out.endsWith('\n[/TAPPY_PLAN]\n\nChúc vui!')).toBe(true)
  })

  it('English sentinel for an English reply', () => {
    const p = parse(guardPlanPrices(wrap(plan({ budget_total: '5,000,000 VND' })), evidence, 'en').text)
    expect(p.days[0].items[0].price).toBe(planNoPriceSentinel('en'))
    expect(p.budget_total).toBe('5,000,000 VND')
  })

  it('a value that is already the sentinel or a band is left alone', () => {
    const p = parse(guardPlanPrices(wrap(plan({ days: [{ label: 'Tối nay', items: [
      { name: 'Nhà Hàng Jaspas', price: 'chưa có giá' }, { name: 'Mimi Ultra Lounge', price: '$$' },
    ] }], cost_breakdown: { 'Ăn tối': 'chưa có giá cụ thể' } })), evidence, 'vi').text)
    expect(p.days[0].items.map((i: { price: string }) => i.price)).toEqual(['chưa có giá', '$$'])
    expect(p.cost_breakdown['Ăn tối']).toBe('chưa có giá cụ thể')
  })
})

describe('CASE B — real item-level price evidence survives', () => {
  it('Google price_range on the row backs the item price', () => {
    const rows = [{ name: 'Nhà Hàng Jaspas', price_range: { low: 200000, high: 500000, currency: 'VND' } }]
    const evidence = { byEntity: planPriceEvidenceFromRows(rows), userAmounts: [] }
    const p = parse(guardPlanPrices(wrap(plan({ budget_total: 'chưa có giá', days: [{ label: 'Tối nay', items: [
      { name: 'Nhà Hàng Jaspas', price: '200.000 - 500.000đ/người' },
    ] }], cost_breakdown: { 'Ăn tối': '500.000đ' } })), evidence, 'vi').text)
    expect(p.days[0].items[0].price).toBe('200.000 - 500.000đ/người')
    expect(p.cost_breakdown['Ăn tối']).toBe('500.000đ')
  })

  it('the Serper band verbatim backs itself; a number inside the band does not', () => {
    const rows = [{ name: 'Nhà Hàng Jaspas', price_range_text: '100.000-200.000 ₫' }]
    const evidence = { byEntity: planPriceEvidenceFromRows(rows), userAmounts: [] }
    const p = parse(guardPlanPrices(wrap(plan({ days: [{ label: 'Tối nay', items: [
      { name: 'Nhà Hàng Jaspas', price: '100.000-200.000 ₫' }, { name: 'Jaspas', price: 'khoảng 150.000đ' },
    ] }], cost_breakdown: {} })), evidence, 'vi').text)
    expect(p.days[0].items[0].price).toBe('100.000-200.000 ₫')
    expect(p.days[0].items[1].price).toBe('chưa có giá')
  })

  it('a hotel row states its price in its own snippet', () => {
    const rows = [{ name: 'Seaside Hotel', title: 'Seaside Hotel - Quy Nhơn - Booking.com', snippet: 'Giá từ 850.000đ/đêm' }]
    const evidence = { byEntity: planPriceEvidenceFromRows(rows), userAmounts: [] }
    const p = parse(guardPlanPrices(wrap(plan({ days: [{ label: 'Ngày 1', items: [{ name: 'Seaside Hotel', price: '850.000đ/đêm' }] }], cost_breakdown: {} })), evidence, 'vi').text)
    expect(p.days[0].items[0].price).toBe('850.000đ/đêm')
  })

  it('price_level alone is a band with no amount — it never becomes VND', () => {
    const rows = [{ name: 'Nhà Hàng Jaspas', price_level: 2 }]
    expect(planPriceEvidenceFromRows(rows).size).toBe(0)
    const p = parse(guardPlanPrices(wrap(plan()), { byEntity: planPriceEvidenceFromRows(rows), userAmounts: [] }, 'vi').text)
    expect(p.days[0].items[0].price).toBe('chưa có giá')
  })
})

describe('CASE C — the user-stated total is never replaced', () => {
  it('"budget 5 triệu" keeps budget_total 5.000.000 VND with zero evidence', () => {
    const p = parse(guardPlanPrices(wrap(plan()), { byEntity: new Map(), userAmounts: USER_AMOUNTS }, 'vi').text)
    expect(p.budget_total).toBe('5.000.000 VND')
  })

  it('the user number never legitimises a cost line, even one that calls itself the budget', () => {
    const p = parse(guardPlanPrices(wrap(plan({ cost_breakdown: { 'Ngân sách của bạn': '5 triệu', 'Ăn tối': '5.000.000 VND' } })), { byEntity: new Map(), userAmounts: USER_AMOUNTS }, 'vi').text)
    expect(p.budget_total).toBe('5.000.000 VND')
    expect(p.cost_breakdown['Ngân sách của bạn']).toBe('chưa có giá')
    expect(p.cost_breakdown['Ăn tối']).toBe('chưa có giá')
  })

  it('an item the user priced themselves keeps the user number but is not a retrieved cost', () => {
    const p = parse(guardPlanPrices(wrap(plan({ days: [{ label: 'Tối nay', items: [{ name: 'Nhà Hàng Jaspas', price: '5 triệu' }] }], cost_breakdown: {} })), { byEntity: new Map(), userAmounts: USER_AMOUNTS }, 'vi').text)
    expect(p.days[0].items[0].price).toBe('5 triệu')
    expect(p.cost_breakdown).toEqual({})
  })

  it('a total the user never stated and no tool returned is not real', () => {
    const p = parse(guardPlanPrices(wrap(plan({ budget_total: '3.000.000 VND' })), { byEntity: new Map(), userAmounts: [] }, 'vi').text)
    expect(p.budget_total).toBe('chưa có giá')
  })
})

describe('CASE D — mixed evidence', () => {
  const rows = [
    { name: 'Nhà Hàng Jaspas', price_range: { low: 800000, high: 1200000, currency: 'VND' } },
    { name: 'Mimi Ultra Lounge', address: 'Quận 1' },
  ]
  const evidence = { byEntity: planPriceEvidenceFromRows(rows), userAmounts: USER_AMOUNTS }

  it('keeps the restaurant price, blanks the bar price, and no fabricated total or remainder', () => {
    const p = parse(guardPlanPrices(wrap(plan()), evidence, 'vi').text)
    expect(p.days[0].items[0].price).toBe('khoảng 800.000 - 1.200.000 VND (cho 2 người)')
    expect(p.days[0].items[1].price).toBe('chưa có giá')
    expect(p.budget_total).toBe('5.000.000 VND')
    // 1.000.000 is neither the user's number nor a retrieved amount for any item.
    expect(p.cost_breakdown['Ăn tối tại Nhà Hàng Jaspas']).toBe('chưa có giá')
    expect(p.cost_breakdown['Nhảy múa tại Mimi Ultra Lounge']).toBe('chưa có giá')
    // One item without a price: the model's remainder is gone and nothing is summed.
    expect(Object.keys(p.cost_breakdown)).toEqual(['Ăn tối tại Nhà Hàng Jaspas', 'Nhảy múa tại Mimi Ultra Lounge'])
    expect(JSON.stringify(p.cost_breakdown)).not.toMatch(/\d{3}\.\d{3}/)
  })

  it('evidence for one place does not leak to another', () => {
    const p = parse(guardPlanPrices(wrap(plan({ days: [{ label: 'Tối nay', items: [
      { name: 'Mimi Ultra Lounge', price: '800.000 - 1.200.000 VND' },
    ] }], cost_breakdown: {} })), evidence, 'vi').text)
    expect(p.days[0].items[0].price).toBe('chưa có giá')
  })
})

describe('CASE E — prose guards and non-plan replies are untouched', () => {
  it('no plan block: the text is returned as-is', () => {
    const text = 'Quán này tầm 50.000đ/tô, khá ổn.'
    expect(guardPlanPrices(text, { byEntity: new Map(), userAmounts: [] }, 'vi')).toEqual({ text, redacted: 0 })
  })

  it('malformed plan JSON is never corrupted', () => {
    const text = '[TAPPY_PLAN]\n{"type":"evening","days":[\n[/TAPPY_PLAN]'
    expect(guardPlanPrices(text, { byEntity: new Map(), userAmounts: [] }, 'vi').text).toBe(text)
  })

  it('the prose money guards still skip the block and still judge prose exactly as before', () => {
    const text = 'Tô bún 45.000đ.\n\n' + wrap(plan())
    // Snippet guard: prose price with no snippet evidence goes; the block is not prose.
    const snip = snippetGuard(text, [], USER_VI)
    expect(snip.text).not.toContain('45.000đ')
    expect(snip.text).toContain('[TAPPY_PLAN]')
    expect(snip.text).toContain('800.000 - 1.200.000')
    // Structured money guard: inert without structured records, as documented.
    expect(guardMoneyClaimsInText(text, [], []).text).toBe(text)
  })
})

describe('end to end — the exact failing pattern through the real stream filter', () => {
  const osmRows = [
    { name: 'Nhà Hàng Jaspas', address: '33 Đồng Khởi, Quận 1', maps_link: 'https://www.google.com/maps?q=10.778168,106.7037041' },
    { name: 'Mimi Ultra Lounge', address: '61 Nam Kỳ Khởi Nghĩa, Quận 1', maps_link: 'https://www.google.com/maps?q=10.7718973,106.7005703' },
  ]
  const reply = 'Kế hoạch đây.\n\n[TAPPY_PLAN]\n' + JSON.stringify(plan()) + '\n[/TAPPY_PLAN]\n\nTổng ước tính 3.000.000 VND, còn dư 2.000.000 VND so với ngân sách 5 triệu.'
  const frames = [
    'f:{"messageId":"m1"}',
    '0:"Tôi sẽ tìm."',
    '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"nhà hàng","location":"TP HCM","type":"restaurant"}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result: { location: 'TP HCM', source: 'OpenStreetMap', results: [osmRows[0]] } }),
    '9:{"toolCallId":"t2","toolName":"search_places","args":{"query":"bar","location":"TP HCM","type":"bar"}}',
    'a:' + JSON.stringify({ toolCallId: 't2', result: { location: 'TP HCM', source: 'OpenStreetMap', results: [osmRows[1]] } }),
    'e:{"finishReason":"tool-calls","usage":{"promptTokens":1,"completionTokens":1},"isContinued":false}',
    'f:{"messageId":"m2"}',
    '0:' + JSON.stringify(reply),
    'e:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1},"isContinued":false}',
    'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}',
  ]

  it('delivers the plan with no invented numeric price, item, total or remainder', async () => {
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', undefined, undefined, undefined, undefined, false, USER_VI, true)
    const body = await new Response(res.body).text()
    const text = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    expect(text).toContain('[TAPPY_PLAN]')
    const p = parse(text)
    expect(p.days[0].items.map((i: { price: string }) => i.price)).toEqual(['chưa có giá', 'chưa có giá'])
    expect(p.budget_total).toBe('5.000.000 VND')
    expect(p.cost_breakdown).toEqual({ 'Ăn tối tại Nhà Hàng Jaspas': 'chưa có giá', 'Nhảy múa tại Mimi Ultra Lounge': 'chưa có giá' })
    // The prose remainder is judged by the existing snippet guard: no snippet, no number.
    expect(text).not.toContain('3.000.000')
    expect(text).not.toContain('2.000.000')
    expect(text).not.toMatch(/800[.,]000/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 MEASURED 2026-09-15 on the UAT probe ("…budget 3 triệu, ở Quận 1"): two
// items with no price, and the card read "Tổng ước tính 3.000.000 VND" — the
// user's budget, presented as the evening's cost. Budget ≠ cost: the user's
// number may be the envelope (budget_total) and nothing else.
// ─────────────────────────────────────────────────────────────────────────────
describe('budget is not a cost — derived lines are the server\'s, never the model\'s', () => {
  const USER_3M = 'lập kế hoạch ăn chơi nhảy múa cho 2 người tối nay đi, budget 3 triệu, ở Quận 1 Sài Gòn'
  const AMOUNTS_3M = [3_000_000]
  const twoItems = (a: string, b: string) => [{ label: 'Tối nay', items: [
    { name: 'Nhà Hàng Jaspas', price: a }, { name: 'Mimi Ultra Lounge', price: b },
  ] }]
  const noEvidence = { byEntity: new Map<string, number[]>(), userAmounts: AMOUNTS_3M }
  const fullEvidence = { byEntity: planPriceEvidenceFromRows([
    { name: 'Nhà Hàng Jaspas', price_range: { low: 500000, high: 500000, currency: 'VND' } },
    { name: 'Mimi Ultra Lounge', price_range: { low: 800000, high: 800000, currency: 'VND' } },
  ]), userAmounts: AMOUNTS_3M }

  it('A — user budget, no prices: budget survives; total and remaining are unavailable', () => {
    const out = guardPlanPrices(wrap(plan({ budget_total: '3.000.000 VND', days: twoItems('chưa có giá cụ thể', 'chưa có giá cụ thể'),
      cost_breakdown: { 'Ăn tối (2 người)': 'chưa có giá cụ thể', 'Nhảy múa (2 người)': 'chưa có giá cụ thể', 'Tổng ước tính': '3.000.000 VND', 'Còn lại': '3.000.000 VND' } })), noEvidence, 'vi')
    const p = parse(out.text)
    expect(p.budget_total).toBe('3.000.000 VND')
    expect(p.days[0].items.map((i: { price: string }) => i.price)).toEqual(['chưa có giá cụ thể', 'chưa có giá cụ thể'])
    expect(p.cost_breakdown).toEqual({ 'Ăn tối (2 người)': 'chưa có giá cụ thể', 'Nhảy múa (2 người)': 'chưa có giá cụ thể' })
    expect(JSON.stringify(p.cost_breakdown)).not.toContain('3.000.000')
    expect(out.redacted).toBe(2)
  })

  it('D — a model total equal to the user budget is not evidence', () => {
    const p = parse(guardPlanPrices(wrap(plan({ budget_total: '3.000.000 VND', days: twoItems('chưa có giá', 'chưa có giá'),
      cost_breakdown: { 'Tổng chi phí': '3.000.000 VND', 'Tổng cộng': '3 triệu', 'Total': '3,000,000 VND', 'Còn dư': '0 VND' } })), noEvidence, 'vi').text)
    expect(p.cost_breakdown).toEqual({})
    expect(p.budget_total).toBe('3.000.000 VND')
  })

  it('B — real prices on every item: the server sums them and subtracts from the budget', () => {
    const p = parse(guardPlanPrices(wrap(plan({ budget_total: '3.000.000 VND', days: twoItems('500.000đ', '800.000đ'),
      cost_breakdown: { 'Ăn tối': '500.000đ', 'Bar': '800.000đ', 'Tổng ước tính': '2.000.000 VND', 'Còn lại': '1.000.000 VND' } })), fullEvidence, 'vi').text)
    expect(p.budget_total).toBe('3.000.000 VND')
    expect(p.days[0].items.map((i: { price: string }) => i.price)).toEqual(['500.000đ', '800.000đ'])
    expect(p.cost_breakdown).toEqual({ 'Ăn tối': '500.000đ', 'Bar': '800.000đ', 'Tổng chi phí dự kiến': '1.300.000 VND', 'Còn lại': '1.700.000 VND' })
  })

  it('B (en) — English labels for an English reply', () => {
    const p = parse(guardPlanPrices(wrap(plan({ budget_total: '3,000,000 VND', days: twoItems('500,000 VND', '800,000 VND'), cost_breakdown: {} })), fullEvidence, 'en').text)
    expect(p.cost_breakdown).toEqual({ 'Estimated total cost': '1,300,000 VND', 'Remaining': '1,700,000 VND' })
  })

  it('G — ranges sum to a range, never a midpoint', () => {
    const ev = { byEntity: planPriceEvidenceFromRows([
      { name: 'Nhà Hàng Jaspas', price_range: { low: 400000, high: 500000, currency: 'VND' } },
      { name: 'Mimi Ultra Lounge', price_range: { low: 700000, high: 800000, currency: 'VND' } },
    ]), userAmounts: AMOUNTS_3M }
    const p = parse(guardPlanPrices(wrap(plan({ days: twoItems('400.000 - 500.000đ', '700.000 - 800.000đ'), cost_breakdown: {} })), ev, 'vi').text)
    expect(p.cost_breakdown['Tổng chi phí dự kiến']).toBe('1.100.000 – 1.300.000 VND')
    expect(p.cost_breakdown['Còn lại']).toBe('1.700.000 – 1.900.000 VND')
    expect(JSON.stringify(p.cost_breakdown)).not.toContain('1.200.000')
  })

  it('C — mixed evidence: no partial total, no remainder', () => {
    const ev = { byEntity: planPriceEvidenceFromRows([{ name: 'Nhà Hàng Jaspas', price_range: { low: 500000, high: 500000, currency: 'VND' } }]), userAmounts: AMOUNTS_3M }
    const p = parse(guardPlanPrices(wrap(plan({ days: twoItems('500.000đ', '800.000đ'), cost_breakdown: { 'Tổng ước tính': '1.300.000 VND' } })), ev, 'vi').text)
    expect(p.days[0].items.map((i: { price: string }) => i.price)).toEqual(['500.000đ', 'chưa có giá'])
    expect(p.cost_breakdown).toEqual({})
  })

  it('no budget stated, all items priced: a total but no remainder', () => {
    const p = parse(guardPlanPrices(wrap(plan({ budget_total: 'chưa có giá', days: twoItems('500.000đ', '800.000đ'), cost_breakdown: {} })), { ...fullEvidence, userAmounts: [] }, 'vi').text)
    expect(p.cost_breakdown).toEqual({ 'Tổng chi phí dự kiến': '1.300.000 VND' })
  })

  it('over budget: a total but no negative remainder', () => {
    const p = parse(guardPlanPrices(wrap(plan({ days: twoItems('500.000đ', '800.000đ'), cost_breakdown: {} })), { ...fullEvidence, userAmounts: [1_000_000] }, 'vi').text)
    expect(p.cost_breakdown).toEqual({ 'Tổng chi phí dự kiến': '1.300.000 VND' })
  })

  it('F — prose: the budget echoed as a cost is redacted, the budget named as a budget survives', () => {
    const text = 'Tổng ước tính 3.000.000 VND cho cả tối. Với ngân sách 3 triệu cho 2 người, bạn hoàn toàn thoải mái.\n\nChi phí khoảng 3 triệu. Budget: 3,000,000 VND is plenty. Remaining: 3,000,000 VND.'
    const out = snippetGuard(text, [], USER_3M)
    expect(out.text).not.toContain('Tổng ước tính 3.000.000')
    expect(out.text).not.toContain('Chi phí khoảng 3 triệu')
    expect(out.text).not.toContain('Remaining: 3,000,000')
    expect(out.text).toContain('Với ngân sách 3 triệu cho 2 người')
    expect(out.text).toContain('Budget: 3,000,000 VND is plenty')
  })

  it('H — the exact UAT scenario through the real stream filter: parseable, budget kept, no fabricated cost', async () => {
    const osmRows = [
      { name: 'Nhà Hàng Jaspas', address: 'Quận 1, TP HCM', wifi: true, maps_link: 'https://www.google.com/maps?q=10.778168,106.7037041' },
      { name: 'Mimi Ultra Lounge', address: '61 Nam Kỳ Khởi Nghĩa, Quận 1', wifi: true, maps_link: 'https://www.google.com/maps?q=10.7718973,106.7005703' },
    ]
    const uatPlan = plan({ budget_total: '3.000.000 VND', title: 'Tối vui vẻ ăn ngon rồi nhảy múa ở Quận 1',
      days: twoItems('chưa có giá cụ thể', 'chưa có giá cụ thể'),
      cost_breakdown: { 'Ăn tối (2 người)': 'chưa có giá cụ thể', 'Bar/Nhảy múa (2 người)': 'chưa có giá cụ thể', 'Tổng ước tính': '3.000.000 VND' } })
    const reply = 'Kế hoạch tối nay đây.\n\n[TAPPY_PLAN]\n' + JSON.stringify(uatPlan) + '\n[/TAPPY_PLAN]\n\nTổng ước tính 3.000.000 VND cho cả tối. Với ngân sách 3 triệu, hai bạn thoải mái.'
    const frames = [
      'f:{"messageId":"m1"}', '0:"Tôi sẽ tìm."',
      '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"nhà hàng","location":"Quận 1","type":"restaurant"}}',
      'a:' + JSON.stringify({ toolCallId: 't1', result: { location: 'Quận 1', source: 'OpenStreetMap', results: [osmRows[0]] } }),
      '9:{"toolCallId":"t2","toolName":"search_places","args":{"query":"bar","location":"Quận 1","type":"bar"}}',
      'a:' + JSON.stringify({ toolCallId: 't2', result: { location: 'Quận 1', source: 'OpenStreetMap', results: [osmRows[1]] } }),
      'e:{"finishReason":"tool-calls","usage":{"promptTokens":1,"completionTokens":1},"isContinued":false}',
      'f:{"messageId":"m2"}', '0:' + JSON.stringify(reply),
      'e:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1},"isContinued":false}',
      'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}',
    ]
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', undefined, undefined, undefined, undefined, false, USER_3M, true)
    const body = await new Response(res.body).text()
    const text = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    const p = parse(text)
    expect(p.budget_total).toBe('3.000.000 VND')
    expect(p.days[0].items.map((i: { price: string }) => i.price)).toEqual(['chưa có giá cụ thể', 'chưa có giá cụ thể'])
    expect(p.cost_breakdown).toEqual({ 'Ăn tối (2 người)': 'chưa có giá cụ thể', 'Bar/Nhảy múa (2 người)': 'chưa có giá cụ thể' })
    const prose = text.replace(/\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]/, '')
    expect(prose).not.toContain('Tổng ước tính 3.000.000')
    expect(prose).toContain('Với ngân sách 3 triệu')
  })
})
