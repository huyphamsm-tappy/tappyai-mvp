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
    expect(Object.values(p.cost_breakdown)).toEqual(['chưa có giá', 'chưa có giá', 'chưa có giá'])
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

  it('an item priced at exactly the user number is the user\'s number too', () => {
    const p = parse(guardPlanPrices(wrap(plan({ cost_breakdown: { 'Tổng ngân sách': '5 triệu' } })), { byEntity: new Map(), userAmounts: USER_AMOUNTS }, 'vi').text)
    expect(p.cost_breakdown['Tổng ngân sách']).toBe('5 triệu')
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
    expect(p.cost_breakdown['Còn dư']).toBe('chưa có giá')
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
    expect(Object.values(p.cost_breakdown)).toEqual(['chưa có giá', 'chưa có giá', 'chưa có giá'])
    // The prose remainder is judged by the existing snippet guard: no snippet, no number.
    expect(text).not.toContain('3.000.000')
    expect(text).not.toContain('2.000.000')
    expect(text).not.toMatch(/800[.,]000/)
  })
})
