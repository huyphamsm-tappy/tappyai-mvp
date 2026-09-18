// @vitest-environment node
/**
 * Consultative V1 — the stream-filter contract.
 *
 * With `collector.consultativeV1` unset (flag OFF) the filter is byte-identical to before. With it
 * set: a no-tool follow-up is buffered and a "mình đã kiểm tra" claim is removed; an atmosphere
 * claim about a named venue that its fetched text does not support is removed; a card-value
 * re-listing is dropped when the card renders and kept when it does not; the guard telemetry line
 * is emitted once.
 */
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector, type ConsultativeV1Context } from './toolResultSplit'

const ROWS = [
  { place_id: 'p1', name: 'Cơm Niêu Sài Gòn', address: '585 Huỳnh Tấn Phát, Quận 7', google_rating: '⭐ 4.6 (1.200 đánh giá)', rating_value: 4.6, rating_count: 1200, opening_hours: '08:00–22:00', phone: '028 1234 5678', maps_link: 'https://maps.google.com/?cid=1', amenity: 'restaurant' },
  { place_id: 'p2', name: 'Ốc Đào', address: 'Quận 1', google_rating: '⭐ 4.4 (589 đánh giá)', rating_value: 4.4, rating_count: 589, maps_link: 'https://maps.google.com/?cid=2', amenity: 'restaurant' },
]
const SNIPPETS = [
  { title: 'Cơm Niêu Sài Gòn', snippet: 'không gian yên tĩnh, hợp gia đình', evidence_scope: 'entity', evidence_about: 'Cơm Niêu Sài Gòn' },
  { title: 'Ốc Đào', snippet: 'quán rất đông, xếp hàng', evidence_scope: 'entity', evidence_about: 'Ốc Đào' },
]
const FOLLOWUPS = '[FOLLOWUPS]Quán khác|Giá món[/FOLLOWUPS]'
const USER = 'quán ăn tối yên tĩnh cho 2 người ở Quận 1'

async function run(reply: string, opts: { v1?: ConsultativeV1Context; tool?: boolean } = {}) {
  const collector = createEnrichmentCollector(USER)
  if (opts.v1) collector.setConsultativeV1(opts.v1)
  const toolResult = { results: ROWS, price_search_results: SNIPPETS, place_search_status: 'has_results' }
  const lines = [
    ...(opts.tool === false ? [] : [
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      `a:{"toolCallId":"t1","result":${JSON.stringify(toolResult)}}`,
    ]),
    '0:' + JSON.stringify(reply),
    'd:{"finishReason":"stop"}',
  ]
  const logs: string[] = []
  const orig = console.log
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')) }
  try {
    const res = applyPlaceEnrichmentStreamFilter(
      new Response(lines.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, USER, true,
    )
    const text = await new Response(res.body).text()
    return { text, logs }
  } finally { console.log = orig }
}
const prose = (stream: string): string => stream.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
const ON: ConsultativeV1Context = { on: true, rendersCard: true, namedRefetch: [], carried: [], hardGaps: [], budgetGap: false }

describe('flag OFF — identity', () => {
  it('a no-tool follow-up streams straight through, search claim and all', async () => {
    const reply = 'Mình đã kiểm tra lại, quán mở đến 22h. Bạn nên đi sớm.'
    const { text, logs } = await run(reply, { tool: false })
    expect(prose(text)).toBe(reply)
    expect(logs.some(l => l.includes('"guard":"consultative_v1"'))).toBe(false)
  })
})

describe('flag ON', () => {
  it('removes a search claim on a no-tool follow-up and logs the guard once', async () => {
    const { text, logs } = await run('Mình đã kiểm tra lại, quán mở đến 22h. Bạn nên đi sớm.', { v1: ON, tool: false })
    expect(prose(text)).toBe('Bạn nên đi sớm.')
    const guard = logs.filter(l => l.includes('"guard":"consultative_v1"'))
    expect(guard).toHaveLength(1)
    expect(guard[0]).toContain('"search_claims_removed":1')
    expect(guard[0]).toContain('"any_tool_called":false')
  })
  it('keeps the same claim when a tool ran this turn', async () => {
    const { text } = await run('Mình đã kiểm tra lại, **Cơm Niêu Sài Gòn** mở đến 22h vì hợp 2 người tối nay.', { v1: ON })
    expect(prose(text)).toContain('Mình đã kiểm tra lại')
  })
  it('removes an unsupported atmosphere claim about a named venue, keeps the supported one', async () => {
    const reply = `Mình chọn **Cơm Niêu Sài Gòn** cho tối nay vì không gian yên tĩnh hợp 2 người.\n\nNgoài ra **Ốc Đào** cũng rất yên tĩnh và lãng mạn.\n\nCuối tuần thường đông hơn.\n\n${FOLLOWUPS}`
    const { text, logs } = await run(reply, { v1: ON })
    const out = prose(text)
    expect(out).toContain('Mình chọn **Cơm Niêu Sài Gòn**')
    expect(out).not.toContain('Ốc Đào** cũng rất yên tĩnh')
    expect(out).toContain('Cuối tuần thường đông hơn.')
    expect(out).toContain('[FOLLOWUPS]')
    expect(logs.find(l => l.includes('"guard":"consultative_v1"'))).toContain('"atmosphere_removed":1')
  })
  it('drops a card-value re-listing when the card renders, keeps it when it does not', async () => {
    const reply = `Mình chọn **Cơm Niêu Sài Gòn** vì 1.200 đánh giá là bằng chứng đủ mạnh cho 2 người tối nay.\n\nCơm Niêu Sài Gòn: 4.6⭐ (1.200 đánh giá), mở 08:00–22:00.\n\nNên đi sớm.`
    const withCard = prose((await run(reply, { v1: ON })).text)
    expect(withCard).toContain('bằng chứng đủ mạnh')
    expect(withCard).not.toContain('mở 08:00–22:00')
    const noCard = prose((await run(reply, { v1: { ...ON, rendersCard: false } })).text)
    expect(noCard).toContain('mở 08:00–22:00')
  })

  it('a no-tool follow-up may quote the numbers the previous reply stated (carried evidence)', async () => {
    const reply = '**Ốc Đào** có 4.4⭐ từ 589 đánh giá và cách bạn 1.2km, nên cuối tuần thường đông.'
    const carried = [{ name: 'Ốc Đào', rating: 4.4, reviewCount: 589, distanceKm: 1.2 }]
    const { text, logs } = await run(reply, { v1: { ...ON, carried }, tool: false })
    expect(prose(text)).toContain('4.4⭐ từ 589 đánh giá')
    expect(logs.find(l => l.includes('"guard":"consultative_v1"'))).toContain('"carried":1')
  })

  it('an orphan emoji line left by a removed sentence is dropped', async () => {
    const reply = `Mình chọn **Cơm Niêu Sài Gòn** vì yên tĩnh hợp 2 người tối nay.\n\nNgoài ra **Ốc Đào** rất lãng mạn.\n\n 🍷\n\n${FOLLOWUPS}`
    const out = prose((await run(reply, { v1: ON })).text)
    expect(out).not.toMatch(/\n\s*🍷\s*\n/)
    expect(out).toContain('[FOLLOWUPS]')
  })

  it('names an unaddressed evidence gap and a missing price itself, before the machine blocks', async () => {
    const reply = `Mình chọn **Cơm Niêu Sài Gòn** cho cả nhà trưa cuối tuần vì 1.200 đánh giá.\n\n${FOLLOWUPS}`
    const { text } = await run(reply, { v1: { ...ON, hardGaps: ['parking', 'kids'], budgetGap: true } })
    const out = prose(text)
    expect(out).toContain('Mình chưa thấy bằng chứng về chỗ đậu xe, phù hợp trẻ em ở các quán này')
    expect(out).toContain('Kết quả chưa có mức giá')
    expect(out.indexOf('chưa thấy bằng chứng')).toBeLessThan(out.indexOf('[FOLLOWUPS]'))
    // Already said ⇒ not repeated.
    const said = `Mình chọn **Cơm Niêu Sài Gòn**. Mình chưa thấy bằng chứng về chỗ đậu xe hay phù hợp trẻ em, nên gọi hỏi trước.\n\n${FOLLOWUPS}`
    const out2 = prose((await run(said, { v1: { ...ON, hardGaps: ['parking', 'kids'] } })).text)
    expect(out2.match(/chưa thấy bằng chứng/g)).toHaveLength(1)
  })
})
