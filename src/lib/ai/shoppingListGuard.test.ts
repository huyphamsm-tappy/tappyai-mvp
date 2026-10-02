// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector, type ConsultativeV1Context } from './toolResultSplit'

// ─────────────────────────────────────────────────────────────────────────────
// B4 — S7 ("Máy lọc không khí phòng ngủ 20m2", GATE 40, 3/3 deterministic): the model wrote a
// product list; the guards cut every product line; the user got "mình gợi ý:" and nothing.
// Two things close it, at the stream level:
//   1. the money guard is PROPORTIONAL — an unsupported amount takes its clause, not the line;
//   2. a shopping turn whose body is emptied and that has no decision marker gets the server's
//      honest sentence, never a blank.
// ─────────────────────────────────────────────────────────────────────────────

const USER = 'máy lọc không khí phòng ngủ 20m2 tầm 5 triệu'
const RECORDS = [
  { title: 'Máy lọc không khí Daikin MC55UVM6', link: 'https://www.dienmayxanh.com/may-loc-khong-khi/daikin-mc55uvm6', price: '6.990.000 ₫' },
  { title: 'Máy lọc không khí Xiaomi 4 Lite', link: 'https://www.dienmayxanh.com/may-loc-khong-khi/xiaomi-4-lite', price: '2.790.000 ₫' },
]
const ON: ConsultativeV1Context = { on: true, rendersCard: true, namedRefetch: [], carried: [], hardGaps: [], budgetGap: false }
const NL = String.fromCharCode(10)

async function run(reply: string, opts: { marker?: string | null } = {}) {
  const collector = createEnrichmentCollector(USER)
  collector.setConsultativeV1(ON)
  if (opts.marker) collector.setShoppingMarker?.(opts.marker)
  const toolResult = { source: 'serper_shopping', search_results: RECORDS }
  const lines = [
    '9:{"toolCallId":"t1","toolName":"search_products","args":{"query":"máy lọc không khí"}}',
    `a:{"toolCallId":"t1","result":${JSON.stringify(toolResult)}}`,
    '0:' + JSON.stringify(reply),
    'd:{"finishReason":"stop"}',
  ]
  const logs: string[] = []
  const orig = console.log
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')) }
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(lines.join(NL) + NL), 'vi', collector, undefined, undefined, undefined, false, USER, true)
    const text = await new Response(res.body).text()
    return { text, logs }
  } finally { console.log = orig }
}
const prose = (stream: string): string => stream.split(NL).filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

describe('B4 — the product list survives the money guard', () => {
  it('lines whose amounts are unsupported keep their product; only the amounts go', async () => {
    const reply = ['Mình gợi ý:', '- **Daikin MC55UVM6** — 6.500.000₫, lọc HEPA, êm cho phòng ngủ', '- **Xiaomi 4 Lite** — 2.990.000₫, giá mềm', 'Mình nghiêng về **Daikin MC55UVM6** vì độ ồn thấp.'].join(NL)
    const { text } = await run(reply)
    const out = prose(text)
    expect(out).toContain('**Daikin MC55UVM6**')
    expect(out).toContain('**Xiaomi 4 Lite**')
    expect(out).toContain('lọc HEPA')
    expect(out).not.toContain('6.500.000')
    expect(out).not.toContain('2.990.000')
    expect(out).toContain('nghiêng về')
  })
})

describe('B4 — an emptied shopping reply is never blank', () => {
  it('body cut to almost nothing, no decision marker ⇒ the honest server sentence, logged as shopping_none', async () => {
    // Every line names a product the records do not carry (the grounding gate cuts them) and an amount.
    const reply = ['Mình gợi ý:', '- **Sharp FP-J40E** — 4.200.000₫', '- **Coway AP-1019C** — 5.900.000₫'].join(NL)
    const { text, logs } = await run(reply)
    const out = prose(text)
    expect(out).not.toContain('Sharp')
    expect(out).not.toContain('Coway')
    // The grounding gate's own honest line (cardRenders:false) — not "see the card below" over an
    // empty card; the lead-in colon is kept so the gate can strip the orphaned lead-in.
    expect(out).toContain('Mình chưa tìm được lựa chọn nào trong kết quả đủ khớp')
    expect(out).not.toContain('nằm ở thẻ bên dưới')
    expect(out).not.toContain('Mình gợi ý:')
    void logs
  })
})

describe('B3 — a price no fetched row can verify is HEDGED, not cut', () => {
  it('organic rows (no structured price): the amounts stay and one hedge line is appended; a name the rows do not carry is still cut', async () => {
    const collector = createEnrichmentCollector(USER)
    collector.setConsultativeV1(ON)
    const organic = { source: 'serper_organic', search_results: [{ title: 'Máy lọc không khí Daikin MC55UVM6', link: 'https://www.dienmayxanh.com/x', snippet: 'HEPA' }] }
    const reply = ['- **Daikin MC55UVM6** — khoảng 6.500.000₫, lọc HEPA', 'Mình nghiêng về **Daikin MC55UVM6**.'].join(NL)
    const lines = ['9:{"toolCallId":"t1","toolName":"search_products","args":{"query":"máy lọc không khí"}}', `a:{"toolCallId":"t1","result":${JSON.stringify(organic)}}`, '0:' + JSON.stringify(reply), 'd:{"finishReason":"stop"}']
    const logs: string[] = []
    const orig = console.log
    console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')) }
    let text = ''
    try {
      const res = applyPlaceEnrichmentStreamFilter(new Response(lines.join(NL) + NL), 'vi', collector, undefined, undefined, undefined, false, USER, true)
      text = await new Response(res.body).text()
    } finally { console.log = orig }
    const out = prose(text)
    expect(out, logs.filter(l => l.includes('tappyai_guard')).join('|')).toContain('6.500.000')
    expect(out).toContain('Giá nêu trên chưa được xác nhận từ listing đã tìm')
    expect(out.match(/chưa được xác nhận từ listing/g)).toHaveLength(1)
    expect(logs.some(l => l.includes('"step":"hedged_unverified"'))).toBe(true)
  })
})
